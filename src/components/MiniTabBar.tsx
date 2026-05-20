import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MainMenuModal from './MainMenuModal';
import { safeNavigate } from '../utils/safeNavigation';
import TactileIcon from './TactileIcon';
import { SCREEN_THEME } from '../utils/screenTheme';
import { useTranslation } from '../i18n/useTranslation';

const PRIMARY = SCREEN_THEME.woodGreenDark;

type TabItem = {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tab?: string;
};

export default function MiniTabBar() {
  const navigation = useNavigation<NavigationProp<{ MainTabs: { screen: string } }>>();
  const [menuVisible, setMenuVisible] = useState(false);
  const { t } = useTranslation();

  const tabs: TabItem[] = [
    { label: t.menu.home, icon: 'home', tab: 'HomeTab' },
    { label: t.menu.mapChaika, icon: 'map', tab: 'MapTab' },
    { label: t.menu.helpNeighbors, icon: 'hand-heart-outline', tab: 'HelpTab' },
    { label: t.mainScreen.chaikaBonus, icon: 'plus-circle-outline', tab: 'BonusTab' },
    { label: t.menu.profile, icon: 'account-circle', tab: 'ProfileTab' },
  ];

  const handlePress = (item: TabItem) => {
    if (item.tab) {
      if (!safeNavigate(navigation, 'MainTabs', { screen: item.tab })) {
        const parent = navigation.getParent?.();
        if (!parent || !safeNavigate(parent as NavigationProp<Record<string, object | undefined>>, 'MainTabs', { screen: item.tab })) {
          safeNavigate(navigation, item.tab);
        }
      }
    }
  };

  return (
    <>
      <View style={styles.container}>
        <View style={styles.barBevelTop} />
        <View style={styles.barBevelBottom} />
        {tabs.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.tab}
            onPress={() => handlePress(item)}
            activeOpacity={0.72}
          >
            <TactileIcon icon={item.icon} size={36} iconSize={18} backgroundColor={SCREEN_THEME.cardCream} tint={PRIMARY} />
            <Text style={styles.label}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.tab, styles.menuTab]}
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.72}
        >
          <View style={styles.menuBadge}>
            <View style={styles.menuBadgeBevelTop} />
            <View style={styles.menuBadgeBevelBottom} />
            <View style={styles.menuBadgeGloss} />
            <MaterialCommunityIcons name="menu" size={18} color="#fff" />
          </View>
          <Text style={[styles.label, styles.menuLabel]}>{t.menu.menuButton}</Text>
        </TouchableOpacity>
      </View>

      <MainMenuModal visible={menuVisible} onClose={() => setMenuVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: SCREEN_THEME.paper,
    borderTopWidth: 2,
    borderTopColor: SCREEN_THEME.woodGrainDark,
    paddingBottom: 6,
    paddingTop: 8,
    ...SCREEN_THEME.raisedShadow,
    overflow: 'hidden',
  },
  barBevelTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: SCREEN_THEME.woodGrainLight,
    zIndex: 2,
  },
  barBevelBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: SCREEN_THEME.bevelLightSoft,
    zIndex: 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 1,
  },
  label: {
    fontSize: 8,
    fontWeight: '800',
    color: PRIMARY,
    textAlign: 'center',
    marginTop: 4,
    textShadowColor: SCREEN_THEME.embossDark,
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 1,
  },
  menuTab: {
    flex: 1,
  },
  menuBadge: {
    backgroundColor: SCREEN_THEME.terracotta,
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SCREEN_THEME.terracottaDark,
    overflow: 'hidden',
    ...SCREEN_THEME.raisedShadow,
  },
  menuBadgeBevelTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: SCREEN_THEME.bevelLight,
  },
  menuBadgeBevelBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: SCREEN_THEME.bevelDark,
  },
  menuBadgeGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: SCREEN_THEME.glassOverlay,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  menuLabel: {
    color: PRIMARY,
    fontWeight: '800',
  },
});


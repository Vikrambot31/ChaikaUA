import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { safeNavigate } from '../utils/safeNavigation';
import TactileIcon from './TactileIcon';
import { SCREEN_THEME } from '../utils/screenTheme';
import { useTranslation } from '../i18n/useTranslation';
import { useAppTheme } from '../hooks/useAppTheme';

const PRIMARY = SCREEN_THEME.woodGreenDark;

type TabItem = {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  tab?: string;
};

export default function MiniTabBar() {
  const navigation = useNavigation<NavigationProp<{ MainTabs: { screen: string } }>>();
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();

  const tabs: TabItem[] = [
    { label: t.menu.home, icon: 'home', tab: 'HomeTab' },
    { label: t.menu.mapChaika, icon: 'map-search', tab: 'MapTab' },
    { label: t.menu.helpNeighbors, icon: 'hand-heart-outline', tab: 'HelpTab' },
    { label: t.mainScreen.services, icon: 'plus-circle-outline', tab: 'ServicesTab' },
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
    <View style={[styles.container, { backgroundColor: colors.paper, borderTopColor: colors.uiBorder }]}>
      <View style={[styles.barBevelTop, { backgroundColor: isDark ? colors.uiBorder : SCREEN_THEME.woodGrainLight }]} />
      <View style={styles.barBevelBottom} />
      {tabs.map((item) => (
        <TouchableOpacity
          key={item.label}
          style={styles.tab}
          onPress={() => handlePress(item)}
          activeOpacity={0.72}
        >
          <TactileIcon icon={item.icon} size={36} iconSize={18} backgroundColor={isDark ? colors.navTabActive : SCREEN_THEME.cardCream} tint={isDark ? colors.textPrimary : PRIMARY} />
          <Text style={[styles.label, { color: isDark ? colors.textPrimary : PRIMARY }]} numberOfLines={1}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
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
    fontSize: 9,
    fontWeight: '800',
    color: PRIMARY,
    textAlign: 'center',
    marginTop: 4,
    textShadowColor: SCREEN_THEME.embossDark,
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 1,
  },
});


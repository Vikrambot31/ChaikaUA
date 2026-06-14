import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { COLORS } from '../utils/constants';
import { useTranslation } from '../i18n/useTranslation';
import { safeNavigate } from '../utils/safeNavigation';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from './TactileIcon';
import { setTheme } from '../redux/slices/themeSlice';
import { useAppTheme } from '../hooks/useAppTheme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface MenuItem {
  labelKey: string;
  label?: string;
  icon: IconName;
  tab?: string;
  screen?: string;
}

interface MainMenuModalProps {
  visible: boolean;
  onClose: () => void;
}

const MainMenuModal: React.FC<MainMenuModalProps> = ({ visible, onClose }) => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { isDark } = useAppTheme();

  const themeLabel =
    t.menu.title === 'Меню застосунку' ? 'Тема' :
    t.menu.title === 'Меню приложения' ? 'Тема' :
    'Theme';

  const MAIN_MENU_ITEMS: MenuItem[] = [
    { labelKey: 'home', icon: 'home', tab: 'HomeTab' },
    { labelKey: 'mapChaika', icon: 'map-search', tab: 'MapTab' },
    { labelKey: 'profile', icon: 'account-circle', tab: 'ProfileTab' },
  ];

  const ADDITIONAL_MENU_ITEMS: MenuItem[] = [
    { labelKey: 'osbb', icon: 'office-building-cog-outline', screen: 'OsbbHubScreen' },
    { labelKey: 'servicesHub', icon: 'plus-circle-outline', screen: 'ServicesHubScreen' },
    { labelKey: 'helpNeighbors', icon: 'hand-heart', screen: 'HelpNeighborsScreen' },
    { labelKey: 'aboutApp', icon: 'information-outline', screen: 'AppInfoScreen' },
    { labelKey: 'loginRegister', icon: 'login', screen: 'LoginScreen' },
    { labelKey: 'qrShare', icon: 'qrcode', screen: 'QRCodeScreen' },
  ];

  const navigateToTab = (tabName: string) => {
    // 1) If we're already inside Tab navigator, go directly to tab route.
    if (safeNavigate(navigation, tabName)) {
      return true;
    }

    // 2) Try parent navigator chain.
    const parent = navigation.getParent?.();
    if (parent && safeNavigate(parent as NavigationProp<Record<string, object | undefined>>, tabName)) {
      return true;
    }

    // 3) Fallback to root stack route with nested tab param.
    return safeNavigate(navigation, 'MainTabs', { screen: tabName });
  };

  const navigateToScreen = (screenName: string) => {
    // Try current navigator first.
    if (safeNavigate(navigation, screenName)) {
      return true;
    }

    // Then climb parent navigators.
    let parent = navigation.getParent?.();
    while (parent) {
      if (safeNavigate(parent as NavigationProp<Record<string, object | undefined>>, screenName)) {
        return true;
      }
      parent = parent.getParent?.();
    }

    return false;
  };

  const handleNavigate = (item: MenuItem) => {
    let didNavigate = false;

    if (item.tab) {
      didNavigate = navigateToTab(item.tab);
    } else if (item.screen) {
      didNavigate = navigateToScreen(item.screen);
    }

    if (didNavigate) {
      onClose();
    } else if (__DEV__) {
      console.warn(`[MainMenuModal] Navigation failed for ${item.tab ?? item.screen ?? item.labelKey}`);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.menuContainer}>
          <View style={styles.menuHeader}>
            <View style={styles.menuHeaderBevelTop} />
            <View style={styles.menuHeaderBevelBottom} />
            <View style={styles.menuHeaderGloss} />
            <Text style={styles.menuTitle}>{t.menu.title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={28} color={COLORS.white} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.menuList} showsVerticalScrollIndicator={true}>
            {MAIN_MENU_ITEMS.map((item, index) => (
              <TouchableOpacity
                key={item.labelKey}
                style={[styles.menuItem, index === MAIN_MENU_ITEMS.length - 1 && styles.divider]}
                onPress={() => handleNavigate(item)}
                activeOpacity={0.7}
              >
                <TactileIcon
                  icon={item.icon}
                  size={40}
                  iconSize={20}
                  backgroundColor={SCREEN_THEME.cardCream}
                  tint={SCREEN_THEME.woodGreenDark}
                />
                <Text style={styles.menuItemLabel}>{item.label ?? t.menu[item.labelKey as keyof typeof t.menu]}</Text>
                <MaterialCommunityIcons name="chevron-right" size={24} color={SCREEN_THEME.textMuted} />
              </TouchableOpacity>
            ))}

            <View style={styles.sectionDivider} />

            {ADDITIONAL_MENU_ITEMS.map((item, index) => (
              <TouchableOpacity
                key={item.labelKey}
                style={[styles.menuItem, index === ADDITIONAL_MENU_ITEMS.length - 1 && styles.menuItemLast]}
                onPress={() => handleNavigate(item)}
                activeOpacity={0.7}
              >
                <TactileIcon
                  icon={item.icon}
                  size={40}
                  iconSize={20}
                  backgroundColor={SCREEN_THEME.cardCream}
                  tint={SCREEN_THEME.terracottaDark}
                />
                <Text style={styles.menuItemLabel}>{item.label ?? t.menu[item.labelKey as keyof typeof t.menu]}</Text>
                <MaterialCommunityIcons name="chevron-right" size={24} color={SCREEN_THEME.textMuted} />
              </TouchableOpacity>
            ))}

            <View style={styles.sectionDivider} />

            <View style={styles.themeRow}>
              <TactileIcon icon="theme-light-dark" size={40} iconSize={20} backgroundColor={SCREEN_THEME.cardCream} tint={SCREEN_THEME.enamelBlueDark} />
              <Text style={styles.menuItemLabel}>{themeLabel}</Text>
              <View style={styles.themeToggle}>
                <TouchableOpacity
                  style={[styles.themeBtn, !isDark && styles.themeBtnActive]}
                  onPress={() => dispatch(setTheme('light'))}
                >
                  <Text style={[styles.themeBtnText, !isDark && styles.themeBtnTextActive]}>☀️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.themeBtn, isDark && styles.themeBtnActive]}
                  onPress={() => dispatch(setTheme('dark'))}
                >
                  <Text style={[styles.themeBtnText, isDark && styles.themeBtnTextActive]}>🌙</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(67, 49, 28, 0.28)',
    justifyContent: 'flex-start',
  },
  menuContainer: {
    width: '85%',
    height: '100%',
    backgroundColor: SCREEN_THEME.paper,
    borderWidth: 2,
    borderRightWidth: 4,
    borderColor: SCREEN_THEME.woodGrainDark,
    ...SCREEN_THEME.raisedShadowStrong,
    overflow: 'hidden',
  },
  menuHeader: {
    backgroundColor: '#B85042',
    paddingHorizontal: 16,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  menuHeaderBevelTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: SCREEN_THEME.bevelLight,
  },
  menuHeaderBevelBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#8F322A',
  },
  menuHeaderGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: SCREEN_THEME.glassOverlay,
  },
  menuTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuList: {
    paddingVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: SCREEN_THEME.borderSoft,
  },
  divider: {
    borderBottomWidth: 2,
    borderBottomColor: SCREEN_THEME.woodGrainLight,
  },
  sectionDivider: {
    height: 10,
    backgroundColor: SCREEN_THEME.appBg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: SCREEN_THEME.borderStrong,
    borderBottomColor: SCREEN_THEME.borderStrong,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: SCREEN_THEME.textPrimary,
    textShadowColor: SCREEN_THEME.embossDark,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  themeToggle: {
    flexDirection: 'row',
    gap: 6,
  },
  themeBtn: {
    width: 40,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.cardCream,
    borderWidth: 1,
    borderColor: SCREEN_THEME.uiBorder,
  },
  themeBtnActive: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderColor: SCREEN_THEME.terracottaDark,
  },
  themeBtnText: {
    fontSize: 18,
  },
  themeBtnTextActive: {
    // emoji renders the same, active state indicated by button background
  },
});

export default MainMenuModal;

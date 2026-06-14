import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import { selectHasAnyProfileNotification } from '../redux/slices/notificationSlice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { safeNavigate } from '../utils/safeNavigation';
import { useTranslation } from '../i18n/useTranslation';
import { SCREEN_THEME } from '../utils/screenTheme';
import { useAppTheme } from '../hooks/useAppTheme';
import { useInboxNotifications } from '../hooks/useInboxNotifications';

const TAB_WIDTH = 82;

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const ICONS: Record<string, IconName> = {
  HomeTab: 'home',
  MapTab: 'map-search',
  HelpTab: 'hand-heart-outline',
  ServicesTab: 'plus-circle-outline',
  ProfileTab: 'account-circle',
};

const ACTIVE_COLORS: Record<string, string> = {
  HomeTab: SCREEN_THEME.woodGreenDark,
  MapTab: SCREEN_THEME.terracottaDark,
  HelpTab: SCREEN_THEME.linenOliveDark,
  ServicesTab: SCREEN_THEME.enamelBlueDark,
  ProfileTab: '#6D8B55',
};

const DARK_ACTIVE_TINT = '#F5E8F0';
const DARK_INACTIVE_TINT = '#CEAABF';

const ScrollableTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const stackNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollThreshold = Dimensions.get('window').width / 2;
  const [pulseRequests, setPulseRequests] = useState(false);
  const hasProfileNotification = useSelector(selectHasAnyProfileNotification);
  const profileBlinkAnim = useRef(new Animated.Value(1)).current;
  const { unreadCount, totalCount } = useInboxNotifications();
  const inboxPulseAnim = useRef(new Animated.Value(1)).current;
  const hasInbox = totalCount > 0;

  useEffect(() => {
    const activeIndex = state.index;
    const scrollPosition = activeIndex * TAB_WIDTH - scrollThreshold + TAB_WIDTH / 2;

    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        x: Math.max(0, scrollPosition),
        animated: true,
      });
    }, 80);

    return () => clearTimeout(timer);
  }, [scrollThreshold, state.index]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      const seen = await AsyncStorage.getItem('home_coffee_tip_seen_v1');
      if (seen === '1') {
        return;
      }

      timer = setTimeout(() => {
        setPulseRequests(true);
        void AsyncStorage.setItem('home_coffee_tip_seen_v1', '1');
        setTimeout(() => setPulseRequests(false), 900);
      }, 4000);
    };

    void run();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Inbox badge pulse animation
  useEffect(() => {
    if (unreadCount === 0) {
      inboxPulseAnim.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(inboxPulseAnim, { toValue: 1.12, duration: 600, useNativeDriver: true }),
        Animated.timing(inboxPulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [unreadCount, inboxPulseAnim]);

  useEffect(() => {
    if (!hasProfileNotification) {
      profileBlinkAnim.setValue(1);
      return;
    }
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(profileBlinkAnim, { toValue: 0.35, duration: 1000, useNativeDriver: true }),
        Animated.timing(profileBlinkAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [hasProfileNotification, profileBlinkAnim]);

  return (
    <View style={[styles.container, { backgroundColor: colors.navBarBg, borderTopColor: colors.navBarBorder }]}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const fallbackLabel = options.title !== undefined ? String(options.title) : route.name;
          const label =
            route.name === 'HomeTab' ? t.menu.home :
            route.name === 'MapTab' ? t.menu.mapChaika :
            route.name === 'HelpTab' ? t.menu.helpNeighbors :
            route.name === 'ServicesTab' ? t.mainScreen.services :
            route.name === 'ProfileTab' ? t.menu.profile :
            fallbackLabel;
          const isFocused = state.index === index;
          const activeColor = ACTIVE_COLORS[route.name] ?? SCREEN_THEME.terracottaDark;
          const iconColor = isFocused
            ? (isDark ? DARK_ACTIVE_TINT : activeColor)
            : (isDark ? DARK_INACTIVE_TINT : '#998969');
          const labelColor = isFocused
            ? (isDark ? DARK_ACTIVE_TINT : activeColor)
            : (isDark ? DARK_INACTIVE_TINT : '#998969');
          const shouldPulse = route.name === 'HelpTab' && pulseRequests;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              safeNavigate(navigation as never, route.name);
            }
          };

          const tabElement = (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={[
                styles.tab,
                { backgroundColor: colors.navTabDefault, borderColor: isDark && !isFocused ? 'rgba(185,141,170,0.25)' : colors.navBarBorder },
                isFocused && styles.tabActive,
                isFocused && { backgroundColor: colors.navTabActive, borderColor: activeColor, shadowColor: activeColor },
                shouldPulse && styles.pulseTab,
              ]}
              activeOpacity={0.86}
            >
              {isFocused ? (
                <>
                  <View style={[styles.tabActiveBevelTop, { backgroundColor: `${activeColor}44` }]} />
                  <View style={styles.tabActiveBevelBottom} />
                  <View style={styles.tabGloss} />
                </>
              ) : (
                <>
                  <View style={styles.tabBevelTop} />
                  <View style={styles.tabBevelBottom} />
                </>
              )}
              <View style={[styles.iconWrap, !isFocused && isDark && { backgroundColor: 'rgba(185,141,170,0.12)' }, isFocused && { backgroundColor: `${activeColor}22` }, shouldPulse && styles.pulseIconWrap]}>
                {route.name === 'ProfileTab' && hasProfileNotification && !isFocused ? (
                  <Animated.View style={{ opacity: profileBlinkAnim }}>
                    <MaterialCommunityIcons
                      name={ICONS[route.name] ?? 'help-circle'}
                      size={22}
                      color="#9D5E45"
                    />
                  </Animated.View>
                ) : (
                  <MaterialCommunityIcons
                    name={ICONS[route.name] ?? 'help-circle'}
                    size={isFocused ? 25 : 22}
                    color={iconColor}
                  />
                )}
                {route.name === 'ProfileTab' && hasProfileNotification && !isFocused && (
                  <View style={styles.profileNotifDot} />
                )}
              </View>
              <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
                {label}
              </Text>
            </TouchableOpacity>
          );

          // Insert inbox button after HomeTab when there are messages
          if (route.name === 'HomeTab' && hasInbox) {
            return (
              <React.Fragment key={route.key}>
                {tabElement}
                <Animated.View style={{ transform: [{ scale: unreadCount > 0 ? inboxPulseAnim : 1 }] }}>
                  <TouchableOpacity
                    style={[
                      styles.tab,
                      styles.inboxTab,
                      { backgroundColor: isDark ? 'rgba(122,37,81,0.18)' : 'rgba(122,37,81,0.10)', borderColor: SCREEN_THEME.terracotta },
                    ]}
                    onPress={() => stackNav.navigate('InboxScreen')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.tabBevelTop} />
                    <View style={styles.tabBevelBottom} />
                    <View style={[styles.iconWrap, { backgroundColor: 'rgba(122,37,81,0.12)' }]}>
                      <MaterialCommunityIcons
                        name="email"
                        size={23}
                        color={SCREEN_THEME.terracotta}
                      />
                      {unreadCount > 0 && (
                        <View style={styles.inboxBadge}>
                          <Text style={styles.inboxBadgeText}>
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              </React.Fragment>
            );
          }

          return tabElement;
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: SCREEN_THEME.navBarBg,
    borderTopColor: SCREEN_THEME.navBarBorder,
    borderTopWidth: 1,
    minHeight: 84,
    paddingBottom: 6,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 12,
  },
  tab: {
    width: TAB_WIDTH,
    height: 60,
    marginHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: SCREEN_THEME.navTabDefault,
    borderWidth: 1,
    borderColor: SCREEN_THEME.navBarBorder,
    overflow: 'hidden',
  },
  tabActive: {
    backgroundColor: SCREEN_THEME.navTabActive,
    borderWidth: 1,
    ...SCREEN_THEME.raisedShadow,
  },
  tabBevelTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: SCREEN_THEME.bevelDark,
  },
  tabBevelBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: SCREEN_THEME.bevelLightSoft,
  },
  tabActiveBevelTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: SCREEN_THEME.bevelLight,
  },
  tabActiveBevelBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: SCREEN_THEME.bevelDark,
  },
  tabGloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '38%',
    backgroundColor: SCREEN_THEME.glassOverlay,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  pulseTab: {
    transform: [{ scale: 1.04 }],
    borderColor: '#D67B4F',
    shadowColor: '#D67B4F',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 7,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  pulseIconWrap: {
    backgroundColor: 'rgba(214,123,79,0.18)',
  },
  profileNotifDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9D5E45',
  },
  inboxTab: {
    borderWidth: 1.5,
    width: 58,
  },
  inboxBadge: {
    position: 'absolute',
    top: 0,
    right: -2,
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  inboxBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#998969',
    textAlign: 'center',
  },
});

export default ScrollableTabBar;

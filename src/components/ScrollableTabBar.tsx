import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { safeNavigate } from '../utils/safeNavigation';
import { useTranslation } from '../i18n/useTranslation';
import { SCREEN_THEME } from '../utils/screenTheme';

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

const ScrollableTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollThreshold = Dimensions.get('window').width / 2;
  const [pulseRequests, setPulseRequests] = useState(false);

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

  return (
    <View style={styles.container}>
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

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={[
                styles.tab,
                isFocused && styles.tabActive,
                isFocused && { borderColor: activeColor, shadowColor: activeColor },
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
              <View style={[styles.iconWrap, isFocused && { backgroundColor: `${activeColor}22` }, shouldPulse && styles.pulseIconWrap]}>
                <MaterialCommunityIcons
                  name={ICONS[route.name] ?? 'help-circle'}
                  size={isFocused ? 25 : 22}
                  color={isFocused ? activeColor : '#998969'}
                />
              </View>
              <Text style={[styles.label, isFocused && { color: activeColor }]} numberOfLines={1}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(248, 240, 221, 0.98)',
    borderTopColor: '#E1CFAB',
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
    backgroundColor: '#F0E5CF',
    borderWidth: 1,
    borderColor: '#D8C7A0',
    overflow: 'hidden',
  },
  tabActive: {
    backgroundColor: '#FFFCEF',
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
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#998969',
    textAlign: 'center',
  },
});

export default ScrollableTabBar;


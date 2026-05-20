import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { selectIsOnline } from '../redux/slices/networkSlice';
import type { RootState } from '../redux/store';

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT: Record<Lang, string> = {
  ua: 'Немає зʼєднання з інтернетом',
  ru: 'Нет соединения с интернетом',
  en: 'No internet connection',
};

const BANNER_HEIGHT = 38;

export default function OfflineBanner() {
  const isOnline = useSelector(selectIsOnline);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const translateY = useRef(new Animated.Value(-BANNER_HEIGHT)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: isOnline ? -BANNER_HEIGHT : 0,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [isOnline, translateY]);

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <View style={styles.inner}>
        <MaterialCommunityIcons name="wifi-off" size={16} color="#FFF" />
        <Text style={styles.text}>{UI_TEXT[language]}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: BANNER_HEIGHT,
    backgroundColor: '#B85042',
    zIndex: 9999,
    elevation: 20,
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

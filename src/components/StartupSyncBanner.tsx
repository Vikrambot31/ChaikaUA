import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import {
  getStartupSyncSnapshot,
  subscribeStartupSync,
  type StartupSyncSnapshot,
} from '../services/startupSync';

const BANNER_HEIGHT = 22;
const TOP_OFFSET = 38;

export default function StartupSyncBanner() {
  const [snapshot, setSnapshot] = useState<StartupSyncSnapshot>(getStartupSyncSnapshot());
  const [translateY] = useState(() => new Animated.Value(-BANNER_HEIGHT));

  useEffect(() => subscribeStartupSync(setSnapshot), []);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: snapshot.isActive ? 0 : -BANNER_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [snapshot.isActive, translateY]);

  if (!snapshot.isActive) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.banner, { transform: [{ translateY }] }]}
    >
      <View style={styles.inner}>
        <ActivityIndicator size="small" color="rgba(255, 246, 218, 0.55)" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: TOP_OFFSET,
    alignSelf: 'center',
    height: BANNER_HEIGHT,
    zIndex: 9998,
    elevation: 19,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { SCREEN_THEME } from '../utils/screenTheme';

type TactileCardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  elevated?: boolean;
  pressable?: boolean;
};

export default function TactileCard({
  children,
  onPress,
  style,
  elevated = true,
  pressable = true,
}: TactileCardProps) {
  const scaleVal = useRef(new Animated.Value(1)).current;
  const [elevationNum, setElevationNum] = useState(elevated ? 6 : 3);

  const staticShadow = {
    shadowColor: '#6B3A5A',
    shadowOpacity: elevated ? 0.28 : 0.14,
    shadowRadius: elevated ? 6 : 3,
    shadowOffset: { width: 2, height: elevated ? 5 : 3 },
    elevation: elevationNum,
  };

  const handlePressIn = () => {
    if (!pressable) return;
    setElevationNum(2);
    Animated.timing(scaleVal, { toValue: 0.97, duration: 80, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    if (!pressable) return;
    setElevationNum(elevated ? 6 : 3);
    Animated.timing(scaleVal, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  };

  if (onPress) {
    return (
      <Animated.View style={[styles.shell, staticShadow, { transform: [{ scale: scaleVal }] }, style] as any}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.pressableContent}
        >
          <View style={styles.bevelTopLeft} />
          <View style={styles.bevelBottomRight} />
          <View style={styles.gloss} />
          {children}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.shell, staticShadow, style] as any}>
      <View style={styles.bevelTopLeft} />
      <View style={styles.bevelBottomRight} />
      <View style={styles.gloss} />
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
    overflow: 'hidden',
  },
  pressableContent: {
    flex: 1,
  },
  bevelTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: SCREEN_THEME.bevelLight,
  },
  bevelBottomRight: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: SCREEN_THEME.bevelDark,
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
    backgroundColor: SCREEN_THEME.glassOverlay,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
});

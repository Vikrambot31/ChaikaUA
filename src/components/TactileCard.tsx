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
  const shadowOffsetY = useRef(new Animated.Value(elevated ? 5 : 3)).current;
  const shadowOpacity = useRef(new Animated.Value(elevated ? 0.28 : 0.14)).current;
  const shadowRadius = useRef(new Animated.Value(elevated ? 6 : 3)).current;
  const [elevationNum, setElevationNum] = useState(elevated ? 6 : 3);

  const animatedShadow = {
    shadowColor: '#5C3A1E',
    shadowOpacity,
    shadowRadius,
    shadowOffset: { width: 2, height: shadowOffsetY },
    elevation: elevationNum,
  };

  const handlePressIn = () => {
    if (!pressable) return;
    setElevationNum(2);
    Animated.parallel([
      Animated.timing(scaleVal, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(shadowOffsetY, { toValue: 2, duration: 80, useNativeDriver: false }),
      Animated.timing(shadowOpacity, { toValue: 0.10, duration: 80, useNativeDriver: false }),
      Animated.timing(shadowRadius, { toValue: 2, duration: 80, useNativeDriver: false }),
    ]).start();
  };

  const handlePressOut = () => {
    if (!pressable) return;
    setElevationNum(elevated ? 6 : 3);
    Animated.parallel([
      Animated.timing(scaleVal, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(shadowOffsetY, { toValue: elevated ? 5 : 3, duration: 120, useNativeDriver: false }),
      Animated.timing(shadowOpacity, { toValue: elevated ? 0.28 : 0.14, duration: 120, useNativeDriver: false }),
      Animated.timing(shadowRadius, { toValue: elevated ? 6 : 3, duration: 120, useNativeDriver: false }),
    ]).start();
  };

  if (onPress) {
    const flex = (style as any)?.flex;
    return (
      <Animated.View style={[{ transform: [{ scale: scaleVal }] }, flex !== undefined ? { flex } : null]}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[styles.shell, animatedShadow, style] as any}
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
    <Animated.View style={[styles.shell, animatedShadow, style] as any}>
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

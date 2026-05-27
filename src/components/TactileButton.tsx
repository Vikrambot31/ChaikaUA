import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SCREEN_THEME } from '../utils/screenTheme';

type TactileButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'social';
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: any;
  icon?: React.ReactNode;
};

const VARIANTS = {
  primary: {
    bg: SCREEN_THEME.terracotta,
    border: SCREEN_THEME.terracottaDark,
    text: '#FFFFFF',
    shadowColor: 'rgba(157, 94, 69, 0.40)',
  },
  secondary: {
    bg: SCREEN_THEME.cardCream,
    border: '#D5C8A8',
    text: SCREEN_THEME.textPrimary,
    shadowColor: 'rgba(128, 105, 69, 0.25)',
  },
  social: {
    bg: SCREEN_THEME.linenOlive,
    border: SCREEN_THEME.linenOliveDark,
    text: '#FFFFFF',
    shadowColor: 'rgba(120, 145, 91, 0.30)',
  },
};

export default function TactileButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
  textStyle,
  icon,
}: TactileButtonProps) {
  const v = VARIANTS[variant];
  const disabledTextColor = variant === 'primary' || variant === 'social' ? '#FFFFFF' : SCREEN_THEME.textPrimary;
  const scaleVal = useRef(new Animated.Value(1)).current;
  const translateYVal = useRef(new Animated.Value(0)).current;
  const [elevationNum, setElevationNum] = useState(6);

  const staticShadow = {
    shadowColor: v.shadowColor,
    shadowOpacity: 0.32,
    shadowRadius: 6,
    shadowOffset: { width: 1, height: 5 },
    elevation: elevationNum,
  };

  const handlePressIn = () => {
    if (disabled) return;
    setElevationNum(2);
    Animated.timing(scaleVal, { toValue: 0.96, duration: 80, useNativeDriver: true }).start();
    Animated.timing(translateYVal, { toValue: 2, duration: 80, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    setElevationNum(6);
    Animated.timing(scaleVal, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    Animated.timing(translateYVal, { toValue: 0, duration: 150, useNativeDriver: true }).start();
  };

  return (
    <Animated.View
      style={[
        styles.shell,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
        },
        staticShadow,
        { transform: [{ scale: scaleVal }, { translateY: translateYVal }] },
        disabled && styles.disabledBtn,
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={styles.pressableContent}
      >
        <View style={styles.bevelTopLeft} />
        <View style={styles.bevelBottom} />
        <View style={styles.gloss} />
        <View style={styles.insetShadow} />
        <View style={styles.innerContent}>
          {icon}
          <Text style={[styles.title, { color: disabled ? disabledTextColor : v.text }, textStyle]}>{title}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pressableContent: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bevelTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: SCREEN_THEME.bevelLight,
  },
  bevelBottom: {
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
    height: '45%',
    backgroundColor: SCREEN_THEME.glassShine,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  insetShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
    backgroundColor: SCREEN_THEME.bevelDark,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  innerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  disabledBtn: {
    opacity: 0.7,
  },
});

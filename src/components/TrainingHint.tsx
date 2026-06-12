import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SCREEN_THEME } from '../utils/screenTheme';

type TrainingHintProps = {
  text: string;
  onDismiss: () => void;
  /** Auto-hide after N ms. Pass 0 to disable. Default 12 000. */
  autoHideMs?: number;
};

const ACCENT = '#2F7D50';

export default function TrainingHint({ text, onDismiss, autoHideMs = 12_000 }: TrainingHintProps) {
  const slideY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 68, friction: 9 }),
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();

    if (autoHideMs > 0) {
      const timer = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(onDismiss);
      }, autoHideMs);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoHideMs, onDismiss, opacity, slideY]);

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ translateY: slideY }], opacity }]}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color="#FFF" />
        </View>
        <Text style={styles.text} numberOfLines={3}>{text}</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onDismiss} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="close" size={18} color={SCREEN_THEME.textMuted} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 24,
    left: 12,
    right: 12,
    zIndex: 999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EFFAF2',
    borderWidth: 1,
    borderColor: '#A8D5B7',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#2F241A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    color: SCREEN_THEME.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8F5EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

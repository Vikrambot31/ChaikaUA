import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const ACCENT = '#8D7AB8';

export const HINT_BADGE_LABELS: Record<string, string> = {
  ua: 'Потрібна допомога?',
  ru: 'Нужна помощь?',
  en: 'Need help?',
};

type HintBadgeProps = {
  visible: boolean;
  onTap: () => void;
  onDismiss: () => void;
  label?: string;
};

export default function HintBadge({
  visible,
  onTap,
  onDismiss,
  label = 'Нужна помощь?',
}: HintBadgeProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.wrapper, { opacity }]}>
      <TouchableOpacity
        style={styles.pill}
        onPress={onTap}
        activeOpacity={0.78}
      >
        <MaterialCommunityIcons name="lightbulb-on-outline" size={14} color={ACCENT} />
        <Text style={styles.label}>{label}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={onDismiss}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialCommunityIcons name="close" size={13} color={ACCENT} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ACCENT,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: ACCENT,
  },
  closeBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ACCENT,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 5,
    marginLeft: -3,
  },
});

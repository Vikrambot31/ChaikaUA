import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type HintType = 'hint' | 'warning' | 'success' | 'error';

interface InlineFieldHintProps {
  message?: string;
  type?: HintType;
  visible?: boolean;
}

const TYPE_STYLE: Record<HintType, { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; background: string; border: string }> = {
  hint: { icon: 'information-outline', color: '#3B6C8F', background: '#EEF7FC', border: '#B8DAEE' },
  warning: { icon: 'alert-circle-outline', color: '#8A5A12', background: '#FFF6D8', border: '#F2D477' },
  success: { icon: 'check-circle-outline', color: '#2F6B3E', background: '#EDF8EF', border: '#B9DDBE' },
  error: { icon: 'close-circle-outline', color: '#9B2C2C', background: '#FDECEC', border: '#F3B4B4' },
};

export const InlineFieldHint: React.FC<InlineFieldHintProps> = ({ message, type = 'hint', visible = true }) => {
  if (!visible || !message) return null;

  const current = TYPE_STYLE[type];

  return (
    <View style={[styles.container, { backgroundColor: current.background, borderColor: current.border }]}>
      <MaterialCommunityIcons name={current.icon} size={14} color={current.color} />
      <Text style={[styles.text, { color: current.color }]}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
    gap: 6,
  },
  text: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
});

export default InlineFieldHint;

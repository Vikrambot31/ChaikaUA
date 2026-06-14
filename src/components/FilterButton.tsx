import React from 'react';
import { StyleSheet, Text, TextStyle, TouchableOpacity, ViewStyle } from 'react-native';
import { PlaceType } from '../types/app';
import { SCREEN_THEME } from '../utils/screenTheme';
import { useAppTheme } from '../hooks/useAppTheme';

interface FilterButtonProps {
  type: PlaceType;
  label: string;
  isSelected: boolean;
  onPress: () => void;
}

const TYPE_COLORS: Record<PlaceType, string> = {
  [PlaceType.SHOP]: SCREEN_THEME.terracotta,
  [PlaceType.SCHOOL]: SCREEN_THEME.enamelBlue,
  [PlaceType.KINDERGARTEN]: '#4F8D5F',
  [PlaceType.CAFE]: SCREEN_THEME.woodGreen,
  [PlaceType.SERVICE]: '#5E6FA8',
  [PlaceType.PHARMACY]: '#C79C47',
  [PlaceType.SALON]: '#8A7AB1',
  [PlaceType.RESTAURANT]: '#B8713E',
  [PlaceType.BUILDING]: '#315B72',
};

const FilterButton: React.FC<FilterButtonProps> = ({ type, label, isSelected, onPress }) => {
  const { colors, isDark } = useAppTheme();
  const activeColor = TYPE_COLORS[type];
  const buttonStyle: ViewStyle = {
    backgroundColor: isSelected ? activeColor : colors.cardBg,
    borderColor: isSelected ? activeColor : colors.uiBorder,
  };
  const textStyle: TextStyle = {
    color: isSelected ? '#FFFFFF' : (isDark ? colors.textPrimary : SCREEN_THEME.textSecondary),
  };

  return (
    <TouchableOpacity activeOpacity={0.84} onPress={onPress} style={[styles.button, buttonStyle]}>
      <Text style={[styles.label, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#6E573B',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
  },
});

export default FilterButton;

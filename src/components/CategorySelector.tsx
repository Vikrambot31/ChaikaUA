import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_GROUPS } from '../data/categories';
import { SCREEN_THEME } from '../utils/screenTheme';

interface CategorySelectorProps {
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
}

const CategorySelector: React.FC<CategorySelectorProps> = ({ value, onSelect, disabled = false }) => {
  return (
    <View>
      <View style={styles.labelRow}>
        <MaterialCommunityIcons name="shape-outline" size={16} color={SCREEN_THEME.textSecondary} />
        <Text style={styles.label}>Група категорій</Text>
      </View>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={value} onValueChange={onSelect} enabled={!disabled}>
          <Picker.Item label="Оберіть групу..." value="" />
          {CATEGORY_GROUPS.map((group) => (
            <Picker.Item key={group.value} label={group.label} value={group.value} />
          ))}
        </Picker>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '800', color: SCREEN_THEME.textSecondary },
  pickerContainer: {
    backgroundColor: '#FFFDF6',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7D6B3',
    overflow: 'hidden',
  },
});

export default CategorySelector;


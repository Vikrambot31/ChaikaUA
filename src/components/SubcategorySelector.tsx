import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getSubcategories } from '../data/categories';
import { SCREEN_THEME } from '../utils/screenTheme';

interface SubcategorySelectorProps {
  group: string;
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
}

const SubcategorySelector: React.FC<SubcategorySelectorProps> = ({ group, value, onSelect, disabled = false }) => {
  const subcategories = getSubcategories(group);

  return (
    <View>
      <View style={styles.labelRow}>
        <MaterialCommunityIcons name="format-list-bulleted" size={16} color={SCREEN_THEME.textSecondary} />
        <Text style={styles.label}>Підкатегорія</Text>
      </View>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={value} onValueChange={onSelect} enabled={!disabled}>
          <Picker.Item label="Оберіть підкатегорію..." value="" />
          {subcategories.map((subcategory) => (
            <Picker.Item key={subcategory.value} label={subcategory.label} value={subcategory.value} />
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

export default SubcategorySelector;


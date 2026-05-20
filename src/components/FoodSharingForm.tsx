import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { CHAIKA_STORES, TIME_SLOTS } from '../data/categories';
import { SCREEN_THEME } from '../utils/screenTheme';

interface FoodSharingFormProps {
  store: string;
  timeSlot: string;
  onStoreChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}

const FoodSharingForm: React.FC<FoodSharingFormProps> = ({ store, timeSlot, onStoreChange, onTimeChange }) => {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Похід у магазин</Text>
      <Text style={styles.label}>Магазин</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={store} onValueChange={onStoreChange}>
          <Picker.Item label="Оберіть магазин..." value="" />
          {CHAIKA_STORES.map((item) => (
            <Picker.Item key={item.value} label={item.label} value={item.value} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>Коли буду там</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={timeSlot} onValueChange={onTimeChange}>
          <Picker.Item label="Оберіть час..." value="" />
          {TIME_SLOTS.map((item) => (
            <Picker.Item key={item.value} label={item.label} value={item.value} />
          ))}
        </Picker>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#FFF8EE',
    borderRadius: 26,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E8C97A',
  },
  title: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '800', color: SCREEN_THEME.textSecondary, marginBottom: 6, marginTop: 8 },
  pickerContainer: {
    backgroundColor: '#FFFDF6',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7D6B3',
    overflow: 'hidden',
  },
});

export default FoodSharingForm;


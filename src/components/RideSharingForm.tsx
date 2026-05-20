import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { TIME_SLOTS } from '../data/categories';
import { SCREEN_THEME } from '../utils/screenTheme';

interface RideSharingFormProps {
  destination: string;
  timeSlot: string;
  onDestinationChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}

const RideSharingForm: React.FC<RideSharingFormProps> = ({
  destination,
  timeSlot,
  onDestinationChange,
  onTimeChange,
}) => {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Деталі поїздки</Text>

      <Text style={styles.label}>Куди їхати</Text>
      <TextInput
        value={destination}
        onChangeText={onDestinationChange}
        placeholder="Вкажіть напрямок"
        placeholderTextColor={SCREEN_THEME.textSecondary}
        style={styles.input}
      />

      <Text style={styles.label}>Коли виїзд</Text>
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
  input: {
    backgroundColor: '#FFFDF6',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: SCREEN_THEME.textPrimary,
    borderWidth: 1,
    borderColor: '#E7D6B3',
    marginBottom: 4,
  },
  pickerContainer: {
    backgroundColor: '#FFFDF6',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7D6B3',
    overflow: 'hidden',
  },
});

export default RideSharingForm;


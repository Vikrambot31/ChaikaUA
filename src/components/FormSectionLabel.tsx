import React from 'react';
import { StyleSheet, Text, View, ViewStyle, TextStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Props = {
  label: string;
  completed?: boolean;
  containerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  testID?: string;
};

const FormSectionLabel: React.FC<Props> = ({ label, completed = false, containerStyle, labelStyle, testID }) => (
  <View style={[styles.row, containerStyle]} testID={testID}>
    <Text style={[styles.label, labelStyle]}>{label}</Text>
    {completed ? <MaterialCommunityIcons name="check-circle" size={16} color="#2EB85C" /> : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    flexShrink: 1,
  },
});

export default FormSectionLabel;

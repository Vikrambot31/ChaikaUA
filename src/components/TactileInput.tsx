import React from 'react';
import { StyleSheet, TextInput, View, TextInputProps } from 'react-native';
import { SCREEN_THEME } from '../utils/screenTheme';

type TactileInputProps = TextInputProps & {
  error?: boolean;
};

export default function TactileInput({
  error = false,
  style,
  ...rest
}: TactileInputProps) {
  return (
    <View style={styles.outer}>
      <View style={styles.insetTop} />
      <View style={styles.insetBottom} />
      <TextInput
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor={SCREEN_THEME.textMuted}
        underlineColorAndroid="transparent"
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: SCREEN_THEME.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: -1 },
    elevation: 1,
  },
  insetTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: SCREEN_THEME.bevelDark,
    zIndex: 1,
  },
  insetBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: SCREEN_THEME.bevelLightSoft,
    zIndex: 1,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: '600',
    color: SCREEN_THEME.textPrimary,
    backgroundColor: 'transparent',
  },
  inputError: {
    borderColor: '#C62828',
    borderWidth: 1,
  },
});

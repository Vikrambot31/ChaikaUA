import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../utils/constants';
import { useTranslation } from '../i18n/useTranslation';
import { useAppTheme } from '../hooks/useAppTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Optional override for the body text (e.g. "Register to write messages") */
  message?: string;
};

/**
 * Soft bottom-sheet shown when a guest tries to perform an action that
 * requires registration (write, upload, like, participate, etc.).
 * The underlying screen remains fully visible — no blocking navigation.
 */
export default function GuestRegisterBanner({ visible, onClose, message }: Props) {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const copy = t.guestBanner;

  const handleLogin = () => {
    onClose();
    navigation.navigate('LoginScreen');
  };

  const handleRegister = () => {
    onClose();
    navigation.navigate('RegisterScreenFull');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.paper, borderColor: colors.uiBorder }]}>
        <View style={[styles.handle, { backgroundColor: colors.uiBorder }]} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>{copy.title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{message ?? copy.body}</Text>

        <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} activeOpacity={0.85}>
          <Text style={styles.btnPrimaryText}>{copy.login}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnSecondary} onPress={handleRegister} activeOpacity={0.85}>
          <Text style={[styles.btnSecondaryText, { color: isDark ? colors.textPrimary : COLORS.primary }]}>{copy.register}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnBack} onPress={onClose} activeOpacity={0.7}>
          <Text style={[styles.btnBackText, { color: colors.textMuted }]}>{copy.later}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A2E',
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  btnSecondary: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnSecondaryText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  btnBack: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnBackText: {
    color: '#999',
    fontSize: 14,
  },
});

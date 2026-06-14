import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import TactileButton from './TactileButton';

type Lang = 'ua' | 'ru' | 'en';

interface Props {
  visible: boolean;
  loading: boolean;
  userName?: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

const MIN_REASON_LENGTH = 30;

const UI: Record<Lang, {
  title: string;
  description: string;
  placeholder: string;
  confirmBtn: string;
  cancelBtn: string;
  tooShort: string;
}> = {
  ua: {
    title: 'Заблокувати користувача',
    description: 'Опишіть, чому ви блокуєте цього користувача. Це побачить адміністратор.',
    placeholder: 'Причина блокування (мінімум 30 символів)',
    confirmBtn: 'Заблокувати',
    cancelBtn: 'Скасувати',
    tooShort: 'Мінімум 30 символів',
  },
  ru: {
    title: 'Заблокировать пользователя',
    description: 'Опишите, почему вы блокируете этого пользователя. Это увидит администратор.',
    placeholder: 'Причина блокировки (минимум 30 символов)',
    confirmBtn: 'Заблокировать',
    cancelBtn: 'Отмена',
    tooShort: 'Минимум 30 символов',
  },
  en: {
    title: 'Block user',
    description: 'Describe why you are blocking this user. This will be visible to the administrator.',
    placeholder: 'Block reason (minimum 30 characters)',
    confirmBtn: 'Block',
    cancelBtn: 'Cancel',
    tooShort: 'Minimum 30 characters',
  },
};

export default function BlockReasonModal({ visible, loading, userName, onConfirm, onClose }: Props) {
  const language = useSelector(
    (state: RootState) => (state.language?.current ?? 'ua') as Lang,
  );
  const t = UI[language];
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!visible) setReason('');
  }, [visible]);

  const trimmedReasonLength = reason.trim().length;
  const showLengthError = reason.length > 0 && trimmedReasonLength < MIN_REASON_LENGTH;
  const isValid = trimmedReasonLength >= MIN_REASON_LENGTH;

  const handleConfirm = () => {
    if (!isValid || loading) return;
    onConfirm(reason.trim());
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.handle} />

          <Text style={styles.title}>{t.title}</Text>
          {userName ? (
            <Text style={styles.name} numberOfLines={1}>
              {userName}
            </Text>
          ) : null}
          <Text style={styles.description}>{t.description}</Text>

          <TextInput
            style={[
              styles.input,
              showLengthError && styles.inputError,
            ]}
            value={reason}
            onChangeText={setReason}
            placeholder={t.placeholder}
            placeholderTextColor="#9F958E"
            multiline
            maxLength={500}
            textAlignVertical="top"
            autoFocus
          />

          {showLengthError ? (
            <Text style={styles.hintText}>{t.tooShort}</Text>
          ) : null}

          <TactileButton
            title={t.confirmBtn}
            onPress={handleConfirm}
            variant="primary"
            disabled={!isValid || loading}
            loading={loading}
            style={styles.confirmBtn}
          />

          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.8}>
            <Text style={styles.cancelText}>{t.cancelBtn}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FBF7F2',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0CEB6',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2D2520',
    textAlign: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7A1E5C',
    textAlign: 'center',
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: '#7A6D64',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 17,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#0C0A09',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  inputError: {
    borderColor: '#B91C1C',
  },
  hintText: {
    fontSize: 11,
    color: '#B91C1C',
    fontWeight: '700',
    marginBottom: 8,
    marginLeft: 4,
  },
  confirmBtn: {
    backgroundColor: '#7A2551',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7A6D64',
  },
});

import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { reportBlockService, type ReportReason } from '../services/reportBlockService';
import { useAppTheme } from '../hooks/useAppTheme';

type Lang = 'ua' | 'ru' | 'en';

interface Props {
  visible: boolean;
  onClose: () => void;
  contentId: string;
  contentType: string;
  contentTitle?: string;
  reportedUserId?: string;
  language: Lang;
}

const REASONS: { key: ReportReason; ua: string; ru: string; en: string }[] = [
  { key: 'spam',         ua: 'Спам',                ru: 'Спам',                  en: 'Spam' },
  { key: 'fake',         ua: 'Хибна інформація',    ru: 'Неверная информация',   en: 'Incorrect info' },
  { key: 'inappropriate',ua: 'Неприйнятний вміст',  ru: 'Неприемлемый контент',  en: 'Inappropriate' },
  { key: 'other',        ua: 'Інше',                ru: 'Другое',                en: 'Other' },
];

const UI_TEXT = {
  ua: {
    title: 'Поскаржитись',
    placeholder: 'Опишіть проблему детально... (обов\'язково)',
    submit: 'Надіслати',
    cancel: 'Скасувати',
    successTitle: 'Скаргу надіслано',
    successMsg: 'Дякуємо. Ваша скарга буде розглянута.',
    errorTitle: 'Помилка',
    errorMsg: 'Не вдалося надіслати скаргу. Спробуйте пізніше.',
    descRequired: 'Опишіть проблему (мінімум 10 символів)',
  },
  ru: {
    title: 'Пожаловаться',
    placeholder: 'Опишите проблему подробно... (обязательно)',
    submit: 'Отправить',
    cancel: 'Отмена',
    successTitle: 'Жалоба отправлена',
    successMsg: 'Спасибо. Ваша жалоба будет рассмотрена.',
    errorTitle: 'Ошибка',
    errorMsg: 'Не удалось отправить жалобу. Попробуйте позже.',
    descRequired: 'Опишите проблему (минимум 10 символов)',
  },
  en: {
    title: 'Report',
    placeholder: 'Describe the issue in detail... (required)',
    submit: 'Submit',
    cancel: 'Cancel',
    successTitle: 'Report submitted',
    successMsg: 'Thank you. Your report will be reviewed.',
    errorTitle: 'Error',
    errorMsg: 'Failed to submit report. Please try again later.',
    descRequired: 'Describe the issue (minimum 10 characters)',
  },
} as const;

export default function ContentComplaintModal({
  visible,
  onClose,
  contentId,
  contentType,
  contentTitle,
  reportedUserId,
  language,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const t = UI_TEXT[language];

  const [reason, setReason] = useState<ReportReason>('other');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason('other');
    setDescription('');
    setSubmitting(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (description.trim().length < 10) {
      Alert.alert(t.errorTitle, t.descRequired);
      return;
    }
    setSubmitting(true);
    try {
      await reportBlockService.writeContentReport({
        contentId,
        contentType,
        contentTitle,
        reportedUserId: reportedUserId || '',
        reason,
        description: description.trim(),
      });
      Alert.alert(t.successTitle, t.successMsg);
      reset();
    } catch (err) {
      console.warn('[ContentComplaintModal] submit error:', err);
      Alert.alert(t.errorTitle, t.errorMsg);
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={reset}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={reset}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.paper }]} onPress={() => undefined}>
          <View style={[styles.handle, { backgroundColor: colors.uiBorder }]} />

          <View style={styles.titleRow}>
            <MaterialCommunityIcons name="flag-outline" size={18} color="#C85D4A" />
            <Text style={[styles.title, { color: colors.textPrimary }]}>{t.title}</Text>
          </View>

          {/* Reason pills */}
          <View style={styles.reasonRow}>
            {REASONS.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={[styles.pill, reason === r.key && styles.pillActive]}
                onPress={() => setReason(r.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, { color: colors.textPrimary }, reason === r.key && styles.pillTextActive]}>
                  {r[language]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.uiBorder, color: colors.textPrimary }]}
            value={description}
            onChangeText={setDescription}
            placeholder={t.placeholder}
            placeholderTextColor={colors.placeholder}
            multiline
            maxLength={500}
            editable={!submitting}
          />

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.disabled]}
            onPress={() => void handleSubmit()}
            disabled={submitting}
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>{submitting ? '...' : t.submit}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={reset} activeOpacity={0.8}>
            <Text style={[styles.cancelText, { color: isDark ? colors.textPrimary : '#7A6D64' }]}>{t.cancel}</Text>
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, justifyContent: 'center',
  },
  title: {
    fontSize: 16, fontWeight: '900',
  },
  reasonRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14,
  },
  pill: {
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#E4D0AB', backgroundColor: '#F7F3EE',
  },
  pillActive: {
    borderColor: '#C85D4A', backgroundColor: 'rgba(200,93,74,0.1)',
  },
  pillText: {
    fontSize: 13, fontWeight: '700',
  },
  pillTextActive: {
    color: '#C85D4A',
  },
  input: {
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: '#C85D4A', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 8,
  },
  submitText: {
    color: '#fff', fontWeight: '900', fontSize: 15,
  },
  disabled: { opacity: 0.6 },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 14, fontWeight: '700' },
});

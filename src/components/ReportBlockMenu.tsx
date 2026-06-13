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
import TactileButton from './TactileButton';
import { useAppTheme } from '../hooks/useAppTheme';

type Lang = 'ua' | 'ru' | 'en';

interface Props {
  visible: boolean;
  onClose: () => void;
  listingId: string;
  reportedUserId: string;
  currentUserId: string;
  language: Lang;
  onBlock: (userId: string) => void;
}

const REPORT_REASONS: ReportReason[] = ['spam', 'inappropriate', 'fake', 'other'];

const UI_TEXT: Record<Lang, {
  menuTitle: string;
  reportOption: string;
  blockOption: string;
  reportTitle: string;
  reasons: Record<ReportReason, string>;
  descriptionPlaceholder: string;
  submitBtn: string;
  cancelBtn: string;
  blockConfirmTitle: string;
  blockConfirmMsg: string;
  blockConfirmBtn: string;
  blockCancelBtn: string;
  reportSuccess: string;
  blockSuccess: string;
  errorTitle: string;
  errorGeneric: string;
}> = {
  ua: {
    menuTitle: 'Дії',
    reportOption: 'Поскаржитись',
    blockOption: 'Заблокувати',
    reportTitle: 'Причина скарги',
    reasons: {
      spam: 'Спам',
      inappropriate: 'Непристойний вміст',
      fake: 'Фейковий профіль',
      other: 'Інше',
    },
    descriptionPlaceholder: 'Додатковий опис (необов\'язково)',
    submitBtn: 'Надіслати',
    cancelBtn: 'Скасувати',
    blockConfirmTitle: 'Заблокувати користувача?',
    blockConfirmMsg: 'Ви більше не бачитимете анкети цієї людини.',
    blockConfirmBtn: 'Заблокувати',
    blockCancelBtn: 'Скасувати',
    reportSuccess: 'Скаргу надіслано',
    blockSuccess: 'Користувача заблоковано',
    errorTitle: 'Помилка',
    errorGeneric: 'Не вдалося виконати дію. Спробуйте пізніше.',
  },
  ru: {
    menuTitle: 'Действия',
    reportOption: 'Пожаловаться',
    blockOption: 'Заблокировать',
    reportTitle: 'Причина жалобы',
    reasons: {
      spam: 'Спам',
      inappropriate: 'Непристойный контент',
      fake: 'Фейковый профиль',
      other: 'Другое',
    },
    descriptionPlaceholder: 'Дополнительное описание (необязательно)',
    submitBtn: 'Отправить',
    cancelBtn: 'Отмена',
    blockConfirmTitle: 'Заблокировать пользователя?',
    blockConfirmMsg: 'Вы больше не будете видеть анкеты этого человека.',
    blockConfirmBtn: 'Заблокировать',
    blockCancelBtn: 'Отмена',
    reportSuccess: 'Жалоба отправлена',
    blockSuccess: 'Пользователь заблокирован',
    errorTitle: 'Ошибка',
    errorGeneric: 'Не удалось выполнить действие. Попробуйте позже.',
  },
  en: {
    menuTitle: 'Actions',
    reportOption: 'Report',
    blockOption: 'Block',
    reportTitle: 'Report reason',
    reasons: {
      spam: 'Spam',
      inappropriate: 'Inappropriate content',
      fake: 'Fake profile',
      other: 'Other',
    },
    descriptionPlaceholder: 'Additional details (optional)',
    submitBtn: 'Submit',
    cancelBtn: 'Cancel',
    blockConfirmTitle: 'Block this user?',
    blockConfirmMsg: 'You will no longer see profiles from this person.',
    blockConfirmBtn: 'Block',
    blockCancelBtn: 'Cancel',
    reportSuccess: 'Report submitted',
    blockSuccess: 'User blocked',
    errorTitle: 'Error',
    errorGeneric: 'Action failed. Please try again later.',
  },
};

export default function ReportBlockMenu({
  visible,
  onClose,
  listingId,
  reportedUserId,
  currentUserId: _currentUserId,
  language,
  onBlock,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const t = UI_TEXT[language];
  const [mode, setMode] = useState<'menu' | 'report'>('menu');
  const [reason, setReason] = useState<ReportReason>('spam');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetAndClose = () => {
    setMode('menu');
    setReason('spam');
    setDescription('');
    setSubmitting(false);
    onClose();
  };

  const handleReport = async () => {
    setSubmitting(true);
    try {
      await reportBlockService.writeReport({
        reportedUserId,
        reportedListingId: listingId,
        reason,
        description: description.trim(),
        source: 'kontakt-xxx',
      });
      Alert.alert(t.reportSuccess);
      resetAndClose();
    } catch (error) {
      console.warn('[ReportBlockMenu] report failed:', error);
      Alert.alert(t.errorTitle, t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlockPress = () => {
    Alert.alert(t.blockConfirmTitle, t.blockConfirmMsg, [
      { text: t.blockCancelBtn, style: 'cancel' },
      {
        text: t.blockConfirmBtn,
        style: 'destructive',
        onPress: async () => {
          try {
            await reportBlockService.setBlock(reportedUserId);
            onBlock(reportedUserId);
            Alert.alert(t.blockSuccess);
            resetAndClose();
          } catch (error) {
            console.warn('[ReportBlockMenu] block failed:', error);
            Alert.alert(t.errorTitle, t.errorGeneric);
          }
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={resetAndClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={resetAndClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.paper }]} onPress={() => undefined}>
          <View style={[styles.handle, { backgroundColor: colors.uiBorder }]} />

          {mode === 'menu' ? (
            <>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{t.menuTitle}</Text>
              <View style={styles.options}>
                <TouchableOpacity
                  style={styles.optionBtn}
                  onPress={() => setMode('report')}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="flag-outline" size={20} color={colors.accentText} style={styles.optionIcon} />
                  <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>{t.reportOption}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.optionBtn}
                  onPress={handleBlockPress}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="block-helper" size={20} color="#B91C1C" style={styles.optionIcon} />
                  <Text style={[styles.optionLabel, { color: '#B91C1C' }]}>{t.blockOption}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{t.reportTitle}</Text>
              <View style={styles.options}>
                {REPORT_REASONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.reasonBtn, reason === r && styles.reasonBtnActive]}
                    onPress={() => setReason(r)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.reasonLabel, { color: colors.textPrimary }, reason === r && styles.reasonLabelActive]}>{t.reasons[r]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.descInput, { backgroundColor: colors.inputBg, borderColor: colors.uiBorder, color: colors.textPrimary }]}
                value={description}
                onChangeText={setDescription}
                placeholder={t.descriptionPlaceholder}
                placeholderTextColor={colors.placeholder}
                multiline
                maxLength={500}
              />
              <TactileButton
                title={t.submitBtn}
                onPress={handleReport}
                variant="primary"
                disabled={submitting}
                loading={submitting}
                style={styles.submitBtn}
              />
            </>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={resetAndClose} activeOpacity={0.8}>
            <Text style={[styles.cancelText, { color: isDark ? colors.textPrimary : '#7A2551' }]}>{t.cancelBtn}</Text>
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
    marginBottom: 16,
  },
  options: {
    gap: 8,
    marginBottom: 16,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F3EE',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  optionIcon: {
    marginRight: 12,
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2520',
  },
  reasonBtn: {
    backgroundColor: '#F7F3EE',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  reasonBtnActive: {
    borderColor: '#7A2551',
    backgroundColor: 'rgba(122,37,81,0.1)',
  },
  reasonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2520',
  },
  reasonLabelActive: {
    color: '#7A2551',
  },
  descInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#0C0A09',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: '#7A2551',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  submitBtnText: {
    color: '#1C1917',
    fontWeight: '900',
    fontSize: 15,
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

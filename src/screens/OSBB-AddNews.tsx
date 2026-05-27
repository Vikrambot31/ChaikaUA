import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { selectIsOsbbManager } from '../redux/slices/osbbSlice';
import { useOsbbMembership } from '../hooks/useOsbbMembership';
import { SCREEN_THEME } from '../utils/screenTheme';
import { addOsbbNews, updateOsbbNews } from '../services/osbbNews';

type AppNav = NativeStackNavigationProp<Record<string, object | undefined>>;
type Lang = 'ua' | 'ru' | 'en';
export type NewsPriority = 'urgent' | 'important' | 'info';

export interface NewsItem {
  id: string;
  priority: NewsPriority;
  title: string;
  body: string;
  date: string;
}

type RouteParams = {
  OsbbAddNewsScreen: { editItem?: NewsItem };
};

const UI_TEXT = {
  ua: {
    headerAdd: 'Додати новину',
    headerEdit: 'Редагувати',
    priorityLabel: 'Пріоритет',
    urgent: 'Терміново',
    important: 'Важливо',
    info: 'Інфо',
    titleLabel: 'Заголовок',
    titlePlaceholder: 'Введіть заголовок...',
    bodyLabel: 'Текст новини',
    bodyPlaceholder: 'Введіть текст повідомлення...',
    save: 'Зберегти',
    preview: 'Попередній перегляд',
    successTitle: 'Збережено',
    successMsg: 'Новину збережено на модерацію.',
    validationTitle: 'Заповніть поля',
    validationMsg: 'Заголовок і текст є обов\'язковими.',
    noBuildingId: 'Не вибрано будинок ОСББ. Поверніться назад і спочатку завершіть налаштування.',
    managerOnly: 'Лише підтверджений представник правління ОСББ може публікувати новини.',
    charsLeft: 'символів залишилось',
    dateLabel: 'Сьогодні',
  },
  ru: {
    headerAdd: 'Добавить новость',
    headerEdit: 'Редактировать',
    priorityLabel: 'Приоритет',
    urgent: 'Срочно',
    important: 'Важно',
    info: 'Инфо',
    titleLabel: 'Заголовок',
    titlePlaceholder: 'Введите заголовок...',
    bodyLabel: 'Текст новости',
    bodyPlaceholder: 'Введите текст сообщения...',
    save: 'Сохранить',
    preview: 'Предпросмотр',
    successTitle: 'Сохранено',
    successMsg: 'Новость сохранена на модерацию.',
    validationTitle: 'Заполните поля',
    validationMsg: 'Заголовок и текст обязательны.',
    noBuildingId: 'Не выбран дом ОСББ. Вернитесь назад и сначала завершите настройку.',
    managerOnly: 'Только подтверждённый представитель правления ОСББ может публиковать новости.',
    charsLeft: 'символов осталось',
    dateLabel: 'Сегодня',
  },
  en: {
    headerAdd: 'Add news',
    headerEdit: 'Edit',
    priorityLabel: 'Priority',
    urgent: 'Urgent',
    important: 'Important',
    info: 'Info',
    titleLabel: 'Title',
    titlePlaceholder: 'Enter title...',
    bodyLabel: 'News body',
    bodyPlaceholder: 'Enter message text...',
    save: 'Save',
    preview: 'Preview',
    successTitle: 'Saved',
    successMsg: 'News item was sent to moderation.',
    validationTitle: 'Check fields',
    validationMsg: 'Title and body are required.',
    noBuildingId: 'No OSBB building selected. Set up a building in the OSBB section before publishing.',
    managerOnly: 'Only an approved OSBB board representative can publish news.',
    charsLeft: 'characters left',
    dateLabel: 'Today',
  },
} as const;

interface PriorityOption {
  key: NewsPriority;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  activeColor: string;
}

const PRIORITY_OPTIONS: PriorityOption[] = [
  { key: 'urgent', icon: 'alert-circle', activeColor: '#C0392B' },
  { key: 'important', icon: 'star-circle', activeColor: '#D4AC0D' },
  { key: 'info', icon: 'information', activeColor: SCREEN_THEME.enamelBlue },
];

const CARD_BASE = {
  backgroundColor: SCREEN_THEME.paperStrong,
  borderRadius: 24,
  borderWidth: 1,
  borderColor: '#E4D0AB',
  shadowColor: '#6E573B',
  shadowOpacity: 0.1,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
} as const;

const OsbbAddNewsScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const route = useRoute<RouteProp<RouteParams, 'OsbbAddNewsScreen'>>();
  const editItem = route.params?.editItem;
  const isEditMode = Boolean(editItem);

  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const buildingId = useSelector((state: RootState) => state.osbb.buildingId);
  const isManager = useSelector(selectIsOsbbManager);
  useOsbbMembership();
  const t = UI_TEXT[language];

  const [priority, setPriority] = useState<NewsPriority>(editItem?.priority ?? 'info');
  const [title, setTitle] = useState(editItem?.title ?? '');
  const [body, setBody] = useState(editItem?.body ?? '');
  const [saving, setSaving] = useState(false);

  const TITLE_MAX = 100;
  const BODY_MAX = 1000;
  const isFormValid = title.trim().length > 0 && body.trim().length > 0;

  const previewAccent = useMemo(() => {
    switch (priority) {
      case 'urgent':
        return { bg: '#FFF1EF', border: '#E4B0AA', tag: '#B9402D' };
      case 'important':
        return { bg: '#FFF8E5', border: '#E5CF8A', tag: '#A87A00' };
      default:
        return { bg: '#EEF6FC', border: '#B9D3E8', tag: '#356D93' };
    }
  }, [priority]);

  const handleSave = async () => {
    if (!isFormValid) {
      Alert.alert(t.validationTitle, t.validationMsg);
      return;
    }
    if (!buildingId) {
      Alert.alert(t.validationTitle, t.noBuildingId);
      return;
    }
    if (!isManager) {
      Alert.alert(t.validationTitle, t.managerOnly);
      return;
    }

    setSaving(true);
    try {
      if (editItem) {
        await updateOsbbNews(buildingId, editItem.id, {
          priority,
          title: title.trim(),
          body: body.trim(),
        });
      } else {
        await addOsbbNews(buildingId, { priority, title: title.trim(), body: body.trim() });
      }

      Alert.alert(t.successTitle, t.successMsg, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.75}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditMode ? t.headerEdit : t.headerAdd}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>{t.priorityLabel}</Text>
            <View style={styles.priorityRow}>
              {PRIORITY_OPTIONS.map((opt) => {
                const isActive = priority === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.priorityBtn,
                      isActive && {
                        backgroundColor: `${opt.activeColor}22`,
                        borderColor: opt.activeColor,
                      },
                    ]}
                    onPress={() => setPriority(opt.key)}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name={opt.icon} size={17} color={isActive ? opt.activeColor : SCREEN_THEME.textSecondary} />
                    <Text style={[styles.priorityBtnText, isActive && { color: opt.activeColor }]}>{t[opt.key]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>{t.titleLabel}</Text>
              <Text style={styles.charsHint}>{TITLE_MAX - title.length} {t.charsLeft}</Text>
            </View>
            <TextInput
              style={styles.titleInput}
              placeholder={t.titlePlaceholder}
              placeholderTextColor={SCREEN_THEME.textMuted}
              value={title}
              onChangeText={setTitle}
              maxLength={TITLE_MAX}
              returnKeyType="next"
            />
          </View>

          <View style={styles.card}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>{t.bodyLabel}</Text>
              <Text style={styles.charsHint}>{BODY_MAX - body.length} {t.charsLeft}</Text>
            </View>
            <TextInput
              style={styles.bodyInput}
              placeholder={t.bodyPlaceholder}
              placeholderTextColor={SCREEN_THEME.textMuted}
              value={body}
              onChangeText={setBody}
              maxLength={BODY_MAX}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={styles.card}>
            <View style={styles.previewLabelRow}>
              <Text style={styles.fieldLabel}>{t.preview}</Text>
              <View style={styles.previewBadge}>
                <MaterialCommunityIcons name="eye-outline" size={14} color={SCREEN_THEME.textSecondary} />
                <Text style={styles.previewBadgeText}>{t.preview}</Text>
              </View>
            </View>
            <View style={[styles.previewCard, { backgroundColor: previewAccent.bg, borderColor: previewAccent.border }]}> 
              <View style={styles.previewTopRow}>
                <Text style={[styles.previewTag, { color: previewAccent.tag }]}>{t[priority]}</Text>
                <Text style={styles.previewDate}>{t.dateLabel}</Text>
              </View>
              <Text style={styles.previewTitle}>{title.trim() || t.titlePlaceholder}</Text>
              <Text style={styles.previewBody}>{body.trim() || t.bodyPlaceholder}</Text>
            </View>
          </View>

          {!buildingId ? (
            <View style={styles.noBuildingBanner}>
              <MaterialCommunityIcons name="information-outline" size={16} color="#8A5A00" />
              <Text style={styles.noBuildingText}>{t.noBuildingId}</Text>
            </View>
          ) : !isManager ? (
            <View style={styles.noBuildingBanner}>
              <MaterialCommunityIcons name="shield-lock-outline" size={16} color="#8A5A00" />
              <Text style={styles.noBuildingText}>{t.managerOnly}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.saveButton, (!isFormValid || saving || !isManager) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!isFormValid || saving || !isManager}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save-outline" size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>{t.save}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: SCREEN_THEME.appBg,
  },
  backBtn: { width: 40, alignItems: 'center' },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  scrollContent: { padding: 16, paddingBottom: 48 },
  card: {
    ...CARD_BASE,
    padding: 16,
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  charsHint: {
    fontSize: 11,
    fontWeight: '600',
    color: SCREEN_THEME.textMuted,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.cardCream,
  },
  priorityBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
  },
  titleInput: {
    fontSize: 16,
    fontWeight: '700',
    color: SCREEN_THEME.textPrimary,
    backgroundColor: SCREEN_THEME.cardCream,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  bodyInput: {
    fontSize: 15,
    fontWeight: '500',
    color: SCREEN_THEME.textPrimary,
    backgroundColor: SCREEN_THEME.cardCream,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 13,
    minHeight: 160,
    lineHeight: 22,
  },
  previewLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: SCREEN_THEME.cardCream,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  previewBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
  },
  previewCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  previewTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewTag: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  previewDate: {
    fontSize: 11,
    color: SCREEN_THEME.textMuted,
    fontWeight: '700',
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 10,
  },
  previewBody: {
    fontSize: 15,
    lineHeight: 22,
    color: SCREEN_THEME.textPrimary,
  },
  saveButton: {
    marginTop: 8,
    backgroundColor: SCREEN_THEME.woodGreen,
    borderRadius: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: SCREEN_THEME.woodGreen,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  noBuildingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F0C040',
    padding: 12,
    marginBottom: 10,
  },
  noBuildingText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#8A5A00',
    lineHeight: 18,
  },
});

export default OsbbAddNewsScreen;



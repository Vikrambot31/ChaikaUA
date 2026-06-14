import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { OsbbCollection, addOsbbCollection, subscribeOsbbCollections } from '../services/osbbCollections';
import { useOsbbMembership } from '../hooks/useOsbbMembership';
import { RATE_LIMITERS } from '../utils/rateLimiter';
import { safeOpenExternalUrl } from '../utils/communicationActions';
import type { DetailItemData } from '../utils/detailViewTypes';
import MiniTabBar from '../components/MiniTabBar';
import { useAppTheme } from '../hooks/useAppTheme';

type AppNav = NativeStackNavigationProp<Record<string, object | undefined>>;
type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    title: 'Збір коштів',
    restrictedTitle: 'Доступ обмежений',
    restrictedBody: 'Лише підтверджений представник правління ОСББ може створювати теми зборів і реквізити оплати.',
    addCollection: 'Додати збір',
    collectionTopic: 'Тема збору',
    description: 'Опис (необов\'язково)',
    deadline: 'Дедлайн (РРРР-ММ-ДД)',
    target: 'Ціль, грн',
    monobankLink: 'Посилання Monobank',
    add: 'Додати',
    adding: 'Додаємо...',
    noCollections: 'Зборів поки немає',
    noCollectionsBody: 'Додайте першу тему збору і посилання на оплату.',
    collected: 'Зібрано',
    from: 'із',
    pay: 'Оплатити',
    osbb: 'ОСББ',
    onlyApproved: 'Лише підтверджений голова правління ОСББ може створювати теми зборів і реквізити оплати.',
    setupFirst: 'Спочатку налаштуйте будинок ОСББ.',
    successMsg: 'Збір успішно додано! Він з\'явиться після модерації.',
    alertTitle: 'Помилка',
    errTitle: 'Вкажіть тему збору.',
    errTarget: 'Ціль має бути більше 0.',
    errUrl: 'Вкажіть посилання на оплату.',
    errDeadline: 'Дата має бути у форматі РРРР-ММ-ДД.',
    errRateLimit: (secs: number) => `Зачекайте ${secs} сек. перед наступною відправкою.`,
    deadlineUntil: 'до',
  },
  ru: {
    title: 'Сбор средств',
    restrictedTitle: 'Доступ ограничен',
    restrictedBody: 'Только подтвержденный представитель правления ОСББ может создавать темы сборов и реквизиты оплаты.',
    addCollection: 'Добавить сбор',
    collectionTopic: 'Тема сбора',
    description: 'Описание (необязательно)',
    deadline: 'Дедлайн (ГГГГ-ММ-ДД)',
    target: 'Цель, грн',
    monobankLink: 'Ссылка Monobank',
    add: 'Добавить',
    adding: 'Добавляем...',
    noCollections: 'Сборов пока нет',
    noCollectionsBody: 'Добавьте первую тему сбора и ссылку на оплату.',
    collected: 'Собрано',
    from: 'из',
    pay: 'Оплатить',
    osbb: 'ОСББ',
    onlyApproved: 'Только подтверждённый глава правления ОСББ может создавать темы сборов и реквизиты оплаты.',
    setupFirst: 'Сначала настройте дом ОСББ.',
    successMsg: 'Сбор успешно добавлен! Он появится после модерации.',
    alertTitle: 'Ошибка',
    errTitle: 'Укажите тему сбора.',
    errTarget: 'Цель должна быть больше 0.',
    errUrl: 'Укажите ссылку на оплату.',
    errDeadline: 'Дата должна быть в формате ГГГГ-ММ-ДД.',
    errRateLimit: (secs: number) => `Подождите ${secs} сек. перед следующей отправкой.`,
    deadlineUntil: 'до',
  },
  en: {
    title: 'Fundraising',
    restrictedTitle: 'Access restricted',
    restrictedBody: 'Only an approved OSBB board head can create collection topics and payment details.',
    addCollection: 'Add collection',
    collectionTopic: 'Collection topic',
    description: 'Description (optional)',
    deadline: 'Deadline (YYYY-MM-DD)',
    target: 'Target, UAH',
    monobankLink: 'Monobank link',
    add: 'Add',
    adding: 'Adding...',
    noCollections: 'No collections yet',
    noCollectionsBody: 'Add the first collection topic and payment link.',
    collected: 'Collected',
    from: 'of',
    pay: 'Pay',
    osbb: 'OSBB',
    onlyApproved: 'Only an approved OSBB board head can create collection topics and payment details.',
    setupFirst: 'Set up OSBB building first.',
    successMsg: 'Collection added! It will appear after moderation.',
    alertTitle: 'Error',
    errTitle: 'Enter a collection topic.',
    errTarget: 'Target must be greater than 0.',
    errUrl: 'Enter a payment link.',
    errDeadline: 'Date must be in YYYY-MM-DD format.',
    errRateLimit: (secs: number) => `Please wait ${secs} seconds before submitting again.`,
    deadlineUntil: 'until',
  },
} as const;

const DEADLINE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_PAYMENT_HOSTS = ['send.monobank.ua', 'jar.monobank.ua', 'mono.bank'];

const mapToDetailData = (item: OsbbCollection): DetailItemData => ({
  id: item.id,
  title: item.title,
  description: item.description,
  price: `${item.collectedAmount} / ${item.targetAmount} грн`,
  sourceType: 'osbb',
  sourceId: item.id,
});

const OsbbSborScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const navLock = useRef(false);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const { colors, isDark } = useAppTheme();
  const buildingId = useSelector((state: RootState) => state.osbb.buildingId);
  useOsbbMembership();
  const canManageCollections = useSelector(
    (state: RootState) =>
      state.osbb.membershipRole === 'manager' &&
      state.osbb.membershipStatus === 'approved'
  );
  const [collections, setCollections] = useState<OsbbCollection[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [target, setTarget] = useState('');
  const [url, setUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errors, setErrors] = useState<{ title?: string; target?: string; url?: string; deadline?: string }>({});

  useEffect(() => {
    return subscribeOsbbCollections(buildingId, setCollections);
  }, [buildingId]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!title.trim()) next.title = text.errTitle;
    const targetNum = Number(target);
    if (!Number.isFinite(targetNum) || targetNum <= 0) next.target = text.errTarget;
    if (!url.trim()) {
      next.url = text.errUrl;
    } else {
      try {
        const parsed = new URL(url.trim());
        const hostname = parsed.hostname.toLowerCase();
        const isSafeHost = parsed.protocol === 'https:' && SAFE_PAYMENT_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
        if (!isSafeHost) {
          next.url = text.errUrl;
        }
      } catch {
        next.url = text.errUrl;
      }
    }
    if (deadline.trim() && !DEADLINE_REGEX.test(deadline.trim())) next.deadline = text.errDeadline;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const addCollection = async () => {
    if (!canManageCollections || !buildingId) return;
    if (!validate()) return;

    const secsLeft = RATE_LIMITERS.osbbCollection.cooldownSecondsLeft();
    if (secsLeft > 0) {
      Alert.alert(text.alertTitle, text.errRateLimit(secsLeft));
      return;
    }

    setIsSaving(true);
    setSuccessMsg('');
    try {
      await addOsbbCollection(buildingId, {
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: deadline.trim() || undefined,
        targetAmount: Number(target),
        paymentUrl: url.trim(),
      });
      setTitle('');
      setDescription('');
      setDeadline('');
      setTarget('');
      setUrl('');
      setErrors({});
      RATE_LIMITERS.osbbCollection.recordSubmit();
      setSuccessMsg(text.successMsg);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('[OsbbSborScreen] addOsbbCollection failed:', err);
      Alert.alert(text.alertTitle, err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.screenTitle, { color: isDark ? '#F5E8F0' : undefined }]}>{text.title}</Text>
          <View style={styles.backBtn} />
        </View>

        {canManageCollections ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{text.addCollection}</Text>

            {successMsg ? (
              <View style={styles.successBanner}>
                <MaterialCommunityIcons name="check-circle-outline" size={18} color="#2D8A4E" />
                <Text style={styles.successText}>{successMsg}</Text>
              </View>
            ) : null}

            <TextInput
              value={title}
              onChangeText={(v) => { setTitle(v); setErrors((e) => ({ ...e, title: undefined })); }}
              placeholder={text.collectionTopic}
              placeholderTextColor={SCREEN_THEME.textMuted}
              style={[styles.input, errors.title ? styles.inputError : null]}
            />
            {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={text.description}
              placeholderTextColor={SCREEN_THEME.textMuted}
              multiline
              numberOfLines={2}
              style={[styles.input, styles.inputMultiline]}
            />

            <TextInput
              value={target}
              onChangeText={(v) => { setTarget(v.replace(/[^0-9]/g, '')); setErrors((e) => ({ ...e, target: undefined })); }}
              placeholder={text.target}
              placeholderTextColor={SCREEN_THEME.textMuted}
              keyboardType="number-pad"
              style={[styles.input, errors.target ? styles.inputError : null]}
            />
            {errors.target ? <Text style={styles.errorText}>{errors.target}</Text> : null}

            <TextInput
              value={deadline}
              onChangeText={(v) => { setDeadline(v); setErrors((e) => ({ ...e, deadline: undefined })); }}
              placeholder={text.deadline}
              placeholderTextColor={SCREEN_THEME.textMuted}
              style={[styles.input, errors.deadline ? styles.inputError : null]}
            />
            {errors.deadline ? <Text style={styles.errorText}>{errors.deadline}</Text> : null}

            <TextInput
              value={url}
              onChangeText={(v) => { setUrl(v); setErrors((e) => ({ ...e, url: undefined })); }}
              placeholder={text.monobankLink}
              placeholderTextColor={SCREEN_THEME.textMuted}
              autoCapitalize="none"
              style={[styles.input, errors.url ? styles.inputError : null]}
            />
            {errors.url ? <Text style={styles.errorText}>{errors.url}</Text> : null}

            <TouchableOpacity style={[styles.addBtn, isSaving && styles.addBtnDisabled]} onPress={addCollection} activeOpacity={0.86} disabled={isSaving}>
              {isSaving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.addBtnText}>{text.add}</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{text.restrictedTitle}</Text>
            <Text style={styles.emptySubtitle}>{text.restrictedBody}</Text>
          </View>
        )}

        {collections.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="hand-coin-outline" size={48} color={SCREEN_THEME.textSecondary} />
            <Text style={styles.emptyTitle}>{text.noCollections}</Text>
            <Text style={styles.emptySubtitle}>{text.noCollectionsBody}</Text>
          </View>
        ) : collections.map((item) => {
          const progress = Math.min(100, Math.round((item.collectedAmount / item.targetAmount) * 100));
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.collectionCard}
              onPress={() => { if (navLock.current) return; navLock.current = true; navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item) }); setTimeout(() => { navLock.current = false; }, 800); }}
              activeOpacity={0.86}
            >
              <Text style={styles.collectionTitle}>{item.title}</Text>
              {item.description ? <Text style={styles.collectionDesc}>{item.description}</Text> : null}
              {item.deadline ? (
                <Text style={styles.collectionDeadline}>
                  <MaterialCommunityIcons name="calendar-outline" size={12} color={SCREEN_THEME.textMuted} />
                  {' '}{text.deadlineUntil} {item.deadline}
                </Text>
              ) : null}
              <Text style={styles.collectionMeta}>{text.collected} {item.collectedAmount} {text.from} {item.targetAmount} грн</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <TouchableOpacity
                style={styles.payBtn}
                onPress={(e) => { e.stopPropagation(); void safeOpenExternalUrl(item.paymentUrl, language); }}
                activeOpacity={0.86}
              >
                <Text style={styles.payBtnText}>{text.pay}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <MiniTabBar />
    </SafeAreaView>
  );
};

const CARD_BASE = {
  backgroundColor: SCREEN_THEME.paperStrong,
  borderRadius: 24,
  borderWidth: 1,
  borderColor: '#E4D0AB',
  shadowColor: '#6E573B',
  shadowOpacity: 0.10,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  listContent: { padding: 16, paddingBottom: 110 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 4 },
  backBtn: { width: 40, alignItems: 'center' },
  screenTitle: { fontSize: 20, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  formCard: { ...CARD_BASE, padding: 16, gap: 9, marginBottom: 14 },
  formTitle: { color: SCREEN_THEME.textPrimary, fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 4 },
  input: { backgroundColor: '#FFF8EA', borderRadius: 14, borderWidth: 1, borderColor: '#E4D0AB', paddingHorizontal: 12, paddingVertical: 11, color: SCREEN_THEME.textPrimary, fontWeight: '800' },
  inputMultiline: { height: 64, textAlignVertical: 'top' },
  inputError: { borderColor: '#D94F3D' },
  errorText: { color: '#D94F3D', fontSize: 12, fontWeight: '700', marginTop: -4 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EAF6EE', borderRadius: 12, padding: 10 },
  successText: { flex: 1, color: '#2D8A4E', fontSize: 13, fontWeight: '700' },
  addBtn: { borderRadius: 14, backgroundColor: SCREEN_THEME.terracotta, paddingVertical: 13, alignItems: 'center' },
  addBtnDisabled: { opacity: 0.6 },
  addBtnText: { color: '#fff', fontWeight: '900' },
  collectionCard: { ...CARD_BASE, padding: 16, marginBottom: 12 },
  collectionTitle: { color: SCREEN_THEME.textPrimary, fontSize: 18, fontWeight: '900' },
  collectionDesc: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '500', marginTop: 4, lineHeight: 18 },
  collectionDeadline: { color: SCREEN_THEME.textMuted, fontSize: 12, fontWeight: '700', marginTop: 4 },
  collectionMeta: { color: SCREEN_THEME.textSecondary, marginTop: 5, fontWeight: '800' },
  progressTrack: { height: 10, backgroundColor: '#E9DFCC', borderRadius: 999, overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', backgroundColor: SCREEN_THEME.woodGreenDark, borderRadius: 999 },
  payBtn: { borderRadius: 14, backgroundColor: SCREEN_THEME.enamelBlue, alignItems: 'center', paddingVertical: 13, marginTop: 14 },
  payBtnText: { color: '#fff', fontWeight: '900' },
  emptyCard: { ...CARD_BASE, padding: 32, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: SCREEN_THEME.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, fontWeight: '500', color: SCREEN_THEME.textSecondary, textAlign: 'center', lineHeight: 20 },
});

export default OsbbSborScreen;

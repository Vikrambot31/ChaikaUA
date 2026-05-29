import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../redux/store';
import { HelpRequest } from '../types/app';
import { addHelpRequest, selectTodayHelpRequests } from '../redux/slices/helpRequestsSlice';
import MiniTabBar from '../components/MiniTabBar';
import ContactReasonModal from '../components/ContactReasonModal';
import { useContactRequest } from '../hooks/useContactRequest';
import ErrorHandler from '../utils/errorHandler';
import { SCREEN_THEME } from '../utils/screenTheme';
import { safeCallPhone } from '../utils/communicationActions';
import { firebaseChatAPI } from '../firebase-config';
import { normalizePersonName, normalizePhoneText, sanitizeStoredText } from '../utils/textUtils';
import { validateName, validatePhone } from '../utils/validators';
import { showUserError } from '../utils/userFacingErrors';
import { RATE_LIMITERS } from '../utils/rateLimiter';
import { database } from '../firebase-config';
import { ref as dbRef, get as dbGet, set as dbSet, update as dbUpdate } from 'firebase/database';
import { resolveUserAvatarMap } from '../utils/userAvatar';
import type { DetailItemData } from '../utils/detailViewTypes';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { getDonePhotos, validateSubmissionRequirements } from '../utils/submissionRequirements';
import UserCardActionBar from '../components/UserCardActionBar';

const HELP_NEIGHBORS_SPLASH_KEY = '@help_neighbors_first_visit_splash_seen';
const HELP_NEIGHBORS_MAX_PER_DAY = 3;
const getDailyKey = (userId: string) => `@help_neighbors_daily_limit_v1_${userId}`;

const UI_TEXT = {
  ua: {
    headerTitle: 'Потрібна допомога',
    headerSubtitle: 'Термінові прохання мешканців ЖК Чайка',
    formTitle: 'Залишити заявку',
    namePlaceholder: "Ваше ім'я",
    phonePlaceholder: 'Ваш телефон',
    helpTypePlaceholder: 'Оберіть тип допомоги...',
    descriptionPlaceholder: 'Коротко опишіть, яка допомога потрібна',
    ownTextRequiredTitle: 'Додайте свій текст',
    ownTextRequiredBody: 'Щоб опублікувати прохання, опишіть ситуацію своїми словами (мінімум 10 символів).',
    ownTextRequiredAction: 'Додати опис',
    submitButton: 'Відправити прохання',
    listTitle: 'Термінові запити',
    emptyTitle: 'Сьогодні все спокійно',
    emptySubtitle: 'Немає термінових прохань від сусідів',
    expired: 'Час минув',
    successTitle: 'Успішно',
    successMessage: 'Ваш запит надіслано на модерацію',
    errorTitle: 'Помилка',
    errorMessage: 'Заповніть усі поля',
    saveErrorMessage: 'Не вдалося додати прохання',
    dailyLimitTitle: 'Ліміт вичерпано',
    dailyLimitBody: 'Дозволяється лише 3 термінові заявки на день.',
    splash: 'Зробимо Чайку місцем підтримки один для одного',
    authNoticeTitle: 'Потрібна реєстрація',
    authNoticeBody: 'Щоб надіслати прохання про допомогу, увійдіть або зареєструйтесь.',
    authNoticeBtn: 'Увійти / Зареєструватись',
    photoLabel: 'Фото ситуації (необов\'язково)',
    photoErrorMessage: 'Фото не завантажилось. Видаліть його або спробуйте ще раз.',
    helpTypes: [
      { label: 'Медична допомога', value: 'medical' },
      { label: 'Дрібний ремонт', value: 'repair' },
      { label: 'Психологічна підтримка', value: 'psychology' },
      { label: 'Догляд за дітьми', value: 'childcare' },
      { label: 'Сантехніка', value: 'plumbing' },
      { label: 'Електрика', value: 'electrical' },
      { label: 'Прибирання', value: 'cleaning' },
      { label: 'Доставка', value: 'delivery' },
      { label: 'Інше', value: 'other' },
    ],
  },
  ru: {
    headerTitle: 'Нужна помощь',
    headerSubtitle: 'Срочные просьбы жителей ЖК Чайка',
    formTitle: 'Оставить заявку',
    namePlaceholder: 'Ваше имя',
    phonePlaceholder: 'Ваш телефон',
    helpTypePlaceholder: 'Выберите тип помощи...',
    descriptionPlaceholder: 'Кратко опишите, какая помощь нужна',
    ownTextRequiredTitle: 'Добавьте свой текст',
    ownTextRequiredBody: 'Чтобы опубликовать просьбу, опишите ситуацию своими словами (минимум 10 символов).',
    ownTextRequiredAction: 'Добавить описание',
    submitButton: 'Отправить просьбу',
    listTitle: 'Срочные запросы',
    emptyTitle: 'Сегодня все спокойно',
    emptySubtitle: 'Нет срочных просьб от соседей',
    expired: 'Срок вышел',
    successTitle: 'Успешно',
    successMessage: 'Ваш запрос отправлен на модерацию',
    errorTitle: 'Ошибка',
    errorMessage: 'Заполните все поля',
    saveErrorMessage: 'Не удалось добавить просьбу',
    dailyLimitTitle: 'Лимит исчерпан',
    dailyLimitBody: 'Допускается не более 3 срочных заявок в день.',
    splash: 'Сделаем Чайку друг для друга местом поддержки',
    authNoticeTitle: 'Нужна регистрация',
    authNoticeBody: 'Чтобы отправить просьбу о помощи, войдите или зарегистрируйтесь.',
    authNoticeBtn: 'Войти / Зарегистрироваться',
    photoLabel: 'Фото ситуации (необязательно)',
    photoErrorMessage: 'Фото не загрузилось. Удалите его или попробуйте ещё раз.',
    helpTypes: [
      { label: 'Медицинская помощь', value: 'medical' },
      { label: 'Мелкий ремонт', value: 'repair' },
      { label: 'Психологическая поддержка', value: 'psychology' },
      { label: 'Уход за детьми', value: 'childcare' },
      { label: 'Сантехника', value: 'plumbing' },
      { label: 'Электрика', value: 'electrical' },
      { label: 'Уборка', value: 'cleaning' },
      { label: 'Доставка', value: 'delivery' },
      { label: 'Другое', value: 'other' },
    ],
  },
  en: {
    headerTitle: 'Need Help',
    headerSubtitle: 'Urgent requests from Chaika Life residents',
    formTitle: 'Leave a request',
    namePlaceholder: 'Your name',
    phonePlaceholder: 'Your phone',
    helpTypePlaceholder: 'Select help type...',
    descriptionPlaceholder: 'Briefly describe what help is needed',
    ownTextRequiredTitle: 'Add your own text',
    ownTextRequiredBody: 'To publish the request, describe your situation in your own words (at least 10 characters).',
    ownTextRequiredAction: 'Add description',
    submitButton: 'Send request',
    listTitle: 'Urgent requests',
    emptyTitle: 'Everything is calm today',
    emptySubtitle: 'There are no urgent requests from neighbors',
    expired: 'Time expired',
    successTitle: 'Success',
    successMessage: 'Your request was sent to moderation',
    errorTitle: 'Error',
    errorMessage: 'Fill in all fields',
    saveErrorMessage: 'Failed to add the request',
    dailyLimitTitle: 'Daily limit reached',
    dailyLimitBody: 'Only 3 urgent requests are allowed per day.',
    splash: "Let's make Chaika Life a place of support for one another",
    authNoticeTitle: 'Registration required',
    authNoticeBody: 'To send a help request, sign in or register.',
    authNoticeBtn: 'Sign in / Register',
    photoLabel: 'Photo (optional)',
    photoErrorMessage: 'Photo failed to upload. Remove it or try again.',
    helpTypes: [
      { label: 'Medical help', value: 'medical' },
      { label: 'Small repair', value: 'repair' },
      { label: 'Psychological support', value: 'psychology' },
      { label: 'Childcare', value: 'childcare' },
      { label: 'Plumbing', value: 'plumbing' },
      { label: 'Electrical help', value: 'electrical' },
      { label: 'Cleaning', value: 'cleaning' },
      { label: 'Delivery', value: 'delivery' },
      { label: 'Other', value: 'other' },
    ],
  },
} as const;

const formatPublishedAt = (createdAt: Date) => {
  const day = String(createdAt.getDate()).padStart(2, '0');
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const hours = String(createdAt.getHours()).padStart(2, '0');
  const minutes = String(createdAt.getMinutes()).padStart(2, '0');
  return `${day}.${month} ${hours}:${minutes}`;
};

type DailyLimitRecord = { date: string; count: number };

const getTodayString = () => new Date().toISOString().slice(0, 10);

const loadDailyLimitRecord = async (key: string): Promise<DailyLimitRecord> => {
  const today = getTodayString();
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return { date: today, count: 0 };
    const parsed = JSON.parse(raw) as DailyLimitRecord;
    return parsed.date === today ? parsed : { date: today, count: 0 };
  } catch {
    return { date: today, count: 0 };
  }
};

const saveDailyLimitRecord = async (key: string, record: DailyLimitRecord): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(record));
  } catch { /* ignore */ }
};

const HelpNeighborsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const navLock = useRef(false);
  const dispatch = useDispatch<AppDispatch>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const [name, setName] = useState(() => (user?.name ? normalizePersonName(user.name) : ''));
  const [phone, setPhone] = useState(() => (user?.phone ? normalizePhoneText(user.phone) : ''));
  const [helpType, setHelpType] = useState('');
  const [description, setDescription] = useState('');
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [showHelpSplash, setShowHelpSplash] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string>>({});

  const handleGuestFormTouch = () => {
    Alert.alert(text.authNoticeTitle, text.authNoticeBody, [
      { text: text.authNoticeBtn, onPress: () => navigation.navigate('LoginScreen', {}) },
      { text: 'OK', style: 'cancel' },
    ]);
  };

  const todayRequests = useSelector((state: RootState) => selectTodayHelpRequests(state)) as HelpRequest[];
  const burningRequests = useMemo(
    () => todayRequests.filter((request) => request.isBurning && request.expiresAt > new Date()),
    [todayRequests]
  );

  useEffect(() => {
    const userIds = Array.from(new Set(burningRequests.map((item) => item.userId).filter((id): id is string => Boolean(id))));
    if (userIds.length === 0) return;
    let cancelled = false;
    void resolveUserAvatarMap(database, userIds).then((resolved) => {
      if (cancelled) return;
      setAvatarByUserId((prev) => ({ ...prev, ...resolved }));
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [burningRequests]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loadSplashState = async () => {
      try {
        const seenSplash = await AsyncStorage.getItem(HELP_NEIGHBORS_SPLASH_KEY);
        if (!isMounted) return;

        if (seenSplash === 'true') {
          setIsReady(true);
          return;
        }

        setShowHelpSplash(true);
        timeoutId = setTimeout(async () => {
          if (!isMounted) return;
          setShowHelpSplash(false);
          setIsReady(true);
          try {
            await AsyncStorage.setItem(HELP_NEIGHBORS_SPLASH_KEY, 'true');
          } catch {}
        }, 3000);
      } catch {
        if (!isMounted) return;
        setShowHelpSplash(true);
        timeoutId = setTimeout(() => {
          if (!isMounted) return;
          setShowHelpSplash(false);
          setIsReady(true);
        }, 3000);
      }
    };

    void loadSplashState();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const handleSubmit = async () => {
    const normalizedName = normalizePersonName(name);
    const normalizedPhone = normalizePhoneText(phone);

    if (!normalizedName || !normalizedPhone || !helpType) {
      Alert.alert(text.errorTitle, text.errorMessage);
      return;
    }

    if (!validateName(normalizedName) || !validatePhone(normalizedPhone)) {
      Alert.alert(text.errorTitle, text.errorMessage);
      return;
    }

    const userDescription = description.trim();
    if (userDescription.length < 10) {
      Alert.alert(
        text.ownTextRequiredTitle,
        text.ownTextRequiredBody,
        [{ text: text.ownTextRequiredAction }]
      );
      return;
    }
    if (!validateSubmissionRequirements({ language, userId: user?.id, userPhotoURL: user?.photoURL, userStartAvatarKey: user?.startAvatarKey, navigation })) {
      return;
    }

    const secsLeft = RATE_LIMITERS.helpRequest.cooldownSecondsLeft();
    if (secsLeft > 0) {
      Alert.alert(text.errorTitle, language === 'ru'
        ? `Следующий запрос можно отправить через ${secsLeft} сек.`
        : language === 'en'
          ? `Please wait ${secsLeft} seconds before sending another request.`
          : `Наступний запит можна надіслати через ${secsLeft} сек.`);
      return;
    }

    if (formPhotos.some(p => p.status === 'uploading')) {
      Alert.alert(text.errorTitle, language === 'ua'
        ? 'Зачекайте, фото ще завантажується'
        : language === 'ru'
          ? 'Подождите, фото ещё загружается'
          : 'Please wait, photo is still uploading');
      return;
    }

    if (formPhotos.some(p => p.status === 'error')) {
      Alert.alert(text.errorTitle, text.photoErrorMessage);
      return;
    }

    const firstPhoto = getDonePhotos(formPhotos)[0];

    // BUG-02: block submit if photo selected but downloadUrl not yet available
    if (firstPhoto && !firstPhoto.downloadUrl) {
      Alert.alert(text.errorTitle, language === 'ua'
        ? 'Зачекайте, посилання на фото ще формується'
        : language === 'ru'
          ? 'Подождите, ссылка на фото ещё формируется'
          : 'Please wait, photo link is being generated');
      return;
    }

    const payloadDescription = sanitizeStoredText(userDescription);

    setSubmitting(true);
    try {
      // BUG-04: check daily limit from both AsyncStorage and RTDB (cross-device protection)
      const today = getTodayString();
      const dailyKey = getDailyKey(user!.id);
      const dailyLimitRecord = await loadDailyLimitRecord(dailyKey);
      const rtdbSnap = await dbGet(dbRef(database, `rate_limits/${user!.id}/help_neighbors`)).catch(() => null);
      const rtdbRecord = rtdbSnap?.val() as { date: string; count: number } | null;
      const rtdbCount = rtdbRecord?.date === today ? (rtdbRecord.count ?? 0) : 0;
      const effectiveCount = Math.max(dailyLimitRecord.count, rtdbCount);
      if (effectiveCount >= HELP_NEIGHBORS_MAX_PER_DAY) {
        Alert.alert(text.dailyLimitTitle, text.dailyLimitBody);
        return;
      }

      const serverResult = await firebaseChatAPI.addRequest({
        name: normalizedName,
        phone: normalizedPhone,
        language,
        description: payloadDescription,
        category: 'help',
        subcategory: helpType,
        group: 'help_neighbors',
        photoUri: firstPhoto?.downloadUrl ?? '',
        photoStoragePath: firstPhoto?.storagePath ?? '',
      });

      if (!serverResult.success) {
        throw new Error(serverResult.error || 'Failed to submit help request');
      }

      const requestId = serverResult.data?.id || `help-${Date.now()}`;

      if (firstPhoto?.photoId && user?.id) {
        void dbUpdate(dbRef(database, `request_photos/${user.id}/${firstPhoto.photoId}`), {
          requestId,
          requestPath: `requests/${requestId}`,
          sourceFeature: 'help_neighbors',
          updatedAt: Date.now(),
        }).catch(() => {});
      }

      const newRequest: HelpRequest = {
        id: requestId,
        userId: user?.id ?? '',
        name: normalizedName,
        phone: normalizedPhone,
        description: payloadDescription,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        isBurning: true,
        moderationStatus: 'approved',
      };

      dispatch(addHelpRequest(newRequest));
      RATE_LIMITERS.helpRequest.recordSubmit();
      // BUG-04: persist counter to both AsyncStorage and RTDB
      await saveDailyLimitRecord(dailyKey, { ...dailyLimitRecord, count: effectiveCount + 1 });
      void dbSet(dbRef(database, `rate_limits/${user!.id}/help_neighbors`), { date: today, count: effectiveCount + 1 }).catch(() => {});
      // BUG-03: removed immediate syncFromRequests — new request is already in Redux via addHelpRequest;
      // immediate getRequests() risked race-condition where RTDB hadn't propagated yet, causing the card to vanish.
      setName('');
      setPhone('');
      setHelpType('');
      setDescription('');
      setFormPhotos([]);
      Alert.alert(text.successTitle, text.successMessage);
    } catch (err) {
      const errMessage =
        err instanceof Error && err.message
          ? `HelpNeighborsScreen: addHelpRequest: ${err.message}`
          : 'HelpNeighborsScreen: addHelpRequest';
      ErrorHandler.createError(err, errMessage);
      showUserError(language, 'send', err);
    } finally {
      setSubmitting(false);
    }
  };

  const mapToDetailData = (item: HelpRequest): DetailItemData => ({
    id: item.id,
    title: item.name,
    description: item.description,
    phone: item.phone,
    category: undefined,
    status: item.isBurning && item.expiresAt > new Date() ? text.listTitle : text.expired,
    userId: item.userId,
    createdAt: item.createdAt.toISOString(),
    sourceType: 'help',
    sourceId: item.id,
  });

  const openDetail = (item: HelpRequest) => {
    navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item) });
  };

  return (
    <SafeAreaView style={styles.container}>
      {showHelpSplash ? (
        <View style={styles.splashContainer}>
          <Image source={require('../../assets/WEBP-version/dopomoga1.webp')} style={styles.splashImage} resizeMode="cover" />
          <View style={styles.splashOverlay} />
          <View style={styles.splashCaption}>
            <Text style={styles.splashText}>{text.splash}</Text>
          </View>
        </View>
      ) : null}

      {/* FlatList replaces the outer ScrollView for virtualized rendering of help request cards */}
      {isReady ? (
        <FlatList
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          data={burningRequests}
          keyExtractor={(item) => item.id}
          initialNumToRender={8}
          windowSize={5}
          ListHeaderComponent={
            <>
              <View style={styles.headerCard}>
                <Image source={require('../../assets/WEBP-version/Sosedi-pomogaut.webp')} style={styles.headerImage} resizeMode="cover" />
              </View>

              {!user && (
                <View style={styles.authNoticeCard}>
                  <Text style={styles.authNoticeTitle}>{text.authNoticeTitle}</Text>
                  <Text style={styles.authNoticeBody}>{text.authNoticeBody}</Text>
                  <TouchableOpacity
                    style={styles.authNoticeBtn}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('LoginScreen', {})}
                  >
                    <Text style={styles.authNoticeBtnText}>{text.authNoticeBtn}</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.formCard}>
                <Text style={styles.formTitle}>{text.formTitle}</Text>

                <TextInput
                  placeholder={text.namePlaceholder}
                  placeholderTextColor="#A0938D"
                  value={name}
                  onChangeText={(value) => setName(normalizePersonName(value))}
                  style={styles.input}
                />
                <TextInput
                  placeholder={text.phonePlaceholder}
                  placeholderTextColor="#A0938D"
                  value={phone}
                  onChangeText={(value) => setPhone(normalizePhoneText(value))}
                  keyboardType="phone-pad"
                  style={styles.input}
                />

                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={helpType} onValueChange={(itemValue: string) => setHelpType(itemValue)} style={styles.picker}>
                    <Picker.Item label={text.helpTypePlaceholder} value="" />
                    {text.helpTypes.map((type) => (
                      <Picker.Item key={type.value} label={type.label} value={type.value} />
                    ))}
                  </Picker>
                </View>

                <TextInput
                  placeholder={text.descriptionPlaceholder}
                  placeholderTextColor="#A0938D"
                  value={description}
                  onChangeText={setDescription}
                  style={[styles.input, styles.textArea]}
                  multiline
                  textAlignVertical="top"
                  maxLength={500}
                />
                <Text style={styles.charCount}>{description.trim().length}/500</Text>

                <Text style={styles.fieldLabel}>{text.photoLabel}</Text>
                <PhotoUploadField
                  uid={user?.id ?? ''}
                  userName={user?.name ?? ''}
                  maxPhotos={1}
                  storagePath="requests"
                  onPhotosChange={setFormPhotos}
                />

                <TouchableOpacity style={[styles.submitButton, submitting && { opacity: 0.6 }]} onPress={() => { if (!submitting) void handleSubmit(); }} activeOpacity={0.85} disabled={submitting}>
                  {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitButtonText}>{text.submitButton}</Text>}
                </TouchableOpacity>

                {!user && (
                  <TouchableOpacity
                    style={StyleSheet.absoluteFillObject}
                    activeOpacity={1}
                    onPress={handleGuestFormTouch}
                  />
                )}
              </View>

              <View style={styles.listHeader}>
                <Text style={styles.listTitle}>{text.listTitle}</Text>
                <View style={styles.listCountBadge}>
                  <Text style={styles.listCount}>{burningRequests.length}</Text>
                </View>
              </View>
            </>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.requestCard} onPress={() => { if (navLock.current) return; navLock.current = true; openDetail(item); setTimeout(() => { navLock.current = false; }, 800); }} activeOpacity={0.86}>
              <View style={styles.requestHeader}>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{item.name}</Text>
                </View>
                <View style={styles.timeBadge}>
                  <Text style={styles.timeText}>{formatPublishedAt(item.createdAt)}</Text>
                </View>
              </View>
              <Text style={styles.requestDescription}>{item.description}</Text>
              {item.moderationStatus === 'pending' && item.userId === user?.id && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>
                    {language === 'ru' ? 'Ожидает модерации' : language === 'en' ? 'Awaiting moderation' : 'Очікує модерації'}
                  </Text>
                </View>
              )}
              <UserCardActionBar
                avatarUri={(item.userId && avatarByUserId[item.userId]) || undefined}
                name={item.name}
                userId={item.userId}
                currentUserId={user?.id}
                language={language}
                onProfile={item.userId ? () => { if (navLock.current) return; navLock.current = true; navigation.navigate('ViewUserProfile', { userId: item.userId as string }); setTimeout(() => { navLock.current = false; }, 800); } : undefined}
                onContact={item.userId && item.userId !== user?.id ? () => openContactModal({ userId: item.userId as string, name: item.name || 'Unknown', sourceType: 'help', sourceId: item.id, sourceTitle: item.description?.slice(0, 60) }) : item.phone ? () => void safeCallPhone(item.phone, language) : undefined}
                contactDisabled={!item.phone && (!item.userId || item.userId === user?.id)}
                likePath="feed_likes/help_neighbors"
                likeId={item.id}
                avatarSize={64}
              />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{text.emptyTitle}</Text>
              <Text style={styles.emptySubtext}>{text.emptySubtitle}</Text>
            </View>
          }
        />
      ) : null}

      <ContactReasonModal
        visible={contactModalVisible}
        pending={contactPending}
        target={contactTarget}
        onSelect={(reason) => void sendContactRequest(reason)}
        onClose={closeContactModal}
      />
      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
    backgroundColor: '#1F221A',
    justifyContent: 'flex-end',
  },
  splashImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22, 28, 18, 0.24)',
  },
  splashCaption: {
    marginHorizontal: 18,
    marginBottom: 26,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 248, 238, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(96, 102, 63, 0.18)',
    shadowColor: '#26301E',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  splashText: {
    color: '#2A2D22',
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
  },
  scrollContent: { paddingBottom: 40, paddingHorizontal: 16, paddingTop: 16 },
  headerCard: {
    marginBottom: 14,
    overflow: 'hidden',
    borderRadius: 18,
  },
  headerImage: { width: '100%', height: 200, resizeMode: 'cover' },
  formCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  formTitle: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 14 },
  fieldLabel: { color: SCREEN_THEME.textPrimary, fontWeight: '900', marginBottom: 8 },
  input: {
    backgroundColor: '#F7F3EE',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: SCREEN_THEME.textPrimary,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8DDD3',
  },
  pickerWrapper: {
    backgroundColor: '#F7F3EE',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    overflow: 'hidden',
    marginBottom: 10,
  },
  picker: { color: SCREEN_THEME.textPrimary, height: 50 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  charCount: { fontSize: 12, color: SCREEN_THEME.textSecondary, textAlign: 'right', marginBottom: 10, fontWeight: '700' },
  submitButton: { backgroundColor: SCREEN_THEME.terracotta, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  submitButtonText: { color: '#FFFFFF', fontWeight: '800' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 },
  listTitle: { fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  listCountBadge: { backgroundColor: SCREEN_THEME.terracotta, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  listCount: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  requestCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  requestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  userInfo: { flex: 1 },
  userName: { fontWeight: '900', color: SCREEN_THEME.textPrimary },
  timeBadge: { backgroundColor: SCREEN_THEME.terracotta, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  timeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  requestDescription: { color: '#fff', backgroundColor: '#7A1E5C', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, lineHeight: 20, marginBottom: 8, fontWeight: '800', overflow: 'hidden' },
  pendingBadge: { backgroundColor: '#FFF3CD', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#F0C96B' },
  pendingBadgeText: { color: '#7A5C00', fontWeight: '800', fontSize: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 12 },
  emptySubtext: { color: SCREEN_THEME.textSecondary, marginTop: 4 },
  authNoticeCard: {
    backgroundColor: '#FFF8E7',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F0C96B',
  },
  authNoticeTitle: { fontSize: 15, fontWeight: '900', color: '#7A5C00', marginBottom: 6 },
  authNoticeBody: { fontSize: 13, color: '#7A5C00', lineHeight: 19, marginBottom: 12 },
  authNoticeBtn: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  authNoticeBtnText: { color: '#FFF9EE', fontWeight: '900', fontSize: 14 },
});

export default HelpNeighborsScreen;









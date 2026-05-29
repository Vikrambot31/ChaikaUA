import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationProp, ParamListBase, StackActions } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../redux/store';
import type { HelpRequest } from '../types/app';
import { addHelpRequest, syncFromRequests } from '../redux/slices/helpRequestsSlice';
import { useRequests } from '../hooks/useRequests';
import CategorySelector from '../components/CategorySelector';
import SubcategorySelector from '../components/SubcategorySelector';
import FoodSharingForm from '../components/FoodSharingForm';
import RideSharingForm from '../components/RideSharingForm';
import FormSectionLabel from '../components/FormSectionLabel';
import { FormFieldError } from '../components/ValidationErrorMessage';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import { normalizePersonName, normalizePhoneText, sanitizeStoredText } from '../utils/textUtils';
import { validateName, validatePhone } from '../utils/validators';
import { SPECIAL } from '../data/categories';
import { STORAGE_KEYS } from '../utils/constants';
import { firebaseChatAPI } from '../firebase-config';
import { createPendingModeration } from '../utils/moderation';
import { getRequests } from '../services/api';
import { RATE_LIMITERS } from '../utils/rateLimiter';
import { showUserError } from '../utils/userFacingErrors';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { getDonePhotos, getRequiredPhotoLabel, validateSubmissionRequirements } from '../utils/submissionRequirements';

const DRAFT_KEY = `${STORAGE_KEYS.SETTINGS}:request-form-draft`;
const MAX_DESC_LENGTH = 500;
let guestPromptShownThisSession = false;

// Дневной лимит срочных заявок
const URGENT_MAX_PER_DAY = 3;
const URGENT_MIN_INTERVAL_MS = 30 * 60 * 1000; // 30 хвилин

type UrgentDailyRecord = { date: string; count: number; lastTime: number };

const getTodayString = () => new Date().toISOString().slice(0, 10);

const loadUrgentRecord = async (userId: string): Promise<UrgentDailyRecord> => {
  const today = getTodayString();
  const key = `urgent_requests_daily_v1_${userId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return { date: today, count: 0, lastTime: 0 };
    const parsed = JSON.parse(raw) as UrgentDailyRecord;
    return parsed.date === today ? parsed : { date: today, count: 0, lastTime: 0 };
  } catch {
    return { date: today, count: 0, lastTime: 0 };
  }
};

const saveUrgentRecord = async (userId: string, record: UrgentDailyRecord): Promise<void> => {
  const key = `urgent_requests_daily_v1_${userId}`;
  try {
    await AsyncStorage.setItem(key, JSON.stringify(record));
  } catch { /* ignore */ }
};

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    errorTitle: 'Помилка',
    nameError: "Введіть ім'я (мінімум 2 символи)",
    phoneError: 'Введіть коректний телефон у форматі +380...',
    groupError: 'Оберіть групу категорій (наприклад: Фудшеринг, Транспорт)',
    subcategoryError: 'Оберіть підкатегорію всередині групи',
    foodError: 'Вкажіть магазин та час для фудшерингу',
    rideError: 'Вкажіть напрямок та час для поїздки',
    detailsError: 'Заповніть усі деталі',
    descTooShort: 'Якщо описуєте ситуацію - вкажіть хоча б 10 символів',
    descMinHint: 'Мінімум 10 символів, якщо додаєте опис.',
    ownTextRequiredTitle: 'Додайте свій текст',
    ownTextRequiredBody: 'Щоб опублікувати заявку, опишіть ситуацію своїми словами (мінімум 10 символів).',
    ownTextRequiredAction: 'Додати опис',
    doneTitle: 'Готово',
    doneBody: 'Заявку надіслано на модерацію',
    doneRequestId: 'Номер заявки',
    urgentSuccess: 'Вашу термінову заявку надіслано сусідам',
    submitErrorDefault: "Не вдалося додати заявку. Перевірте з'єднання та спробуйте ще раз.",
    heroTitle: 'Нова заявка',
    heroSubtitle: "Оберіть категорію - після перевірки модератором сусіди зможуть з вами зв'язатися",
    heroSubtitleUrgent: 'Термінова заявка потрапить до розділу «Допомога сусідам» і пропаде о 23:59',
    urgentToggle: 'Терміново (тільки сьогодні)',
    contacts: 'Контакти',
    nameLabel: "Ім'я",
    namePlaceholder: "Ваше ім'я",
    phoneLabel: 'Телефон',
    categoryTitle: 'Категорія',
    addDetails: '+ Додати деталі',
    hideDetails: '− Сховати деталі',
    descLabel: 'Опис ситуації (необов\'язково)',
    descPlaceholder: 'Розкажіть детальніше, що саме потрібно...',
    charsLeft: 'символів',
    submit: 'Відправити заявку',
    submitUrgent: 'Надіслати термінову заявку',
    ok: 'OK',
    urgentLimitTitle: 'Ліміт вичерпано',
    urgentLimitBody: 'Дозволяється лише 3 термінові заявки на день.',
    urgentIntervalTitle: 'Зачекайте',
    urgentIntervalPrefix: 'Між терміновими заявками мінімальна пауза 30 хвилин. Залишилось',
    urgentIntervalSuffix: 'хв.',
    photoAuthTitle: 'Потрібна авторизація',
    photoAuthBody: 'Щоб завантажувати контент, потрібно авторизуватися. Це умова застосунку.',
    photoAuthBtn: 'Реєстрація',
    photoAuthCancel: 'Скасувати',
    guestPromptTitle: 'Потрібна реєстрація',
    guestPromptBody: 'Для подачі заявок потрібна РЕЄСТРАЦІЯ.\n\nХочете пройти швидку реєстрацію за 2 хвилини?',
    guestPromptConfirm: 'Так, зареєструватись',
    guestPromptDecline: 'Ні',
    authNoticeBody: 'Для подачі заявок потрібна реєстрація. Це займе 1 хвилину.',
    authNoticeBtn: 'Увійти / Зареєструватись',
  },
  ru: {
    errorTitle: 'Ошибка',
    nameError: 'Введите имя (минимум 2 символа)',
    phoneError: 'Введите корректный телефон в формате +380...',
    groupError: 'Выберите группу категорий (например: Фудшеринг, Транспорт)',
    subcategoryError: 'Выберите подкатегорию внутри группы',
    foodError: 'Укажите магазин и время для фудшеринга',
    rideError: 'Укажите направление и время для поездки',
    detailsError: 'Заполните все детали',
    descTooShort: 'Если описываете ситуацию - укажите хотя бы 10 символов',
    descMinHint: 'Минимум 10 символов, если добавляете описание.',
    ownTextRequiredTitle: 'Добавьте свой текст',
    ownTextRequiredBody: 'Чтобы опубликовать заявку, опишите ситуацию своими словами (минимум 10 символов).',
    ownTextRequiredAction: 'Добавить описание',
    doneTitle: 'Готово',
    doneBody: 'Заявка отправлена на модерацию',
    doneRequestId: 'Номер заявки',
    urgentSuccess: 'Ваша срочная заявка отправлена соседям',
    submitErrorDefault: 'Не удалось добавить заявку. Проверьте соединение и попробуйте снова.',
    heroTitle: 'Новая заявка',
    heroSubtitle: 'Выберите категорию - после проверки модератором соседи смогут с вами связаться',
    heroSubtitleUrgent: 'Срочная заявка попадёт в раздел «Помощь соседям» и исчезнет в 23:59',
    urgentToggle: 'Срочно (только сегодня)',
    contacts: 'Контакты',
    nameLabel: 'Имя',
    namePlaceholder: 'Ваше имя',
    phoneLabel: 'Телефон',
    categoryTitle: 'Категория',
    addDetails: '+ Добавить детали',
    hideDetails: '− Скрыть детали',
    descLabel: 'Описание ситуации (необязательно)',
    descPlaceholder: 'Расскажите подробнее, что именно нужно...',
    charsLeft: 'символов',
    submit: 'Отправить заявку',
    submitUrgent: 'Отправить срочную заявку',
    ok: 'OK',
    urgentLimitTitle: 'Лимит исчерпан',
    urgentLimitBody: 'Допускается не более 3 срочных заявок в день.',
    urgentIntervalTitle: 'Подождите',
    urgentIntervalPrefix: 'Между срочными заявками минимальная пауза 30 минут. Осталось',
    urgentIntervalSuffix: 'мин.',
    photoAuthTitle: 'Требуется авторизация',
    photoAuthBody: 'Чтобы загружать контент, нужно авторизоваться. Это условие приложения.',
    photoAuthBtn: 'Регистрация',
    photoAuthCancel: 'Отмена',
    guestPromptTitle: 'Требуется регистрация',
    guestPromptBody: 'Для отправки заявок нужна РЕГИСТРАЦИЯ.\n\nХотите пройти быструю регистрацию за 2 минуты?',
    guestPromptConfirm: 'Да, зарегистрироваться',
    guestPromptDecline: 'Нет',
    authNoticeBody: 'Для отправки заявок нужна регистрация. Это займёт 1 минуту.',
    authNoticeBtn: 'Войти / Зарегистрироваться',
  },
  en: {
    errorTitle: 'Error',
    nameError: 'Enter a name (at least 2 characters)',
    phoneError: 'Enter a valid phone in format +380...',
    groupError: 'Choose a category group (for example: Foodsharing, Transport)',
    subcategoryError: 'Choose a subcategory in the selected group',
    foodError: 'Specify store and time for foodsharing',
    rideError: 'Specify direction and time for the ride',
    detailsError: 'Fill in all details',
    descTooShort: 'If you are describing the situation - enter at least 10 characters',
    descMinHint: 'Minimum 10 characters if you add a description.',
    ownTextRequiredTitle: 'Add your own text',
    ownTextRequiredBody: 'To publish the request, describe your situation in your own words (at least 10 characters).',
    ownTextRequiredAction: 'Add description',
    doneTitle: 'Done',
    doneBody: 'Request sent for moderation',
    doneRequestId: 'Request ID',
    urgentSuccess: 'Your urgent request was sent to neighbors',
    submitErrorDefault: 'Failed to add request. Check connection and try again.',
    heroTitle: 'New Request',
    heroSubtitle: 'Choose a category and a moderator will review it before neighbors can contact you',
    heroSubtitleUrgent: 'Urgent request will appear in "Neighbor Help" and expire at 23:59 today',
    urgentToggle: 'Urgent (today only)',
    contacts: 'Contacts',
    nameLabel: 'Name',
    namePlaceholder: 'Your name',
    phoneLabel: 'Phone',
    categoryTitle: 'Category',
    addDetails: '+ Add details',
    hideDetails: '− Hide details',
    descLabel: 'Situation description (optional)',
    descPlaceholder: 'Describe in more detail what you need...',
    charsLeft: 'chars',
    submit: 'Send request',
    submitUrgent: 'Send urgent request',
    ok: 'OK',
    urgentLimitTitle: 'Daily limit reached',
    urgentLimitBody: 'Only 3 urgent requests are allowed per day.',
    urgentIntervalTitle: 'Please wait',
    urgentIntervalPrefix: 'Minimum 30 minutes between urgent requests. Time remaining:',
    urgentIntervalSuffix: 'min.',
    photoAuthTitle: 'Authorization required',
    photoAuthBody: 'To upload content, you must be authorized. This is a requirement of the app.',
    photoAuthBtn: 'Register',
    photoAuthCancel: 'Cancel',
    guestPromptTitle: 'Registration required',
    guestPromptBody: 'To submit requests, REGISTRATION is required.\n\nWould you like to register quickly in 2 minutes?',
    guestPromptConfirm: 'Yes, register',
    guestPromptDecline: 'No',
    authNoticeBody: 'To submit requests, registration is required. It takes 1 minute.',
    authNoticeBtn: 'Sign in / Register',
  },
} as const;

const AddRequestScreen = ({ navigation }: { navigation: NavigationProp<ParamListBase> }) => {
  const { sendRequest } = useRequests();
  const dispatch = useDispatch<AppDispatch>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const user = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];
  const requiredPhotoLabel = getRequiredPhotoLabel(language);

  const [name, setName] = useState(() => (user?.name ? normalizePersonName(user.name) : ''));
  const [phone, setPhone] = useState(() => (user?.phone ? normalizePhoneText(user.phone) : ''));
  const [group, setGroup] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [store, setStore] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);

  // Новые поля единой формы
  const [isUrgent, setIsUrgent] = useState(false);
  const [description, setDescription] = useState('');
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    phone?: string;
    group?: string;
    subcategory?: string;
    special?: string;
    description?: string;
  }>({});

  const isFoodsharing = subcategory === SPECIAL.FOODSHARING;
  const isRide = subcategory === SPECIAL.RIDE_SHARE;

  const isSpecialComplete = useMemo(() => {
    if (isFoodsharing) return Boolean(store && timeSlot);
    if (isRide) return Boolean(destination.trim() && timeSlot);
    return true;
  }, [destination, isFoodsharing, isRide, store, timeSlot]);
  const isContactsComplete = useMemo(() => validateName(normalizePersonName(name)) && validatePhone(normalizePhoneText(phone)), [name, phone]);
  // Для срочной заявки категория не обязательна
  const isCategoryComplete = useMemo(() => isUrgent ? true : Boolean(group) && Boolean(subcategory), [group, subcategory, isUrgent]);
  const isDescriptionValid = description.trim().length === 0 || description.trim().length >= 10;

  // Загрузка черновика
  useEffect(() => {
    const loadDraft = async () => {
      const raw = await AsyncStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Record<string, string>;
        setName(normalizePersonName(parsed.name ?? ''));
        setPhone(normalizePhoneText(parsed.phone ?? '+380'));
        setGroup(parsed.group ?? '');
        setSubcategory(parsed.subcategory ?? '');
        setStore(parsed.store ?? '');
        setTimeSlot(parsed.timeSlot ?? '');
        setDestination(parsed.destination ?? '');
        if (parsed.description) setDescription(parsed.description);
      } catch {
        await AsyncStorage.removeItem(DRAFT_KEY);
      }
    };
    void loadDraft();
  }, []);

  // Показати гість-підказку один раз при відкритті форми
  useEffect(() => {
    if (!user?.id && !guestPromptShownThisSession) {
      guestPromptShownThisSession = true;
      Alert.alert(
        text.guestPromptTitle,
        text.guestPromptBody,
        [
          { text: text.guestPromptConfirm, onPress: () => navigation.navigate('LoginScreen' as never) },
          { text: text.guestPromptDecline, style: 'cancel' },
        ]
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Автосохранение черновика
  useEffect(() => {
    void AsyncStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ name, phone, group, subcategory, store, timeSlot, destination, description })
    );
  }, [name, phone, group, subcategory, store, timeSlot, destination, description]);

  const clearDraft = useCallback(async () => {
    await AsyncStorage.removeItem(DRAFT_KEY);
  }, []);

  const handleGroupChange = useCallback((value: string) => {
    setGroup(value);
    setSubcategory('');
    setStore('');
    setTimeSlot('');
    setDestination('');
  }, []);

  const handleSubcategoryChange = useCallback((value: string) => {
    setSubcategory(value);
    setStore('');
    setTimeSlot('');
    setDestination('');
  }, []);

  const handleToggleDetails = useCallback(() => {
    setShowDetails((prev) => !prev);
  }, []);

  const handleUrgentToggle = useCallback((value: boolean) => {
    setIsUrgent(value);
  }, []);

  const handleGuestPhotoPress = useCallback(() => {
    Alert.alert(
      text.photoAuthTitle,
      text.photoAuthBody,
      [
        { text: text.photoAuthBtn, onPress: () => navigation.navigate('LoginScreen' as never) },
        { text: text.photoAuthCancel, style: 'cancel' },
      ]
    );
  }, [navigation, text]);

  const returnToRequestTopics = useCallback(() => {
    navigation.dispatch(StackActions.replace('RequestsTab'));
  }, [navigation]);

  const handleSubmit = async () => {
    if (loading) return;
    if (!validateSubmissionRequirements({ language, userId: user?.id, userPhotoURL: user?.photoURL, userStartAvatarKey: user?.startAvatarKey, navigation })) {
      return;
    }
    const nextErrors: {
      name?: string;
      phone?: string;
      group?: string;
      subcategory?: string;
      special?: string;
      description?: string;
    } = {};
    const normalizedName = normalizePersonName(name);
    const normalizedPhone = normalizePhoneText(phone);

    if (!validateName(normalizedName)) {
      nextErrors.name = text.nameError;
      setFieldErrors(nextErrors);
      Alert.alert(text.errorTitle, text.nameError);
      return;
    }
    if (!validatePhone(normalizedPhone)) {
      nextErrors.phone = text.phoneError;
      setFieldErrors(nextErrors);
      Alert.alert(text.errorTitle, text.phoneError);
      return;
    }

    // Для обычной заявки категория обязательна
    if (!isUrgent) {
      if (!group) {
        nextErrors.group = text.groupError;
        setFieldErrors(nextErrors);
        Alert.alert(text.errorTitle, text.groupError);
        return;
      }
      if (!subcategory) {
        nextErrors.subcategory = text.subcategoryError;
        setFieldErrors(nextErrors);
        Alert.alert(text.errorTitle, text.subcategoryError);
        return;
      }
      if (!isSpecialComplete) {
        nextErrors.special = isFoodsharing ? text.foodError : isRide ? text.rideError : text.detailsError;
        setFieldErrors(nextErrors);
        Alert.alert(text.errorTitle, isFoodsharing ? text.foodError : isRide ? text.rideError : text.detailsError);
        return;
      }
    }

    const userDescription = description.trim();
    if (showDetails && userDescription.length > 0 && userDescription.length < 10) {
      nextErrors.description = text.descTooShort;
      setFieldErrors(nextErrors);
      Alert.alert(text.errorTitle, text.descTooShort);
      return;
    }

    setFieldErrors({});
    const firstPhoto = getDonePhotos(formPhotos)[0];

    // Ограничитель частоты - только для заявок с описанием и не срочных
    if (!isUrgent && showDetails && description.trim().length >= 10) {
      const secsLeft = RATE_LIMITERS.requestForm.cooldownSecondsLeft();
      if (secsLeft > 0) {
        Alert.alert(
          language === 'ru' ? 'Подождите немного' : language === 'en' ? 'Please wait' : 'Зачекайте трохи',
          language === 'ru'
            ? `Заявку уже отправили. Следующую с описанием можно через ${secsLeft} сек.`
            : language === 'en'
              ? `Request already sent. You can send the next detailed request in ${secsLeft} seconds.`
              : `Заявку вже надіслали. Наступну з описом можна через ${secsLeft} сек.`
        );
        return;
      }
    }

    setLoading(true);
    try {
      if (isUrgent) {
        // Перевірка денного ліміту та інтервалу між терміновими заявками
        const urgentRecord = await loadUrgentRecord(user!.id);
        if (urgentRecord.count >= URGENT_MAX_PER_DAY) {
          Alert.alert(text.urgentLimitTitle, text.urgentLimitBody, [{ text: text.ok }]);
          return;
        }
        if (urgentRecord.lastTime > 0 && Date.now() - urgentRecord.lastTime < URGENT_MIN_INTERVAL_MS) {
          const minsLeft = Math.ceil((URGENT_MIN_INTERVAL_MS - (Date.now() - urgentRecord.lastTime)) / 60000);
          Alert.alert(
            text.urgentIntervalTitle,
            `${text.urgentIntervalPrefix} ${minsLeft} ${text.urgentIntervalSuffix}`,
            [{ text: text.ok }]
          );
          return;
        }

        // --- Путь срочной заявки (помощь соседям) ---
        const descText = description.trim()
          ? sanitizeStoredText(description.trim())
          : sanitizeStoredText(userDescription);

        const serverResult = await firebaseChatAPI.addRequest({
          name: normalizedName,
          phone: normalizedPhone,
          language,
          description: descText,
          category: subcategory || 'other',
          group: 'help_neighbors',
          photoUri: firstPhoto?.downloadUrl ?? '',
          photoStoragePath: firstPhoto?.storagePath ?? '',
        });

        if (!serverResult.success) {
          showUserError(language, 'send', serverResult.error || text.submitErrorDefault);
          return;
        }

        // Зберегти запис ліміту після успішної відправки
        await saveUrgentRecord(user!.id, { ...urgentRecord, count: urgentRecord.count + 1, lastTime: Date.now() });

        const newRequest: HelpRequest = {
          id: serverResult.data?.id || `help-${Date.now()}`,
          name: normalizedName,
          phone: normalizedPhone,
          description: descText,
          createdAt: new Date(),
          expiresAt: new Date(new Date().setHours(23, 59, 59, 999)),
          isBurning: true,
          ...createPendingModeration(),
        };

        dispatch(addHelpRequest(newRequest));

        const requestsResponse = await getRequests();
        if (requestsResponse.success && requestsResponse.data) {
          dispatch(syncFromRequests(requestsResponse.data));
        }

        await clearDraft();
        setName('');
        setPhone('+380');
        setGroup('');
        setSubcategory('');
        setStore('');
        setTimeSlot('');
        setDestination('');
        setDescription('');
        setIsUrgent(false);
        setShowDetails(false);

        Alert.alert(text.doneTitle, text.urgentSuccess, [{ text: text.ok, onPress: returnToRequestTopics }]);
      } else {
        // --- Обычный путь ---
        const finalDescription = showDetails ? sanitizeStoredText(userDescription) : '';

        const createdRequest = await sendRequest({
          name: normalizedName,
          phone: normalizedPhone,
          language,
          category: subcategory,
          group,
          subcategory,
          store,
          timeSlot,
          destination: destination.trim(),
          building: 'Чайка Life',
          description: finalDescription,
          text: finalDescription,
          photoUri: firstPhoto?.downloadUrl ?? '',
          photoStoragePath: firstPhoto?.storagePath ?? '',
        });

        RATE_LIMITERS.requestForm.recordSubmit();

        const shortRequestId = createdRequest?.id ? String(createdRequest.id).slice(-6).toUpperCase() : null;
        const successMessage = shortRequestId
          ? `${text.doneBody}\n\n${text.doneRequestId}: ${shortRequestId}`
          : text.doneBody;

        await clearDraft();
        setName('');
        setPhone('+380');
        setGroup('');
        setSubcategory('');
        setStore('');
        setTimeSlot('');
        setDestination('');
        setDescription('');
        setShowDetails(false);
        Alert.alert(text.doneTitle, successMessage, [{ text: text.ok, onPress: returnToRequestTopics }]);
      }
    } catch (err: unknown) {
      showUserError(language, 'send', err || text.submitErrorDefault);
      await clearDraft();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Герой-картка */}
          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
                <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.heroTitle}>{text.heroTitle}</Text>
            <Text style={styles.heroSubtitle}>{isUrgent ? text.heroSubtitleUrgent : text.heroSubtitle}</Text>

            {/* Перемикач терміновості */}
            <View style={styles.urgentRow}>
              <View style={styles.urgentTextWrap}>
                <MaterialCommunityIcons
                  name="fire"
                  size={18}
                  color={isUrgent ? SCREEN_THEME.terracotta : SCREEN_THEME.textMuted}
                />
                <Text style={[styles.urgentLabel, isUrgent && styles.urgentLabelActive]}>
                  {text.urgentToggle}
                </Text>
              </View>
              <Switch
                value={isUrgent}
                onValueChange={handleUrgentToggle}
                trackColor={{ false: '#E0D4BA', true: SCREEN_THEME.terracotta }}
                thumbColor={isUrgent ? '#FFF9EE' : '#F5EDD8'}
              />
            </View>
          </View>

          {!user && (
            <View style={styles.authNoticeCard}>
              <Text style={styles.authNoticeTitle}>{text.guestPromptTitle}</Text>
              <Text style={styles.authNoticeBody}>{text.authNoticeBody}</Text>
              <TouchableOpacity
                style={styles.authNoticeBtn}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('LoginScreen' as never)}
              >
                <Text style={styles.authNoticeBtnText}>{text.authNoticeBtn}</Text>
              </TouchableOpacity>
            </View>
          )}

          {user && (<>
          {/* Контакти */}
          <View style={styles.card}>
            <FormSectionLabel label={text.contacts} completed={isContactsComplete} labelStyle={styles.sectionTitle} />
            <FormSectionLabel label={text.nameLabel} completed={validateName(normalizePersonName(name))} containerStyle={styles.labelRow} labelStyle={styles.label} />
            <TextInput style={styles.input} placeholder={text.namePlaceholder} placeholderTextColor={SCREEN_THEME.textMuted} value={name} onChangeText={(v) => { setName(normalizePersonName(v)); if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined })); }} />
            <FormFieldError error={fieldErrors.name} />
            <FormSectionLabel label={text.phoneLabel} completed={validatePhone(normalizePhoneText(phone))} containerStyle={styles.labelRow} labelStyle={styles.label} />
            <TextInput style={styles.input} placeholder="+380..." placeholderTextColor={SCREEN_THEME.textMuted} value={phone} onChangeText={(v) => { setPhone(normalizePhoneText(v)); if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined })); }} keyboardType="phone-pad" />
            <FormFieldError error={fieldErrors.phone} />
          </View>

          {/* Категорія (завжди видна, для термінових - опціонально) */}
          <View style={styles.card}>
            <FormSectionLabel
              label={isUrgent ? `${text.categoryTitle} (необов'язково)` : text.categoryTitle}
              completed={isCategoryComplete && isSpecialComplete}
              labelStyle={styles.sectionTitle}
            />
            <CategorySelector value={group} onSelect={handleGroupChange} disabled={loading} />
            <FormFieldError error={fieldErrors.group} />
            {group ? <SubcategorySelector group={group} value={subcategory} onSelect={handleSubcategoryChange} disabled={loading} /> : null}
            <FormFieldError error={fieldErrors.subcategory} />
          </View>

          {isFoodsharing ? <FoodSharingForm store={store} timeSlot={timeSlot} onStoreChange={setStore} onTimeChange={setTimeSlot} /> : null}
          {isRide ? <RideSharingForm destination={destination} timeSlot={timeSlot} onDestinationChange={setDestination} onTimeChange={setTimeSlot} /> : null}
          <View style={styles.inlineErrorWrap}><FormFieldError error={fieldErrors.special} /></View>

          {/* Кнопка "Додати деталі" */}
          <TouchableOpacity style={styles.detailsToggle} onPress={handleToggleDetails} activeOpacity={0.75}>
            <MaterialCommunityIcons
              name={showDetails ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={SCREEN_THEME.textSecondary}
            />
            <Text style={styles.detailsToggleText}>
              {showDetails ? text.hideDetails : text.addDetails}
            </Text>
          </TouchableOpacity>

          {/* Блок деталей - разворачивается по кнопке */}
          {showDetails ? (
            <View style={styles.card}>
              <FormSectionLabel
                label={text.descLabel}
                completed={description.trim().length === 0 || description.trim().length >= 10}
                labelStyle={styles.sectionTitle}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={text.descPlaceholder}
                placeholderTextColor={SCREEN_THEME.textMuted}
                value={description}
                onChangeText={(v) => setDescription(v.slice(0, MAX_DESC_LENGTH))}
                multiline
                maxLength={MAX_DESC_LENGTH}
                textAlignVertical="top"
              />
              <Text style={[styles.charCounter, !isDescriptionValid && styles.charCounterError]}>
                {description.length}/{MAX_DESC_LENGTH} {text.charsLeft}
              </Text>
              <Text style={styles.fieldHint}>{text.descMinHint}</Text>
              <FormFieldError error={fieldErrors.description} />
            </View>
          ) : null}

          {/* Кнопка отправки */}
          <View style={styles.card}>
            <FormSectionLabel
              label={requiredPhotoLabel}
              completed={getDonePhotos(formPhotos).length > 0}
              labelStyle={styles.sectionTitle}
            />
            {user?.id ? (
              <PhotoUploadField
                uid={user.id}
                userName={user?.name ?? ''}
                maxPhotos={3}
                storagePath="requests"
                onPhotosChange={setFormPhotos}
              />
            ) : (
              <TouchableOpacity style={styles.guestPhotoBtn} onPress={handleGuestPhotoPress} activeOpacity={0.8}>
                <MaterialCommunityIcons name="camera-plus-outline" size={22} color={SCREEN_THEME.textSecondary} />
                <Text style={styles.guestPhotoBtnText}>Додати фото</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                isUrgent && styles.submitButtonUrgent,
                loading && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF9EE" />
              ) : (
                <>
                  {isUrgent ? (
                    <MaterialCommunityIcons name="fire" size={18} color="#FFF9EE" />
                  ) : (
                    <MaterialCommunityIcons name="send-outline" size={18} color="#FFF9EE" />
                  )}
                  <Text style={styles.submitButtonText}>
                    {isUrgent ? text.submitUrgent : text.submit}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          </>)}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  flex: { flex: 1 },
  backgroundLayer: { ...StyleSheet.absoluteFillObject },
  orb: { position: 'absolute', borderRadius: 999 },
  container: { flex: 1 },
  heroCard: { marginHorizontal: 20, marginTop: 16, backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 30, padding: 20, borderWidth: 1, borderColor: '#E4D0AB' },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1E1BC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0C89A' },
  heroTitle: { fontSize: 26, fontWeight: '900', color: SCREEN_THEME.textPrimary, textAlign: 'center' },
  heroSubtitle: { marginTop: 10, fontSize: 14, lineHeight: 21, color: SCREEN_THEME.textSecondary, textAlign: 'center' },
  urgentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EBD9B6' },
  urgentTextWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  urgentLabel: { fontSize: 14, fontWeight: '800', color: SCREEN_THEME.textSecondary },
  urgentLabelActive: { color: SCREEN_THEME.terracotta },
  card: { marginHorizontal: 20, marginTop: 16, backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 26, padding: 18, borderWidth: 1, borderColor: '#E4D0AB' },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '800', color: SCREEN_THEME.textSecondary, marginBottom: 6, marginTop: 8 },
  labelRow: { marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#FFFDF6', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: SCREEN_THEME.textPrimary, borderWidth: 1, borderColor: '#E7D6B3' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  charCounter: { fontSize: 12, color: SCREEN_THEME.textSecondary, marginTop: 6, textAlign: 'right', fontWeight: '700' },
  charCounterError: { color: SCREEN_THEME.terracotta },
  fieldHint: { fontSize: 12, color: SCREEN_THEME.textSecondary, marginTop: 4, fontWeight: '700' },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, marginHorizontal: 20, paddingVertical: 10, borderRadius: 18, borderWidth: 1, borderColor: '#E4D0AB', backgroundColor: SCREEN_THEME.paperStrong },
  detailsToggleText: { fontSize: 14, fontWeight: '800', color: SCREEN_THEME.textSecondary },
  authNoticeCard: { marginHorizontal: 20, marginTop: 16, backgroundColor: '#FFF8E1', borderRadius: 26, padding: 18, borderWidth: 1, borderColor: '#F5C842' },
  authNoticeTitle: { fontSize: 15, fontWeight: '900', color: '#7A5C00', marginBottom: 6 },
  authNoticeBody: { fontSize: 13, color: '#7A5C00', lineHeight: 19, marginBottom: 12 },
  authNoticeBtn: { backgroundColor: SCREEN_THEME.woodGreen, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 18, alignSelf: 'flex-start' },
  authNoticeBtnText: { color: '#FFF9EE', fontWeight: '900', fontSize: 14 },
  footer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 30 },
  submitButton: { minHeight: 56, borderRadius: 18, backgroundColor: SCREEN_THEME.woodGreen, borderWidth: 1, borderColor: SCREEN_THEME.woodGreenDark, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  submitButtonUrgent: { backgroundColor: SCREEN_THEME.terracotta, borderColor: SCREEN_THEME.terracottaDark },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#FFF9EE', fontWeight: '900', fontSize: 16 },
  inlineErrorWrap: { marginHorizontal: 20, marginTop: 6 },
  guestPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: '#FFFDF6',
  },
  guestPhotoBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
  },
});

export default AddRequestScreen;

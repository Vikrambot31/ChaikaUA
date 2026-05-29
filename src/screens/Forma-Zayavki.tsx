import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
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
import { Picker } from '@react-native-picker/picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../redux/store';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { firebaseChatAPI } from '../firebase-config';
import { addHelpRequest, syncFromRequests } from '../redux/slices/helpRequestsSlice';
import { getRequests } from '../services/api';
import { SCREEN_THEME } from '../utils/screenTheme';
import { getDonePhotos } from '../utils/submissionRequirements';
import { normalizePersonName, sanitizeStoredText } from '../utils/textUtils';
import { showUserError } from '../utils/userFacingErrors';
import { normalizeUkrainianPhoneStrict, validateName, validatePhone } from '../utils/validators';

type Lang = 'ua' | 'ru' | 'en';
type FieldKey = 'name' | 'phone' | 'helpType' | 'description' | 'photos';
type FieldTone = 'idle' | 'valid' | 'error' | 'warning';
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type FieldState = {
  tone: FieldTone;
  message: string;
};

const HELP_TYPES = [
  { value: 'medicine', label: { ua: 'Медицина', ru: 'Медицина', en: 'Medicine' } },
  { value: 'repair', label: { ua: 'Ремонт', ru: 'Ремонт', en: 'Repair' } },
  { value: 'psychology', label: { ua: 'Психологія', ru: 'Психология', en: 'Psychology' } },
  { value: 'transport', label: { ua: 'Транспорт', ru: 'Транспорт', en: 'Transport' } },
  { value: 'shopping', label: { ua: 'Покупки', ru: 'Покупки', en: 'Shopping' } },
  { value: 'documents', label: { ua: 'Документи', ru: 'Документы', en: 'Documents' } },
  { value: 'other', label: { ua: 'Інше', ru: 'Другое', en: 'Other' } },
] as const;

const MAX_DESCRIPTION_LENGTH = 500;
const REQUEST_FORM_DRAFT_KEY = '@chaika:request-form-draft:v1';

const TEXT_BY_LANG = {
  ua: {
    back: 'Назад',
    title: 'Додати прохання',
    subtitle: 'Заповніть коротку форму. Ми підкажемо, що вже готово, а що ще треба дописати.',
    name: "Ім'я",
    phone: 'Телефон',
    helpType: 'Тип допомоги',
    description: 'Опис',
    photo: "Фото (необов'язково)",
    namePlaceholder: "Ваше ім'я",
    phonePlaceholder: '+380...',
    descriptionPlaceholder: 'Напишіть, що саме потрібно...',
    chooseType: 'Оберіть тип допомоги',
    submit: 'Надіслати прохання',
    submitReview: 'Перевірити та надіслати',
    successTitle: 'Готово',
    successBody: 'Ваше прохання додано у стрічку допомоги сусідам.',
    errorTitle: 'Помилка',
    required: "Заповніть ім'я, телефон, тип допомоги та опис.",
    invalidContact: "Перевірте ім'я та телефон.",
    shortDescription: 'Опис має бути не менше 10 символів.',
    photoUploading: 'Зачекайте, поки фото завантажиться, або видаліть його.',
    photoError: 'Фото не завантажилось. Видаліть його або спробуйте ще раз.',
    sendFailed: 'Не вдалося надіслати прохання.',
    authRequiredTitle: 'Потрібен вхід',
    authRequiredBody: 'Щоб додати заявку, спочатку увійдіть або пройдіть реєстрацію.',
    authLater: 'Пізніше',
    authGoLogin: 'Перейти до входу',
    bannerStart: 'Заповніть обов’язкові поля. Кожне поле покаже, що з ним не так.',
    bannerProgress: 'Готово {done} з {total}. Перевірте підказки нижче.',
    bannerReady: 'Усе готово. Можна надсилати прохання.',
    bannerPhoto: 'Обов’язкові поля готові. Перевірте фото нижче.',
    checklistTitle: 'Готовність форми',
    ready: 'Готово',
    optional: "Необов'язково",
    nameHint: "Вкажіть ім'я, щоб сусіди знали, до кого звертатися.",
    nameEmpty: "Напишіть ім'я.",
    nameInvalid: "Ім'я має містити мінімум 2 символи.",
    phoneHint: 'Формат: +380 XX XXX XX XX.',
    phoneEmpty: 'Напишіть номер телефону.',
    phoneInvalid: 'Перевірте український номер у форматі +380 XX XXX XX XX.',
    helpTypeHint: 'Оберіть один варіант, щоб сусіди швидше зрозуміли тему.',
    helpTypeEmpty: 'Оберіть тип допомоги.',
    descriptionHint: 'Напишіть: що сталося, де це знаходиться, коли потрібна допомога.',
    descriptionExample: 'Приклад: Потрібна допомога купити ліки сьогодні після 18:00, будинок 12.',
    descriptionEmpty: 'Опишіть, яка допомога потрібна.',
    descriptionShort: 'Додайте ще трохи деталей. Мінімум 10 символів.',
    descriptionCount: '{count}/500, мін. 10 символів',
    descriptionLeft: 'Ще {left} символів до мінімуму.',
    photoHint: "Фото необов'язкове, але допоможе швидше зрозуміти ситуацію.",
    photoReady: 'Фото готове.',
    photoUploadWait: 'Фото ще завантажується.',
    photoUploadError: 'Фото з помилкою. Видаліть його або спробуйте ще раз.',
  },
  ru: {
    back: 'Назад',
    title: 'Добавить просьбу',
    subtitle: 'Заполните короткую форму. Мы подскажем, что уже готово, а что ещё нужно дописать.',
    name: 'Имя',
    phone: 'Телефон',
    helpType: 'Тип помощи',
    description: 'Описание',
    photo: 'Фото (необязательно)',
    namePlaceholder: 'Ваше имя',
    phonePlaceholder: '+380...',
    descriptionPlaceholder: 'Напишите, что именно нужно...',
    chooseType: 'Выберите тип помощи',
    submit: 'Отправить просьбу',
    submitReview: 'Проверить и отправить',
    successTitle: 'Готово',
    successBody: 'Ваша просьба добавлена в ленту помощи соседям.',
    errorTitle: 'Ошибка',
    required: 'Заполните имя, телефон, тип помощи и описание.',
    invalidContact: 'Проверьте имя и телефон.',
    shortDescription: 'Описание должно быть не меньше 10 символов.',
    photoUploading: 'Подождите, пока фото загрузится, или удалите его.',
    photoError: 'Фото не загрузилось. Удалите его или попробуйте ещё раз.',
    sendFailed: 'Не удалось отправить просьбу.',
    authRequiredTitle: 'Нужен вход',
    authRequiredBody: 'Чтобы добавить заявку, сначала войдите или пройдите регистрацию.',
    authLater: 'Позже',
    authGoLogin: 'Перейти на вход',
    bannerStart: 'Заполните обязательные поля. Каждое поле покажет, что с ним не так.',
    bannerProgress: 'Готово {done} из {total}. Проверьте подсказки ниже.',
    bannerReady: 'Всё готово. Можно отправлять просьбу.',
    bannerPhoto: 'Обязательные поля готовы. Проверьте фото ниже.',
    checklistTitle: 'Готовность формы',
    ready: 'Готово',
    optional: 'Необязательно',
    nameHint: 'Укажите имя, чтобы соседи знали, к кому обращаться.',
    nameEmpty: 'Напишите имя.',
    nameInvalid: 'Имя должно содержать минимум 2 символа.',
    phoneHint: 'Формат: +380 XX XXX XX XX.',
    phoneEmpty: 'Напишите номер телефона.',
    phoneInvalid: 'Проверьте украинский номер в формате +380 XX XXX XX XX.',
    helpTypeHint: 'Выберите один вариант, чтобы соседи быстрее поняли тему.',
    helpTypeEmpty: 'Выберите тип помощи.',
    descriptionHint: 'Напишите: что случилось, где это находится, когда нужна помощь.',
    descriptionExample: 'Пример: Нужна помощь купить лекарства сегодня после 18:00, дом 12.',
    descriptionEmpty: 'Опишите, какая помощь нужна.',
    descriptionShort: 'Добавьте ещё немного деталей. Минимум 10 символов.',
    descriptionCount: '{count}/500, мин. 10 символов',
    descriptionLeft: 'Ещё {left} символов до минимума.',
    photoHint: 'Фото необязательно, но поможет быстрее понять ситуацию.',
    photoReady: 'Фото готово.',
    photoUploadWait: 'Фото ещё загружается.',
    photoUploadError: 'Фото с ошибкой. Удалите его или попробуйте ещё раз.',
  },
  en: {
    back: 'Back',
    title: 'Add a request',
    subtitle: 'Fill out the short form. We will show what is ready and what still needs attention.',
    name: 'Name',
    phone: 'Phone',
    helpType: 'Help type',
    description: 'Description',
    photo: 'Photo (optional)',
    namePlaceholder: 'Your name',
    phonePlaceholder: '+380...',
    descriptionPlaceholder: 'Write what you need...',
    chooseType: 'Choose help type',
    submit: 'Send request',
    submitReview: 'Check and send',
    successTitle: 'Done',
    successBody: 'Your request has been added to the neighbor help feed.',
    errorTitle: 'Error',
    required: 'Fill in name, phone, help type and description.',
    invalidContact: 'Check name and phone.',
    shortDescription: 'Description must be at least 10 characters.',
    photoUploading: 'Wait until the photo uploads, or remove it.',
    photoError: 'Photo did not upload. Remove it or try again.',
    sendFailed: 'Could not send the request.',
    authRequiredTitle: 'Sign in required',
    authRequiredBody: 'To add a request, sign in or register first.',
    authLater: 'Later',
    authGoLogin: 'Go to sign in',
    bannerStart: 'Fill in the required fields. Each field will show what needs attention.',
    bannerProgress: '{done} of {total} ready. Check the tips below.',
    bannerReady: 'Everything is ready. You can send the request.',
    bannerPhoto: 'Required fields are ready. Check the photo below.',
    checklistTitle: 'Form readiness',
    ready: 'Ready',
    optional: 'Optional',
    nameHint: 'Enter your name so neighbors know who to contact.',
    nameEmpty: 'Enter your name.',
    nameInvalid: 'Name must contain at least 2 characters.',
    phoneHint: 'Format: +380 XX XXX XX XX.',
    phoneEmpty: 'Enter your phone number.',
    phoneInvalid: 'Check the Ukrainian number format: +380 XX XXX XX XX.',
    helpTypeHint: 'Choose one option so neighbors understand the topic faster.',
    helpTypeEmpty: 'Choose a help type.',
    descriptionHint: 'Write what happened, where it is, and when help is needed.',
    descriptionExample: 'Example: Need help buying medicine today after 18:00, building 12.',
    descriptionEmpty: 'Describe what help is needed.',
    descriptionShort: 'Add a little more detail. Minimum 10 characters.',
    descriptionCount: '{count}/500, min. 10 characters',
    descriptionLeft: '{left} more characters to reach the minimum.',
    photoHint: 'Photo is optional, but it helps people understand the situation faster.',
    photoReady: 'Photo is ready.',
    photoUploadWait: 'Photo is still uploading.',
    photoUploadError: 'Photo has an error. Remove it or try again.',
  },
} as const;

const toneIcon: Record<FieldTone, IconName> = {
  idle: 'circle-outline',
  valid: 'check-circle',
  error: 'alert-circle',
  warning: 'progress-clock',
};

const toneColor: Record<FieldTone, string> = {
  idle: SCREEN_THEME.textMuted,
  valid: '#2F7D50',
  error: '#B84A3A',
  warning: '#B7791F',
};

const formatPhoneParts = (prefix: string, parts: string[]): string => {
  const filledParts = parts.filter(Boolean);
  return filledParts.length > 0 ? `${prefix} ${filledParts.join(' ')}` : prefix;
};

const formatPhoneInput = (value: string): string => {
  const startsWithPlus = value.trimStart().startsWith('+');
  const digits = value.replace(/\D/g, '');

  if (!digits) {
    return startsWithPlus ? '+' : '';
  }

  if (digits.startsWith('380')) {
    const capped = digits.slice(0, 12);
    return formatPhoneParts(`+${capped.slice(0, 3)}`, [
      capped.slice(3, 5),
      capped.slice(5, 8),
      capped.slice(8, 10),
      capped.slice(10, 12),
    ]);
  }

  if (startsWithPlus && digits.startsWith('38')) {
    const capped = digits.slice(0, 12);
    return formatPhoneParts(`+${capped.slice(0, Math.min(3, capped.length))}`, [
      capped.slice(3, 5),
      capped.slice(5, 8),
      capped.slice(8, 10),
      capped.slice(10, 12),
    ]);
  }

  const capped = digits.slice(0, 10);
  return [
    capped.slice(0, 3),
    capped.slice(3, 6),
    capped.slice(6, 8),
    capped.slice(8, 10),
  ].filter(Boolean).join(' ');
};

const fillTemplate = (template: string, values: Record<string, string | number>) => (
  Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), template)
);

const StatusIcon = ({ tone }: { tone: FieldTone }) => (
  <MaterialCommunityIcons name={toneIcon[tone]} size={20} color={toneColor[tone]} />
);

const FieldHeader = ({ label, state }: { label: string; state: FieldState }) => (
  <View style={styles.fieldHeader}>
    <Text style={styles.label}>{label}</Text>
    <StatusIcon tone={state.tone} />
  </View>
);

const FieldMessage = ({ state, extra }: { state: FieldState; extra?: string }) => (
  <View style={styles.fieldMessageWrap}>
    <Text style={[styles.fieldMessage, { color: toneColor[state.tone] }]}>{state.message}</Text>
    {extra ? <Text style={styles.hint}>{extra}</Text> : null}
  </View>
);

const RequestFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const dispatch = useDispatch<AppDispatch>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const user = useSelector((state: RootState) => state.auth.user);
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(() => formatPhoneInput(user?.phone || '+38'));
  const [helpType, setHelpType] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    name: false,
    phone: false,
    helpType: false,
    description: false,
    photos: false,
  });
  const hasUserId = Boolean(user?.id);
  const t = TEXT_BY_LANG[language] ?? TEXT_BY_LANG.ua;

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(REQUEST_FORM_DRAFT_KEY).then((raw) => {
      if (!raw || cancelled) return;
      try {
        const draft = JSON.parse(raw) as Partial<{
          name: string;
          phone: string;
          helpType: string;
          description: string;
        }>;
        if (typeof draft.name === 'string') setName(draft.name);
        if (typeof draft.phone === 'string') setPhone(formatPhoneInput(draft.phone));
        if (typeof draft.helpType === 'string') setHelpType(draft.helpType);
        if (typeof draft.description === 'string') setDescription(draft.description.slice(0, MAX_DESCRIPTION_LENGTH));
      } catch {
        // Ignore invalid draft payload.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const markTouched = (field: FieldKey) => {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
  };

  const normalizedName = useMemo(() => normalizePersonName(name), [name]);
  const normalizedPhone = useMemo(() => normalizeUkrainianPhoneStrict(phone.trim()), [phone]);
  const cleanDescription = useMemo(() => sanitizeStoredText(description.trim()), [description]);
  const donePhotos = useMemo(() => getDonePhotos(photos), [photos]);

  const nameReady = Boolean(normalizedName && validateName(normalizedName));
  const phoneReady = Boolean(normalizedPhone && validatePhone(normalizedPhone));
  const helpTypeReady = Boolean(helpType);
  const descriptionReady = Boolean(cleanDescription && cleanDescription.length >= 10);
  const photosHaveError = photos.some((photo) => photo.status === 'error');
  const photosUploading = photos.some((photo) => photo.status === 'uploading');
  const photosReady = !photosHaveError && !photosUploading;
  const requiredDone = [nameReady, phoneReady, helpTypeReady, descriptionReady].filter(Boolean).length;
  const formReady = nameReady && phoneReady && helpTypeReady && descriptionReady && photosReady;

  const fieldStates = useMemo<Record<FieldKey, FieldState>>(() => {
    const phoneDigits = phone.replace(/\D/g, '');
    const descriptionLength = cleanDescription.length;

    const showNameIssue = submittedOnce || touched.name || name.trim().length > 0;
    const showPhoneIssue = submittedOnce || touched.phone || phoneDigits.length > 2;
    const showHelpTypeIssue = submittedOnce || touched.helpType;
    const showDescriptionIssue = submittedOnce || touched.description || descriptionLength > 0;

    const nameState: FieldState = nameReady
      ? { tone: 'valid', message: t.ready }
      : {
          tone: showNameIssue ? 'error' : 'idle',
          message: !name.trim() ? (showNameIssue ? t.nameEmpty : t.nameHint) : t.nameInvalid,
        };

    const phoneState: FieldState = phoneReady
      ? { tone: 'valid', message: t.ready }
      : {
          tone: showPhoneIssue ? 'error' : 'idle',
          message: phoneDigits.length <= 2 ? (showPhoneIssue ? t.phoneEmpty : t.phoneHint) : t.phoneInvalid,
        };

    const helpTypeState: FieldState = helpTypeReady
      ? { tone: 'valid', message: t.ready }
      : {
          tone: showHelpTypeIssue ? 'error' : 'idle',
          message: showHelpTypeIssue ? t.helpTypeEmpty : t.helpTypeHint,
        };

    const descriptionState: FieldState = descriptionReady
      ? { tone: 'valid', message: t.ready }
      : {
          tone: showDescriptionIssue ? 'error' : 'idle',
          message: descriptionLength === 0
            ? (showDescriptionIssue ? t.descriptionEmpty : t.descriptionHint)
            : t.descriptionShort,
        };

    const photosState: FieldState = photosHaveError
      ? { tone: 'error', message: t.photoUploadError }
      : photosUploading
        ? { tone: 'warning', message: t.photoUploadWait }
        : donePhotos.length > 0
          ? { tone: 'valid', message: t.photoReady }
          : { tone: 'idle', message: t.photoHint };

    return {
      name: nameState,
      phone: phoneState,
      helpType: helpTypeState,
      description: descriptionState,
      photos: photosState,
    };
  }, [
    cleanDescription.length,
    descriptionReady,
    donePhotos.length,
    helpTypeReady,
    name,
    nameReady,
    phone,
    phoneReady,
    photosHaveError,
    photosUploading,
    submittedOnce,
    t,
    touched.description,
    touched.helpType,
    touched.name,
    touched.phone,
  ]);

  const bannerState = useMemo(() => {
    if (formReady) {
      return { tone: 'valid' as FieldTone, message: t.bannerReady };
    }
    if (requiredDone === 4 && !photosReady) {
      return { tone: fieldStates.photos.tone, message: t.bannerPhoto };
    }
    if (requiredDone > 0 || submittedOnce) {
      return {
        tone: submittedOnce ? 'error' as FieldTone : 'warning' as FieldTone,
        message: fillTemplate(t.bannerProgress, { done: requiredDone, total: 4 }),
      };
    }
    return { tone: 'idle' as FieldTone, message: t.bannerStart };
  }, [fieldStates.photos.tone, formReady, photosReady, requiredDone, submittedOnce, t]);

  const saveDraft = async () => {
    await AsyncStorage.setItem(REQUEST_FORM_DRAFT_KEY, JSON.stringify({
      name,
      phone,
      helpType,
      description,
    })).catch(() => undefined);
  };

  const promptAuthRequired = () => {
    Alert.alert(t.authRequiredTitle, t.authRequiredBody, [
      { text: t.authLater, style: 'cancel' },
      {
        text: t.authGoLogin,
        onPress: () => navigation.navigate('LoginScreen', { redirectTo: 'RequestFormScreen', redirectMode: 'auth' }),
      },
    ]);
  };

  const submit = async () => {
    if (!hasUserId) {
      promptAuthRequired();
      return;
    }

    setSubmittedOnce(true);

    if (!normalizedName || !normalizedPhone || !helpType || !cleanDescription) {
      Alert.alert(t.errorTitle, t.required);
      return;
    }

    if (!validateName(normalizedName) || !validatePhone(normalizedPhone)) {
      Alert.alert(t.errorTitle, t.invalidContact);
      return;
    }

    if (cleanDescription.length < 10) {
      Alert.alert(t.errorTitle, t.shortDescription);
      return;
    }

    if (photosHaveError) {
      Alert.alert(t.errorTitle, t.photoError);
      return;
    }

    if (photosUploading) {
      Alert.alert(t.errorTitle, t.photoUploading);
      return;
    }

    const firstPhoto = donePhotos[0];
    const photoPayload = firstPhoto
      ? {
          photoUri: firstPhoto.downloadUrl,
          photoStoragePath: firstPhoto.storagePath,
        }
      : {};

    setSubmitting(true);
    try {
      const result = await firebaseChatAPI.addRequest({
        name: normalizedName,
        phone: normalizedPhone,
        language,
        category: helpType,
        group: 'help_neighbors',
        subcategory: helpType,
        building: 'Чайка',
        text: cleanDescription,
        description: cleanDescription,
        ...photoPayload,
      });

      if (!result.success) {
        showUserError(language, 'send', result.error || t.sendFailed);
        return;
      }

      dispatch(addHelpRequest({
        id: result.data?.id || `help-${Date.now()}`,
        userId: user?.id,
        name: normalizedName,
        phone: normalizedPhone,
        description: cleanDescription,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        isBurning: true,
        moderationStatus: 'approved',
        moderatedAt: new Date().toISOString(),
      }));

      const requestsResponse = await getRequests();
      if (requestsResponse.success && requestsResponse.data) {
        dispatch(syncFromRequests(requestsResponse.data));
      }

      Alert.alert(t.successTitle, t.successBody, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      setName(user?.name ?? '');
      setPhone(formatPhoneInput(user?.phone || '+38'));
      setHelpType('');
      setDescription('');
      setPhotos([]);
      setSubmittedOnce(false);
      setTouched({
        name: false,
        phone: false,
        helpType: false,
        description: false,
        photos: false,
      });
      void AsyncStorage.removeItem(REQUEST_FORM_DRAFT_KEY).catch(() => undefined);
    } catch (error) {
      showUserError(language, 'send', error);
    } finally {
      setSubmitting(false);
    }
  };

  const checklist = [
    { key: 'name' as FieldKey, label: t.name, state: fieldStates.name },
    { key: 'phone' as FieldKey, label: t.phone, state: fieldStates.phone },
    { key: 'helpType' as FieldKey, label: t.helpType, state: fieldStates.helpType },
    { key: 'description' as FieldKey, label: t.description, state: fieldStates.description },
    { key: 'photos' as FieldKey, label: t.photo, state: fieldStates.photos, optional: true },
  ];

  const descriptionExtra = cleanDescription.length > 0 && cleanDescription.length < 10
    ? fillTemplate(t.descriptionLeft, { left: 10 - cleanDescription.length })
    : t.descriptionExample;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.84}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
            <Text style={styles.backText}>{t.back}</Text>
          </TouchableOpacity>

          <View style={styles.heroCard}>
            <Text style={styles.title}>{t.title}</Text>
            <Text style={styles.subtitle}>{t.subtitle}</Text>
          </View>

          <View style={[styles.statusBanner, styles[`${bannerState.tone}Banner`]]}>
            <StatusIcon tone={bannerState.tone} />
            <Text style={[styles.statusBannerText, { color: toneColor[bannerState.tone] }]}>{bannerState.message}</Text>
          </View>

          <View style={styles.checklistCard}>
            <Text style={styles.checklistTitle}>{t.checklistTitle}</Text>
            {checklist.map((item) => (
              <View key={item.key} style={styles.checklistRow}>
                <StatusIcon tone={item.state.tone} />
                <Text style={styles.checklistLabel}>{item.label}</Text>
                <Text style={[styles.checklistStatus, { color: toneColor[item.state.tone] }]}>
                  {item.optional && item.state.tone === 'idle' ? t.optional : item.state.message}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.formCard}>
            <FieldHeader label={t.name} state={fieldStates.name} />
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={() => markTouched('name')}
              placeholder={t.namePlaceholder}
              placeholderTextColor={SCREEN_THEME.textSecondary}
              style={[styles.input, fieldStates.name.tone === 'error' && styles.inputError, fieldStates.name.tone === 'valid' && styles.inputValid]}
              editable={!submitting}
            />
            <FieldMessage state={fieldStates.name} />

            <FieldHeader label={t.phone} state={fieldStates.phone} />
            <TextInput
              value={phone}
              onChangeText={(value) => setPhone(formatPhoneInput(value))}
              onBlur={() => markTouched('phone')}
              placeholder={t.phonePlaceholder}
              placeholderTextColor={SCREEN_THEME.textSecondary}
              style={[styles.input, fieldStates.phone.tone === 'error' && styles.inputError, fieldStates.phone.tone === 'valid' && styles.inputValid]}
              keyboardType="phone-pad"
              editable={!submitting}
            />
            <FieldMessage state={fieldStates.phone} />

            <FieldHeader label={t.helpType} state={fieldStates.helpType} />
            <View style={[styles.pickerWrap, fieldStates.helpType.tone === 'error' && styles.inputError, fieldStates.helpType.tone === 'valid' && styles.inputValid]}>
              <Picker
                selectedValue={helpType}
                onValueChange={(value) => {
                  setHelpType(String(value));
                  markTouched('helpType');
                }}
                enabled={!submitting}
                style={styles.picker}
              >
                <Picker.Item label={t.chooseType} value="" />
                {HELP_TYPES.map((item) => (
                  <Picker.Item key={item.value} label={item.label[language]} value={item.value} />
                ))}
              </Picker>
            </View>
            <FieldMessage state={fieldStates.helpType} />

            <FieldHeader label={t.description} state={fieldStates.description} />
            <TextInput
              value={description}
              onChangeText={(value) => setDescription(value.slice(0, MAX_DESCRIPTION_LENGTH))}
              onBlur={() => markTouched('description')}
              placeholder={t.descriptionPlaceholder}
              placeholderTextColor={SCREEN_THEME.textSecondary}
              style={[styles.input, styles.textArea, fieldStates.description.tone === 'error' && styles.inputError, fieldStates.description.tone === 'valid' && styles.inputValid]}
              multiline
              textAlignVertical="top"
              editable={!submitting}
            />
            <View style={styles.counterRow}>
              <Text style={styles.hint}>{fillTemplate(t.descriptionCount, { count: cleanDescription.length })}</Text>
              <StatusIcon tone={fieldStates.description.tone} />
            </View>
            <FieldMessage state={fieldStates.description} extra={descriptionExtra} />

            <FieldHeader label={t.photo} state={fieldStates.photos} />
            {hasUserId ? (
              <PhotoUploadField
                uid={user?.id ?? ''}
                userName={user?.name || name || user?.id || 'user'}
                maxPhotos={1}
                storagePath="requests"
                onPhotosChange={(nextPhotos) => {
                  setPhotos(nextPhotos);
                  if (nextPhotos.length > 0) markTouched('photos');
                }}
                onBeforePickerOpen={saveDraft}
              />
            ) : (
              <TouchableOpacity style={styles.authNotice} onPress={promptAuthRequired} activeOpacity={0.86}>
                <MaterialCommunityIcons name="lock-outline" size={20} color={SCREEN_THEME.terracotta} />
                <Text style={styles.authNoticeText}>{t.authRequiredBody}</Text>
              </TouchableOpacity>
            )}
            <FieldMessage state={fieldStates.photos} />

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={submit}
              activeOpacity={0.86}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name={formReady ? 'send' : 'clipboard-check-outline'} size={18} color="#FFFFFF" />
                  <Text style={styles.submitText}>{formReady ? t.submit : t.submitReview}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  keyboard: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginBottom: 12,
  },
  backText: { color: SCREEN_THEME.textPrimary, fontWeight: '900' },
  heroCard: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  title: { color: SCREEN_THEME.textPrimary, fontSize: 24, fontWeight: '900', marginBottom: 8 },
  subtitle: { color: SCREEN_THEME.textSecondary, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  statusBanner: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  idleBanner: { backgroundColor: '#F8F3E8', borderColor: '#D9BF91' },
  validBanner: { backgroundColor: '#ECF7EF', borderColor: '#A8D5B7' },
  errorBanner: { backgroundColor: '#FDEDEA', borderColor: '#E5A29A' },
  warningBanner: { backgroundColor: '#FFF6DD', borderColor: '#E2C36F' },
  statusBannerText: { flex: 1, fontSize: 13, fontWeight: '900', lineHeight: 18 },
  checklistCard: {
    borderRadius: 16,
    padding: 13,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 9,
  },
  checklistTitle: { color: SCREEN_THEME.textPrimary, fontSize: 13, fontWeight: '900', marginBottom: 2 },
  checklistRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checklistLabel: { flex: 1, color: SCREEN_THEME.textPrimary, fontSize: 13, fontWeight: '800' },
  checklistStatus: { maxWidth: '46%', textAlign: 'right', fontSize: 12, fontWeight: '900' },
  formCard: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#FFF8EA',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  fieldHeader: {
    marginTop: 12,
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: { color: SCREEN_THEME.textPrimary, fontSize: 14, fontWeight: '900' },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9BF91',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  inputError: { borderColor: '#B84A3A', backgroundColor: '#FFF7F5' },
  inputValid: { borderColor: '#2F7D50', backgroundColor: '#FBFFFC' },
  textArea: { minHeight: 118, paddingTop: 12, lineHeight: 21 },
  pickerWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9BF91',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  picker: { color: SCREEN_THEME.textPrimary },
  counterRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldMessageWrap: { marginTop: 6, gap: 4 },
  fieldMessage: { fontSize: 12, fontWeight: '900', lineHeight: 16 },
  hint: { color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '700', lineHeight: 16 },
  submitButton: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.terracotta,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  submitButtonDisabled: { opacity: 0.68 },
  submitText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16, textAlign: 'center' },
  authNotice: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9BF91',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authNoticeText: {
    flex: 1,
    color: SCREEN_THEME.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
});

export default RequestFormScreen;

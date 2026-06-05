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
import { NavigationProp, ParamListBase, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import RequestPhotoUploadField, { UploadedPhoto } from '../components/RequestPhotoUploadField';
import { firebaseChatAPI } from '../firebase-config';
import { normalizeLanguage } from '../redux/slices/languageSlice';
import { SCREEN_THEME } from '../utils/screenTheme';
import { getFirstDoneRequestPhoto, hasPhotoUploadInProgress, validateSubmissionRequirements } from '../utils/submissionRequirements';
import { checkYellowList } from '../utils/yellowListCheck';
import { normalizePersonName, sanitizeStoredText } from '../utils/textUtils';
import { normalizeUkrainianPhoneStrict, validateName, validatePhone } from '../utils/validators';
import { useOperationTrace } from '../hooks/useOperationTrace';

type Lang = 'ua' | 'ru' | 'en';
type FieldKey = 'name' | 'phone' | 'helpType' | 'description';
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

const MAX_DESCRIPTION_LENGTH = 280;
const REQUEST_FORM_DRAFT_KEY = '@chaika:request-form-draft:v1';

const PHOTO_UI_TEXT = {
  ua: {
    sectionTitle: 'Фото до заявки',
    pending: 'на модерації',
    upload: (p: number) => `завантаження ${p}%`,
    descTitle: 'Опис фото',
    descPlaceholder: 'Опис до 5 слів',
    addressPlaceholder: 'Адреса місця',
    login: 'Увійдіть, щоб додати фото',
    send: 'Відправити на модерацію',
    sending: 'Фото вже на модерації',
    waitUpload: 'Зачекайте, поки фото завантажиться.',
    empty: 'Поки немає фото до заявок',
  },
  ru: {
    sectionTitle: 'Фото к заявке',
    pending: 'на модерации',
    upload: (p: number) => `загрузка ${p}%`,
    descTitle: 'Описание фото',
    descPlaceholder: 'Описание до 5 слов',
    addressPlaceholder: 'Адрес места',
    login: 'Войдите, чтобы добавить фото',
    send: 'Отправить на модерацию',
    sending: 'Фото уже на модерации',
    waitUpload: 'Подождите, пока фото загрузится.',
    empty: 'Пока нет фото к заявкам',
  },
  en: {
    sectionTitle: 'Photos for the request',
    pending: 'in moderation',
    upload: (p: number) => `uploading ${p}%`,
    descTitle: 'Photo description',
    descPlaceholder: 'Up to 5 words',
    addressPlaceholder: 'Place address',
    login: 'Sign in to add a photo',
    send: 'Submit for moderation',
    sending: 'Photo is in moderation',
    waitUpload: 'Wait until the photo finishes uploading.',
    empty: 'No photos for requests yet',
  },
} as const;

const TEXT_BY_LANG = {
  ua: {
    back: 'Назад',
    title: 'Додати прохання',
    subtitle: 'Заповніть коротку форму. Якщо щось пропущено, ми покажемо одну підказку.',
    name: "Ім'я",
    phone: 'Телефон',
    helpType: 'Тип допомоги',
    description: 'Опис',
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
    sendFailed: 'Не вдалося надіслати прохання.',
    authRequiredTitle: 'Потрібен вхід',
    authRequiredBody: 'Щоб додати заявку, спочатку увійдіть або пройдіть реєстрацію.',
    authLater: 'Пізніше',
    authGoLogin: 'Перейти до входу',
    ready: 'Готово',
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
    descriptionCount: '{count}/{max}, мін. 10 символів',
    descriptionLeft: 'Ще {left} символів до мінімуму.',
    dailyHelpLimit: 'Сьогодні ви вже надіслали 5 прохань про допомогу. Нове прохання можна буде надіслати завтра.',
    dailyRequestLimit: 'Сьогодні ви вже надіслали багато заявок. Спробуйте завтра.',
    languageMismatch: 'Напишіть опис мовою застосунку. Для російської - російською, для української - українською, для англійської - англійською.',
    loginExpired: 'Сесія входу закінчилась. Увійдіть в акаунт ще раз і повторіть відправку.',
    permissionDenied: 'Немає дозволу записати заявку. Перезайдіть в акаунт або зверніться до підтримки.',
    networkError: 'Немає стабільного інтернету. Перевірте з\u2019єднання і натисніть відправити ще раз.',
    serverUnavailable: 'Сервер тимчасово недоступний. Форма заповнена правильно, спробуйте трохи пізніше.',
    missingRequestId: 'Firebase прийняв запит, але не повернув номер заявки. Спробуйте відправити ще раз.',
    serverRejected: 'Форма заповнена, але сервер її не прийняв. Спробуйте змінити опис або надіслати пізніше.',
    unknownServerReason: 'Форма заповнена, але сервер повернув незнайому причину: {reason}',
  },
  ru: {
    back: 'Назад',
    title: 'Добавить просьбу',
    subtitle: 'Заполните короткую форму. Если что-то пропущено, покажем одну подсказку.',
    name: 'Имя',
    phone: 'Телефон',
    helpType: 'Тип помощи',
    description: 'Описание',
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
    sendFailed: 'Не удалось отправить просьбу.',
    authRequiredTitle: 'Нужен вход',
    authRequiredBody: 'Чтобы добавить заявку, сначала войдите или пройдите регистрацию.',
    authLater: 'Позже',
    authGoLogin: 'Перейти на вход',
    ready: 'Готово',
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
    descriptionCount: '{count}/{max}, мин. 10 символов',
    descriptionLeft: 'Ещё {left} символов до минимума.',
    dailyHelpLimit: 'Сегодня вы уже отправили 5 просьб о помощи. Новую просьбу можно будет отправить завтра.',
    dailyRequestLimit: 'Сегодня вы уже отправили много заявок. Попробуйте завтра.',
    languageMismatch: 'Напишите описание на языке приложения. Для русского - по-русски, для украинского - по-украински, для английского - по-английски.',
    loginExpired: 'Сессия входа закончилась. Войдите в аккаунт ещё раз и повторите отправку.',
    permissionDenied: 'Нет разрешения записать заявку. Перезайдите в аккаунт или обратитесь в поддержку.',
    networkError: 'Нет стабильного интернета. Проверьте соединение и нажмите отправить ещё раз.',
    serverUnavailable: 'Сервер временно недоступен. Форма заполнена правильно, попробуйте немного позже.',
    missingRequestId: 'Firebase принял запрос, но не вернул номер заявки. Попробуйте отправить ещё раз.',
    serverRejected: 'Форма заполнена, но сервер её не принял. Попробуйте изменить описание или отправить позже.',
    unknownServerReason: 'Форма заполнена, но сервер вернул незнакомую причину: {reason}',
  },
  en: {
    back: 'Back',
    title: 'Add a request',
    subtitle: 'Fill out the short form. If anything is missing, we will show one tip.',
    name: 'Name',
    phone: 'Phone',
    helpType: 'Help type',
    description: 'Description',
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
    sendFailed: 'Could not send the request.',
    authRequiredTitle: 'Sign in required',
    authRequiredBody: 'To add a request, sign in or register first.',
    authLater: 'Later',
    authGoLogin: 'Go to sign in',
    ready: 'Ready',
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
    descriptionCount: '{count}/{max}, min. 10 characters',
    descriptionLeft: '{left} more characters to reach the minimum.',
    dailyHelpLimit: 'You have already sent 5 help requests today. You can send a new one tomorrow.',
    dailyRequestLimit: 'You have already sent many requests today. Try again tomorrow.',
    languageMismatch: 'Write the description in the app language: Russian for Russian, Ukrainian for Ukrainian, English for English.',
    loginExpired: 'Your sign-in session has expired. Sign in again and resend the request.',
    permissionDenied: 'You do not have permission to save this request. Sign in again or contact support.',
    networkError: 'The internet connection is unstable. Check the connection and tap send again.',
    serverUnavailable: 'The server is temporarily unavailable. The form is filled correctly; try again later.',
    missingRequestId: 'Firebase accepted the request but did not return a request number. Try sending again.',
    serverRejected: 'The form is complete, but the server did not accept it. Try changing the description or send it later.',
    unknownServerReason: 'The form is complete, but the server returned an unknown reason: {reason}',
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

const FieldMessage = ({ state, extra, visible }: { state: FieldState; extra?: string; visible: boolean }) => {
  if (!visible) return null;

  return (
    <View style={styles.fieldMessageWrap}>
      <Text style={[styles.fieldMessage, { color: toneColor[state.tone] }]}>{state.message}</Text>
      {extra ? <Text style={styles.hint}>{extra}</Text> : null}
    </View>
  );
};

const getSubmitFailureMessage = (rawError: unknown, t: (typeof TEXT_BY_LANG)[Lang]): string => {
  const rawMessage = rawError instanceof Error ? rawError.message : String(rawError ?? '');
  const raw = rawMessage.toLowerCase();

  if (raw.includes('daily help_neighbors limit')) {
    return t.dailyHelpLimit;
  }

  if (raw.includes('daily request limit')) {
    return t.dailyRequestLimit;
  }

  if (
    raw.includes('auth/network-request-failed') ||
    raw.includes('network') ||
    raw.includes('offline') ||
    raw.includes('fetch') ||
    raw.includes('internet')
  ) {
    return t.networkError;
  }

  if (raw.includes('unavailable') || raw.includes('timeout') || raw.includes('deadline')) {
    return t.serverUnavailable;
  }

  if (
    raw.includes('unauthenticated') ||
    raw.includes('authentication required') ||
    raw.includes('not authenticated') ||
    raw.includes('login required') ||
    raw.includes('sign in') ||
    raw.includes('write_session')
  ) {
    return t.loginExpired;
  }

  if (
    raw.includes('permission-denied') ||
    raw.includes('permission_denied') ||
    raw.includes('permission denied') ||
    raw.includes('missing or insufficient permissions') ||
    raw.includes('unauthorized') ||
    raw.includes('forbidden')
  ) {
    return t.permissionDenied;
  }

  if (
    raw.includes('англ') ||
    raw.includes('english') ||
    raw.includes('non-english') ||
    raw.includes('language')
  ) {
    return t.languageMismatch;
  }

  if (raw.includes('firebase did not return a request id')) {
    return t.missingRequestId;
  }

  if (raw.includes('invalid request payload') || raw.includes('invalid')) {
    return t.serverRejected;
  }

  const safeReason = rawMessage.trim().slice(0, 160);
  return safeReason
    ? fillTemplate(t.unknownServerReason, { reason: safeReason })
    : t.serverRejected;
};

const RequestFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const route = useRoute<RouteProp<{ RequestFormScreen: { group?: string } }, 'RequestFormScreen'>>();
  const requestGroup = route.params?.group ?? 'requests';
  const language = useSelector((state: RootState) => normalizeLanguage(state.language?.current)) as Lang;
  const user = useSelector((state: RootState) => state.auth.user);
  const { startOperation, trace } = useOperationTrace('Forma-Zayavki');
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(() => formatPhoneInput(user?.phone || '+38'));
  const [helpType, setHelpType] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    name: false,
    phone: false,
    helpType: false,
    description: false,
  });

  // Photo section state
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);

  const hasUserId = Boolean(user?.id);
  const t = TEXT_BY_LANG[language] ?? TEXT_BY_LANG.ua;
  const pt = PHOTO_UI_TEXT[language] ?? PHOTO_UI_TEXT.ua;

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

  useEffect(() => {
    setSubmitError(null);
  }, [name, phone, helpType, description]);

  // Auto-save draft whenever form fields change (debounced 600ms).
  // Previously this was called via onBeforePickerOpen, but that caused
  // openPicker to recreate on every keystroke and interfered with
  // the photo preview appearing after selection.
  useEffect(() => {
    const timer = setTimeout(() => {
      void AsyncStorage.setItem(REQUEST_FORM_DRAFT_KEY, JSON.stringify({
        name,
        phone,
        helpType,
        description,
      })).catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [description, helpType, name, phone]);

  const photoUploadsInProgress = hasPhotoUploadInProgress(formPhotos);

  const markTouched = (field: FieldKey) => {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
  };

  const normalizedName = useMemo(() => normalizePersonName(name), [name]);
  const normalizedPhone = useMemo(() => normalizeUkrainianPhoneStrict(phone.trim()), [phone]);
  const cleanDescription = useMemo(() => sanitizeStoredText(description.trim()), [description]);

  const nameReady = Boolean(normalizedName && validateName(normalizedName));
  const phoneReady = Boolean(normalizedPhone && validatePhone(normalizedPhone));
  const helpTypeReady = Boolean(helpType);
  const descriptionReady = Boolean(cleanDescription && cleanDescription.length >= 10);
  const formReady = nameReady && phoneReady && helpTypeReady && descriptionReady;

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

    return {
      name: nameState,
      phone: phoneState,
      helpType: helpTypeState,
      description: descriptionState,
    };
  }, [
    cleanDescription.length,
    descriptionReady,
    helpTypeReady,
    name,
    nameReady,
    phone,
    phoneReady,
    submittedOnce,
    t,
    touched.description,
    touched.helpType,
    touched.name,
    touched.phone,
  ]);

  const activeIssueKey = useMemo(() => (
    (['name', 'phone', 'helpType', 'description'] as FieldKey[])
      .find((key) => fieldStates[key].tone === 'error' || fieldStates[key].tone === 'warning')
  ), [fieldStates]);

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
    startOperation();

    trace('validate', 'start');
    if (!hasUserId) {
      trace('validate', 'fail', { missing: 'userId' });
      promptAuthRequired();
      return;
    }

    if (!validateSubmissionRequirements({ language, userId: user?.id, userPhotoURL: user?.photoURL, userStartAvatarKey: user?.startAvatarKey, navigation })) {
      trace('validate', 'fail', { missing: 'submissionRequirements' });
      return;
    }

    if (await checkYellowList(user?.id, language)) {
      trace('validate', 'fail', { missing: 'yellowList' });
      return;
    }

    setSubmittedOnce(true);

    if (!normalizedName || !normalizedPhone || !helpType || !cleanDescription) {
      trace('validate', 'fail', { missing: 'requiredFields' });
      Alert.alert(t.errorTitle, t.required);
      return;
    }

    if (!validateName(normalizedName) || !validatePhone(normalizedPhone)) {
      trace('validate', 'fail', { missing: 'nameOrPhone' });
      Alert.alert(t.errorTitle, t.invalidContact);
      return;
    }

    if (cleanDescription.length < 10) {
      trace('validate', 'fail', { missing: 'descriptionLength' });
      Alert.alert(t.errorTitle, t.shortDescription);
      return;
    }
    trace('validate', 'success');

    trace('photo_check', 'start');
    if (photoUploadsInProgress) {
      trace('photo_check', 'fail', { reason: 'uploadsInProgress' });
      Alert.alert(t.errorTitle, pt.waitUpload);
      return;
    }

    if (formPhotos.length > 0 && !getFirstDoneRequestPhoto(formPhotos)) {
      trace('photo_check', 'fail', { reason: 'noDonePhoto' });
      Alert.alert(t.errorTitle, pt.waitUpload);
      return;
    }
    trace('photo_check', 'success');

    setSubmitting(true);
    try {
      const requestPhoto = getFirstDoneRequestPhoto(formPhotos);

      trace('api_call', 'start', { path: 'requests' });
      const result = await firebaseChatAPI.addRequest({
        name: normalizedName,
        phone: normalizedPhone,
        language,
        category: helpType,
        group: requestGroup,
        subcategory: helpType,
        building: 'Чайка',
        text: cleanDescription,
        description: cleanDescription,
        ...(requestPhoto ?? {}),
      });

      if (!result.success) {
        const friendlyError = getSubmitFailureMessage(result.error || t.sendFailed, t);
        setSubmitError(friendlyError);
        trace('api_call', 'fail', { reason: 'resultNotSuccess' });
        Alert.alert(t.errorTitle, friendlyError);
        return;
      }
      trace('api_call', 'success');

      trace('user_alert', 'success', { type: 'success' });
      Alert.alert(t.successTitle, t.successBody, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      setName(user?.name ?? '');
      setPhone(formatPhoneInput(user?.phone || '+38'));
      setHelpType('');
      setDescription('');
      setSubmitError(null);
      setSubmittedOnce(false);
      setTouched({
        name: false,
        phone: false,
        helpType: false,
        description: false,
      });
      setFormPhotos([]);
      void AsyncStorage.removeItem(REQUEST_FORM_DRAFT_KEY).catch(() => undefined);
    } catch (error) {
      trace('api_call', 'fail', {}, error);
      const friendlyError = getSubmitFailureMessage(error, t);
      setSubmitError(friendlyError);
      Alert.alert(t.errorTitle, friendlyError);
    } finally {
      setSubmitting(false);
    }
  };

  const descriptionExtra = cleanDescription.length > 0 && cleanDescription.length < 10
    ? fillTemplate(t.descriptionLeft, { left: 10 - cleanDescription.length })
    : undefined;

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

          {submitError ? (
            <View style={[styles.statusBanner, styles.errorBanner]}>
              <StatusIcon tone="error" />
              <Text style={[styles.statusBannerText, { color: toneColor.error }]}>{submitError}</Text>
            </View>
          ) : null}

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
            <FieldMessage state={fieldStates.name} visible={activeIssueKey === 'name'} />

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
            <FieldMessage state={fieldStates.phone} visible={activeIssueKey === 'phone'} />

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
            <FieldMessage state={fieldStates.helpType} visible={activeIssueKey === 'helpType'} />

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
              <Text style={styles.hint}>{fillTemplate(t.descriptionCount, { count: cleanDescription.length, max: MAX_DESCRIPTION_LENGTH })}</Text>
              <StatusIcon tone={fieldStates.description.tone} />
            </View>
            <FieldMessage state={fieldStates.description} extra={descriptionExtra} visible={activeIssueKey === 'description'} />

            <Text style={styles.label}>{pt.sectionTitle}</Text>
            {user?.id ? (
              <RequestPhotoUploadField
                uid={user.id}
                userName={user?.name ?? ''}
                maxPhotos={1}
                onPhotosChange={setFormPhotos}
              />
            ) : null}

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
  formCard: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#FFF8EA',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginBottom: 14,
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
});

export default RequestFormScreen;

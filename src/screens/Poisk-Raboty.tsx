import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useSelector } from 'react-redux';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import MiniTabBar from '../components/MiniTabBar';
import AppPhotoImage from '../components/AppPhotoImage';
import { SCREEN_THEME } from '../utils/screenTheme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import TactileIcon from '../components/TactileIcon';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { normalizePersonName, normalizePhoneText } from '../utils/textUtils';
import { RootState } from '../redux/store';
import { getModerationLabel } from '../utils/moderation';
import { jobService, JobListing } from '../services/jobService';
import { showUserError } from '../utils/userFacingErrors';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';
import { useContactRequest } from '../hooks/useContactRequest';
import ContactReasonModal from '../components/ContactReasonModal';
import { safeCallPhone } from '../utils/communicationActions';
import type { DetailItemData } from '../utils/detailViewTypes';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { getDonePhotos, getRequiredPhotoLabel, validateSubmissionRequirements } from '../utils/submissionRequirements';
import UserCardActionBar from '../components/UserCardActionBar';

const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000;
type AppLanguage = 'ua' | 'ru' | 'en';
type JobListingKind = 'resume' | 'vacancy';
const RESUME_WORK_TYPE_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const VACANCY_WORK_TYPE_INDEXES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

type FieldTone = 'idle' | 'valid' | 'error' | 'warning';
type FieldKey = 'name' | 'phone' | 'age' | 'workType' | 'about';
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type FieldState = {
  tone: FieldTone;
  message: string;
};

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

const StatusIcon = ({ tone }: { tone: FieldTone }) => (
  <MaterialCommunityIcons name={toneIcon[tone]} size={20} color={toneColor[tone]} />
);

const FieldHeader = ({ label, state }: { label: string; state: FieldState }) => (
  <View style={styles.fieldHeader}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <StatusIcon tone={state.tone} />
  </View>
);

const FieldMessage = ({ state, visible }: { state: FieldState; visible: boolean }) => {
  if (!visible || !state.message) return null;
  return (
    <View style={styles.fieldMessageWrap}>
      <Text style={[styles.fieldMessage, { color: toneColor[state.tone] }]}>{state.message}</Text>
    </View>
  );
};

const UI_TEXT = {
  ua: {
    workTypes: [
      'Разова допомога',
      'Постійна робота',
      'Підробіток',
      'Віддалена робота',
      'Ремонт та майстри',
      'Прибирання',
      "Доставка / кур'єр",
      'Няня / догляд',
      "Краса і здоров'я",
      'Навчання / репетитор',
      'IT / дизайн',
      'Продажі / сервіс',
      'Інше',
    ],
    submittedTitle: 'Модерація',
    submittedMessage: "Резюме надіслано на модерацію. Після перевірки воно з'явиться у списку.",
    submittedVacancyMessage: "Вакансію надіслано на модерацію. Після перевірки вона з'явиться у списку.",
    pending: 'На модерації',
    approved: 'Схвалено',
    rejected: 'Відхилено',
    alertFormTitle: 'Анкета',
    alertFormBody: "Заповніть обов'язкові поля: ім'я, телефон, вік, тип роботи.",
    alertVacancyFormBody: "Заповніть обов'язкові поля: контактна особа, телефон, тип робіт, опис вакансії.",
    alertErrorTitle: 'Помилка',
    alertValidationBody: "Перевірте ім'я, телефон та вік.",
    alertVacancyValidationBody: "Перевірте контактну особу та телефон.",
    alertSaveBody: 'Не вдалося зберегти. Спробуйте ще раз.',
    alertDeleteTitle: 'Видалити?',
    alertDeleteBody: 'Ви впевнені, що хочете видалити це резюме?',
    cancel: 'Скасувати',
    delete: 'Видалити',
    headerTitle: 'Пошук роботи',
    headerSubtitle: 'Резюме мешканців ЖК Чайка',
    labelName: "Ім'я",
    labelContactName: 'Контактна особа',
    labelPhone: 'Телефон',
    labelAge: 'Вік',
    labelWorkType: 'Тип робіт',
    labelAbout: 'Коротко про себе',
    labelVacancyAbout: 'Кого шукаєте',
    placeholderName: "Ваше ім'я",
    placeholderContactName: "Ім'я контактної особи",
    placeholderAge: 'Наприклад 28',
    placeholderAbout: 'Що вмієте, який графік підходить',
    placeholderVacancyAbout: 'Обовʼязки, графік, оплата, вимоги',
    submit: 'Опублікувати резюме',
    submitVacancy: 'Опублікувати вакансію',
    addPost: 'Додати публікацію',
    listTitle: 'Резюме',
    listTitleAll: 'Резюме та вакансії',
    defaultWork: 'Робота',
    filterLabel: 'Фільтр резюме',
    filterAll: 'Усі типи робіт',
    years: 'років',
    ageMissing: 'Вік не вказано',
    aboutMissing: 'Опис не вказано',
    emptyTitle: 'Резюме поки немає',
    emptySub: 'Станьте першим — опублікуйте своє резюме',
    searchButton: 'Пошук',
    searchTitle: 'Пошук резюме за критеріями',
    searchName: "Ім'я",
    searchContact: 'Контакт',
    searchAge: 'Вік',
    searchWorkType: 'Тип робіт',
    searchAbout: 'Коротко про себе',
    searchAnyAge: 'Будь-який вік',
    searchAnyType: 'Будь-який тип',
    searchPlaceholderName: 'Введіть ім\'я',
    searchPlaceholderContact: 'Введіть телефон/контакт',
    searchPlaceholderAbout: 'Пошук по опису',
    searchReset: 'Скинути',
    searchApply: 'Показати',
    clearSearch: 'Скинути пошук',
    noSearchResults: 'Нічого не знайдено за критеріями',
    noSearchResultsSub: 'Спробуйте прибрати частину фільтрів.',
    live: 'НАЖИВО',
    liveCount: () => 'активних публікацій про роботу на сьогодні',
    formTypeLabel: 'Що публікуємо?',
    resumeOption: 'Резюме',
    vacancyOption: 'Вакансія',
    resumeBadge: 'Резюме',
    vacancyBadge: 'Вакансія',
    vacancyTitlePrefix: 'Потрібен співробітник',
    vacancyContact: 'Контакт',
    postedAt: 'Розміщено',
    viewProfile: 'Переглянути профіль',
    contactUser: "Зв'язатися",
    authRequired: 'Увійдіть в акаунт, щоб опублікувати оголошення.',
    ready: 'Готово',
    nameHint: "Вкажіть ім'я або контактну особу.",
    nameEmpty: "Напишіть ім'я.",
    nameInvalid: "Ім'я має містити мінімум 2 символи.",
    phoneHint: 'Формат: +380 XX XXX XX XX.',
    phoneEmpty: 'Напишіть номер телефону.',
    phoneInvalid: 'Перевірте номер у форматі +380 XX XXX XX XX.',
    ageHint: 'Вкажіть вік від 14 до 100 років.',
    ageEmpty: 'Напишіть ваш вік.',
    ageInvalid: 'Вік має бути від 14 до 100.',
    workTypeHint: 'Оберіть категорію роботи.',
    workTypeEmpty: 'Оберіть тип робіт.',
    aboutHint: "Опишіть вакансію: обов'язки, графік, оплата.",
    aboutEmpty: 'Опишіть, кого шукаєте.',
    submitReview: 'Перевірити та опублікувати',
  },
  ru: {
    workTypes: [
      'Разовая помощь',
      'Постоянная работа',
      'Подработка',
      'Удаленная работа',
      'Ремонт и мастера',
      'Уборка',
      'Доставка / курьер',
      'Няня / уход',
      'Красота и здоровье',
      'Обучение / репетитор',
      'IT / дизайн',
      'Продажи / сервис',
      'Другое',
    ],
    submittedTitle: 'Модерация',
    submittedMessage: 'Резюме отправлено на модерацию. После проверки оно появится в списке.',
    submittedVacancyMessage: 'Вакансия отправлена на модерацию. После проверки она появится в списке.',
    pending: 'На модерации',
    approved: 'Одобрено',
    rejected: 'Отклонено',
    alertFormTitle: 'Анкета',
    alertFormBody: 'Заполните обязательные поля: имя, телефон, возраст, тип работы.',
    alertVacancyFormBody: 'Заполните обязательные поля: контактное лицо, телефон, тип работ, описание вакансии.',
    alertErrorTitle: 'Ошибка',
    alertValidationBody: 'Проверьте имя, телефон и возраст.',
    alertVacancyValidationBody: 'Проверьте контактное лицо и телефон.',
    alertSaveBody: 'Не удалось сохранить. Попробуйте еще раз.',
    alertDeleteTitle: 'Удалить?',
    alertDeleteBody: 'Вы уверены, что хотите удалить это резюме?',
    cancel: 'Отмена',
    delete: 'Удалить',
    headerTitle: 'Поиск работы',
    headerSubtitle: 'Резюме жителей ЖК Чайка',
    labelName: 'Имя',
    labelContactName: 'Контактное лицо',
    labelPhone: 'Телефон',
    labelAge: 'Возраст',
    labelWorkType: 'Тип работ',
    labelAbout: 'Коротко о себе',
    labelVacancyAbout: 'Кого ищете',
    placeholderName: 'Ваше имя',
    placeholderContactName: 'Имя контактного лица',
    placeholderAge: 'Например 28',
    placeholderAbout: 'Что умеете, какой график подходит',
    placeholderVacancyAbout: 'Обязанности, график, оплата, требования',
    submit: 'Опубликовать резюме',
    submitVacancy: 'Опубликовать вакансию',
    addPost: 'Добавить публикацию',
    listTitle: 'Резюме',
    listTitleAll: 'Резюме и вакансии',
    defaultWork: 'Работа',
    filterLabel: 'Фильтр резюме',
    filterAll: 'Все типы работ',
    years: 'лет',
    ageMissing: 'Возраст не указан',
    aboutMissing: 'Описание не указано',
    emptyTitle: 'Резюме пока нет',
    emptySub: 'Станьте первым — опубликуйте свое резюме',
    searchButton: 'Поиск',
    searchTitle: 'Поиск резюме по критериям',
    searchName: 'Имя',
    searchContact: 'Контакт',
    searchAge: 'Возраст',
    searchWorkType: 'Тип работ',
    searchAbout: 'Коротко о себе',
    searchAnyAge: 'Любой возраст',
    searchAnyType: 'Любой тип',
    searchPlaceholderName: 'Введите имя',
    searchPlaceholderContact: 'Введите телефон/контакт',
    searchPlaceholderAbout: 'Поиск по описанию',
    searchReset: 'Сбросить',
    searchApply: 'Показать',
    clearSearch: 'Сбросить поиск',
    noSearchResults: 'Ничего не найдено по критериям',
    noSearchResultsSub: 'Попробуйте убрать часть фильтров.',
    live: 'В ЭФИРЕ',
    liveCount: () => 'активных публикаций о работе на сегодня',
    formTypeLabel: 'Что публикуем?',
    resumeOption: 'Резюме',
    vacancyOption: 'Вакансия',
    resumeBadge: 'Резюме',
    vacancyBadge: 'Вакансия',
    vacancyTitlePrefix: 'Нужен сотрудник',
    vacancyContact: 'Контакт',
    postedAt: 'Размещено',
    viewProfile: 'Просмотреть профиль',
    contactUser: 'Связаться',
    authRequired: 'Войдите в аккаунт, чтобы опубликовать объявление.',
    ready: 'Готово',
    nameHint: 'Укажите имя или контактное лицо.',
    nameEmpty: 'Напишите имя.',
    nameInvalid: 'Имя должно содержать минимум 2 символа.',
    phoneHint: 'Формат: +380 XX XXX XX XX.',
    phoneEmpty: 'Напишите номер телефона.',
    phoneInvalid: 'Проверьте номер в формате +380 XX XXX XX XX.',
    ageHint: 'Укажите возраст от 14 до 100 лет.',
    ageEmpty: 'Напишите ваш возраст.',
    ageInvalid: 'Возраст должен быть от 14 до 100.',
    workTypeHint: 'Выберите категорию работы.',
    workTypeEmpty: 'Выберите тип работ.',
    aboutHint: 'Опишите вакансию: обязанности, график, оплата.',
    aboutEmpty: 'Опишите, кого ищете.',
    submitReview: 'Проверить и опубликовать',
  },
  en: {
    workTypes: [
      'One-time help',
      'Full-time job',
      'Part-time work',
      'Remote work',
      'Repair and handyman',
      'Cleaning',
      'Delivery / courier',
      'Nanny / care',
      'Beauty and wellness',
      'Teaching / tutoring',
      'IT / design',
      'Sales / service',
      'Other',
    ],
    submittedTitle: 'Moderation',
    submittedMessage: 'Resume was sent for moderation. It will appear after review.',
    submittedVacancyMessage: 'Vacancy was sent for moderation. It will appear after review.',
    pending: 'Pending moderation',
    approved: 'Approved',
    rejected: 'Rejected',
    alertFormTitle: 'Resume',
    alertFormBody: 'Fill in the required fields: name, phone, age, work type.',
    alertVacancyFormBody: 'Fill in the required fields: contact person, phone, work type, and vacancy details.',
    alertErrorTitle: 'Error',
    alertValidationBody: 'Check name, phone, and age.',
    alertVacancyValidationBody: 'Check contact person and phone.',
    alertSaveBody: 'Could not save. Please try again.',
    alertDeleteTitle: 'Delete?',
    alertDeleteBody: 'Are you sure you want to delete this resume?',
    cancel: 'Cancel',
    delete: 'Delete',
    headerTitle: 'Job Search',
    headerSubtitle: 'Resident resumes in Chaika Life',
    labelName: 'Name',
    labelContactName: 'Contact person',
    labelPhone: 'Phone',
    labelAge: 'Age',
    labelWorkType: 'Work type',
    labelAbout: 'About you',
    labelVacancyAbout: 'Who you are hiring',
    placeholderName: 'Your name',
    placeholderContactName: 'Contact person name',
    placeholderAge: 'For example 28',
    placeholderAbout: 'What you can do and your preferred schedule',
    placeholderVacancyAbout: 'Responsibilities, schedule, pay, requirements',
    submit: 'Publish resume',
    submitVacancy: 'Publish vacancy',
    addPost: 'Add post',
    listTitle: 'Resumes',
    listTitleAll: 'Resumes and vacancies',
    defaultWork: 'Job',
    filterLabel: 'Resume filter',
    filterAll: 'All work types',
    years: 'years',
    ageMissing: 'Age not specified',
    aboutMissing: 'Description not provided',
    emptyTitle: 'No resumes yet',
    emptySub: 'Be the first one — publish your resume',
    searchButton: 'Search',
    searchTitle: 'Search resumes by criteria',
    searchName: 'Name',
    searchContact: 'Contact',
    searchAge: 'Age',
    searchWorkType: 'Work type',
    searchAbout: 'About',
    searchAnyAge: 'Any age',
    searchAnyType: 'Any work type',
    searchPlaceholderName: 'Enter name',
    searchPlaceholderContact: 'Enter phone/contact',
    searchPlaceholderAbout: 'Search in description',
    searchReset: 'Reset',
    searchApply: 'Apply',
    clearSearch: 'Clear search',
    noSearchResults: 'No resumes match your criteria',
    noSearchResultsSub: 'Try removing some filters.',
    live: 'LIVE',
    liveCount: () => 'active job posts today',
    formTypeLabel: 'What are you posting?',
    resumeOption: 'Resume',
    vacancyOption: 'Vacancy',
    resumeBadge: 'Resume',
    vacancyBadge: 'Vacancy',
    vacancyTitlePrefix: 'Hiring',
    vacancyContact: 'Contact',
    postedAt: 'Posted',
    viewProfile: 'View profile',
    contactUser: 'Contact',
    authRequired: 'Sign in to publish a listing.',
    ready: 'Ready',
    nameHint: 'Enter your name or contact person.',
    nameEmpty: 'Enter a name.',
    nameInvalid: 'Name must be at least 2 characters.',
    phoneHint: 'Format: +380 XX XXX XX XX.',
    phoneEmpty: 'Enter a phone number.',
    phoneInvalid: 'Check phone format: +380 XX XXX XX XX.',
    ageHint: 'Enter age between 14 and 100.',
    ageEmpty: 'Enter your age.',
    ageInvalid: 'Age must be between 14 and 100.',
    workTypeHint: 'Select a work category.',
    workTypeEmpty: 'Select a work type.',
    aboutHint: 'Describe the vacancy: responsibilities, schedule, pay.',
    aboutEmpty: 'Describe who you are looking for.',
    submitReview: 'Review and publish',
  },
} as const;

// Lookup: any language's workType label → canonical index (0-12)
const WORK_TYPE_LOOKUP = new Map<string, number>();
(['ua', 'ru', 'en'] as const).forEach((lang) => {
  UI_TEXT[lang].workTypes.forEach((label, idx) => {
    WORK_TYPE_LOOKUP.set(label.toLowerCase(), idx);
  });
});
const normalizeWorkType = (v: string): number =>
  WORK_TYPE_LOOKUP.get(v.toLowerCase()) ?? -1;

const formatListingDate = (value: string, language: AppLanguage): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uk-UA';
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const JobSearchScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const navLock = useRef(false);
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as AppLanguage;
  const user = useSelector((state: RootState) => state.auth.user);
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const text = UI_TEXT[language];
  const requiredPhotoLabel = getRequiredPhotoLabel(language);
  const [listingKind, setListingKind] = useState<JobListingKind>('resume');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(() => normalizePhoneText(user?.phone ?? '+380'));
  const [age, setAge] = useState('');
  const [workType, setWorkType] = useState('');
  const [about, setAbout] = useState('');
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [listings, setListings] = useState<JobListing[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    name: false, phone: false, age: false, workType: false, about: false,
  });
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const [isPublishFormVisible, setIsPublishFormVisible] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [searchContact, setSearchContact] = useState('');
  const [searchAge, setSearchAge] = useState('');
  const [searchWorkType, setSearchWorkType] = useState('');
  const [searchAbout, setSearchAbout] = useState('');
  const [actionModal, setActionModal] = useState<{ visible: boolean; userId: string; userName: string }>({ visible: false, userId: '', userName: '' });
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const avatarByUserId = useUserAvatarMap(listings.map((item) => item.userId));

  useEffect(() => {
    const unsubscribe = jobService.subscribe(setListings, user?.id);
    return unsubscribe;
  }, [user?.id]);

  useEffect(() => {
    if (!name.trim() && user?.name) {
      setName(normalizePersonName(user.name));
    }
  }, [name, user?.name]);

  useEffect(() => {
    if (!phone.trim() || phone === '+380') {
      setPhone(normalizePhoneText(user?.phone ?? '+380'));
    }
  }, [phone, user?.phone]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.2, duration: 850, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 850, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [blinkAnim]);

  const moderationLabels = useMemo(
    () => ({
      pending: text.pending,
      approved: text.approved,
      rejected: text.rejected,
    }),
    [text.approved, text.pending, text.rejected],
  );
  const isVacancyForm = listingKind === 'vacancy';

  const markTouched = (field: FieldKey) => {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
  };

  const nameReady = name.trim().length >= 2;
  const phoneReady = phone.replace(/\D/g, '').length >= 7;
  const ageNum = Number.parseInt(age.trim(), 10);
  const ageReady = isVacancyForm || (Number.isFinite(ageNum) && ageNum >= 14 && ageNum <= 100);
  const workTypeReady = Boolean(workType);
  const aboutReady = !isVacancyForm || about.trim().length > 0;
  const formReady = nameReady && phoneReady && ageReady && workTypeReady && aboutReady;

  const fieldStates = useMemo<Record<FieldKey, FieldState>>(() => {
    const phoneDigits = phone.replace(/\D/g, '');

    const showNameIssue = submittedOnce || touched.name || name.trim().length > 0;
    const showPhoneIssue = submittedOnce || touched.phone || phoneDigits.length > 2;
    const showAgeIssue = submittedOnce || touched.age || age.trim().length > 0;
    const showWorkTypeIssue = submittedOnce || touched.workType;
    const showAboutIssue = submittedOnce || touched.about || about.trim().length > 0;

    const nameState: FieldState = nameReady
      ? { tone: 'valid', message: text.ready }
      : {
          tone: showNameIssue ? 'error' : 'idle',
          message: !name.trim() ? (showNameIssue ? text.nameEmpty : text.nameHint) : text.nameInvalid,
        };

    const phoneState: FieldState = phoneReady
      ? { tone: 'valid', message: text.ready }
      : {
          tone: showPhoneIssue ? 'error' : 'idle',
          message: phoneDigits.length <= 2 ? (showPhoneIssue ? text.phoneEmpty : text.phoneHint) : text.phoneInvalid,
        };

    const ageState: FieldState = isVacancyForm
      ? { tone: 'idle', message: '' }
      : ageReady
      ? { tone: 'valid', message: text.ready }
      : {
          tone: showAgeIssue ? 'error' : 'idle',
          message: !age.trim() ? (showAgeIssue ? text.ageEmpty : text.ageHint) : text.ageInvalid,
        };

    const workTypeState: FieldState = workTypeReady
      ? { tone: 'valid', message: text.ready }
      : {
          tone: showWorkTypeIssue ? 'error' : 'idle',
          message: showWorkTypeIssue ? text.workTypeEmpty : text.workTypeHint,
        };

    const aboutState: FieldState = !isVacancyForm
      ? (about.trim() ? { tone: 'valid', message: text.ready } : { tone: 'idle', message: '' })
      : aboutReady
      ? { tone: 'valid', message: text.ready }
      : {
          tone: showAboutIssue ? 'error' : 'idle',
          message: !about.trim() ? (showAboutIssue ? text.aboutEmpty : text.aboutHint) : text.aboutHint,
        };

    return { name: nameState, phone: phoneState, age: ageState, workType: workTypeState, about: aboutState };
  }, [
    about,
    age,
    ageReady,
    isVacancyForm,
    name,
    nameReady,
    phone,
    phoneReady,
    submittedOnce,
    text,
    touched.about,
    touched.age,
    touched.name,
    touched.phone,
    touched.workType,
    workTypeReady,
  ]);

  const activeIssueKey = useMemo(() => (
    (['name', 'phone', 'age', 'workType', 'about'] as FieldKey[])
      .find((key) => fieldStates[key].tone === 'error' || fieldStates[key].tone === 'warning')
  ), [fieldStates]);

  const getListingKind = (item: JobListing): JobListingKind => item.listingKind === 'vacancy' ? 'vacancy' : 'resume';
  const formWorkTypes = useMemo(() => {
    const indexes = isVacancyForm ? VACANCY_WORK_TYPE_INDEXES : RESUME_WORK_TYPE_INDEXES;
    return indexes.map((index) => text.workTypes[index]).filter(Boolean);
  }, [isVacancyForm, text.workTypes]);
  const filterOptions = useMemo(() => {
    const dynamicValues = listings.map((item) => item.workType).filter(Boolean);
    return Array.from(new Set([...text.workTypes, ...dynamicValues]));
  }, [listings, text.workTypes]);
  const hasAdvancedSearch = useMemo(
    () => Boolean(searchName.trim() || searchContact.trim() || searchAge || searchWorkType || searchAbout.trim()),
    [searchAge, searchAbout, searchContact, searchName, searchWorkType],
  );
  const hasUploadingPhotos = formPhotos.some((p) => p.status === 'uploading');
  const hasPhotoErrors = formPhotos.some((p) => p.status === 'error');
  const filteredListings = useMemo(() => {
    const queryName = searchName.trim().toLowerCase();
    const queryContact = searchContact.trim().toLowerCase();
    const queryAbout = searchAbout.trim().toLowerCase();

    return listings.filter((item) => {
      if (selectedFilter) {
        const fi = normalizeWorkType(selectedFilter);
        const ii = normalizeWorkType(item.workType);
        if (fi !== -1 && ii !== -1 ? fi !== ii : item.workType !== selectedFilter) return false;
      }
      if (queryName && !item.name.toLowerCase().includes(queryName)) return false;
      if (queryContact && !item.phone.toLowerCase().includes(queryContact)) return false;
      if (searchAge && item.age !== searchAge) return false;
      if (searchWorkType) {
        const fi = normalizeWorkType(searchWorkType);
        const ii = normalizeWorkType(item.workType);
        if (fi !== -1 && ii !== -1 ? fi !== ii : item.workType !== searchWorkType) return false;
      }
      if (queryAbout && !item.about.toLowerCase().includes(queryAbout)) return false;
      return true;
    });
  }, [listings, searchAge, searchAbout, searchContact, searchName, searchWorkType, selectedFilter]);

  const resetSearch = () => {
    setSearchName('');
    setSearchContact('');
    setSearchAge('');
    setSearchWorkType('');
    setSearchAbout('');
  };

  const handleViewProfile = (userId: string) => {
    setActionModal({ visible: false, userId: '', userName: '' });
    navigation.navigate('ViewUserProfile', { userId });
  };

  const handleContact = (userId: string, name: string) => {
    setActionModal({ visible: false, userId: '', userName: '' });
    openContactModal({ userId, name, sourceType: 'job' });
  };

  const mapToDetailData = (item: JobListing): DetailItemData => ({
    id: item.id,
    title: getListingKind(item) === 'vacancy'
      ? `${text.vacancyTitlePrefix}: ${item.workType || text.defaultWork}`
      : item.name,
    description: item.about,
    photoUri: item.photoUri,
    photoStoragePath: item.photoStoragePath,
    phone: item.phone,
    category: item.workType,
    price: getListingKind(item) === 'resume' && item.age ? `${item.age} ${text.years}` : undefined,
    status: getModerationLabel(item.moderationStatus, moderationLabels),
    userId: item.userId,
    createdAt: item.createdAt,
    sourceType: 'job',
    sourceId: item.id,
  });

  const handleSubmit = async (confirmed = false) => {
    if (!validateSubmissionRequirements({ language, userId: user?.id, userPhotoURL: user?.photoURL, userStartAvatarKey: user?.startAvatarKey, navigation })) {
      return;
    }
    setSubmittedOnce(true);
    const isVacancy = listingKind === 'vacancy';
    if (!name.trim() || !phone.trim() || !workType || (!isVacancy && !age.trim()) || (isVacancy && !about.trim())) {
      Alert.alert(text.alertFormTitle, isVacancy ? text.alertVacancyFormBody : text.alertFormBody);
      return;
    }
    const ageNum = Number.parseInt(age.trim(), 10);
    if (
      name.trim().length < 2
      || phone.replace(/\D/g, '').length < 7
      || (!isVacancy && (!Number.isFinite(ageNum) || ageNum < 14 || ageNum > 100))
    ) {
      Alert.alert(text.alertErrorTitle, isVacancy ? text.alertVacancyValidationBody : text.alertValidationBody);
      return;
    }
    if (hasUploadingPhotos) {
      Alert.alert(text.alertErrorTitle, language === 'ru' ? 'Дождитесь завершения загрузки фото.' : language === 'en' ? 'Wait until photo upload is complete.' : 'Дочекайтесь завершення завантаження фото.');
      return;
    }
    if (hasPhotoErrors) {
      Alert.alert(text.alertErrorTitle, language === 'ru' ? 'Не удалось загрузить фото. Удалите его или попробуйте ещё раз.' : language === 'en' ? 'Photo upload failed. Remove it or try again.' : 'Не вдалося завантажити фото. Видаліть його або спробуйте ще раз.');
      return;
    }
    const firstPhoto = getDonePhotos(formPhotos)[0];

    if (!confirmed) {
      const previewTitle = language === 'ru' ? 'Проверьте данные' : language === 'en' ? 'Review details' : 'Перевірте дані';
      const previewCancel = language === 'ru' ? 'Назад' : language === 'en' ? 'Back' : 'Назад';
      const previewSend = language === 'ru' ? 'Отправить' : language === 'en' ? 'Send' : 'Надіслати';
      const kindLabel = isVacancy ? text.vacancyOption : text.resumeOption;
      const previewBody = [
        `${text.formTypeLabel}: ${kindLabel}`,
        `${isVacancy ? text.labelContactName : text.labelName}: ${normalizePersonName(name)}`,
        `${text.labelPhone}: ${normalizePhoneText(phone)}`,
        !isVacancy ? `${text.labelAge}: ${age.trim()}` : '',
        `${text.labelWorkType}: ${workType}`,
        `${isVacancy ? text.labelVacancyAbout : text.labelAbout}: ${about.trim() || '—'}`,
      ].filter(Boolean).join('\n');

      Alert.alert(previewTitle, previewBody, [
        { text: previewCancel, style: 'cancel' },
        { text: previewSend, onPress: () => { void handleSubmit(true); } },
      ]);
      return;
    }

    setSubmitting(true);
    try {
      const createdAt = new Date();
      await jobService.add({
        listingKind,
        name: normalizePersonName(name),
        phone: normalizePhoneText(phone),
        age: isVacancy ? '' : age.trim(),
        workType,
        about: about.trim(),
        photoUri: firstPhoto?.downloadUrl ?? '',
        photoStoragePath: firstPhoto?.storagePath ?? '',
        moderationStatus: 'pending',
        submittedForModerationAt: createdAt.toISOString(),
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + TWO_MONTHS_MS).toISOString(),
        userId: user?.id || '',
        language,
      });

      Alert.alert(text.submittedTitle, isVacancy ? text.submittedVacancyMessage : text.submittedMessage);
      setName(user?.name ? normalizePersonName(user.name) : '');
      setPhone(normalizePhoneText(user?.phone ?? '+380'));
      setAge('');
      setWorkType('');
      setAbout('');
      setFormPhotos([]);
      setListingKind('resume');
      setTouched({ name: false, phone: false, age: false, workType: false, about: false });
      setSubmittedOnce(false);
      setIsPublishFormVisible(false);
    } catch (error) {
      showUserError(language, 'send', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(text.alertDeleteTitle, text.alertDeleteBody, [
      { text: text.cancel, style: 'cancel' },
      {
        text: text.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await jobService.remove(id);
          } catch (error) {
            showUserError(language, 'delete', error);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={searchModalVisible} animationType="slide" transparent onRequestClose={() => setSearchModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{text.searchTitle}</Text>
              <TouchableOpacity onPress={() => setSearchModalVisible(false)} style={styles.modalCloseBtn} activeOpacity={0.75}>
                <Text style={styles.modalCloseText}>OK</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.formLabel}>{text.searchName}</Text>
              <TextInput
                style={styles.input}
                value={searchName}
                onChangeText={setSearchName}
                placeholder={text.searchPlaceholderName}
                placeholderTextColor="#A0938D"
              />

              <Text style={styles.formLabel}>{text.searchContact}</Text>
              <TextInput
                style={styles.input}
                value={searchContact}
                onChangeText={setSearchContact}
                placeholder={text.searchPlaceholderContact}
                placeholderTextColor="#A0938D"
              />

              <Text style={styles.formLabel}>{text.searchAge}</Text>
              <TextInput
                style={styles.input}
                value={searchAge}
                onChangeText={(value) => setSearchAge(value.replace(/[^0-9]/g, '').slice(0, 3))}
                placeholder={text.searchAnyAge}
                placeholderTextColor="#A0938D"
                keyboardType="number-pad"
              />

              <Text style={styles.formLabel}>{text.searchWorkType}</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={searchWorkType} onValueChange={setSearchWorkType} style={styles.picker}>
                  <Picker.Item label={text.searchAnyType} value="" />
                  {filterOptions.map((option) => (
                    <Picker.Item key={`search-${option}`} label={option} value={option} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.formLabel}>{text.searchAbout}</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={searchAbout}
                onChangeText={setSearchAbout}
                placeholder={text.searchPlaceholderAbout}
                placeholderTextColor="#A0938D"
                multiline
                maxLength={180}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.resetBtn} onPress={resetSearch} activeOpacity={0.82}>
                  <Text style={styles.resetBtnText}>{text.searchReset}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.applyBtn} onPress={() => setSearchModalVisible(false)} activeOpacity={0.82}>
                  <Text style={styles.applyBtnText}>{text.searchApply}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* FlatList replaces the outer ScrollView for virtualized rendering of listing cards */}
      <FlatList
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        data={listings.length > 0 ? filteredListings : []}
        keyExtractor={(item) => item.id}
        initialNumToRender={8}
        windowSize={5}
        ListHeaderComponent={
          <>
            <View style={styles.headerCard}>
              <View style={styles.headerImageFrame}>
                <Image
                  source={require('../../assets/WEBP-version/workChaika.webp')}
                  style={styles.headerImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.headerTitle}>{text.headerTitle}</Text>
              <Text style={styles.headerSubtitle}>{text.headerSubtitle}</Text>
              <View style={styles.livePanel}>
                <View style={styles.liveBadge}>
                  <Animated.Text style={[styles.liveDot, { opacity: blinkAnim }]}>•</Animated.Text>
                  <Text style={styles.liveText}>{text.live}</Text>
                </View>
                <View style={styles.liveCountBlock}>
                  <Text style={styles.liveNumber}>{listings.length}</Text>
                  <Text style={styles.liveCount}>{text.liveCount()}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.publishToggleBtn}
              onPress={() => {
                if (!user) {
                  Alert.alert(text.addPost, text.authRequired);
                  return;
                }
                setIsPublishFormVisible(true);
              }}
              activeOpacity={0.86}
            >
              <Text style={styles.publishToggleBtnText}>{text.addPost}</Text>
            </TouchableOpacity>

            {isPublishFormVisible ? (
              <View style={styles.formCard}>
                <Text style={styles.formLabel}>{text.formTypeLabel}</Text>
                <View style={styles.kindSwitcher}>
                  <TouchableOpacity
                    style={[styles.kindOption, listingKind === 'resume' && styles.kindOptionActive]}
                    onPress={() => { setListingKind('resume'); setWorkType(''); setTouched({ name: false, phone: false, age: false, workType: false, about: false }); setSubmittedOnce(false); }}
                    activeOpacity={0.82}
                  >
                    <Text style={[styles.kindOptionText, listingKind === 'resume' && styles.kindOptionTextActive]}>{text.resumeOption}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.kindOption, listingKind === 'vacancy' && styles.kindOptionActive]}
                    onPress={() => { setListingKind('vacancy'); setWorkType(''); setTouched({ name: false, phone: false, age: false, workType: false, about: false }); setSubmittedOnce(false); }}
                    activeOpacity={0.82}
                  >
                    <Text style={[styles.kindOptionText, listingKind === 'vacancy' && styles.kindOptionTextActive]}>{text.vacancyOption}</Text>
                  </TouchableOpacity>
                </View>

                <FieldHeader label={isVacancyForm ? text.labelContactName : text.labelName} state={fieldStates.name} />
                <TextInput
                  placeholder={isVacancyForm ? text.placeholderContactName : text.placeholderName}
                  value={name}
                  onChangeText={(value) => setName(normalizePersonName(value))}
                  onBlur={() => markTouched('name')}
                  style={[styles.input, fieldStates.name.tone === 'error' && styles.inputError, fieldStates.name.tone === 'valid' && styles.inputValid]}
                  placeholderTextColor="#A0938D"
                />
                <FieldMessage state={fieldStates.name} visible={activeIssueKey === 'name'} />

                <FieldHeader label={text.labelPhone} state={fieldStates.phone} />
                <TextInput placeholder="+380..." value={phone} onChangeText={(value) => setPhone(normalizePhoneText(value))} onBlur={() => markTouched('phone')} keyboardType="phone-pad" style={[styles.input, fieldStates.phone.tone === 'error' && styles.inputError, fieldStates.phone.tone === 'valid' && styles.inputValid]} placeholderTextColor="#A0938D" />
                <FieldMessage state={fieldStates.phone} visible={activeIssueKey === 'phone'} />

                {!isVacancyForm ? (
                  <>
                    <FieldHeader label={text.labelAge} state={fieldStates.age} />
                    <TextInput placeholder={text.placeholderAge} value={age} onChangeText={(value) => setAge(value.replace(/[^0-9]/g, '').slice(0, 3))} onBlur={() => markTouched('age')} keyboardType="number-pad" style={[styles.input, fieldStates.age.tone === 'error' && styles.inputError, fieldStates.age.tone === 'valid' && styles.inputValid]} placeholderTextColor="#A0938D" />
                    <FieldMessage state={fieldStates.age} visible={activeIssueKey === 'age'} />
                  </>
                ) : null}

                <FieldHeader label={text.labelWorkType} state={fieldStates.workType} />
                <View style={[styles.pickerWrapper, fieldStates.workType.tone === 'error' && styles.inputError, fieldStates.workType.tone === 'valid' && styles.inputValid]}>
                  <Picker selectedValue={workType} onValueChange={(value) => { setWorkType(value); markTouched('workType'); }} style={styles.picker}>
                    <Picker.Item label={text.searchAnyType} value="" />
                    {formWorkTypes.map((item) => (
                      <Picker.Item key={item} label={item} value={item} />
                    ))}
                  </Picker>
                </View>
                <FieldMessage state={fieldStates.workType} visible={activeIssueKey === 'workType'} />

                <FieldHeader label={isVacancyForm ? text.labelVacancyAbout : text.labelAbout} state={fieldStates.about} />
                <TextInput
                  placeholder={isVacancyForm ? text.placeholderVacancyAbout : text.placeholderAbout}
                  value={about}
                  onChangeText={setAbout}
                  onBlur={() => markTouched('about')}
                  style={[styles.input, styles.textarea, fieldStates.about.tone === 'error' && styles.inputError, fieldStates.about.tone === 'valid' && styles.inputValid]}
                  placeholderTextColor="#A0938D"
                  multiline
                  maxLength={180}
                />
                <FieldMessage state={fieldStates.about} visible={activeIssueKey === 'about'} />

                <Text style={styles.formLabel}>{requiredPhotoLabel}</Text>
                {user?.id ? (
                  <PhotoUploadField
                    uid={user.id}
                    userName={user?.name ?? ''}
                    maxPhotos={3}
                    storagePath="job_listings"
                    onPhotosChange={setFormPhotos}
                  />
                ) : (
                  <Text style={styles.signInNote}>{text.authRequired}</Text>
                )}

                <TouchableOpacity style={[styles.submitBtn, (submitting || hasUploadingPhotos) && { opacity: 0.65 }]} onPress={() => { void handleSubmit(); }} activeOpacity={0.85} disabled={submitting || hasUploadingPhotos}>
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name={formReady ? 'send' : 'clipboard-check-outline'} size={18} color="#FFFFFF" />
                      <Text style={styles.submitBtnText}>{hasUploadingPhotos ? (language === 'ru' ? 'Загрузка фото…' : language === 'en' ? 'Uploading photo…' : 'Завантаження фото…') : formReady ? (isVacancyForm ? text.submitVacancy : text.submit) : text.submitReview}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}

            {listings.length > 0 ? (
              <View style={styles.listingsSection}>
                <Text style={styles.formLabel}>{text.filterLabel}</Text>
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={selectedFilter} onValueChange={setSelectedFilter} style={styles.picker}>
                    <Picker.Item label={text.filterAll} value="" />
                    {filterOptions.map((option) => (
                      <Picker.Item key={option} label={option} value={option} />
                    ))}
                  </Picker>
                </View>

                <View style={styles.listingsHeaderRow}>
                  <Text style={styles.listingsSectionTitle}>{text.listTitleAll} ({filteredListings.length})</Text>
                  <TouchableOpacity style={styles.searchBtn} onPress={() => setSearchModalVisible(true)} activeOpacity={0.82}>
                    <Text style={styles.searchBtnText}>{text.searchButton}</Text>
                  </TouchableOpacity>
                </View>
                {hasAdvancedSearch ? (
                  <TouchableOpacity style={styles.clearSearchBtn} onPress={resetSearch} activeOpacity={0.82}>
                    <Text style={styles.clearSearchText}>{text.clearSearch}</Text>
                  </TouchableOpacity>
                ) : null}
                {filteredListings.length === 0 ? (
                  <View style={styles.emptyFiltered}>
                    <Text style={styles.emptyFilteredTitle}>{text.noSearchResults}</Text>
                    <Text style={styles.emptyFilteredSub}>{text.noSearchResultsSub}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.listingCard}
            onPress={() => { if (navLock.current) return; navLock.current = true; navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item) }); setTimeout(() => { navLock.current = false; }, 800); }}
            activeOpacity={0.85}
          >
            <View style={styles.listingHeader}>
              <View style={styles.listingHeaderLeft}>
                {item.photoUri || item.photoStoragePath ? (
                  <AppPhotoImage
                    uri={item.photoUri}
                    storagePath={item.photoStoragePath}
                    style={styles.listingPhoto}
                    resizeMode="cover"
                    debugLabel={`Job:${item.id}`}
                  />
                ) : (
                  <MiniUserAvatar uri={(item.userId && avatarByUserId[item.userId]) || undefined} name={item.name} size={68} borderRadius={20} backgroundColor="#6A8BA5" />
                )}
                <Text style={styles.listingName}>
                  {getListingKind(item) === 'vacancy' ? (item.workType || text.defaultWork) : item.name}
                </Text>
              </View>
              {item.userId === user?.id ? (
                <TouchableOpacity onPress={() => handleDelete(item.id)}>
                  <Text style={styles.deleteText}>{text.delete}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.positionTitle}>{item.workType || text.defaultWork}</Text>
            <Text style={styles.postedDateText}>
              {text.postedAt}: {formatListingDate(item.createdAt, language) || '—'}
            </Text>
            <View style={styles.badgeRow}>
              <Text style={[styles.kindBadge, getListingKind(item) === 'vacancy' && styles.kindBadgeVacancy]}>
                {getListingKind(item) === 'vacancy' ? text.vacancyBadge : text.resumeBadge}
              </Text>
              {getListingKind(item) === 'resume' ? (
                <Text style={styles.badge}>{item.age ? `${item.age} ${text.years}` : text.ageMissing}</Text>
              ) : (
                <Text style={styles.badge}>{text.vacancyContact}: {item.name}</Text>
              )}
              {item.isArchived ? (
                <Text style={styles.archiveBadge}>Архів</Text>
              ) : (
                <Text style={styles.moderationBadge}>
                  {getModerationLabel(item.moderationStatus, moderationLabels)}
                </Text>
              )}
            </View>
            <Text style={styles.listingAbout}>{item.about || text.aboutMissing}</Text>
            <UserCardActionBar
              avatarUri={(item.userId && avatarByUserId[item.userId]) || undefined}
              name={item.name}
              userId={item.userId}
              currentUserId={user?.id}
              language={language}
              onProfile={item.userId ? () => handleViewProfile(item.userId as string) : undefined}
              onContact={item.userId && item.userId !== user?.id ? () => handleContact(item.userId as string, item.name ?? 'Unknown') : item.phone ? () => void safeCallPhone(item.phone, language) : undefined}
              contactDisabled={!item.phone && (!item.userId || item.userId === user?.id)}
              likePath="feed_likes/jobs"
              likeId={item.id}
            />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          listings.length === 0 ? (
            <View style={styles.emptyState}>
              <TactileIcon icon="account-search-outline" size={54} iconSize={26} backgroundColor="#403933" />
              <Text style={styles.emptyTitle}>{text.emptyTitle}</Text>
              <Text style={styles.emptySub}>{text.emptySub}</Text>
            </View>
          ) : null
        }
      />
      <MiniTabBar />
      <Modal
        visible={actionModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionModal({ visible: false, userId: '', userName: '' })}
      >
        <View style={styles.actionOverlay}>
          <View style={styles.actionSheet}>
            <TouchableOpacity style={styles.actionPrimaryBtn} onPress={() => handleViewProfile(actionModal.userId)} activeOpacity={0.86}>
              <Text style={styles.actionPrimaryText}>{text.viewProfile}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionSecondaryBtn} onPress={() => handleContact(actionModal.userId, actionModal.userName)} activeOpacity={0.86}>
              <Text style={styles.actionSecondaryText}>{text.contactUser}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCancelBtn} onPress={() => setActionModal({ visible: false, userId: '', userName: '' })} activeOpacity={0.8}>
              <Text style={styles.actionCancelText}>{text.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ContactReasonModal
        visible={contactModalVisible}
        pending={contactPending}
        target={contactTarget}
        onSelect={(reason) => void sendContactRequest(reason)}
        onClose={closeContactModal}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingTop: 24, paddingBottom: 110 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '84%',
    paddingBottom: 16,
  },
  modalHandle: { width: 42, height: 4, borderRadius: 99, backgroundColor: '#D9C69E', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8DDD3',
  },
  modalTitle: { color: SCREEN_THEME.textPrimary, fontSize: 17, fontWeight: '900', flex: 1, paddingRight: 8 },
  modalCloseBtn: { backgroundColor: SCREEN_THEME.enamelBlue, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  modalCloseText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  modalContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  resetBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9C69E',
    backgroundColor: '#F7F3EE',
    alignItems: 'center',
    paddingVertical: 12,
  },
  resetBtnText: { color: SCREEN_THEME.textSecondary, fontWeight: '800', fontSize: 13 },
  applyBtn: { flex: 1, borderRadius: 14, backgroundColor: SCREEN_THEME.woodGreen, alignItems: 'center', paddingVertical: 12 },
  applyBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  headerCard: { backgroundColor: '#E8EDF8', borderRadius: 28, padding: 16, marginBottom: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#BECBE7', overflow: 'hidden' },
  headerImageFrame: {
    width: '100%',
    height: 178,
    borderRadius: 22,
    backgroundColor: '#F4F7FC',
    borderWidth: 1,
    borderColor: 'rgba(86, 116, 170, 0.18)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerImage: {
    width: '96%',
    height: '96%',
  },
  headerTitle: { fontSize: 28, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 8 },
  headerSubtitle: { marginTop: 6, color: SCREEN_THEME.textSecondary, textAlign: 'center' },
  livePanel: {
    marginTop: 12,
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#F7F9FD',
    borderWidth: 1,
    borderColor: 'rgba(69, 106, 174, 0.18)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#E6EEF9',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  liveDot: { color: '#2F69B1', fontSize: 15, fontWeight: '900', marginRight: 4, lineHeight: 15 },
  liveText: { color: '#2F69B1', fontSize: 10, fontWeight: '900', letterSpacing: 0 },
  liveCountBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  liveNumber: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: SCREEN_THEME.enamelBlue,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingHorizontal: 8,
  },
  liveCount: { flex: 1, color: SCREEN_THEME.textSecondary, fontSize: 11, lineHeight: 15, fontWeight: '800', textAlign: 'right' },
  publishToggleBtn: {
    backgroundColor: SCREEN_THEME.enamelBlue,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  publishToggleBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  formCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 24, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E4D0AB' },
  formLabel: { fontWeight: '700', color: SCREEN_THEME.textPrimary, marginBottom: 8, marginTop: 8 },
  fieldHeader: {
    marginTop: 12,
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldLabel: { color: SCREEN_THEME.textPrimary, fontSize: 14, fontWeight: '900' },
  fieldMessageWrap: { marginTop: 6, marginBottom: 2 },
  fieldMessage: { fontSize: 12, fontWeight: '900', lineHeight: 16 },
  signInNote: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '700', paddingVertical: 10, lineHeight: 18 },
  kindSwitcher: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F7F3EE',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    padding: 5,
    marginBottom: 8,
  },
  kindOption: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  kindOptionActive: {
    backgroundColor: SCREEN_THEME.enamelBlue,
  },
  kindOptionText: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  kindOptionTextActive: { color: '#FFFFFF' },
  input: { backgroundColor: '#F7F3EE', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: SCREEN_THEME.textPrimary, borderWidth: 1, borderColor: '#E8DDD3' },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  workTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  workTypeChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#F7F3EE', borderWidth: 1, borderColor: '#E8DDD3' },
  workTypeChipActive: { backgroundColor: '#DDEAF0', borderColor: SCREEN_THEME.enamelBlueDark },
  workTypeText: { color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '800' },
  workTypeTextActive: { color: SCREEN_THEME.enamelBlueDark },
  submitBtn: { backgroundColor: SCREEN_THEME.terracotta, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', marginTop: 14, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800' },
  inputError: { borderColor: '#B84A3A', backgroundColor: '#FFF7F5' },
  inputValid: { borderColor: '#2F7D50', backgroundColor: '#FBFFFC' },
  listingsSection: { marginBottom: 16 },
  pickerWrapper: {
    backgroundColor: '#F7F3EE',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    overflow: 'hidden',
    marginBottom: 10,
  },
  picker: { color: SCREEN_THEME.textPrimary, height: 50 },
  listingsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  listingsSectionTitle: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  searchBtn: { backgroundColor: SCREEN_THEME.enamelBlue, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  searchBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  clearSearchBtn: { alignSelf: 'flex-start', marginBottom: 10 },
  clearSearchText: { color: SCREEN_THEME.terracottaDark, fontWeight: '800', fontSize: 12 },
  emptyFiltered: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 16,
    marginBottom: 8,
  },
  emptyFilteredTitle: { color: SCREEN_THEME.textPrimary, fontWeight: '800', fontSize: 14 },
  emptyFilteredSub: { color: SCREEN_THEME.textSecondary, marginTop: 4, fontSize: 12, lineHeight: 18 },
  listingCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 20, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E4D0AB' },
  listingHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  listingHeaderLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  listingPhoto: { width: 68, height: 68, borderRadius: 20, backgroundColor: '#E8EDF8' },
  listingName: { fontWeight: '800', color: SCREEN_THEME.textPrimary, marginLeft: 10, flexShrink: 1, fontSize: 16 },
  phoneInlineAction: { marginLeft: 10, marginTop: 3 },
  positionTitle: {
    color: SCREEN_THEME.enamelBlueDark,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    marginBottom: 4,
  },
  postedDateText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  deleteText: { color: '#D05B4D', fontWeight: '700' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  archiveBadge: { fontSize: 10, fontWeight: '700', color: '#fff', backgroundColor: '#8B7355', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, overflow: 'hidden' },
  kindBadge: { color: '#FFFFFF', backgroundColor: SCREEN_THEME.woodGreen, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '900' },
  kindBadgeVacancy: { backgroundColor: SCREEN_THEME.terracotta },
  badge: { color: SCREEN_THEME.enamelBlueDark, backgroundColor: '#E8F0F3', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '900' },
  moderationBadge: { color: '#8A5A00', backgroundColor: '#FFF2C7', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: '900' },
  listingAbout: { color: '#fff', backgroundColor: '#7A1E5C', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, lineHeight: 18, marginBottom: 8, fontWeight: '800', overflow: 'hidden' },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: SCREEN_THEME.textPrimary, marginTop: 14 },
  emptySub: { color: SCREEN_THEME.textSecondary, marginTop: 6, textAlign: 'center' },
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  actionSheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  actionPrimaryBtn: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  actionSecondaryBtn: {
    backgroundColor: '#F7F3EE',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  actionSecondaryText: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  actionCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCancelText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
});

export default JobSearchScreen;

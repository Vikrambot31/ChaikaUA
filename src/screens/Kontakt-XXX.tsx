import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Linking, Modal, PanResponder, Platform, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useSelector } from 'react-redux';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MiniTabBar from '../components/MiniTabBar';
import MiniUserAvatar from '../components/MiniUserAvatar';
import AppPhotoImage from '../components/AppPhotoImage';
import { SCREEN_THEME } from '../utils/screenTheme';
import { normalizePhoneText } from '../utils/textUtils';
import { RootState } from '../redux/store';
import { contactsService, ContactListing } from '../services/contactsService';
import { getModerationUserMessage, showUserError } from '../utils/userFacingErrors';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { get, ref } from 'firebase/database';
import { database } from '../firebase-config';
import { useContactRequest } from '../hooks/useContactRequest';
import ContactReasonModal from '../components/ContactReasonModal';
import { pickUserAvatarUri } from '../utils/userAvatar';
import { safeOpenViber } from '../utils/communicationActions';
import type { DetailItemData } from '../utils/detailViewTypes';
import InlineFieldHint from '../components/InlineFieldHint';
import { FormFieldError } from '../components/ValidationErrorMessage';
import { useSoftToast } from '../hooks/useSoftToast';
import { getDonePhotos, validateSubmissionRequirements } from '../utils/submissionRequirements';
import { checkYellowList } from '../utils/yellowListCheck';
import { getLanguageValidationError } from '../utils/contentLanguageGuard';
import UserCardActionBar from '../components/UserCardActionBar';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';
import { useOperationTrace } from '../hooks/useOperationTrace';
import { subscribeActiveBonusPromotions, type BonusPromotion } from '../services/bonusService';
import ScreenTooltip from '../components/ScreenTooltip';
import { CONTACTS_CHAIKA_TOOLTIP } from '../utils/screenTooltips';
import { VideoLoadingOverlay } from '../components/VideoLoadingOverlay';

const CONTACT_LISTING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const PROFILE_FETCH_TIMEOUT_MS = 5_000;
const MAX_PROFILE_CACHE_SIZE = 500;
const DRAFT_SAVE_DEBOUNCE_MS = 900;
const CONTACTS_DRAFT_KEY = '@chaika:contacts_draft';

type ContactProfile = { name?: string; avatarUri?: string };
type ContactProfileCacheEntry = ContactProfile & { fetchedAt: number };

const contactProfileCache = new Map<string, ContactProfileCacheEntry>();

function upsertProfileCache(uid: string, entry: ContactProfileCacheEntry): void {
  if (!contactProfileCache.has(uid) && contactProfileCache.size >= MAX_PROFILE_CACHE_SIZE) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    contactProfileCache.forEach((e, k) => {
      if (e.fetchedAt < oldestTime) { oldestTime = e.fetchedAt; oldestKey = k; }
    });
    if (oldestKey !== undefined) contactProfileCache.delete(oldestKey);
  }
  contactProfileCache.set(uid, entry);
}

const CONTACT_CATEGORY_VALUES = [
  'furniture',
  'appliances',
  'electronics',
  'kids',
  'clothes',
  'sport',
  'books',
  'kitchen',
  'construction',
  'plants',
  'other',
] as const;

type ContactCategoryValue = typeof CONTACT_CATEGORY_VALUES[number];

const ITEM_CONDITION_VALUES = ['new', 'like_new', 'good', 'fair'] as const;
const ZODIAC_VALUES = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'] as const;
const HUMAN_DESIGN_TYPE_VALUES = ['generator', 'projector', 'manifestor', 'reflector'] as const;
const HUMAN_DESIGN_PROFILE_VALUES = ['1/3', '1/4', '2/4', '2/5', '3/5', '3/6', '4/1', '4/6', '5/1', '5/2', '6/2', '6/3'] as const;
const HUMAN_DESIGN_TELEGRAM_URL = 'https://t.me/Vikram_2027';
const HUMAN_DESIGN_TELEGRAM_MESSAGE = 'Добрый день. Я с приложения Чайка Life - хочу бесплатно узнать про ДЧ свой тип';

type ContactsDraft = Partial<{
  category: string;
  condition: string;
  price: string;
  description: string;
  phone: string;
  addFormVisible: boolean;
  isInterestingFormExpanded: boolean;
  zodiacSign: string;
  humanDesignType: string;
  humanDesignProfile: string;
}>;

const UI_TEXT = {
  ua: {
    title: 'Знайомства на каву',
    subtitle: 'Люди ЖК Чайка — знайдіть цікаву компанію поруч',
    categoryLabel: 'Хто я',
    conditionLabel: 'Шукаю',
    priceLabel: 'Вік',
    priceError: 'Вкажіть коректний вік.',
    phoneLabel: 'Контактний телефон',
    photoLabel: 'Фото',
    addPhoto: 'Обрати з Моїх фотографій',
    removePhoto: 'Прибрати фото',
    descriptionLabel: 'Про себе',
    submitBtn: 'Опублікувати',
    addRequest: '+ Моя анкета',
    formTitle: 'Моя анкета',
    errorFill: 'Заповніть усі поля',
    errorPhone: 'Перевірте номер телефону',
    successTitle: 'Готово',
    successMsg: 'Анкету опубліковано. Тепер інші можуть знайти вас.',
    successMsgWithPhoto: 'Анкету опубліковано. Фото буде показане після перевірки модератором.',
    deleteConfirmTitle: 'Видалити?',
    deleteConfirmMsg: 'Ви впевнені, що хочете видалити цю анкету?',
    deleteCancel: 'Скасувати',
    deleteBtn: 'Видалити',
    listingsTitle: 'Люди поруч',
    filterLabel: 'Фільтр',
    filterAll: 'Усі',
    pending: 'На модерації',
    approved: 'Схвалено',
    rejected: 'Відхилено',
    noDesc: 'Без тексту',
    selectCategory: 'Оберіть...',
    selectCondition: 'Оберіть...',
    errorSave: 'Не вдалося зберегти контакт',
    errorTitle: 'Помилка',
    deleteText: 'Видалити',
    conditionLabels: { new: 'Дружбу', like_new: 'Спілкування', good: 'Романтику', fair: 'Спільні інтереси' },
    categories: {
      furniture: 'Чоловік',
      appliances: 'Жінка',
      electronics: 'Пара',
      kids: 'Компанія друзів',
      clothes: 'Сусід по будинку',
      sport: 'Сусід по району',
      books: 'Хтось для спілкування',
      kitchen: 'Хтось для прогулянок',
      construction: 'Хтось для спорту',
      plants: 'Хтось для подорожей',
      other: 'Інше',
    },
    searchButton: 'Пошук',
    searchTitle: 'Пошук людей',
    searchName: 'Ім\'я',
    searchCategory: 'Хто',
    searchCondition: 'Шукає',
    searchPriceFrom: 'Вік від',
    searchPriceTo: 'Вік до',
    searchContact: 'Контакт',
    searchDescription: 'Про себе',
    searchAnyCategory: 'Будь-хто',
    searchAnyCondition: 'Будь-що',
    searchPlaceholderName: 'Наприклад: Олександр',
    searchPlaceholderContact: '+380... або інший контакт',
    searchPlaceholderDescription: 'Пошук по тексту',
    searchReset: 'Скинути',
    searchApply: 'Показати',
    clearSearch: 'Скинути пошук',
    noSearchResults: 'Нікого не знайдено',
    noSearchResultsSub: 'Спробуйте прибрати частину фільтрів.',
    showPhoneToggle: 'Показувати телефон на картці',
    categoryHint: 'Оберіть, як ви хочете представитись іншим мешканцям.',
    conditionHint: 'Оберіть, для чого ви шукаєте контакт.',
    ageHint: 'Вкажіть реальний вік. Це допомагає людям краще зрозуміти анкету.',
    phoneHint: "Залиште номер, за яким з вами можна зв'язатися.",
    descriptionHint: 'Коротко напишіть про себе або кого шукаєте.',
    makeInteresting: 'Зробити анкету цікавішою',
    zodiacLabel: 'Оберіть зі списку ваш знак зодіаку',
    humanDesignTypeLabel: 'Ваш тип за системою "Дизайн Людини"',
    humanDesignProfileLabel: 'Оберіть ваш профіль за Дизайном Людини',
    humanDesignConsultation: 'Що таке наука Дизайн Людини - хочу безкоштовну консультацію',
    selectZodiac: 'Оберіть знак...',
    selectHumanDesignType: 'Оберіть тип...',
    selectHumanDesignProfile: 'Оберіть профіль...',
    zodiacLabels: {
      aries: 'Овен', taurus: 'Телець', gemini: 'Близнюки', cancer: 'Рак', leo: 'Лев', virgo: 'Діва',
      libra: 'Терези', scorpio: 'Скорпіон', sagittarius: 'Стрілець', capricorn: 'Козоріг', aquarius: 'Водолій', pisces: 'Риби',
    },
    humanDesignTypeLabels: { generator: 'Генератор', projector: 'Проектор', manifestor: 'Маніфестор', reflector: 'Рефлектор' },
    descriptionRequired: 'Додайте кілька слів про себе.',
    authRequired: 'Для публікації анкети потрібна реєстрація.',
    sectionMain: 'Основне',
    sectionExtra: 'Додатково',
    live: 'НАЖИВО',
    liveCount: (count: number) => `всього ${count} людей шукають знайомств`,
    topAnketyTitle: 'Топ анкети',
    editBtn: 'Редагувати',
    editTitle: 'Редагування анкети',
    editSaveBtn: 'Зберегти зміни',
    editSuccessTitle: 'Готово',
    editSuccessMsg: 'Анкету оновлено. Зміни надіслано на модерацію.',
    editCooldownMsg: 'Редагувати можна раз на 3 дні. Спробуйте пізніше.',
    editWhilePendingMsg: 'Анкета зараз на модерації. Дочекайтесь результату.',
    swipeFilterTitle: 'Я шукаю',
    swipeFilterGenderAll: 'Будь-кого',
    swipeFilterGenderMale: 'Чоловіка',
    swipeFilterGenderFemale: 'Жінку',
    swipeFilterGenderFriends: 'Друзів',
    swipeFilterAgeFrom: 'Вік від',
    swipeFilterAgeTo: 'до',
    swipeFilterStart: 'Почати листати',
    swipeFilterSkip: 'Без фільтрів',
    swipeBackBtn: '← Контакти',
    swipeDoneTitle: 'Переглянуто всі анкети',
    swipeDoneLiked: (n: number) => `Вподобано: ${n}`,
    swipeRestartBtn: 'Почати знову',
    swipeLikeLabel: 'ЛАЙК ♥',
    swipePassLabel: 'ДАЛІ →',
  },
  ru: {
    title: 'Знакомства на кофе',
    subtitle: 'Люди ЖК Чайка — найдите интересную компанию рядом',
    categoryLabel: 'Кто я',
    conditionLabel: 'Ищу',
    priceLabel: 'Возраст',
    priceError: 'Укажите корректный возраст.',
    phoneLabel: 'Контактный телефон',
    photoLabel: 'Фото',
    addPhoto: 'Выбрать из Моих фотографий',
    removePhoto: 'Убрать фото',
    descriptionLabel: 'О себе',
    submitBtn: 'Опубликовать',
    addRequest: '+ Моя анкета',
    formTitle: 'Моя анкета',
    errorFill: 'Заполните все поля',
    errorPhone: 'Проверьте номер телефона',
    successTitle: 'Готово',
    successMsg: 'Анкета опубликована. Теперь другие могут найти вас.',
    successMsgWithPhoto: 'Анкета опубликована. Фото появится после проверки модератором.',
    deleteConfirmTitle: 'Удалить?',
    deleteConfirmMsg: 'Вы уверены, что хотите удалить эту анкету?',
    deleteCancel: 'Отмена',
    deleteBtn: 'Удалить',
    listingsTitle: 'Люди рядом',
    filterLabel: 'Фильтр',
    filterAll: 'Все',
    pending: 'На модерации',
    approved: 'Одобрено',
    rejected: 'Отклонено',
    noDesc: 'Без текста',
    selectCategory: 'Выберите...',
    selectCondition: 'Выберите...',
    errorSave: 'Не удалось сохранить контакт',
    errorTitle: 'Ошибка',
    deleteText: 'Удалить',
    conditionLabels: { new: 'Дружбу', like_new: 'Общение', good: 'Романтику', fair: 'Общие интересы' },
    categories: {
      furniture: 'Мужчина',
      appliances: 'Женщина',
      electronics: 'Пара',
      kids: 'Компания друзей',
      clothes: 'Сосед по дому',
      sport: 'Сосед по району',
      books: 'Кто-то для общения',
      kitchen: 'Кто-то для прогулок',
      construction: 'Кто-то для спорта',
      plants: 'Кто-то для путешествий',
      other: 'Другое',
    },
    searchButton: 'Поиск',
    searchTitle: 'Поиск людей',
    searchName: 'Имя',
    searchCategory: 'Кто',
    searchCondition: 'Ищет',
    searchPriceFrom: 'Возраст от',
    searchPriceTo: 'Возраст до',
    searchContact: 'Контакт',
    searchDescription: 'О себе',
    searchAnyCategory: 'Любой',
    searchAnyCondition: 'Любое',
    searchPlaceholderName: 'Например: Александр',
    searchPlaceholderContact: '+380... или другой контакт',
    searchPlaceholderDescription: 'Поиск по тексту',
    searchReset: 'Сбросить',
    searchApply: 'Показать',
    clearSearch: 'Сбросить поиск',
    noSearchResults: 'Никого не найдено',
    noSearchResultsSub: 'Попробуйте убрать часть фильтров.',
    showPhoneToggle: 'Показывать телефон на карточке',
    categoryHint: 'Выберите, как вы хотите представиться другим жителям.',
    conditionHint: 'Выберите, для чего вы ищете контакт.',
    ageHint: 'Укажите реальный возраст. Это помогает людям лучше понять анкету.',
    phoneHint: 'Оставьте номер, по которому с вами можно связаться.',
    descriptionHint: 'Коротко напишите о себе или кого ищете.',
    makeInteresting: 'Сделать анкету интереснее',
    zodiacLabel: 'Выбрать из списка ваш знак зодиака',
    humanDesignTypeLabel: 'Ваш тип по системе "Дизайн Человека"',
    humanDesignProfileLabel: 'Выбрать ваш профиль по Дизайну Человека',
    humanDesignConsultation: 'Что такое наука Дизайн Человека - хочу бесплатную консультацию',
    selectZodiac: 'Выберите знак...',
    selectHumanDesignType: 'Выберите тип...',
    selectHumanDesignProfile: 'Выберите профиль...',
    zodiacLabels: {
      aries: 'Овен', taurus: 'Телец', gemini: 'Близнецы', cancer: 'Рак', leo: 'Лев', virgo: 'Дева',
      libra: 'Весы', scorpio: 'Скорпион', sagittarius: 'Стрелец', capricorn: 'Козерог', aquarius: 'Водолей', pisces: 'Рыбы',
    },
    humanDesignTypeLabels: { generator: 'Генератор', projector: 'Проектор', manifestor: 'Манифестор', reflector: 'Рефлектор' },
    descriptionRequired: 'Добавьте несколько слов о себе.',
    authRequired: 'Для публикации анкеты требуется регистрация.',
    sectionMain: 'Основное',
    sectionExtra: 'Дополнительно',
    live: 'В ЭФИРЕ',
    liveCount: (count: number) => `всего ${count} людей ищут знакомства`,
    topAnketyTitle: 'Топ анкеты',
    editBtn: 'Редактировать',
    editTitle: 'Редактирование анкеты',
    editSaveBtn: 'Сохранить изменения',
    editSuccessTitle: 'Готово',
    editSuccessMsg: 'Анкета обновлена. Изменения отправлены на модерацию.',
    editCooldownMsg: 'Редактировать можно раз в 3 дня. Попробуйте позже.',
    editWhilePendingMsg: 'Анкета на модерации. Дождитесь результата.',
    swipeFilterTitle: 'Я ищу',
    swipeFilterGenderAll: 'Кого угодно',
    swipeFilterGenderMale: 'Мужчину',
    swipeFilterGenderFemale: 'Женщину',
    swipeFilterGenderFriends: 'Друзей',
    swipeFilterAgeFrom: 'Возраст от',
    swipeFilterAgeTo: 'до',
    swipeFilterStart: 'Начать листать',
    swipeFilterSkip: 'Без фильтров',
    swipeBackBtn: '← Контакты',
    swipeDoneTitle: 'Просмотрены все анкеты',
    swipeDoneLiked: (n: number) => `Понравилось: ${n}`,
    swipeRestartBtn: 'Начать заново',
    swipeLikeLabel: 'ЛАЙК ♥',
    swipePassLabel: 'ДАЛЬШЕ →',
  },
  en: {
    title: 'Coffee Meetups',
    subtitle: 'Chaika Life people — find interesting company nearby',
    categoryLabel: 'I am',
    conditionLabel: 'Looking for',
    priceLabel: 'Age',
    priceError: 'Enter a valid age.',
    phoneLabel: 'Phone',
    photoLabel: 'Photo',
    addPhoto: 'Choose from My photos',
    removePhoto: 'Remove photo',
    descriptionLabel: 'About me',
    submitBtn: 'Publish',
    addRequest: '+ My profile',
    formTitle: 'My profile',
    errorFill: 'Fill all fields',
    errorPhone: 'Check phone number',
    successTitle: 'Done',
    successMsg: 'Profile published. Now others can find you.',
    successMsgWithPhoto: 'Profile published. Photo will appear after moderation review.',
    deleteConfirmTitle: 'Delete?',
    deleteConfirmMsg: 'Are you sure you want to delete this profile?',
    deleteCancel: 'Cancel',
    deleteBtn: 'Delete',
    listingsTitle: 'People nearby',
    filterLabel: 'Filter',
    filterAll: 'All',
    pending: 'Pending moderation',
    approved: 'Approved',
    rejected: 'Rejected',
    noDesc: 'No text',
    selectCategory: 'Select...',
    selectCondition: 'Select...',
    errorSave: 'Failed to save contact',
    errorTitle: 'Error',
    deleteText: 'Delete',
    conditionLabels: { new: 'Friendship', like_new: 'Chat', good: 'Romance', fair: 'Shared interests' },
    categories: {
      furniture: 'Male',
      appliances: 'Female',
      electronics: 'Couple',
      kids: 'Group of friends',
      clothes: 'Neighbor',
      sport: 'Area neighbor',
      books: 'Someone to talk',
      kitchen: 'Someone for walks',
      construction: 'Someone for sports',
      plants: 'Someone for travels',
      other: 'Other',
    },
    searchButton: 'Search',
    searchTitle: 'Search people',
    searchName: 'Name',
    searchCategory: 'I am',
    searchCondition: 'Looking for',
    searchPriceFrom: 'Age from',
    searchPriceTo: 'Age to',
    searchContact: 'Contact',
    searchDescription: 'About',
    searchAnyCategory: 'Anyone',
    searchAnyCondition: 'Anything',
    searchPlaceholderName: 'For example: Alex',
    searchPlaceholderContact: '+380... or other contact',
    searchPlaceholderDescription: 'Search by text',
    searchReset: 'Reset',
    searchApply: 'Apply',
    clearSearch: 'Clear search',
    noSearchResults: 'No people found',
    noSearchResultsSub: 'Try removing some filters.',
    showPhoneToggle: 'Show phone on card',
    categoryHint: 'Choose how you want to introduce yourself to neighbors.',
    conditionHint: 'Choose what kind of contact you are looking for.',
    ageHint: 'Enter your real age. It helps people understand the profile better.',
    phoneHint: 'Leave a number people can use to contact you.',
    descriptionHint: 'Briefly write about yourself or who you are looking for.',
    makeInteresting: 'Make profile more interesting',
    zodiacLabel: 'Choose your zodiac sign',
    humanDesignTypeLabel: 'Your Human Design type',
    humanDesignProfileLabel: 'Choose your Human Design profile',
    humanDesignConsultation: 'What is Human Design - I want a free consultation',
    selectZodiac: 'Choose sign...',
    selectHumanDesignType: 'Choose type...',
    selectHumanDesignProfile: 'Choose profile...',
    zodiacLabels: {
      aries: 'Aries', taurus: 'Taurus', gemini: 'Gemini', cancer: 'Cancer', leo: 'Leo', virgo: 'Virgo',
      libra: 'Libra', scorpio: 'Scorpio', sagittarius: 'Sagittarius', capricorn: 'Capricorn', aquarius: 'Aquarius', pisces: 'Pisces',
    },
    humanDesignTypeLabels: { generator: 'Generator', projector: 'Projector', manifestor: 'Manifestor', reflector: 'Reflector' },
    descriptionRequired: 'Add a few words about yourself.',
    authRequired: 'Registration is required to publish a profile.',
    sectionMain: 'Basic info',
    sectionExtra: 'More about me',
    live: 'LIVE',
    liveCount: (count: number) => `${count} people looking for contacts`,
    topAnketyTitle: 'Top profiles',
    editBtn: 'Edit',
    editTitle: 'Edit profile',
    editSaveBtn: 'Save changes',
    editSuccessTitle: 'Done',
    editSuccessMsg: 'Profile updated. Changes sent for moderation.',
    editCooldownMsg: 'You can edit once every 3 days. Try later.',
    editWhilePendingMsg: 'Profile is under moderation. Wait for the result.',
    swipeFilterTitle: 'I am looking for',
    swipeFilterGenderAll: 'Anyone',
    swipeFilterGenderMale: 'A man',
    swipeFilterGenderFemale: 'A woman',
    swipeFilterGenderFriends: 'Friends',
    swipeFilterAgeFrom: 'Age from',
    swipeFilterAgeTo: 'to',
    swipeFilterStart: 'Start swiping',
    swipeFilterSkip: 'No filters',
    swipeBackBtn: '← Contacts',
    swipeDoneTitle: 'All profiles viewed',
    swipeDoneLiked: (n: number) => `Liked: ${n}`,
    swipeRestartBtn: 'Start again',
    swipeLikeLabel: 'LIKE ♥',
    swipePassLabel: 'NEXT →',
  },
} as const;

const KontaktiChaikyScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const navLock = useRef(false);
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector((state: RootState) => state.auth.user);
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const text = UI_TEXT[language];
  const toast = useSoftToast();
  const { startOperation, trace } = useOperationTrace('Kontakt-XXX');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState(() => (user?.phone ? normalizePhoneText(user.phone) : '+380'));
  const [isInterestingFormExpanded, setIsInterestingFormExpanded] = useState(false);
  const [zodiacSign, setZodiacSign] = useState('');
  const [humanDesignType, setHumanDesignType] = useState('');
  const [humanDesignProfile, setHumanDesignProfile] = useState('');
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [showPhoneOnCard, setShowPhoneOnCard] = useState(true);
  const [listings, setListings] = useState<ContactListing[]>([]);
  const [listingsReady, setListingsReady] = useState(false);
  const [listingsLoadError, setListingsLoadError] = useState(false);
  const [profileByUserId, setProfileByUserId] = useState<Record<string, ContactProfile>>({});
  const [selectedFilterCategory, setSelectedFilterCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [addFormVisible, setAddFormVisible] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchItemName, setSearchItemName] = useState('');
  const [searchCategory, setSearchCategory] = useState('');
  const [searchCondition, setSearchCondition] = useState('');
  const [searchPriceFrom, setSearchPriceFrom] = useState('');
  const [searchPriceTo, setSearchPriceTo] = useState('');
  const [searchContact, setSearchContact] = useState('');
  const [searchDescription, setSearchDescription] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [activePromotions, setActivePromotions] = useState<BonusPromotion[]>([]);
  const [editingItem, setEditingItem] = useState<ContactListing | null>(null);
  const [editFormVisible, setEditFormVisible] = useState(false);
  const [editCategory, setEditCategory] = useState('');
  const [editCondition, setEditCondition] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editShowPhone, setEditShowPhone] = useState(true);
  const [editZodiac, setEditZodiac] = useState('');
  const [editHdType, setEditHdType] = useState('');
  const [editHdProfile, setEditHdProfile] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editSubmitAttempted, setEditSubmitAttempted] = useState(false);
  // Swipe mode
  const [swipeMode, setSwipeMode] = useState(false);
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [swipeFilterVisible, setSwipeFilterVisible] = useState(false);
  const [swipeGenderFilter, setSwipeGenderFilter] = useState<'all' | 'furniture' | 'appliances' | 'kids'>('all');
  const [swipeAgeFrom, setSwipeAgeFrom] = useState('');
  const [swipeAgeTo, setSwipeAgeTo] = useState('');
  const swipePosition = useRef(new Animated.ValueXY()).current;
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraftRef = useRef({ category, condition, price, description, phone, addFormVisible, isInterestingFormExpanded, zodiacSign, humanDesignType, humanDesignProfile });
  const avatarByUserId = useUserAvatarMap(listings.map((item) => item.userId));
  const previousAddFormVisibleRef = useRef(addFormVisible);
  const skipNextDraftFlushRef = useRef(false);

  const getCategoryLabel = useCallback(
    (value: string) => text.categories[value as ContactCategoryValue] ?? value,
    [text.categories],
  );

  const handleRequestCloseModal = useCallback(() => {
    const defaultPhone = user?.phone ? normalizePhoneText(user.phone) : '+380';
    const isDirty =
      category !== '' ||
      condition !== '' ||
      price.trim() !== '' ||
      description.trim() !== '' ||
      phone.trim() !== defaultPhone ||
      zodiacSign !== '' ||
      humanDesignType !== '' ||
      humanDesignProfile !== '' ||
      formPhotos.length > 0 ||
      !showPhoneOnCard;
    if (!isDirty) {
      skipNextDraftFlushRef.current = true;
      void AsyncStorage.removeItem(CONTACTS_DRAFT_KEY).catch(() => {});
      setAddFormVisible(false);
      return;
    }
    Alert.alert(
      'Закрити форму?',
      'Ви ще не надіслали заявку. Закрити?',
      [
        { text: 'Ні', style: 'cancel' },
        { text: 'Так', onPress: () => setAddFormVisible(false) },
      ],
    );
  }, [category, condition, description, formPhotos.length, humanDesignProfile, humanDesignType, phone, price, showPhoneOnCard, user?.phone, zodiacSign]);

  useEffect(() => {
    let isMounted = true;
    setListingsReady(false);
    setListingsLoadError(false);
    const unsubscribe = contactsService.subscribe((items) => {
      setListingsReady(true);
      setListingsLoadError(false);
      setListings(items);
    }, user?.id, () => {
      setListingsReady(true);
      setListingsLoadError(true);
    });
    // Restore draft if Android restarted the activity while picker was open
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CONTACTS_DRAFT_KEY);
        if (!isMounted || !raw) return;
        const draft = JSON.parse(raw) as ContactsDraft;
        if (draft.category) setCategory(draft.category);
        if (draft.condition) setCondition(draft.condition);
        if (draft.price) setPrice(draft.price);
        if (draft.description) setDescription(draft.description);
        if (draft.phone) setPhone(draft.phone);
        if (draft.isInterestingFormExpanded) setIsInterestingFormExpanded(true);
        if (draft.zodiacSign) setZodiacSign(draft.zodiacSign);
        if (draft.humanDesignType) setHumanDesignType(draft.humanDesignType);
        if (draft.humanDesignProfile) setHumanDesignProfile(draft.humanDesignProfile);
        if (draft.addFormVisible) setAddFormVisible(true);
        await AsyncStorage.removeItem(CONTACTS_DRAFT_KEY);
      } catch { /* ignore */ }
    })();
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    return subscribeActiveBonusPromotions('contacts', setActivePromotions);
  }, []);

  useEffect(() => {
    latestDraftRef.current = { category, condition, price, description, phone, addFormVisible, isInterestingFormExpanded, zodiacSign, humanDesignType, humanDesignProfile };
  }, [addFormVisible, category, condition, description, humanDesignProfile, humanDesignType, isInterestingFormExpanded, phone, price, zodiacSign]);

  const saveDraftNow = useCallback((visible = latestDraftRef.current.addFormVisible) => {
    if (!visible) return;
    const { category: draftCategory, condition: draftCondition, price: draftPrice, description: draftDescription, phone: draftPhone, isInterestingFormExpanded: draftInteresting, zodiacSign: draftZodiac, humanDesignType: draftDesignType, humanDesignProfile: draftDesignProfile } = latestDraftRef.current;
    void AsyncStorage.setItem(
      CONTACTS_DRAFT_KEY,
      JSON.stringify({ category: draftCategory, condition: draftCondition, price: draftPrice, description: draftDescription, phone: draftPhone, addFormVisible: true, isInterestingFormExpanded: draftInteresting, zodiacSign: draftZodiac, humanDesignType: draftDesignType, humanDesignProfile: draftDesignProfile }),
    ).catch(() => {});
  }, []);

  useEffect(() => {
    const wasVisible = previousAddFormVisibleRef.current;
    previousAddFormVisibleRef.current = addFormVisible;
    if (!wasVisible || addFormVisible) return;
    if (skipNextDraftFlushRef.current) {
      skipNextDraftFlushRef.current = false;
      return;
    }
    saveDraftNow(true);
  }, [addFormVisible, saveDraftNow]);

  useEffect(() => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    if (!addFormVisible) return;
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      saveDraftNow(true);
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [addFormVisible, category, condition, description, humanDesignProfile, humanDesignType, isInterestingFormExpanded, phone, price, saveDraftNow, zodiacSign]);

  useEffect(() => () => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    saveDraftNow();
  }, [saveDraftNow]);

  const listingUserIdsKey = useMemo(() => {
    const userIds = Array.from(new Set(listings.map((item) => item.userId).filter((id): id is string => Boolean(id))));
    return userIds.sort().join('|');
  }, [listings]);

  useEffect(() => {
    if (!listingUserIdsKey) return;
    const userIds = listingUserIdsKey.split('|').filter(Boolean);
    const now = Date.now();
    const cachedProfiles: Record<string, ContactProfile> = {};
    const missingUserIds = userIds.filter((uid) => {
      const cached = contactProfileCache.get(uid);
      if (cached && now - cached.fetchedAt < PROFILE_CACHE_TTL_MS) {
        cachedProfiles[uid] = { name: cached.name, avatarUri: cached.avatarUri };
        return false;
      }
      return true;
    });

    if (Object.keys(cachedProfiles).length > 0) {
      setProfileByUserId((prev) => ({ ...prev, ...cachedProfiles }));
    }
    if (missingUserIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      const resolved = await Promise.all(
        missingUserIds.map(async (uid) => {
          try {
            const snap = await Promise.race([
              get(ref(database, `users/${uid}`)),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('profile-timeout')), PROFILE_FETCH_TIMEOUT_MS)
              ),
            ]);
            const data = snap.val() as Record<string, unknown> | null;
            const profile = {
              avatarUri: pickUserAvatarUri(data),
              name: typeof data?.name === 'string' ? data.name.trim() : '',
            } satisfies ContactProfile;
            upsertProfileCache(uid, { ...profile, fetchedAt: Date.now() });
            return [uid, profile] as const;
          } catch {
            const profile = {} satisfies ContactProfile;
            upsertProfileCache(uid, { ...profile, fetchedAt: Date.now() });
            return [uid, profile] as const;
          }
        }),
      );
      if (cancelled) return;
      setProfileByUserId((prev) => {
        const next = { ...prev };
        resolved.forEach(([uid, profile]) => { next[uid] = { ...next[uid], ...profile }; });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [listingUserIdsKey]);

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

  const handleViber = (phoneRaw: string) => {
    if (!user?.id) {
      Alert.alert(
        language === 'en' ? 'Registration required' : language === 'ru' ? 'Нужна регистрация' : 'Потрібна реєстрація',
        language === 'en' ? 'Sign in to contact users.' : language === 'ru' ? 'Для связи необходима регистрация.' : "Для зв'язку потрібна реєстрація.",
        [
          { text: language === 'en' ? 'Register' : language === 'ru' ? 'Зарегистрироваться' : 'Зареєструватись', onPress: () => navigation.navigate('LoginScreen') },
          { text: language === 'en' ? 'Cancel' : language === 'ru' ? 'Отмена' : 'Скасувати', style: 'cancel' },
        ]
      );
      return;
    }
    void safeOpenViber(phoneRaw, language);
  };

  const filteredListings = useMemo(() => {
    const queryItemName = searchItemName.trim().toLowerCase();
    const queryContact = searchContact.trim().toLowerCase();
    const queryDescription = searchDescription.trim().toLowerCase();
    const priceFrom = searchPriceFrom ? Number(searchPriceFrom) : null;
    const priceTo = searchPriceTo ? Number(searchPriceTo) : null;

    return listings.filter((item) => {
      const numericPrice = Number(String(item.price).replace(',', '.').replace(/[^\d.]/g, ''));

      if (selectedFilterCategory && item.category !== selectedFilterCategory) return false;
      if (searchCategory && item.category !== searchCategory) return false;
      if (searchCondition && item.condition !== searchCondition) return false;
      if (queryItemName && !item.itemName.toLowerCase().includes(queryItemName)) return false;
      if (queryContact && !item.phone.toLowerCase().includes(queryContact)) return false;
      if (queryDescription && !item.description.toLowerCase().includes(queryDescription)) return false;
      if (priceFrom !== null && Number.isFinite(priceFrom) && (!Number.isFinite(numericPrice) || numericPrice < priceFrom)) return false;
      if (priceTo !== null && Number.isFinite(priceTo) && (!Number.isFinite(numericPrice) || numericPrice > priceTo)) return false;
      return true;
    });
  }, [
    listings,
    searchCategory,
    searchCondition,
    searchContact,
    searchDescription,
    searchItemName,
    searchPriceFrom,
    searchPriceTo,
    selectedFilterCategory,
  ]);

  const topListings = useMemo(() => {
    const promotedByUserId = new Map(
      activePromotions
        .filter((promotion) => promotion.targetId)
        .map((promotion, index) => [promotion.targetId, index]),
    );
    return [...listings]
      .filter((item) => !item.isArchived && (item.photoUri || promotedByUserId.has(item.userId)))
      .sort((a, b) => {
        const aPromoted = promotedByUserId.get(a.userId);
        const bPromoted = promotedByUserId.get(b.userId);
        if (aPromoted !== undefined || bPromoted !== undefined) {
          if (aPromoted === undefined) return 1;
          if (bPromoted === undefined) return -1;
          return aPromoted - bPromoted;
        }
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      })
      .slice(0, 10);
  }, [activePromotions, listings]);

  const hasAdvancedSearch = useMemo(
    () =>
      Boolean(
        searchItemName.trim() ||
        searchCategory ||
        searchCondition ||
        searchPriceFrom.trim() ||
        searchPriceTo.trim() ||
        searchContact.trim() ||
        searchDescription.trim()
      ),
    [
      searchCategory,
      searchCondition,
      searchContact,
      searchDescription,
      searchItemName,
      searchPriceFrom,
      searchPriceTo,
    ],
  );

  const resetSearch = () => {
    setSearchItemName('');
    setSearchCategory('');
    setSearchCondition('');
    setSearchPriceFrom('');
    setSearchPriceTo('');
    setSearchContact('');
    setSearchDescription('');
  };

  const resetForm = () => {
    skipNextDraftFlushRef.current = true;
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    setCategory('');
    setCondition('');
    setPrice('');
    setDescription('');
    setPhone('+380');
    setIsInterestingFormExpanded(false);
    setZodiacSign('');
    setHumanDesignType('');
    setHumanDesignProfile('');
    setFormPhotos([]);
    setSubmitAttempted(false);
    void AsyncStorage.removeItem(CONTACTS_DRAFT_KEY).catch(() => {});
  };

  const handleSubmit = async () => {
    startOperation();
    setSubmitAttempted(true);

    trace('validate', 'start');
    if (!validateSubmissionRequirements({ language, userId: user?.id, userPhotoURL: user?.photoURL, userStartAvatarKey: user?.startAvatarKey, navigation })) {
      trace('validate', 'fail', { missing: 'submissionRequirements' });
      return;
    }
    if (await checkYellowList(user?.id, language)) {
      trace('validate', 'fail', { missing: 'yellowList' });
      return;
    }
    const normalizedPrice = price.replace(',', '.').replace(/[^\d.]/g, '');
    const numericPrice = Number(normalizedPrice);

    if (!category || !condition || !description.trim() || !phone.trim() || !normalizedPrice) {
      trace('validate', 'fail', { missing: 'requiredFields' });
      toast.showWarning(text.errorTitle, text.errorFill);
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice > 120) {
      trace('validate', 'fail', { missing: 'price' });
      toast.showWarning(text.errorTitle, text.priceError);
      return;
    }
    if (phone.replace(/\D/g, '').length < 7) {
      trace('validate', 'fail', { missing: 'phone' });
      toast.showWarning(text.errorTitle, text.errorPhone);
      return;
    }

    const langError = getLanguageValidationError(description.trim(), language as 'ua' | 'ru' | 'en');
    if (langError) {
      trace('validate', 'fail', { missing: 'language' });
      toast.showWarning(text.errorTitle, langError);
      return;
    }
    trace('validate', 'success');

    setSubmitting(true);
    try {
      trace('photo_check', 'start');
      const donePhotos = getDonePhotos(formPhotos);
      const resolvedPhotoUri = donePhotos[0]?.downloadUrl ?? '';
      const resolvedStoragePath = donePhotos[0]?.storagePath ?? '';
      trace('photo_check', 'success');

      const itemName = user?.name?.trim() || getCategoryLabel(category);
      const createdAt = new Date();

      trace('api_call', 'start', { path: 'contacts' });
      await contactsService.add({
        itemName,
        category,
        condition,
        price: Number.isFinite(numericPrice)
          ? numericPrice.toFixed(Number.isInteger(numericPrice) ? 0 : 2)
          : normalizedPrice,
        description: description.trim(),
        phone: normalizePhoneText(phone),
        photoUri: resolvedPhotoUri,
        photoStoragePath: resolvedStoragePath,
        photoId: '',
        moderationStatus: 'pending',
        submittedForModerationAt: createdAt.toISOString(),
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + CONTACT_LISTING_TTL_MS).toISOString(),
        userId: user?.id || '',
        showPhone: showPhoneOnCard,
        zodiacSign: isInterestingFormExpanded ? zodiacSign : '',
        humanDesignType: isInterestingFormExpanded ? humanDesignType : '',
        humanDesignProfile: isInterestingFormExpanded ? humanDesignProfile : '',
        language,
      });
      trace('api_call', 'success');

      trace('user_alert', 'success', { type: 'success' });
      toast.showSuccess(text.successTitle, resolvedPhotoUri ? text.successMsgWithPhoto : text.successMsg);
      resetForm();
      setAddFormVisible(false);
    } catch (error) {
      trace('api_call', 'fail', {}, error);
      showUserError(language, 'send', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleHumanDesignConsultation = useCallback(async () => {
    const encodedMessage = encodeURIComponent(HUMAN_DESIGN_TELEGRAM_MESSAGE);
    const appUrl = `tg://resolve?domain=Vikram_2027&text=${encodedMessage}`;
    const webUrl = `${HUMAN_DESIGN_TELEGRAM_URL}?text=${encodedMessage}`;

    try {
      const canOpenTelegram = await Linking.canOpenURL(appUrl);
      await Linking.openURL(canOpenTelegram ? appUrl : webUrl);
    } catch {
      await Linking.openURL(webUrl).catch(() => {});
    }
  }, []);

  const handleDelete = (id: string) => {
    Alert.alert(text.deleteConfirmTitle, text.deleteConfirmMsg, [
      { text: text.deleteCancel, style: 'cancel' },
      {
        text: text.deleteBtn,
        style: 'destructive',
        onPress: async () => {
          try {
            await contactsService.remove(id);
          } catch (error) {
            showUserError(language, 'delete', error);
          }
        },
      },
    ]);
  };

  const openEditForm = (item: ContactListing) => {
    setEditingItem(item);
    setEditCategory(item.category);
    setEditCondition(item.condition);
    setEditPrice(item.price);
    setEditDescription(item.description);
    setEditPhone(item.phone);
    setEditShowPhone(item.showPhone !== false);
    setEditZodiac(item.zodiacSign || '');
    setEditHdType(item.humanDesignType || '');
    setEditHdProfile(item.humanDesignProfile || '');
    setEditSubmitAttempted(false);
    setEditFormVisible(true);
  };

  const handleEditSubmit = async () => {
    if (!editingItem) return;
    setEditSubmitAttempted(true);

    if (!editCategory || !editCondition || !editDescription.trim() || !editPhone.trim() || !editPrice.trim()) {
      toast.showWarning(text.errorTitle, text.errorFill);
      return;
    }
    const normalizedPrice = editPrice.replace(',', '.').replace(/[^\d.]/g, '');
    const numericPrice = Number(normalizedPrice);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice > 120) {
      toast.showWarning(text.errorTitle, text.priceError);
      return;
    }
    if (editPhone.replace(/\D/g, '').length < 7) {
      toast.showWarning(text.errorTitle, text.errorPhone);
      return;
    }
    const langError = getLanguageValidationError(editDescription.trim(), language as 'ua' | 'ru' | 'en');
    if (langError) {
      toast.showWarning(text.errorTitle, langError);
      return;
    }

    setEditSubmitting(true);
    try {
      await contactsService.edit(editingItem.id, {
        category: editCategory,
        condition: editCondition,
        price: normalizedPrice,
        description: editDescription.trim(),
        phone: normalizePhoneText(editPhone),
        showPhone: editShowPhone,
        zodiacSign: editZodiac,
        humanDesignType: editHdType,
        humanDesignProfile: editHdProfile,
        language,
      });
      toast.showSuccess(text.editSuccessTitle, text.editSuccessMsg);
      setEditFormVisible(false);
      setEditingItem(null);
    } catch (error: any) {
      if (error?.message === 'edit_cooldown') {
        toast.showWarning(text.errorTitle, text.editCooldownMsg);
      } else if (error?.message === 'edit_while_pending') {
        toast.showWarning(text.errorTitle, text.editWhilePendingMsg);
      } else {
        showUserError(language, 'send', error);
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  // Swipe mode logic
  const swipeItems = useMemo(() => {
    let items = filteredListings.filter((i) => !i.isArchived);
    if (swipeGenderFilter !== 'all') {
      items = items.filter((i) => i.category === swipeGenderFilter);
    }
    const ageFromNum = swipeAgeFrom ? parseInt(swipeAgeFrom, 10) : null;
    const ageToNum = swipeAgeTo ? parseInt(swipeAgeTo, 10) : null;
    if (ageFromNum !== null || ageToNum !== null) {
      items = items.filter((i) => {
        const age = i.price ? parseInt(i.price, 10) : null;
        if (age === null || isNaN(age)) return true;
        if (ageFromNum !== null && age < ageFromNum) return false;
        if (ageToNum !== null && age > ageToNum) return false;
        return true;
      });
    }
    return items;
  }, [filteredListings, swipeGenderFilter, swipeAgeFrom, swipeAgeTo]);
  const swipeItemsRef = useRef(swipeItems);
  swipeItemsRef.current = swipeItems;
  const swipeIndexRef = useRef(swipeIndex);
  swipeIndexRef.current = swipeIndex;

  const advanceSwipe = useCallback(() => {
    swipePosition.setValue({ x: 0, y: 0 });
    setSwipeIndex((prev) => prev + 1);
  }, [swipePosition]);

  const handleSwipeRight = useCallback(() => {
    const item = swipeItemsRef.current[swipeIndexRef.current];
    if (!item) return;
    setLikedIds((prev) => [...prev, item.id]);
    Animated.timing(swipePosition, { toValue: { x: 600, y: 0 }, duration: 280, useNativeDriver: false }).start(advanceSwipe);
  }, [advanceSwipe, swipePosition]);

  const handleSwipeLeft = useCallback(() => {
    Animated.timing(swipePosition, { toValue: { x: -600, y: 0 }, duration: 280, useNativeDriver: false }).start(advanceSwipe);
  }, [advanceSwipe, swipePosition]);

  const handleSwipeRightRef = useRef(handleSwipeRight);
  handleSwipeRightRef.current = handleSwipeRight;
  const handleSwipeLeftRef = useRef(handleSwipeLeft);
  handleSwipeLeftRef.current = handleSwipeLeft;

  const swipePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: swipePosition.x, dy: swipePosition.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, { dx }) => {
        if (dx > 100) {
          handleSwipeRightRef.current();
        } else if (dx < -100) {
          handleSwipeLeftRef.current();
        } else {
          Animated.spring(swipePosition, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    }),
  ).current;

  const mapToDetailData = (item: ContactListing, ownerAvatarUri?: string): DetailItemData => {
    const categoryLabel = getCategoryLabel(item.category);
    const conditionLabel = text.conditionLabels[item.condition as keyof typeof text.conditionLabels] ?? item.condition;

    return {
      id: item.id,
      title: item.itemName,
      description: item.description,
      phone: item.showPhone !== false ? item.phone : undefined,
      photoUri: item.photoUri,
      photoStoragePath: item.photoStoragePath,
      category: categoryLabel || conditionLabel,
      price: item.price ? `${item.price}` : undefined,
      priceLabel: text.priceLabel,
      status: conditionLabel,
      userId: item.userId,
      ownerAvatarUri,
      createdAt: item.createdAt,
      sourceType: 'lyudi',
      sourceId: item.id,
    };
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenTooltip
        storageKey={CONTACTS_CHAIKA_TOOLTIP.storageKey}
        title={CONTACTS_CHAIKA_TOOLTIP.title}
        items={CONTACTS_CHAIKA_TOOLTIP.items}
        language={language}
        accentColor={SCREEN_THEME.woodGreen}
      />
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
                value={searchItemName}
                onChangeText={setSearchItemName}
                placeholder={text.searchPlaceholderName}
                placeholderTextColor="#A0938D"
              />

              <Text style={styles.formLabel}>{text.searchCategory}</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={searchCategory} onValueChange={setSearchCategory} style={styles.picker}>
                  <Picker.Item label={text.searchAnyCategory} value="" />
                  {CONTACT_CATEGORY_VALUES.map((value) => (
                    <Picker.Item key={`search-category-${value}`} label={getCategoryLabel(value)} value={value} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.formLabel}>{text.searchCondition}</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={searchCondition} onValueChange={setSearchCondition} style={styles.picker}>
                  <Picker.Item label={text.searchAnyCondition} value="" />
                  {ITEM_CONDITION_VALUES.map((value) => (
                    <Picker.Item key={`search-condition-${value}`} label={text.conditionLabels[value]} value={value} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.formLabel}>{text.searchPriceFrom}</Text>
              <TextInput
                style={styles.input}
                value={searchPriceFrom}
                onChangeText={(value) => setSearchPriceFrom(value.replace(/[^0-9.,]/g, ''))}
                placeholder="0"
                placeholderTextColor="#A0938D"
                keyboardType="decimal-pad"
              />

              <Text style={styles.formLabel}>{text.searchPriceTo}</Text>
              <TextInput
                style={styles.input}
                value={searchPriceTo}
                onChangeText={(value) => setSearchPriceTo(value.replace(/[^0-9.,]/g, ''))}
                placeholder="0"
                placeholderTextColor="#A0938D"
                keyboardType="decimal-pad"
              />

              <Text style={styles.formLabel}>{text.searchContact}</Text>
              <TextInput
                style={styles.input}
                value={searchContact}
                onChangeText={setSearchContact}
                placeholder={text.searchPlaceholderContact}
                placeholderTextColor="#A0938D"
              />

              <Text style={styles.formLabel}>{text.searchDescription}</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={searchDescription}
                onChangeText={setSearchDescription}
                placeholder={text.searchPlaceholderDescription}
                placeholderTextColor="#A0938D"
                multiline
                maxLength={260}
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
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>{text.title}</Text>
          <Text style={styles.headerSubtitle}>{text.subtitle}</Text>
          <View style={styles.liveLine}>
            <Animated.Text style={[styles.liveDot, { opacity: blinkAnim }]}>•</Animated.Text>
            <Text style={styles.liveText}>{text.live}</Text>
            <Text style={styles.liveCount}>{text.liveCount(listings.length)}</Text>
          </View>
        </View>

        {topListings.length > 0 && (
          <View style={styles.topAnketySection}>
            <Text style={styles.topAnketyTitle}>{text.topAnketyTitle}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topAnketyScroll}>
              {topListings.map((item) => {
                const profile = item.userId ? profileByUserId[item.userId] : undefined;
                const avatarUri = (item.userId && avatarByUserId[item.userId]) || profile?.avatarUri || '';
                const displayName = profile?.name || item.itemName;
                const ageText = item.price ? `${item.price}` : '';
                return (
                  <TouchableOpacity
                    key={`top-${item.id}`}
                    style={styles.topAnketyItem}
                    activeOpacity={0.82}
                    onPress={() => {
                      if (navLock.current) return;
                      navLock.current = true;
                      navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item, avatarUri || undefined) });
                      setTimeout(() => { navLock.current = false; }, 800);
                    }}
                  >
                    <AppPhotoImage
                      uri={item.photoUri}
                      storagePath={item.photoStoragePath}
                      style={styles.topAnketyPhoto}
                      resizeMode="cover"
                    />
                    <Text style={styles.topAnketyName} numberOfLines={1} ellipsizeMode="tail">{displayName}</Text>
                    {ageText ? <Text style={styles.topAnketyAge} numberOfLines={1}>{ageText}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {!listingsReady && listings.length === 0 && (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#6A8BA5" />
          </View>
        )}

        {listingsReady && listingsLoadError && listings.length === 0 && (
          <View style={styles.emptyFiltered}>
            <Text style={styles.emptyFilteredTitle}>{language === 'en' ? 'Could not load contacts' : language === 'ru' ? 'Не удалось загрузить контакты' : 'Не вдалося завантажити контакти'}</Text>
            <Text style={styles.emptyFilteredSub}>{language === 'en' ? 'Check the internet connection or try refreshing the screen.' : language === 'ru' ? 'Проверьте интернет или попробуйте обновить экран.' : 'Перевірте інтернет або спробуйте оновити екран.'}</Text>
          </View>
        )}

        {!listingsLoadError && listings.length > 0 && (
          <View style={styles.listingsSection}>
            <Text style={styles.formLabel}>{text.filterLabel}</Text>
            <View style={styles.pickerWrapper}>
              <Picker selectedValue={selectedFilterCategory} onValueChange={setSelectedFilterCategory} style={styles.picker}>
                <Picker.Item label={text.filterAll} value="" />
                {CONTACT_CATEGORY_VALUES.map((value) => (
                  <Picker.Item key={`filter-${value}`} label={getCategoryLabel(value)} value={value} />
                ))}
              </Picker>
            </View>

            <View style={styles.listingsHeaderRow}>
              <Text style={styles.listingsSectionTitle}>{text.listingsTitle} ({filteredListings.length})</Text>
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
            ) : (
              filteredListings.map((item) => {
                const profile = item.userId ? profileByUserId[item.userId] : undefined;
                const avatarUri = (item.userId && avatarByUserId[item.userId]) || profile?.avatarUri || '';
                const isOwn = item.userId === user?.id;
                const showPhone = !!(item.phone && item.showPhone !== false);
                const conditionLabel = text.conditionLabels[item.condition as keyof typeof text.conditionLabels] ?? item.condition;
                const zodiacLabel = item.zodiacSign ? text.zodiacLabels[item.zodiacSign as keyof typeof text.zodiacLabels] : '';
                const designTypeLabel = item.humanDesignType ? text.humanDesignTypeLabels[item.humanDesignType as keyof typeof text.humanDesignTypeLabels] : '';
                const designProfileLabel = item.humanDesignProfile || '';
                const ageText = item.price ? `${item.price}` : '';
                const categoryLabel = getCategoryLabel(item.category);
                const descriptionText = item.description?.trim() || text.noDesc;
                const displayName = profile?.name || item.itemName;
                const modMsg = getModerationUserMessage(language, item.moderationStatus, item.rejectionReason || item.moderationReason);
                const showModInfo = isOwn && item.moderationStatus !== 'approved';
                const isViberContact = (!item.userId || item.userId === user?.id) && showPhone;
                return (
                  <View
                    key={item.id}
                    style={styles.kCard}
                  >
                    <TouchableOpacity
                      style={styles.kCardTop}
                      onPress={() => { if (navLock.current) return; navLock.current = true; navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item, avatarUri || undefined) }); setTimeout(() => { navLock.current = false; }, 800); }}
                      activeOpacity={0.86}
                    >
                      {Boolean(item.photoUri || item.photoStoragePath) ? (
                        <AppPhotoImage
                          uri={item.photoUri}
                          storagePath={item.photoStoragePath}
                          style={styles.kPhoto}
                          resizeMode="contain"
                          debugLabel={`Contact:${item.id}`}
                        />
                      ) : (
                        <MiniUserAvatar
                          uri={avatarUri || ''}
                          name={displayName}
                          size={92}
                          borderRadius={14}
                          backgroundColor="#6A8BA5"
                        />
                      )}
                      <View style={styles.kInfo}>
                        <View style={styles.kNameRow}>
                          <Text style={styles.kName} numberOfLines={1}>{displayName}</Text>
                          {item.isArchived ? (
                            <Text style={styles.kArchiveBadge}>Архів</Text>
                          ) : null}
                          {ageText ? (
                            <View style={styles.kAgeBadge}>
                              <Text style={styles.kAgeText}>{ageText}</Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={styles.kMetaChips}>
                          <View style={styles.kCategoryBadge}>
                            <Text style={styles.kCategoryText} numberOfLines={1}>{categoryLabel}</Text>
                          </View>
                          <View style={styles.kConditionBadge}>
                            <Text style={styles.kConditionText} numberOfLines={1}>{conditionLabel}</Text>
                          </View>
                        </View>

                        {zodiacLabel || designTypeLabel || designProfileLabel ? (
                          <View style={styles.kInterestingChips}>
                            {zodiacLabel ? <Text style={styles.kInterestingChip}>{zodiacLabel}</Text> : null}
                            {designTypeLabel ? <Text style={styles.kInterestingChip}>{designTypeLabel}</Text> : null}
                            {designProfileLabel ? <Text style={styles.kInterestingChip}>{designProfileLabel}</Text> : null}
                          </View>
                        ) : null}

                        <View style={styles.kDescBox}>
                          <Text style={styles.kDescText} numberOfLines={3}>{descriptionText}</Text>
                        </View>

                        {/* Moderation info (own listings only) */}
                        {showModInfo && modMsg ? (
                          <Text style={styles.kModInfo} numberOfLines={2}>{modMsg}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>

                    <UserCardActionBar
                      avatarUri={avatarUri || ''}
                      name={displayName}
                      userId={item.userId}
                      currentUserId={user?.id}
                      language={language}
                      onProfile={item.userId ? () => { if (navLock.current) return; navLock.current = true; navigation.navigate('ViewUserProfile', { userId: item.userId as string }); setTimeout(() => { navLock.current = false; }, 800); } : undefined}
                      onContact={item.userId && item.userId !== user?.id ? () => openContactModal({ userId: item.userId as string, name: item.itemName ?? 'Unknown', photoURL: avatarUri || undefined, sourceType: 'lyudi', sourceId: item.id, sourceTitle: item.itemName }) : showPhone ? () => handleViber(item.phone) : undefined}
                      contactDisabled={!showPhone && (!item.userId || item.userId === user?.id)}
                      contactLabel={isViberContact ? 'Viber' : undefined}
                      likePath="feed_likes/contacts"
                      likeId={item.id}
                      showLikeAvatars
                    />
                    {isOwn ? (
                      <View style={styles.kOwnActions}>
                        <TouchableOpacity style={styles.kEditLink} onPress={() => openEditForm(item)} activeOpacity={0.8}>
                          <MaterialCommunityIcons name="pencil-outline" size={14} color="#2D7E4D" />
                          <Text style={styles.kEditLinkText}>{text.editBtn}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.kDeleteLink} onPress={() => handleDelete(item.id)} activeOpacity={0.8}>
                          <MaterialCommunityIcons name="trash-can-outline" size={14} color="#C0392B" />
                          <Text style={styles.kDeleteLinkText}>{text.deleteText}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Swipe filter modal */}
      <Modal visible={swipeFilterVisible} transparent animationType="fade" onRequestClose={() => setSwipeFilterVisible(false)}>
        <View style={styles.swipeFilterBackdrop}>
          <View style={styles.swipeFilterSheet}>
            <Text style={styles.swipeFilterTitle}>{text.swipeFilterTitle}</Text>
            <View style={styles.swipeFilterPills}>
              {(['all', 'furniture', 'appliances', 'kids'] as const).map((g) => {
                const label = g === 'all' ? text.swipeFilterGenderAll : g === 'furniture' ? text.swipeFilterGenderMale : g === 'appliances' ? text.swipeFilterGenderFemale : text.swipeFilterGenderFriends;
                return (
                  <TouchableOpacity key={g} style={[styles.swipeFilterPill, swipeGenderFilter === g && styles.swipeFilterPillActive]} onPress={() => setSwipeGenderFilter(g)} activeOpacity={0.8}>
                    <Text style={[styles.swipeFilterPillText, swipeGenderFilter === g && styles.swipeFilterPillTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.swipeFilterAgeRow}>
              <Text style={styles.swipeFilterAgeLabel}>{text.swipeFilterAgeFrom}</Text>
              <TextInput style={styles.swipeFilterAgeInput} value={swipeAgeFrom} onChangeText={setSwipeAgeFrom} keyboardType="numeric" placeholder="18" placeholderTextColor="#78716C" maxLength={3} />
              <Text style={styles.swipeFilterAgeLabel}>{text.swipeFilterAgeTo}</Text>
              <TextInput style={styles.swipeFilterAgeInput} value={swipeAgeTo} onChangeText={setSwipeAgeTo} keyboardType="numeric" placeholder="99" placeholderTextColor="#78716C" maxLength={3} />
            </View>
            <TouchableOpacity style={styles.swipeFilterStartBtn} onPress={() => { swipePosition.setValue({ x: 0, y: 0 }); setSwipeFilterVisible(false); setSwipeIndex(0); setLikedIds([]); setSwipeMode(true); }} activeOpacity={0.85}>
              <Text style={styles.swipeFilterStartBtnText}>{text.swipeFilterStart}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.swipeFilterSkipBtn} onPress={() => { swipePosition.setValue({ x: 0, y: 0 }); setSwipeGenderFilter('all'); setSwipeAgeFrom(''); setSwipeAgeTo(''); setSwipeFilterVisible(false); setSwipeIndex(0); setLikedIds([]); setSwipeMode(true); }} activeOpacity={0.7}>
              <Text style={styles.swipeFilterSkipText}>{text.swipeFilterSkip}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Swipe mode overlay */}
      {swipeMode ? (() => {
        const swipeCard = swipeItems[swipeIndex];
        const swipeRotation = swipePosition.x.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-12deg', '0deg', '12deg'] });
        const likeOpacity = swipePosition.x.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: 'clamp' });
        const passOpacity = swipePosition.x.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
        const swipeProfile = swipeCard && swipeCard.userId ? profileByUserId[swipeCard.userId] : undefined;

        const swipeDisplayName = swipeProfile?.name || swipeCard?.itemName || '';
        const swipeCategoryLabel = swipeCard ? getCategoryLabel(swipeCard.category) : '';
        const swipeConditionLabel = swipeCard ? (text.conditionLabels[swipeCard.condition as keyof typeof text.conditionLabels] ?? swipeCard.condition) : '';
        const swipeDone = swipeIndex >= swipeItems.length;
        return (
          <View style={styles.swipeOverlay}>
            {/* Back button */}
            <TouchableOpacity style={styles.swipeBackBtn} onPress={() => setSwipeMode(false)} activeOpacity={0.85}>
              <MaterialCommunityIcons name="arrow-left" size={20} color="#CA8A04" />
              <Text style={styles.swipeBackBtnText}>{text.swipeBackBtn}</Text>
            </TouchableOpacity>
            {swipeDone ? (
              <View style={styles.swipeDoneBox}>
                <Text style={styles.swipeDoneTitle}>{text.swipeDoneTitle}</Text>
                <Text style={styles.swipeDoneSub}>{text.swipeDoneLiked(likedIds.length)}</Text>
                <TouchableOpacity style={styles.swipeRestartBtn} onPress={() => { swipePosition.setValue({ x: 0, y: 0 }); setSwipeIndex(0); setLikedIds([]); }} activeOpacity={0.85}>
                  <Text style={styles.swipeRestartBtnText}>{text.swipeRestartBtn}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Next card (behind) */}
                {swipeItems[swipeIndex + 1] ? (
                  <View style={[styles.swipeCard, styles.swipeCardBack]} pointerEvents="none" />
                ) : null}
                {/* Current card */}
                <Animated.View
                  style={[styles.swipeCard, { transform: [{ translateX: swipePosition.x }, { translateY: swipePosition.y }, { rotate: swipeRotation }] }]}
                  {...swipePanResponder.panHandlers}
                >
                  <AppPhotoImage
                    uri={swipeCard?.photoUri}
                    storagePath={swipeCard?.photoStoragePath}
                    style={styles.swipePhoto}
                    resizeMode="cover"
                  />
                  {/* Like overlay */}
                  <Animated.View style={[styles.swipeLikeOverlay, { opacity: likeOpacity }]}>
                    <Text style={styles.swipeLikeText}>{text.swipeLikeLabel}</Text>
                  </Animated.View>
                  {/* Pass overlay */}
                  <Animated.View style={[styles.swipePassOverlay, { opacity: passOpacity }]}>
                    <Text style={styles.swipePassText}>{text.swipePassLabel}</Text>
                  </Animated.View>
                  {/* Info bottom */}
                  <View style={styles.swipeInfoBar}>
                    <View style={styles.swipeNameRow}>
                      <Text style={styles.swipeName}>{swipeDisplayName}</Text>
                      {swipeCard?.price ? <Text style={styles.swipeAge}>{swipeCard.price}</Text> : null}
                    </View>
                    <View style={styles.swipeChips}>
                      {swipeCategoryLabel ? <Text style={styles.swipeChip}>{swipeCategoryLabel}</Text> : null}
                      {swipeConditionLabel ? <Text style={styles.swipeChip}>{swipeConditionLabel}</Text> : null}
                    </View>
                    {swipeCard?.description ? <Text style={styles.swipeDesc} numberOfLines={2}>{swipeCard.description}</Text> : null}
                  </View>
                </Animated.View>
                {/* Action buttons */}
                <View style={styles.swipeActions}>
                  <TouchableOpacity style={styles.swipePassBtn} onPress={handleSwipeLeft} activeOpacity={0.85}>
                    <MaterialCommunityIcons name="close" size={40} color="#1C1917" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.swipeLikeBtn} onPress={handleSwipeRight} activeOpacity={0.85}>
                    <MaterialCommunityIcons name="heart" size={48} color="#1C1917" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.swipeCounter}>{swipeIndex + 1} / {swipeItems.length}</Text>
              </>
            )}
          </View>
        );
      })() : null}

      <View style={styles.addBar}>
        <TouchableOpacity
          style={styles.swipeModeBtn}
          onPress={() => {
            if (swipeMode) {
              setSwipeMode(false);
            } else {
              setSwipeFilterVisible(true);
            }
          }}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name={swipeMode ? 'view-list' : 'cards'} size={18} color={swipeMode ? '#CA8A04' : '#FAFAF9'} />
          <Text style={[styles.swipeModeBtnText, swipeMode && { color: '#CA8A04' }]}>{swipeMode ? 'Список' : 'Листати'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBarBtn} onPress={() => {
          if (!user?.id) {
            Alert.alert(text.errorTitle, text.authRequired);
            return;
          }
          setAddFormVisible(true);
        }} activeOpacity={0.85}>
          <Text style={styles.addBarBtnText}>{text.addRequest}</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={addFormVisible} transparent animationType="slide" onRequestClose={handleRequestCloseModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={handleRequestCloseModal} />
          <View style={styles.sheetWrapper}>
            <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{text.formTitle}</Text>
              <TouchableOpacity onPress={handleRequestCloseModal} style={styles.sheetCloseBtn} activeOpacity={0.7}>
                <Text style={styles.sheetCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
              style={styles.sheetScroll}
            >
              <View style={styles.sectionDivider}>
                <View style={styles.sectionDividerLine} />
                <Text style={styles.sectionDividerText}>{text.sectionMain}</Text>
                <View style={styles.sectionDividerLine} />
              </View>
              <Text style={styles.formLabel}>{text.categoryLabel}</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={category} onValueChange={setCategory} style={styles.picker}>
                  <Picker.Item label={text.selectCategory} value="" />
                  {CONTACT_CATEGORY_VALUES.map((value) => (
                    <Picker.Item key={value} label={getCategoryLabel(value)} value={value} />
                  ))}
                </Picker>
              </View>
              <InlineFieldHint message={text.categoryHint} type={category ? 'success' : 'hint'} />
              <FormFieldError error={!category && submitAttempted ? text.errorFill : undefined} />

              <Text style={styles.formLabel}>{text.conditionLabel}</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={condition} onValueChange={(itemValue) => setCondition(itemValue)} style={styles.picker}>
                  <Picker.Item label={text.selectCondition} value="" />
                  {ITEM_CONDITION_VALUES.map((value) => (
                    <Picker.Item key={value} label={text.conditionLabels[value]} value={value} />
                  ))}
                </Picker>
              </View>
              <InlineFieldHint message={text.conditionHint} type={condition ? 'success' : 'hint'} />
              <FormFieldError error={!condition && submitAttempted ? text.errorFill : undefined} />

              <Text style={styles.formLabel}>{text.priceLabel}</Text>
              <TextInput
                placeholder="0"
                value={price}
                onChangeText={(value) => setPrice(value.replace(',', '.').replace(/[^\d.]/g, ''))}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholderTextColor="#A0938D"
              />
              <InlineFieldHint message={text.ageHint} type={price.trim() ? 'success' : 'hint'} />
              <FormFieldError error={submitAttempted && (!price.trim() || Number(price) <= 0) ? text.priceError : undefined} />

              <Text style={styles.formLabel}>{text.descriptionLabel}</Text>
              <TextInput
                placeholder={text.descriptionLabel}
                value={description}
                onChangeText={setDescription}
                style={[styles.input, styles.textarea]}
                placeholderTextColor="#A0938D"
                multiline
                maxLength={260}
              />
              <InlineFieldHint message={text.descriptionHint} type={description.trim() ? 'success' : 'hint'} />
              <FormFieldError error={submitAttempted && !description.trim() ? text.descriptionRequired : undefined} />

              <Text style={styles.formLabel}>{text.phoneLabel}</Text>
              <TextInput placeholder="+380..." value={phone} onChangeText={(value) => setPhone(normalizePhoneText(value))} keyboardType="phone-pad" style={styles.input} placeholderTextColor="#A0938D" />
              <InlineFieldHint message={text.phoneHint} type={phone.replace(/\D/g, '').length >= 7 ? 'success' : 'hint'} />
              <FormFieldError error={submitAttempted && phone.replace(/\D/g, '').length < 7 ? text.errorPhone : undefined} />

              <View style={styles.sectionDivider}>
                <View style={styles.sectionDividerLine} />
                <Text style={styles.sectionDividerText}>{text.sectionExtra}</Text>
                <View style={styles.sectionDividerLine} />
              </View>

              <TouchableOpacity
                style={styles.interestingBtn}
                onPress={() => setIsInterestingFormExpanded((prev) => !prev)}
                activeOpacity={0.84}
              >
                <MaterialCommunityIcons name="star-four-points-outline" size={18} color="#7A1E5C" />
                <Text style={styles.interestingBtnText}>{text.makeInteresting}</Text>
              </TouchableOpacity>

              {isInterestingFormExpanded ? (
                <View style={styles.interestingSection}>
                  <Text style={styles.formLabel}>{text.zodiacLabel}</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker selectedValue={zodiacSign} onValueChange={setZodiacSign} style={styles.picker}>
                      <Picker.Item label={text.selectZodiac} value="" />
                      {ZODIAC_VALUES.map((value) => (
                        <Picker.Item key={value} label={text.zodiacLabels[value]} value={value} />
                      ))}
                    </Picker>
                  </View>

                  <Text style={styles.formLabel}>{text.humanDesignTypeLabel}</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker selectedValue={humanDesignType} onValueChange={setHumanDesignType} style={styles.picker}>
                      <Picker.Item label={text.selectHumanDesignType} value="" />
                      {HUMAN_DESIGN_TYPE_VALUES.map((value) => (
                        <Picker.Item key={value} label={text.humanDesignTypeLabels[value]} value={value} />
                      ))}
                    </Picker>
                  </View>

                  <Text style={styles.formLabel}>{text.humanDesignProfileLabel}</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker selectedValue={humanDesignProfile} onValueChange={setHumanDesignProfile} style={styles.picker}>
                      <Picker.Item label={text.selectHumanDesignProfile} value="" />
                      {HUMAN_DESIGN_PROFILE_VALUES.map((value) => (
                        <Picker.Item key={value} label={value} value={value} />
                      ))}
                    </Picker>
                  </View>

                  <TouchableOpacity style={styles.consultationLink} onPress={handleHumanDesignConsultation} activeOpacity={0.82}>
                    <MaterialCommunityIcons name="send-circle-outline" size={20} color="#2D7E4D" />
                    <Text style={styles.consultationLinkText}>{text.humanDesignConsultation}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <Text style={styles.formLabel}>{text.photoLabel}</Text>
              {user?.id ? (
                <PhotoUploadField
                  uid={user.id}
                  userName={user?.name ?? ''}
                  maxPhotos={5}
                  storagePath="contacts_listings"
                  onPhotosChange={setFormPhotos}
                />
              ) : (
                <Text style={styles.signInNote}>{text.authRequired}</Text>
              )}

              <View style={styles.toggleRow}>
                <Text style={styles.formLabel}>{text.showPhoneToggle}</Text>
                <Switch
                  value={showPhoneOnCard}
                  onValueChange={setShowPhoneOnCard}
                  trackColor={{ false: '#E8DDD3', true: '#6A8BA5' }}
                  thumbColor={showPhoneOnCard ? '#403933' : '#A0938D'}
                />
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>{text.submitBtn}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* Edit modal */}
      <Modal visible={editFormVisible} transparent animationType="slide" onRequestClose={() => setEditFormVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setEditFormVisible(false)} />
          <View style={styles.sheetWrapper}>
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{text.editTitle}</Text>
                <TouchableOpacity onPress={() => setEditFormVisible(false)} style={styles.sheetCloseBtn} activeOpacity={0.7}>
                  <Text style={styles.sheetCloseTxt}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent} style={styles.sheetScroll}>
                <Text style={styles.formLabel}>{text.categoryLabel}</Text>
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={editCategory} onValueChange={setEditCategory} style={styles.picker}>
                    <Picker.Item label={text.selectCategory} value="" />
                    {CONTACT_CATEGORY_VALUES.map((value) => (
                      <Picker.Item key={`edit-cat-${value}`} label={getCategoryLabel(value)} value={value} />
                    ))}
                  </Picker>
                </View>
                <FormFieldError error={!editCategory && editSubmitAttempted ? text.errorFill : undefined} />

                <Text style={styles.formLabel}>{text.conditionLabel}</Text>
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={editCondition} onValueChange={setEditCondition} style={styles.picker}>
                    <Picker.Item label={text.selectCondition} value="" />
                    {ITEM_CONDITION_VALUES.map((value) => (
                      <Picker.Item key={`edit-cond-${value}`} label={text.conditionLabels[value]} value={value} />
                    ))}
                  </Picker>
                </View>
                <FormFieldError error={!editCondition && editSubmitAttempted ? text.errorFill : undefined} />

                <Text style={styles.formLabel}>{text.priceLabel}</Text>
                <TextInput placeholder="0" value={editPrice} onChangeText={(v) => setEditPrice(v.replace(',', '.').replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" style={styles.input} placeholderTextColor="#A0938D" />
                <FormFieldError error={editSubmitAttempted && (!editPrice.trim() || Number(editPrice) <= 0) ? text.priceError : undefined} />

                <Text style={styles.formLabel}>{text.descriptionLabel}</Text>
                <TextInput placeholder={text.descriptionLabel} value={editDescription} onChangeText={setEditDescription} style={[styles.input, styles.textarea]} placeholderTextColor="#A0938D" multiline maxLength={260} />
                <FormFieldError error={editSubmitAttempted && !editDescription.trim() ? text.descriptionRequired : undefined} />

                <Text style={styles.formLabel}>{text.phoneLabel}</Text>
                <TextInput placeholder="+380..." value={editPhone} onChangeText={(v) => setEditPhone(normalizePhoneText(v))} keyboardType="phone-pad" style={styles.input} placeholderTextColor="#A0938D" />
                <FormFieldError error={editSubmitAttempted && editPhone.replace(/\D/g, '').length < 7 ? text.errorPhone : undefined} />

                <Text style={styles.formLabel}>{text.zodiacLabel}</Text>
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={editZodiac} onValueChange={setEditZodiac} style={styles.picker}>
                    <Picker.Item label={text.selectZodiac} value="" />
                    {ZODIAC_VALUES.map((value) => (
                      <Picker.Item key={`edit-z-${value}`} label={text.zodiacLabels[value]} value={value} />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.formLabel}>{text.humanDesignTypeLabel}</Text>
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={editHdType} onValueChange={setEditHdType} style={styles.picker}>
                    <Picker.Item label={text.selectHumanDesignType} value="" />
                    {HUMAN_DESIGN_TYPE_VALUES.map((value) => (
                      <Picker.Item key={`edit-hd-${value}`} label={text.humanDesignTypeLabels[value]} value={value} />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.formLabel}>{text.humanDesignProfileLabel}</Text>
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={editHdProfile} onValueChange={setEditHdProfile} style={styles.picker}>
                    <Picker.Item label={text.selectHumanDesignProfile} value="" />
                    {HUMAN_DESIGN_PROFILE_VALUES.map((value) => (
                      <Picker.Item key={`edit-hdp-${value}`} label={value} value={value} />
                    ))}
                  </Picker>
                </View>

                <View style={styles.toggleRow}>
                  <Text style={styles.formLabel}>{text.showPhoneToggle}</Text>
                  <Switch value={editShowPhone} onValueChange={setEditShowPhone} trackColor={{ false: '#E8DDD3', true: '#6A8BA5' }} thumbColor={editShowPhone ? '#403933' : '#A0938D'} />
                </View>

                <TouchableOpacity style={styles.submitBtn} onPress={handleEditSubmit} activeOpacity={0.85} disabled={editSubmitting}>
                  {editSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{text.editSaveBtn}</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <MiniTabBar />
      <ContactReasonModal
        visible={contactModalVisible}
        pending={contactPending}
        target={contactTarget}
        onSelect={(reason) => void sendContactRequest(reason)}
        onClose={closeContactModal}
      />
      <VideoLoadingOverlay visible={!listingsReady} />
    </SafeAreaView>
  );
};

// Elegant Luxury Design System — ChaikaUA Знайомства на каву
// Colors: Primary #1C1917, Gold #CA8A04, Background #FAFAF9, Text #0C0A09
// Style: Liquid Glass + Premium Black/Gold
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF9' },
  content: { padding: 16, paddingTop: 24, paddingBottom: 110 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(12,10,9,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '84%',
    paddingBottom: 16,
    borderTopWidth: 1,
    borderColor: '#E8D9B5',
  },
  modalHandle: { width: 42, height: 4, borderRadius: 99, backgroundColor: '#CA8A04', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E8D9B5',
  },
  modalTitle: { color: '#1C1917', fontSize: 17, fontWeight: '900', flex: 1, paddingRight: 8, letterSpacing: 0.3 },
  modalCloseBtn: { backgroundColor: '#1C1917', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  modalCloseText: { color: '#CA8A04', fontWeight: '800', fontSize: 12 },
  modalContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  resetBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E8D9B5',
    backgroundColor: '#FAFAF9',
    alignItems: 'center',
    paddingVertical: 12,
  },
  resetBtnText: { color: '#44403C', fontWeight: '700', fontSize: 13 },
  applyBtn: { flex: 1, borderRadius: 16, backgroundColor: '#1C1917', alignItems: 'center', paddingVertical: 12 },
  applyBtnText: { color: '#CA8A04', fontWeight: '800', fontSize: 13 },
  headerCard: {
    backgroundColor: '#1C1917',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CA8A04',
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#FAFAF9', marginTop: 8, letterSpacing: 0.5 },
  headerSubtitle: { marginTop: 6, color: '#B5A990', textAlign: 'center', fontSize: 13 },
  liveLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 },
  liveDot: { color: '#CA8A04', fontSize: 12, fontWeight: '900', marginRight: 4 },
  liveText: { color: '#CA8A04', fontSize: 11, fontWeight: '900', marginRight: 6 },
  liveCount: { color: '#B5A990', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  formLabel: { fontWeight: '700', color: '#1C1917', marginBottom: 8, marginTop: 8, letterSpacing: 0.2 },
  signInNote: { color: '#44403C', fontSize: 13, fontWeight: '700', paddingVertical: 10, lineHeight: 18 },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#0C0A09',
    borderWidth: 1.5,
    borderColor: '#E8D9B5',
    fontSize: 15,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  pickerWrapper: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1.5, borderColor: '#E8D9B5', overflow: 'hidden' },
  picker: { color: '#0C0A09', height: 50 },
  submitBtn: { backgroundColor: '#CA8A04', borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  submitBtnText: { color: '#1C1917', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },
  topAnketySection: { marginBottom: 18 },
  topAnketyTitle: { fontSize: 11, fontWeight: '800', color: '#44403C', marginBottom: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  topAnketyScroll: { paddingHorizontal: 4, gap: 14 },
  topAnketyItem: { width: 72, alignItems: 'center' },
  topAnketyPhoto: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F5EDD6', borderWidth: 2, borderColor: '#CA8A04' },
  topAnketyName: { fontSize: 11, fontWeight: '700', color: '#1C1917', textAlign: 'center', width: 72, marginTop: 5 },
  topAnketyAge: { fontSize: 10, fontWeight: '600', color: '#44403C', textAlign: 'center' },
  listingsSection: { marginBottom: 16 },
  listingsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  listingsSectionTitle: { fontSize: 16, fontWeight: '900', color: '#1C1917', letterSpacing: 0.3 },
  searchBtn: { backgroundColor: '#1C1917', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  searchBtnText: { color: '#CA8A04', fontWeight: '800', fontSize: 12 },
  clearSearchBtn: { alignSelf: 'flex-start', marginBottom: 10 },
  clearSearchText: { color: '#CA8A04', fontWeight: '800', fontSize: 12 },
  emptyFiltered: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8D9B5',
    padding: 18,
    marginBottom: 8,
  },
  emptyFilteredTitle: { color: '#1C1917', fontWeight: '800', fontSize: 14 },
  emptyFilteredSub: { color: '#44403C', marginTop: 4, fontSize: 12, lineHeight: 18 },
  listingCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E8D9B5' },
  listingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  listingName: { fontWeight: '800', color: '#1C1917', flex: 1, marginRight: 8 },
  deleteText: { color: '#B91C1C', fontWeight: '700' },
  listingMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  listingBadgeText: { fontSize: 11, fontWeight: '700', color: '#44403C' },
  listingPrice: { fontSize: 15, fontWeight: '900', color: '#CA8A04' },
  statusBadge: { fontSize: 11, fontWeight: '900', color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  listingDescription: { color: '#44403C', lineHeight: 18, marginBottom: 8 },
  listingPhoto: { width: '100%', height: 170, borderRadius: 16, marginBottom: 8, backgroundColor: '#F5EDD6' },
  moderationInfo: { color: '#78350F', backgroundColor: '#FEF9C3', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  // Elegant Luxury card — premium black/gold palette
  kCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8D9B5',
    elevation: 2,
    shadowColor: '#CA8A04',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  kCardTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  kAvatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  kInfo: {
    flex: 1,
    gap: 6,
  },
  kNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  kName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1917',
    flexShrink: 1,
    letterSpacing: 0.2,
  },
  kMetaChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  kCategoryBadge: {
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: '#E8D9B5',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '52%',
  },
  kCategoryText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  kArchiveBadge: { fontSize: 10, fontWeight: '700', color: '#FAFAF9', backgroundColor: '#44403C', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden', flexShrink: 0 },
  kConditionBadge: {
    backgroundColor: '#F5EDD6',
    borderWidth: 1,
    borderColor: '#E8D9B5',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  kConditionText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#44403C',
  },
  kAgeBadge: {
    backgroundColor: '#1C1917',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 'auto' as const,
  },
  kAgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#CA8A04',
  },
  kDescBox: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1C1917',
  },
  kDescText: {
    fontSize: 12,
    color: '#FAFAF9',
    lineHeight: 17,
    fontWeight: '600',
  },
  kInterestingChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  kInterestingChip: {
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: '#E8D9B5',
    borderRadius: 999,
    color: '#92400E',
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kModInfo: {
    fontSize: 11,
    color: '#78350F',
    backgroundColor: '#FEF9C3',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    lineHeight: 16,
    fontWeight: '700',
  },
  kPhoto: {
    width: 92,
    height: 108,
    borderRadius: 14,
    backgroundColor: '#F5EDD6',
  },
  sectionDivider: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 18,
    marginBottom: 6,
  },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: '#E8D9B5' },
  sectionDividerText: { fontSize: 10, fontWeight: '900' as const, color: '#44403C', textTransform: 'uppercase' as const, letterSpacing: 1.5 },
  kOwnActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  kEditLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  kEditLinkText: { color: '#CA8A04', fontSize: 11, fontWeight: '800' },
  kDeleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  kDeleteLinkText: { color: '#B91C1C', fontSize: 11, fontWeight: '800' },
  interestingBtn: {
    alignItems: 'center',
    backgroundColor: '#FEF9C3',
    borderColor: '#E8D9B5',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  interestingBtnText: { color: '#92400E', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  interestingSection: {
    backgroundColor: '#FAFAF9',
    borderColor: '#E8D9B5',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    padding: 14,
  },
  consultationLink: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
  },
  consultationLinkText: { color: '#CA8A04', flex: 1, fontSize: 13, fontWeight: '900', lineHeight: 18 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#E8D9B5',
  },
  addBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: '#FAFAF9',
    borderTopWidth: 1,
    borderTopColor: '#E8D9B5',
  },
  addBarBtn: {
    flex: 1,
    backgroundColor: '#1C1917',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CA8A04',
  },
  addBarBtnText: { color: '#CA8A04', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  swipeModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1C1917',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#44403C',
  },
  swipeModeBtnText: { color: '#FAFAF9', fontSize: 14, fontWeight: '900' },
  // Swipe mode overlay
  swipeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0C0A09',
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  swipeCard: {
    width: 320,
    height: 460,
    borderRadius: 24,
    backgroundColor: '#1C1917',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#CA8A04',
    elevation: 12,
    shadowColor: '#CA8A04',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  swipeCardBack: {
    position: 'absolute',
    transform: [{ scale: 0.95 }],
    opacity: 0.6,
  },
  swipePhoto: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  swipeLikeOverlay: {
    position: 'absolute',
    top: 32,
    left: 24,
    backgroundColor: 'rgba(202,138,4,0.9)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    transform: [{ rotate: '-12deg' }],
  },
  swipeLikeText: { color: '#1C1917', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  swipePassOverlay: {
    position: 'absolute',
    top: 32,
    right: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#FAFAF9',
    transform: [{ rotate: '12deg' }],
  },
  swipePassText: { color: '#FAFAF9', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  swipeInfoBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(12,10,9,0.82)',
    padding: 16,
    gap: 6,
  },
  swipeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swipeName: { fontSize: 22, fontWeight: '900', color: '#FAFAF9', flex: 1 },
  swipeAge: { fontSize: 18, fontWeight: '800', color: '#CA8A04' },
  swipeChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  swipeChip: { backgroundColor: 'rgba(202,138,4,0.18)', borderWidth: 1, borderColor: '#CA8A04', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, color: '#CA8A04', fontSize: 11, fontWeight: '800' },
  swipeDesc: { color: '#B5A990', fontSize: 13, lineHeight: 18 },
  swipeActions: {
    position: 'absolute',
    bottom: -90,
    flexDirection: 'row',
    gap: 40,
    alignSelf: 'center',
    alignItems: 'center',
  },
  swipePassBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FAFAF9',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  swipeLikeBtn: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#CA8A04',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#CA8A04',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  swipeCounter: { position: 'absolute', top: 60, alignSelf: 'center', color: '#B5A990', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  swipeBackBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(28,25,23,0.85)',
    borderWidth: 1,
    borderColor: '#CA8A04',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 10,
  },
  swipeBackBtnText: { color: '#CA8A04', fontSize: 13, fontWeight: '800' },
  swipeDoneBox: { alignItems: 'center', gap: 12, padding: 32 },
  swipeDoneTitle: { fontSize: 22, fontWeight: '900', color: '#FAFAF9', textAlign: 'center' },
  swipeDoneSub: { fontSize: 16, color: '#CA8A04', fontWeight: '700' },
  swipeRestartBtn: { backgroundColor: '#CA8A04', borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  swipeRestartBtnText: { color: '#1C1917', fontWeight: '900', fontSize: 15 },
  swipeFilterBackdrop: { flex: 1, backgroundColor: 'rgba(12,10,9,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  swipeFilterSheet: {
    backgroundColor: '#1C1917',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    borderWidth: 1,
    borderColor: '#44403C',
    gap: 20,
  },
  swipeFilterTitle: { fontSize: 20, fontWeight: '900', color: '#FAFAF9', textAlign: 'center' },
  swipeFilterPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  swipeFilterPill: {
    borderWidth: 1,
    borderColor: '#44403C',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#292524',
  },
  swipeFilterPillActive: { borderColor: '#CA8A04', backgroundColor: 'rgba(202,138,4,0.15)' },
  swipeFilterPillText: { color: '#B5A990', fontSize: 14, fontWeight: '700' },
  swipeFilterPillTextActive: { color: '#CA8A04' },
  swipeFilterAgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  swipeFilterAgeLabel: { color: '#B5A990', fontSize: 14, fontWeight: '700' },
  swipeFilterAgeInput: {
    backgroundColor: '#292524',
    borderWidth: 1,
    borderColor: '#44403C',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FAFAF9',
    fontSize: 16,
    fontWeight: '800',
    width: 70,
    textAlign: 'center',
  },
  swipeFilterStartBtn: { backgroundColor: '#CA8A04', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  swipeFilterStartBtnText: { color: '#1C1917', fontWeight: '900', fontSize: 16 },
  swipeFilterSkipBtn: { alignItems: 'center', paddingVertical: 4 },
  swipeFilterSkipText: { color: '#78716C', fontSize: 13, fontWeight: '700' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,10,9,0.6)' },
  sheetWrapper: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '92%',
    paddingBottom: 32,
    shadowColor: '#CA8A04',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
    borderTopWidth: 1,
    borderColor: '#E8D9B5',
  },
  sheetScroll: { flexGrow: 0 },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CA8A04',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E8D9B5',
  },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: '#1C1917', letterSpacing: 0.3 },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1917',
    borderWidth: 1,
    borderColor: '#CA8A04',
  },
  sheetCloseTxt: { fontSize: 16, color: '#CA8A04', fontWeight: '900' },
  sheetContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
});

export default KontaktiChaikyScreen;

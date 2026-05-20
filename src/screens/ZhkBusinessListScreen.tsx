import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { equalTo, get, orderByChild, query, ref, runTransaction, set } from 'firebase/database';
import { database } from '../firebase-config';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import MiniTabBar from '../components/MiniTabBar';
import MiniUserAvatar from '../components/MiniUserAvatar';
import AppPhotoImage from '../components/AppPhotoImage';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { resolveMediaAccessUrls } from '../services/mediaAccess';
import { resolveUserAvatarMap } from '../utils/userAvatar';
import { useContactRequest } from '../hooks/useContactRequest';
import ContactReasonModal from '../components/ContactReasonModal';
import { safeCallPhone } from '../utils/communicationActions';
import type { DetailItemData } from '../utils/detailViewTypes';
import { normalizePhoneText } from '../utils/textUtils';
import { normalizeUkrainianPhoneStrict } from '../utils/validators';
import { safeLogError } from '../utils/errorLogger';

// --- Types --------------------------------------------------------------------

type BusinessItem = {
  id: string;
  userId?: string;
  contactName: string;
  phone: string;
  categoryKey: string;
  categoryLabel: string;
  subcategoryKey: string;
  subcategoryLabel: string;
  description: string;
  photoUri?: string;
  photoStoragePath?: string;
  status: string;
  createdAt?: string | number;
  likeCount?: number;
  likesByUserId?: Record<string, true>;
  ratingByUserId?: Record<string, number>;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  updatedAt?: string;
  version?: number;
  rejectionReason?: string;
};

type MyBusinessRequest = Pick<BusinessItem, 'status' | 'rejectionReason' | 'version' | 'createdAt'> | null;
type SubmitStage = 'validate' | 'checkPending' | 'write';

type BusinessSubcategory = { key: string; ua: string; ru: string; en: string };
type BusinessCategory = {
  key: string;
  ua: string;
  ru: string;
  en: string;
  subs: BusinessSubcategory[];
};

const BUSINESS_CATEGORIES: BusinessCategory[] = [
  {
    key: 'food', ua: 'Їжа та випічка', ru: 'Еда и выпечка', en: 'Food & Baking',
    subs: [
      { key: 'pies', ua: 'Пироги / пиріжки', ru: 'Пироги / пирожки', en: 'Pies / pastries' },
      { key: 'cakes', ua: 'Торти на замовлення', ru: 'Торты на заказ', en: 'Custom cakes' },
      { key: 'meals', ua: 'Готові страви на замовлення', ru: 'Готовые блюда на заказ', en: 'Ready meals on order' },
      { key: 'other_food', ua: 'Інша їжа', ru: 'Другая еда', en: 'Other food' },
    ],
  },
  {
    key: 'beauty', ua: 'Краса та догляд', ru: 'Красота и уход', en: 'Beauty & Care',
    subs: [
      { key: 'haircut', ua: 'Стрижка волосся', ru: 'Стрижка волос', en: 'Haircut' },
      { key: 'manicure', ua: 'Манікюр / педикюр', ru: 'Маникюр / педикюр', en: 'Manicure / pedicure' },
      { key: 'massage', ua: 'Масаж', ru: 'Массаж', en: 'Massage' },
      { key: 'cosmetology', ua: 'Косметологія', ru: 'Косметология', en: 'Cosmetology' },
    ],
  },
  {
    key: 'repair', ua: 'Ремонт та майстри', ru: 'Ремонт и мастера', en: 'Repair & Craftsmen',
    subs: [
      { key: 'phones', ua: 'Ремонт телефонів / планшетів', ru: 'Ремонт телефонов / планшетов', en: 'Phone / tablet repair' },
      { key: 'appliance', ua: 'Ремонт побутової техніки', ru: 'Ремонт бытовой техники', en: 'Home appliance repair' },
      { key: 'plumbing', ua: 'Сантехнічні роботи', ru: 'Сантехнические работы', en: 'Plumbing works' },
      { key: 'electric', ua: 'Електрика', ru: 'Электрика', en: 'Electrical works' },
      { key: 'handyman', ua: 'Майстер на годину', ru: 'Мастер на час', en: 'Handyman' },
    ],
  },
  {
    key: 'home', ua: 'Побут та дім', ru: 'Быт и дом', en: 'Home & Household',
    subs: [
      { key: 'cleaning', ua: 'Прибирання', ru: 'Уборка', en: 'Cleaning' },
      { key: 'nanny', ua: 'Няня / догляд за дітьми', ru: 'Няня / уход за детьми', en: 'Nanny / childcare' },
      { key: 'elderly', ua: 'Догляд за літніми людьми', ru: 'Уход за пожилыми', en: 'Elderly care' },
      { key: 'garden', ua: 'Догляд за рослинами', ru: 'Уход за растениями', en: 'Plant care' },
    ],
  },
  {
    key: 'education', ua: 'Навчання та розвиток', ru: 'Обучение и развитие', en: 'Education & Development',
    subs: [
      { key: 'math', ua: 'Репетиторство', ru: 'Репетиторство', en: 'Tutoring' },
      { key: 'languages', ua: 'Іноземні мови', ru: 'Иностранные языки', en: 'Foreign languages' },
      { key: 'fitness', ua: 'Фітнес / йога', ru: 'Фитнес / йога', en: 'Fitness / yoga' },
      { key: 'courses', ua: 'Курси та навчання', ru: 'Курсы и обучение', en: 'Courses & learning' },
    ],
  },
  {
    key: 'transport', ua: 'Транспорт та доставка', ru: 'Транспорт и доставка', en: 'Transport & Delivery',
    subs: [
      { key: 'taxi', ua: 'Підвезення / таксі', ru: 'Подвоз / такси', en: 'Rides / taxi' },
      { key: 'cargo', ua: 'Вантажоперевезення', ru: 'Грузоперевозки', en: 'Cargo transport' },
      { key: 'delivery', ua: 'Доставка', ru: 'Доставка', en: 'Delivery' },
      { key: 'carrepair', ua: 'Ремонт авто', ru: 'Ремонт авто', en: 'Car repair' },
    ],
  },
  {
    key: 'pets', ua: 'Тварини', ru: 'Животные', en: 'Pets',
    subs: [
      { key: 'walking', ua: 'Вигул собак', ru: 'Выгул собак', en: 'Dog walking' },
      { key: 'grooming', ua: 'Грумінг', ru: 'Груминг', en: 'Grooming' },
      { key: 'petsit', ua: 'Догляд за тваринами', ru: 'Уход за животными', en: 'Pet sitting' },
      { key: 'vet', ua: 'Ветеринарна допомога', ru: 'Ветеринарная помощь', en: 'Veterinary help' },
    ],
  },
  {
    key: 'health', ua: 'Здоров\'я та медицина', ru: 'Здоровье и медицина', en: 'Health & Medicine',
    subs: [
      { key: 'nurse', ua: 'Медсестра', ru: 'Медсестра', en: 'Nurse' },
      { key: 'psych', ua: 'Психолог', ru: 'Психолог', en: 'Psychologist' },
      { key: 'nutrition', ua: 'Дієтолог', ru: 'Диетолог', en: 'Dietitian' },
      { key: 'physio', ua: 'Фізіотерапевт', ru: 'Физиотерапевт', en: 'Physiotherapist' },
    ],
  },
  {
    key: 'photo', ua: 'Фото та відео', ru: 'Фото и видео', en: 'Photo & Video',
    subs: [
      { key: 'photo', ua: 'Фотограф', ru: 'Фотограф', en: 'Photographer' },
      { key: 'video', ua: 'Відеограф', ru: 'Видеограф', en: 'Videographer' },
      { key: 'retouch', ua: 'Ретуш фото', ru: 'Ретушь фото', en: 'Photo retouching' },
    ],
  },
  {
    key: 'it', ua: 'IT та цифрові послуги', ru: 'IT и цифровые услуги', en: 'IT & Digital Services',
    subs: [
      { key: 'pc_setup', ua: 'Комп\'ютери / Wi-Fi', ru: 'Компьютеры / Wi-Fi', en: 'PC / Wi-Fi setup' },
      { key: 'websites', ua: 'Сайти / лендинги', ru: 'Сайты / лендинги', en: 'Websites / landing pages' },
      { key: 'design', ua: 'Графічний дизайн', ru: 'Графический дизайн', en: 'Graphic design' },
      { key: 'smm', ua: 'SMM', ru: 'SMM', en: 'SMM' },
    ],
  },
  {
    key: 'other', ua: 'Інше', ru: 'Прочее', en: 'Other',
    subs: [
      { key: 'events', ua: 'Організація свят', ru: 'Организация праздников', en: 'Event organizing' },
      { key: 'rent', ua: 'Оренда речей', ru: 'Аренда вещей', en: 'Item rental' },
      { key: 'other2', ua: 'Інша послуга / товар', ru: 'Другая услуга / товар', en: 'Other service / product' },
    ],
  },
];

const DESC_MAX = 400;

// --- i18n ---------------------------------------------------------------------

const UI_TEXT = {
  ua: {
    title: 'Послуги Жителів ЖК',
    subtitle: 'Бізнес та послуги від ваших сусідів',
    searchPlaceholder: 'Пошук за ім\'ям або описом...',
    allCategories: 'Всі',
    call: 'Зателефонувати',
    contactLabel: 'контакт:',
    noResults: 'Нічого не знайдено',
    noResultsSub: 'Спробуйте змінити фільтр або пошуковий запит',
    loading: 'Завантаження...',
    errorLoad: 'Помилка завантаження. Спробуйте ще раз.',
    retry: 'Повторити',
    emptyList: 'Поки що немає активних пропозицій',
    emptyListSub: 'Будьте першим — додайте свій бізнес!',
    like: 'Лайк',
    liked: 'Вподобано',
    signInToLike: 'Увійдіть, щоб поставити лайк.',
    rating: 'Рейтинг',
    signInToRate: 'Увійдіть, щоб поставити оцінку.',
    priceFrom: 'від',
    priceTo: 'до',
    currencyDefault: '₴',
    noRatings: 'Оцінок ще немає',
    addRequest: 'Розповісти про свої послуги',
    formTitle: 'Мої послуги',
    categoryLabelForm: 'Напрямок діяльності',
    subcategoryLabelForm: 'Уточнення',
    nameLabel: 'Ваше ім\'я або назва',
    namePlaceholder: 'Як до вас звертатися?',
    phoneLabel: 'Контактний телефон',
    phonePlaceholder: '+380...',
    descriptionLabel: 'Опис',
    descriptionPlaceholder: 'Що саме пропонуєте? Ціни, умови, досвід...',
    photoLabel: 'Фото (необов\'язково)',
    selectCategory: 'Оберіть категорію...',
    selectSubcategory: 'Оберіть підкатегорію...',
    submitBtn: 'Надіслати на модерацію',
    successTitle: 'Успішно',
    successMsg: 'Вашу послугу надіслано на модерацію. Після перевірки вона з\'явиться у списку.',
    errorTitle: 'Помилка',
    errorFill: 'Заповніть усі обов\'язкові поля.',
    errorPhone: 'Перевірте номер телефону.',
    signInToSubmit: 'Увійдіть в акаунт, щоб розповісти про свої послуги.',
    charCount: 'символів',
    myRequestStatusTitle: 'Моя заявка',
    myRequestPending: 'На модерації',
    myRequestActive: 'Опубліковано',
    myRequestRejected: 'Відхилено',
    myRequestRejectedReason: 'Причина відхилення',
    myRequestPendingHint: 'Ви можете оновити дані — заявка залишиться на модерації.',
    pendingSoftGuardTitle: 'Заявка вже на модерації',
    pendingSoftGuardText: 'У вас вже є заявка на перевірці. Можете оновити її новими даними або повернутися до форми.',
    pendingSoftGuardUpdate: 'Оновити поточну заявку',
    pendingSoftGuardCancel: 'Скасувати',
    phoneInvalidStrict: 'Введіть телефон у форматі +380XXXXXXXXX, 380XXXXXXXXX або 0XXXXXXXXX.',
  },
  ru: {
    title: 'Услуги Жителей ЖК',
    subtitle: 'Бизнес и услуги от ваших соседей',
    searchPlaceholder: 'Поиск по имени или описанию...',
    allCategories: 'Все',
    call: 'Позвонить',
    contactLabel: 'контакт:',
    noResults: 'Ничего не найдено',
    noResultsSub: 'Попробуйте изменить фильтр или поисковый запрос',
    loading: 'Загрузка...',
    errorLoad: 'Ошибка загрузки. Попробуйте ещё раз.',
    retry: 'Повторить',
    emptyList: 'Пока нет активных предложений',
    emptyListSub: 'Будьте первым — добавьте свой бизнес!',
    like: 'Лайк',
    liked: 'Лайк поставлен',
    signInToLike: 'Войдите, чтобы поставить лайк.',
    rating: 'Рейтинг',
    signInToRate: 'Войдите, чтобы поставить оценку.',
    priceFrom: 'от',
    priceTo: 'до',
    currencyDefault: '₴',
    noRatings: 'Оценок пока нет',
    addRequest: 'Расссказать про свои услуги',
    formTitle: 'Мои услуги',
    categoryLabelForm: 'Направление деятельности',
    subcategoryLabelForm: 'Уточнение',
    nameLabel: 'Ваше имя или название',
    namePlaceholder: 'Как к вам обращаться?',
    phoneLabel: 'Контактный телефон',
    phonePlaceholder: '+380...',
    descriptionLabel: 'Описание',
    descriptionPlaceholder: 'Что именно предлагаете? Цены, условия, опыт...',
    photoLabel: 'Фото (необязательно)',
    selectCategory: 'Выберите категорию...',
    selectSubcategory: 'Выберите подкатегорию...',
    submitBtn: 'Отправить на модерацию',
    successTitle: 'Успешно',
    successMsg: 'Ваша услуга отправлена на модерацию. После проверки она появится в списке.',
    errorTitle: 'Ошибка',
    errorFill: 'Заполните все обязательные поля.',
    errorPhone: 'Проверьте номер телефона.',
    signInToSubmit: 'Войдите в аккаунт, чтобы рассказать про свои услуги.',
    charCount: 'символов',
    myRequestStatusTitle: 'Моя заявка',
    myRequestPending: 'На модерации',
    myRequestActive: 'Опубликовано',
    myRequestRejected: 'Отклонено',
    myRequestRejectedReason: 'Причина отклонения',
    myRequestPendingHint: 'Вы можете обновить данные — заявка останется на модерации.',
    pendingSoftGuardTitle: 'Заявка уже на модерации',
    pendingSoftGuardText: 'У вас уже есть заявка на проверке. Можно обновить её новыми данными или вернуться к форме.',
    pendingSoftGuardUpdate: 'Обновить текущую заявку',
    pendingSoftGuardCancel: 'Отмена',
    phoneInvalidStrict: 'Введите телефон в формате +380XXXXXXXXX, 380XXXXXXXXX или 0XXXXXXXXX.',
  },
  en: {
    title: 'Residents\' Services',
    subtitle: 'Business & services from your neighbors',
    searchPlaceholder: 'Search by name or description...',
    allCategories: 'All',
    call: 'Call',
    contactLabel: 'contact:',
    noResults: 'Nothing found',
    noResultsSub: 'Try changing the filter or search query',
    loading: 'Loading...',
    errorLoad: 'Load error. Please try again.',
    retry: 'Retry',
    emptyList: 'No active listings yet',
    emptyListSub: 'Be the first — add your business!',
    like: 'Like',
    liked: 'Liked',
    signInToLike: 'Sign in to like this listing.',
    rating: 'Rating',
    signInToRate: 'Sign in to rate this listing.',
    priceFrom: 'from',
    priceTo: 'to',
    currencyDefault: '₴',
    noRatings: 'No ratings yet',
    addRequest: 'Tell about your services',
    formTitle: 'My services',
    categoryLabelForm: 'Business direction',
    subcategoryLabelForm: 'Specialisation',
    nameLabel: 'Your name or business name',
    namePlaceholder: 'How should we address you?',
    phoneLabel: 'Contact phone',
    phonePlaceholder: '+380...',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'What do you offer? Prices, conditions, experience...',
    photoLabel: 'Photo (optional)',
    selectCategory: 'Select category...',
    selectSubcategory: 'Select subcategory...',
    submitBtn: 'Send to moderation',
    successTitle: 'Success',
    successMsg: 'Your service has been sent to moderation. It will appear after review.',
    errorTitle: 'Error',
    errorFill: 'Fill all required fields.',
    errorPhone: 'Check phone number.',
    signInToSubmit: 'Sign in to tell neighbors about your services.',
    charCount: 'characters',
    myRequestStatusTitle: 'My request',
    myRequestPending: 'In moderation',
    myRequestActive: 'Published',
    myRequestRejected: 'Rejected',
    myRequestRejectedReason: 'Rejection reason',
    myRequestPendingHint: 'You can update the details — the request will stay in moderation.',
    pendingSoftGuardTitle: 'Request already in moderation',
    pendingSoftGuardText: 'You already have a request under review. You can update it with the new details or return to the form.',
    pendingSoftGuardUpdate: 'Update current request',
    pendingSoftGuardCancel: 'Cancel',
    phoneInvalidStrict: 'Enter a phone in +380XXXXXXXXX, 380XXXXXXXXX, or 0XXXXXXXXX format.',
  },
};

function getPlaceholderIconName(categoryKey?: string): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  const key = (categoryKey || '').toLowerCase();
  if (key.includes('beauty') || key.includes('краса') || key.includes('крас')) return 'hair-dryer';
  if (key.includes('sport') || key.includes('фітнес') || key.includes('фитнес')) return 'dumbbell';
  if (key.includes('food') || key.includes('їжа') || key.includes('еда')) return 'silverware-fork-knife';
  if (key.includes('repair') || key.includes('ремонт')) return 'hammer-wrench';
  if (key.includes('education') || key.includes('освіта') || key.includes('образован')) return 'school-outline';
  if (key.includes('medicine') || key.includes('здоров') || key.includes('мед')) return 'medical-bag';
  if (key.includes('clean') || key.includes('прибиран') || key.includes('уборк')) return 'broom';
  if (key.includes('auto') || key.includes('car') || key.includes('авто')) return 'car-wrench';
  return 'storefront-outline';
}

function getBusinessPriceText(item: BusinessItem, text: typeof UI_TEXT.ua): string | undefined {
  const currency = item.currency || text.currencyDefault;
  if (item.priceMin != null && item.priceMax != null) return `${item.priceMin}–${item.priceMax} ${currency}`;
  if (item.priceMin != null) return `${text.priceFrom} ${item.priceMin} ${currency}`;
  if (item.priceMax != null) return `${text.priceTo} ${item.priceMax} ${currency}`;
  return undefined;
}

function mapToDetailData(item: BusinessItem, text: typeof UI_TEXT.ua): DetailItemData {
  return {
    id: item.id,
    title: item.contactName,
    description: item.description,
    phone: item.phone,
    photoUri: item.photoUri,
    photoStoragePath: item.photoStoragePath,
    price: getBusinessPriceText(item, text),
    category: item.categoryLabel,
    userId: item.userId,
    sourceType: 'buysell',
    sourceId: item.id,
  };
}

function getMyRequestStatusText(status: string | undefined, text: typeof UI_TEXT.ua): string {
  if (status === 'active') return text.myRequestActive;
  if (status === 'rejected') return text.myRequestRejected;
  return text.myRequestPending;
}

// --- Screen -------------------------------------------------------------------

export default function ZhkBusinessListScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector((state: RootState) => state.auth.user);
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const t = UI_TEXT[language];

  const [items, setItems] = useState<BusinessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string>>({});
  const [addFormVisible, setAddFormVisible] = useState(false);
  const [formCategoryKey, setFormCategoryKey] = useState('');
  const [formSubcategoryKey, setFormSubcategoryKey] = useState('');
  const [contactName, setContactName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('+380');
  const [description, setDescription] = useState('');
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [myRequest, setMyRequest] = useState<MyBusinessRequest>(null);
  const pickerActiveRef = React.useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const activeBusinessQuery = query(ref(database, 'local_business'), orderByChild('status'), equalTo('active'));
      const snap = await get(activeBusinessQuery);
      if (snap.exists()) {
        const raw = snap.val() as Record<string, Record<string, unknown>>;
        const active = Object.entries(raw)
          .map(([id, v]) => {
            const value = v as Omit<BusinessItem, 'id'>;
            const likesByUserId = value.likesByUserId && typeof value.likesByUserId === 'object'
              ? value.likesByUserId
              : {};
            const countedLikes = Object.keys(likesByUserId).length;
            const ratingByUserId = value.ratingByUserId && typeof value.ratingByUserId === 'object'
              ? value.ratingByUserId as Record<string, number>
              : {};
            return {
              ...value,
              id,
              likesByUserId,
              likeCount: typeof value.likeCount === 'number' ? Math.max(value.likeCount, countedLikes) : countedLikes,
              ratingByUserId,
            };
          })
          .filter((item) => item.status === 'active');
        // Sort newest first
        active.sort((a, b) => {
          const ta = typeof a.createdAt === 'number'
            ? a.createdAt
            : typeof a.createdAt === 'string'
              ? new Date(a.createdAt).getTime()
              : 0;
          const tb = typeof b.createdAt === 'number'
            ? b.createdAt
            : typeof b.createdAt === 'string'
              ? new Date(b.createdAt).getTime()
              : 0;
          return tb - ta;
        });
        const resolved = await resolveMediaAccessUrls(
          active,
          'local_business',
          (item) => item.photoStoragePath || item.photoUri || '',
          (item, url) => ({ ...item, photoUri: url }),
        );
        setItems(resolved);
      } else {
        setItems([]);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const loadMyRequest = useCallback(async () => {
    if (!user?.id) {
      setMyRequest(null);
      return;
    }

    try {
      const snap = await get(ref(database, `local_business/${user.id}`));
      if (!snap.exists()) {
        setMyRequest(null);
        return;
      }
      const value = snap.val() as Partial<BusinessItem>;
      setMyRequest({
        status: typeof value.status === 'string' ? value.status : 'pending',
        rejectionReason: typeof value.rejectionReason === 'string' ? value.rejectionReason : '',
        version: typeof value.version === 'number' ? value.version : undefined,
        createdAt: value.createdAt,
      });
    } catch {
      setMyRequest(null);
    }
  }, [user?.id]);

  useEffect(() => { void loadMyRequest(); }, [loadMyRequest]);

  useEffect(() => {
    const userIds = Array.from(new Set(items.map((item) => item.userId).filter((id): id is string => Boolean(id))));
    if (userIds.length === 0) return;
    let cancelled = false;
    void resolveUserAvatarMap(database, userIds).then((resolved) => {
      if (cancelled) return;
      setAvatarByUserId((prev) => ({ ...prev, ...resolved }));
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    if (!contactName.trim() && user?.name) {
      setContactName(user.name);
    }
  }, [contactName, user?.name]);

  // Unique categories from loaded data
  const categories = Array.from(
    new Map(items.map((i) => [i.categoryKey, i.categoryLabel])).entries()
  );

  const filtered = items.filter((item) => {
    const matchCat = !selectedCategory || item.categoryKey === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      item.contactName?.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      item.subcategoryLabel?.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const selectedFormCategory = BUSINESS_CATEGORIES.find((category) => category.key === formCategoryKey);
  const selectedFormSubcategory = selectedFormCategory?.subs.find((subcategory) => subcategory.key === formSubcategoryKey);
  const isSubmitFormValid = Boolean(formCategoryKey && formSubcategoryKey && contactName.trim() && phone.trim());

  const resetAddForm = useCallback(() => {
    setFormCategoryKey('');
    setFormSubcategoryKey('');
    setContactName(user?.name ?? '');
    setPhone('+380');
    setDescription('');
    setFormPhotos([]);
  }, [user?.name]);

  const handlePickerOpenChange = useCallback((isOpen: boolean) => {
    pickerActiveRef.current = isOpen;
  }, []);

  const handleRequestCloseAddForm = useCallback(() => {
    if (pickerActiveRef.current) return;
    setAddFormVisible(false);
  }, []);

  const handleFormCategoryChange = useCallback((nextCategory: string) => {
    setFormCategoryKey(nextCategory);
    setFormSubcategoryKey('');
  }, []);

  const logSubmitError = useCallback((errorValue: unknown, stage: SubmitStage, uid?: string, existingStatus?: string) => {
    safeLogError('ZhkBusinessListScreen.submitBusiness', errorValue, {
      uid: uid ?? user?.id ?? '',
      categoryKey: formCategoryKey,
      subcategoryKey: formSubcategoryKey,
      hasPhoto: formPhotos.some((photo) => photo.status === 'done'),
      existingStatus,
      stage,
    });
  }, [formCategoryKey, formPhotos, formSubcategoryKey, user?.id]);

  const confirmPendingUpdate = useCallback((): Promise<boolean> => new Promise((resolve) => {
    Alert.alert(
      t.pendingSoftGuardTitle,
      t.pendingSoftGuardText,
      [
        { text: t.pendingSoftGuardCancel, style: 'cancel', onPress: () => resolve(false) },
        { text: t.pendingSoftGuardUpdate, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  }), [t.pendingSoftGuardCancel, t.pendingSoftGuardText, t.pendingSoftGuardTitle, t.pendingSoftGuardUpdate]);

  const handleSubmitBusiness = useCallback(async () => {
    if (!user?.id) {
      Alert.alert(t.errorTitle, t.signInToSubmit);
      navigation.navigate('LoginScreen');
      return;
    }
    if (!isSubmitFormValid || !selectedFormCategory || !selectedFormSubcategory) {
      logSubmitError(new Error('Business submit validation failed: missing required fields'), 'validate');
      Alert.alert(t.errorTitle, t.errorFill);
      return;
    }
    const normalizedPhone = normalizeUkrainianPhoneStrict(phone);
    if (!normalizedPhone) {
      logSubmitError(new Error('Business submit validation failed: invalid phone format'), 'validate');
      Alert.alert(t.errorTitle, t.phoneInvalidStrict);
      return;
    }

    setSubmitting(true);
    let uidForLog = user.id;
    let existingStatusForLog: string | undefined;
    try {
      const firebaseUser = await ensureFirebaseAuth();
      const uid = firebaseUser.uid;
      uidForLog = uid;
      const businessRef = ref(database, `local_business/${uid}`);
      let existingSnap;
      try {
        existingSnap = await get(businessRef);
      } catch (errorValue) {
        logSubmitError(errorValue, 'checkPending', uid);
        Alert.alert(t.errorTitle, t.errorLoad);
        return;
      }
      const existing = existingSnap.exists() ? existingSnap.val() as Partial<BusinessItem> : null;
      const existingStatus = typeof existing?.status === 'string' ? existing.status : undefined;
      existingStatusForLog = existingStatus;

      if (existingStatus === 'pending') {
        const shouldUpdate = await confirmPendingUpdate();
        if (!shouldUpdate) {
          return;
        }
      }

      const firstPhoto = formPhotos.find((photo) => photo.status === 'done');
      const previousVersion = typeof existing?.version === 'number' ? existing.version : (existing ? 1 : 0);
      const now = new Date().toISOString();
      const entry = {
        uid,
        userId: uid,
        categoryKey: formCategoryKey,
        categoryLabel: selectedFormCategory[language],
        subcategoryKey: formSubcategoryKey,
        subcategoryLabel: selectedFormSubcategory[language],
        contactName: contactName.trim() || user.name || selectedFormSubcategory[language],
        phone: normalizedPhone,
        description: description.trim(),
        photoStoragePath: firstPhoto?.storagePath ?? '',
        photoUri: firstPhoto?.downloadUrl ?? '',
        language,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        version: previousVersion + 1,
        status: 'pending',
        moderatedAt: null,
        moderatedBy: null,
        moderationReason: null,
        rejectionReason: null,
      };

      await set(businessRef, entry);
      Alert.alert(t.successTitle, t.successMsg);
      resetAddForm();
      setAddFormVisible(false);
      setMyRequest({
        status: 'pending',
        rejectionReason: '',
        version: entry.version,
        createdAt: entry.createdAt,
      });
      void loadMyRequest();
      void loadData();
    } catch (errorValue) {
      logSubmitError(errorValue, 'write', uidForLog, existingStatusForLog);
      Alert.alert(t.errorTitle, t.errorLoad);
    } finally {
      setSubmitting(false);
    }
  }, [
    contactName,
    description,
    formCategoryKey,
    formPhotos,
    formSubcategoryKey,
    isSubmitFormValid,
    language,
    loadData,
    loadMyRequest,
    logSubmitError,
    navigation,
    phone,
    resetAddForm,
    selectedFormCategory,
    selectedFormSubcategory,
    confirmPendingUpdate,
    t.errorFill,
    t.errorLoad,
    t.errorTitle,
    t.phoneInvalidStrict,
    t.signInToSubmit,
    t.successMsg,
    t.successTitle,
    user?.id,
    user?.name,
  ]);

  const handleLike = useCallback(async (itemId: string) => {
    const uid = user?.id;
    if (!isAuthenticated || !uid) {
      Alert.alert(t.like, t.signInToLike);
      return;
    }
    const current = items.find((entry) => entry.id === itemId);
    if (current?.likesByUserId?.[uid]) return;

    try {
      const result = await runTransaction(ref(database, `local_business/${itemId}`), (rawCurrent) => {
        const data = (rawCurrent || {}) as Record<string, unknown>;
        const likesByUserId = (data.likesByUserId && typeof data.likesByUserId === 'object'
          ? data.likesByUserId
          : {}) as Record<string, true>;
        if (likesByUserId[uid]) return rawCurrent;
        const nextLikesByUserId: Record<string, true> = { ...likesByUserId, [uid]: true };
        return {
          ...data,
          likesByUserId: nextLikesByUserId,
          likeCount: Object.keys(nextLikesByUserId).length,
        };
      });
      const updated = result.snapshot.val() as (BusinessItem | null);
      if (!updated) return;
      setItems((prev) => prev.map((entry) => {
        if (entry.id !== itemId) return entry;
        const likesByUserId = updated.likesByUserId && typeof updated.likesByUserId === 'object'
          ? updated.likesByUserId
          : {};
        return {
          ...entry,
          likesByUserId,
          likeCount: typeof updated.likeCount === 'number' ? updated.likeCount : Object.keys(likesByUserId).length,
        };
      }));
    } catch {
      // keep current state on network/db error
    }
  }, [isAuthenticated, items, t.like, t.signInToLike, user?.id]);

  const handleRating = useCallback(async (itemId: string, stars: number) => {
    const uid = user?.id;
    if (!isAuthenticated || !uid) {
      Alert.alert(t.rating, t.signInToRate);
      return;
    }
    const current = items.find((entry) => entry.id === itemId);
    if (current?.ratingByUserId?.[uid]) return;

    try {
      const result = await runTransaction(ref(database, `local_business/${itemId}`), (rawCurrent) => {
        const data = (rawCurrent || {}) as Record<string, unknown>;
        const ratingByUserId = (data.ratingByUserId && typeof data.ratingByUserId === 'object'
          ? data.ratingByUserId
          : {}) as Record<string, number>;
        if (ratingByUserId[uid]) return rawCurrent;
        return {
          ...data,
          ratingByUserId: { ...ratingByUserId, [uid]: stars },
        };
      });
      const updated = result.snapshot.val() as (BusinessItem | null);
      if (!updated) return;
      setItems((prev) => prev.map((entry) => {
        if (entry.id !== itemId) return entry;
        const ratingByUserId = updated.ratingByUserId && typeof updated.ratingByUserId === 'object'
          ? updated.ratingByUserId as Record<string, number>
          : {};
        return { ...entry, ratingByUserId };
      }));
    } catch {
      // keep current state on error
    }
  }, [isAuthenticated, items, t.rating, t.signInToRate, user?.id]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t.title}</Text>
          <Text style={styles.headerSub}>{t.subtitle}</Text>
        </View>
        <View style={{ width: 42 }} />
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={SCREEN_THEME.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t.searchPlaceholder}
          placeholderTextColor={SCREEN_THEME.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close-circle" size={18} color={SCREEN_THEME.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {isAuthenticated && myRequest ? (
        <View style={styles.myRequestCard}>
          <View style={styles.myRequestHeader}>
            <MaterialCommunityIcons name="clipboard-text-clock-outline" size={18} color={SCREEN_THEME.terracotta} />
            <Text style={styles.myRequestTitle}>{t.myRequestStatusTitle}</Text>
          </View>
          <Text style={styles.myRequestStatus}>{getMyRequestStatusText(myRequest.status, t)}</Text>
          {myRequest.status === 'pending' ? (
            <Text style={styles.myRequestHint}>{t.myRequestPendingHint}</Text>
          ) : null}
          {myRequest.status === 'rejected' && myRequest.rejectionReason ? (
            <Text style={styles.myRequestReason}>
              {t.myRequestRejectedReason}: {myRequest.rejectionReason}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Category filter chips */}
      {!loading && !error && categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsContent}
        >
          <TouchableOpacity
            style={[styles.chip, !selectedCategory && styles.chipActive]}
            onPress={() => setSelectedCategory('')}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, !selectedCategory && styles.chipTextActive]}>{t.allCategories}</Text>
          </TouchableOpacity>
          {categories.map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.chip, selectedCategory === key && styles.chipActive]}
              onPress={() => setSelectedCategory(selectedCategory === key ? '' : key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, selectedCategory === key && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} />
          <Text style={styles.centerText}>{t.loading}</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="wifi-off" size={48} color={SCREEN_THEME.textMuted} />
          <Text style={styles.centerText}>{t.errorLoad}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { void loadData(); }}>
            <Text style={styles.retryText}>{t.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="store-outline" size={56} color={SCREEN_THEME.textMuted} />
          <Text style={styles.centerText}>{t.emptyList}</Text>
          <Text style={styles.centerSub}>{t.emptyListSub}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="filter-off-outline" size={48} color={SCREEN_THEME.textMuted} />
          <Text style={styles.centerText}>{t.noResults}</Text>
          <Text style={styles.centerSub}>{t.noResultsSub}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((item) => (
              <BusinessCard
                key={item.id}
                item={item}
                avatarUri={(item.userId && avatarByUserId[item.userId]) || ''}
                onLike={handleLike}
                onRate={handleRating}
                currentUserId={user?.id}
              onContact={item.userId && item.userId !== user?.id ? () => openContactModal({ userId: item.userId as string, name: item.contactName, sourceType: 'buysell', sourceId: item.id, sourceTitle: item.contactName }) : undefined}
              />
          ))}
        </ScrollView>
      )}

      <View style={styles.addBar}>
        <TouchableOpacity style={styles.addBarBtn} onPress={() => setAddFormVisible(true)} activeOpacity={0.85}>
          <Text style={styles.addBarBtnText}>{t.addRequest}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={addFormVisible} transparent animationType="slide" onRequestClose={handleRequestCloseAddForm}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={handleRequestCloseAddForm} />
          <View style={styles.sheetWrapper}>
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{t.formTitle}</Text>
                <TouchableOpacity onPress={handleRequestCloseAddForm} style={styles.sheetCloseBtn} activeOpacity={0.7}>
                  <Text style={styles.sheetCloseTxt}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.sheetContent}
                style={styles.sheetScroll}
              >
                <Text style={styles.formLabel}>{t.categoryLabelForm} *</Text>
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={formCategoryKey} onValueChange={handleFormCategoryChange} style={styles.picker}>
                    <Picker.Item label={t.selectCategory} value="" />
                    {BUSINESS_CATEGORIES.map((category) => (
                      <Picker.Item key={category.key} label={category[language]} value={category.key} />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.formLabel}>{t.subcategoryLabelForm} *</Text>
                <View style={styles.pickerWrapper}>
                  <Picker
                    selectedValue={formSubcategoryKey}
                    enabled={Boolean(selectedFormCategory)}
                    onValueChange={setFormSubcategoryKey}
                    style={styles.picker}
                  >
                    <Picker.Item label={t.selectSubcategory} value="" />
                    {(selectedFormCategory?.subs ?? []).map((subcategory) => (
                      <Picker.Item key={subcategory.key} label={subcategory[language]} value={subcategory.key} />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.formLabel}>{t.nameLabel}</Text>
                <TextInput
                  style={styles.input}
                  value={contactName}
                  onChangeText={setContactName}
                  placeholder={t.namePlaceholder}
                  placeholderTextColor={SCREEN_THEME.textMuted}
                  maxLength={60}
                />

                <Text style={styles.formLabel}>{t.phoneLabel} *</Text>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={(value) => setPhone(normalizePhoneText(value))}
                  placeholder={t.phonePlaceholder}
                  placeholderTextColor={SCREEN_THEME.textMuted}
                  keyboardType="phone-pad"
                  maxLength={18}
                />

                <Text style={styles.formLabel}>{t.descriptionLabel}</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  value={description}
                  onChangeText={(value) => setDescription(value.slice(0, DESC_MAX))}
                  placeholder={t.descriptionPlaceholder}
                  placeholderTextColor={SCREEN_THEME.textMuted}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{description.length}/{DESC_MAX} {t.charCount}</Text>

                <Text style={styles.formLabel}>{t.photoLabel}</Text>
                <PhotoUploadField
                  uid={user?.id ?? ''}
                  userName={user?.name ?? ''}
                  maxPhotos={1}
                  storagePath="local_business"
                  onPhotosChange={(photos) => setFormPhotos(photos.filter((photo) => photo.status === 'done'))}
                  onPickerOpenChange={handlePickerOpenChange}
                />

                <TouchableOpacity
                  style={[styles.submitBtn, (!isSubmitFormValid || submitting) && styles.submitBtnDisabled]}
                  onPress={() => void handleSubmitBusiness()}
                  activeOpacity={0.85}
                  disabled={!isSubmitFormValid || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>{t.submitBtn}</Text>
                  )}
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
    </SafeAreaView>
  );
}

// --- Business Card ------------------------------------------------------------

function BusinessCard({
  item,
  avatarUri,
  onLike,
  onRate,
  currentUserId,
  onContact,
}: {
  item: BusinessItem;
  avatarUri?: string;
  onLike: (itemId: string) => Promise<void>;
  onRate: (itemId: string, stars: number) => Promise<void>;
  currentUserId?: string;
  onContact?: () => void;
}) {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const t = UI_TEXT[language];
  const likeCount = typeof item.likeCount === 'number' ? item.likeCount : Object.keys(item.likesByUserId || {}).length;
  const hasLiked = Boolean(currentUserId && item.likesByUserId?.[currentUserId]);
  const placeholderIcon = getPlaceholderIconName(item.categoryKey);

  // Rating calculations
  const ratingValues = Object.values(item.ratingByUserId || {});
  const avgRating = ratingValues.length > 0
    ? ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length
    : 0;
  const ratingCount = ratingValues.length;
  const hasRated = Boolean(currentUserId && item.ratingByUserId?.[currentUserId]);

  // Price range
  const priceText = getBusinessPriceText(item, t);

  const handleCall = () => {
    void safeCallPhone(item.phone, language);
  };

  return (
    <TouchableWithoutFeedback
      onPress={() => navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item, t) })}
    >
      <View style={card.wrap}>

      {/* TOP: business photo LEFT + category/title RIGHT */}
      <View style={card.topRow}>
        {Boolean(item.photoUri || item.photoStoragePath) ? (
          <AppPhotoImage
            uri={item.photoUri}
            storagePath={item.photoStoragePath}
            style={card.businessPhoto}
            resizeMode="cover"
            debugLabel={`Business:${item.id}`}
          />
        ) : (
          <View style={card.photoPlaceholder}>
            <MaterialCommunityIcons name={placeholderIcon} size={98} color="#C8B89A" />
          </View>
        )}

        <View style={card.titleBlock}>
          <Text style={card.categoryLabel} numberOfLines={1}>{item.categoryLabel}</Text>
          <Text style={card.subcategoryLabel} numberOfLines={2}>
            {item.subcategoryLabel || item.categoryLabel}
          </Text>
          <View style={card.titleBottomGroup}>
            {priceText && (
              <View style={card.priceRow}>
                <MaterialCommunityIcons name="tag-outline" size={13} color={SCREEN_THEME.terracotta} />
                <Text style={card.priceText}>{priceText}</Text>
              </View>
            )}
            <View style={card.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => { void onRate(item.id, star); }}
                  disabled={hasRated}
                  hitSlop={{ top: 5, bottom: 5, left: 3, right: 3 }}
                  activeOpacity={hasRated ? 1 : 0.7}
                >
                  <MaterialCommunityIcons
                    name={star <= Math.round(avgRating) ? 'star' : 'star-outline'}
                    size={20}
                    color={star <= Math.round(avgRating) ? '#F5A623' : (hasRated ? '#D0C0A0' : '#C8B89A')}
                  />
                </TouchableOpacity>
              ))}
              {ratingCount > 0 ? (
                <Text style={card.ratingText}>{avgRating.toFixed(1)} ({ratingCount})</Text>
              ) : (
                <Text style={card.ratingTextEmpty}>{hasRated ? '' : '–'}</Text>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* DESCRIPTION */}
      {!!item.description && (
        <Text style={card.desc} numberOfLines={3}>{item.description}</Text>
      )}

      <View style={card.likeRow}>
        <TouchableOpacity
          style={[card.likeBtn, hasLiked && card.likeBtnActive]}
          onPress={() => { void onLike(item.id); }}
          activeOpacity={hasLiked ? 1 : 0.85}
          disabled={hasLiked}
        >
          <MaterialCommunityIcons
            name={hasLiked ? 'thumb-up' : 'thumb-up-outline'}
            size={16}
            color={hasLiked ? '#fff' : SCREEN_THEME.textSecondary}
          />
          <Text style={[card.likeBtnText, hasLiked && card.likeBtnTextActive]}>{hasLiked ? t.liked : t.like}</Text>
        </TouchableOpacity>
        <Text style={card.likeCountText}>{likeCount}</Text>
      </View>

      {/* CONTACT ROW: avatar + name + call button */}
      <View style={card.contactRow}>
        <MiniUserAvatar
          uri={avatarUri || ''}
          name={item.contactName}
          size={36}
          borderRadius={18}
          backgroundColor="#6A8BA5"
        />
        <Text style={card.contactName} numberOfLines={1}>{item.contactName}</Text>
        <TouchableOpacity style={[card.callBtn, !item.phone && card.callBtnDisabled]} onPress={handleCall} activeOpacity={item.phone ? 0.85 : 1} disabled={!item.phone}>
          <MaterialCommunityIcons name="phone-outline" size={15} color="#fff" />
          <Text style={card.callBtnText}>{t.call}</Text>
        </TouchableOpacity>
        {onContact ? (
          <TouchableOpacity style={[card.callBtn, { backgroundColor: '#7A1E5C' }]} onPress={onContact} activeOpacity={0.85}>
            <MaterialCommunityIcons name="account-arrow-right-outline" size={15} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>

      </View>
    </TouchableWithoutFeedback>
  );
}

// --- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8,
  },
  backBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: SCREEN_THEME.cardCream,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E0C89A',
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { fontSize: 17, fontWeight: '900', color: SCREEN_THEME.textPrimary, textAlign: 'center' },
  headerSub: { fontSize: 12, color: SCREEN_THEME.textSecondary, textAlign: 'center', marginTop: 1 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#E4D0AB',
    gap: 8,
  },
  searchIcon: { marginRight: 2 },
  searchInput: { flex: 1, fontSize: 15, color: SCREEN_THEME.textPrimary, fontWeight: '500', padding: 0 },
  myRequestCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  myRequestHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
  myRequestTitle: { fontSize: 13, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  myRequestStatus: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.terracotta },
  myRequestHint: { marginTop: 5, fontSize: 12, lineHeight: 17, color: SCREEN_THEME.textSecondary, fontWeight: '600' },
  myRequestReason: { marginTop: 5, fontSize: 12, lineHeight: 17, color: '#8A3B2E', fontWeight: '700' },
  chipsScroll: { maxHeight: 44, marginBottom: 8 },
  chipsContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
    borderColor: '#D9C79A', backgroundColor: SCREEN_THEME.paperStrong,
  },
  chipActive: { backgroundColor: SCREEN_THEME.terracotta, borderColor: SCREEN_THEME.terracotta },
  chipText: { fontSize: 13, fontWeight: '700', color: SCREEN_THEME.textSecondary },
  chipTextActive: { color: '#fff' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  centerText: { fontSize: 16, fontWeight: '700', color: SCREEN_THEME.textSecondary, textAlign: 'center' },
  centerSub: { fontSize: 13, color: SCREEN_THEME.textMuted, textAlign: 'center' },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: SCREEN_THEME.terracotta, borderRadius: 14,
  },
  retryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  addBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: SCREEN_THEME.appBg,
    borderTopWidth: 1,
    borderTopColor: '#E4D0AB',
  },
  addBarBtn: {
    backgroundColor: SCREEN_THEME.woodGreenDark,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBarBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrapper: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFAF4',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetScroll: { flexGrow: 0 },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D4C0A8',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDE3D5',
  },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4E8D8',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  sheetCloseTxt: { fontSize: 16, color: '#7A6D64', fontWeight: '900' },
  sheetContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  formLabel: { fontWeight: '700', color: SCREEN_THEME.textPrimary, marginBottom: 8, marginTop: 8 },
  input: {
    backgroundColor: '#F7F3EE',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: SCREEN_THEME.textPrimary,
    borderWidth: 1,
    borderColor: '#E8DDD3',
  },
  textarea: { minHeight: 92, textAlignVertical: 'top' },
  charCount: { alignSelf: 'flex-end', color: SCREEN_THEME.textMuted, fontSize: 11, marginTop: 4, fontWeight: '700' },
  pickerWrapper: {
    backgroundColor: '#F7F3EE',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    overflow: 'hidden',
  },
  picker: { color: SCREEN_THEME.textPrimary, height: 50 },
  submitBtn: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  submitBtnDisabled: { opacity: 0.55 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800' },
});

const card = StyleSheet.create({
  wrap: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#DDCCAA',
    padding: 14,
    marginBottom: 14,
    shadowColor: '#A08060',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  // TOP ROW: photo left + title right
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 12,
  },
  businessPhoto: {
    width: 138,
    height: 138,
    borderRadius: 18,
    backgroundColor: '#EDE3D0',
    borderWidth: 2,
    borderColor: '#2E2416',
    flexShrink: 0,
  },
  photoPlaceholder: {
    width: 138,
    height: 138,
    borderRadius: 18,
    backgroundColor: '#EDE3D0',
    borderWidth: 2,
    borderColor: '#2E2416',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  titleBottomGroup: {
    gap: 5,
    paddingTop: 6,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceText: {
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.terracotta,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
    marginLeft: 3,
  },
  ratingTextEmpty: {
    fontSize: 11,
    color: SCREEN_THEME.textMuted,
    marginLeft: 3,
  },
  categoryLabel: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    marginBottom: 6,
    backgroundColor: '#EEE7D7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.45,
  },
  subcategoryLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    lineHeight: 22,
  },

  // DESCRIPTION
  desc: {
    fontSize: 13,
    color: SCREEN_THEME.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
    fontWeight: '600',
  },

  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#D8C7A5',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F6ECDC',
  },
  likeBtnActive: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderColor: SCREEN_THEME.terracotta,
  },
  likeBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
  },
  likeBtnTextActive: {
    color: '#fff',
  },
  likeCountText: {
    fontSize: 13,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },

  // CONTACT ROW
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E6DAC1',
  },
  contactLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    textTransform: 'uppercase',
  },
  contactName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#C98262',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  callBtnDisabled: {
    opacity: 0.45,
  },
  callBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
});



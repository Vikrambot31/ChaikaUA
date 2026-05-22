import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useSelector } from 'react-redux';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MiniTabBar from '../components/MiniTabBar';
import MiniUserAvatar from '../components/MiniUserAvatar';
import TactileIcon from '../components/TactileIcon';
import AppPhotoImage from '../components/AppPhotoImage';
import { SCREEN_THEME } from '../utils/screenTheme';
import { normalizePhoneText } from '../utils/textUtils';
import { RootState } from '../redux/store';
import { getModerationLabel } from '../utils/moderation';
import { buySellService, BuySellListing } from '../services/buySellService';
import { getModerationUserMessage, showUserError } from '../utils/userFacingErrors';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { get, ref } from 'firebase/database';
import { database } from '../firebase-config';
import { useContactRequest } from '../hooks/useContactRequest';
import ContactReasonModal from '../components/ContactReasonModal';
import { safeCallPhone } from '../utils/communicationActions';
import type { DetailItemData } from '../utils/detailViewTypes';

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

const ITEM_CATEGORY_VALUES = [
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

const ITEM_CONDITION_VALUES = ['new', 'like_new', 'good', 'fair'] as const;

const UI_TEXT = {
  ua: {
    title: 'Куплю / Продам',
    subtitle: 'Оголошення для сусідів ЖК Чайка',
    categoryLabel: 'Категорія товару',
    conditionLabel: 'Стан товару',
    priceLabel: 'Ціна',
    priceError: 'Вкажіть коректну ціну більше 0.',
    phoneLabel: 'Телефон для зв\'язку',
    photoLabel: 'Фото товару',
    addPhoto: 'Обрати з Моїх фотографій',
    removePhoto: 'Прибрати фото',
    descriptionLabel: 'Опис',
    submitBtn: 'Надіслати на модерацію',
    addRequest: '+ Додати оголошення',
    formTitle: 'Оголошення',
    errorFill: 'Заповніть усі поля',
    errorPhone: 'Перевірте номер телефону',
    successTitle: 'Успішно',
    successMsg: 'Оголошення надіслано на модерацію. Після перевірки воно з\'явиться у списку.',
    deleteConfirmTitle: 'Видалити?',
    deleteConfirmMsg: 'Ви впевнені, що хочете видалити це оголошення?',
    deleteCancel: 'Скасувати',
    deleteBtn: 'Видалити',
    listingsTitle: 'Активні оголошення',
    filterLabel: 'Фільтр товарів',
    filterAll: 'Усі категорії',
    pending: 'На модерації',
    approved: 'Схвалено',
    rejected: 'Відхилено',
    noDesc: 'Без опису',
    selectCategory: 'Оберіть категорію...',
    selectCondition: 'Оберіть стан...',
    errorSave: 'Не вдалося зберегти оголошення',
    errorTitle: 'Помилка',
    deleteText: 'Видалити',
    conditionLabels: { new: 'Новий', like_new: 'Як новий', good: 'Гарний', fair: 'З недоліками' },
    categories: ['Меблі', 'Побутова техніка', 'Електроніка', 'Дитячі товари', 'Одяг та взуття', 'Спорт та відпочинок', 'Книги та навчання', 'Посуд та кухня', 'Будматеріали', 'Рослини', 'Інше'],
    searchButton: 'Пошук',
    searchTitle: 'Пошук товарів за критеріями',
    searchName: 'Назва товару',
    searchCategory: 'Категорія',
    searchCondition: 'Стан',
    searchPriceFrom: 'Ціна від',
    searchPriceTo: 'Ціна до',
    searchContact: "Контакт",
    searchDescription: 'Опис',
    searchAnyCategory: 'Будь-яка категорія',
    searchAnyCondition: 'Будь-який стан',
    searchPlaceholderName: 'Наприклад: велосипед',
    searchPlaceholderContact: '+380... або інший контакт',
    searchPlaceholderDescription: 'Пошук по опису',
    searchReset: 'Скинути',
    searchApply: 'Показати',
    clearSearch: 'Скинути пошук',
    noSearchResults: 'Нічого не знайдено за критеріями',
    noSearchResultsSub: 'Спробуйте прибрати частину фільтрів.',
    live: 'LIVE',
    liveCount: (count: number) => `всього ${count} активних оголошень на сьогодні`,
  },
  ru: {
    title: 'Куплю / Продам',
    subtitle: 'Объявления для соседей ЖК Чайка',
    categoryLabel: 'Категория товара',
    conditionLabel: 'Состояние товара',
    priceLabel: 'Цена',
    priceError: 'Укажите корректную цену больше 0.',
    phoneLabel: 'Телефон для связи',
    photoLabel: 'Фото товара',
    addPhoto: 'Выбрать из Моих фотографий',
    removePhoto: 'Убрать фото',
    descriptionLabel: 'Описание',
    submitBtn: 'Отправить на модерацию',
    addRequest: '+ Добавить объявление',
    formTitle: 'Объявление',
    errorFill: 'Заполните все поля',
    errorPhone: 'Проверьте номер телефона',
    successTitle: 'Успешно',
    successMsg: 'Объявление отправлено на модерацию. После проверки оно появится в списке.',
    deleteConfirmTitle: 'Удалить?',
    deleteConfirmMsg: 'Вы уверены, что хотите удалить это объявление?',
    deleteCancel: 'Отмена',
    deleteBtn: 'Удалить',
    listingsTitle: 'Активные объявления',
    filterLabel: 'Фильтр товаров',
    filterAll: 'Все категории',
    pending: 'На модерации',
    approved: 'Одобрено',
    rejected: 'Отклонено',
    noDesc: 'Без описания',
    selectCategory: 'Выберите категорию...',
    selectCondition: 'Выберите состояние...',
    errorSave: 'Не удалось сохранить объявление',
    errorTitle: 'Ошибка',
    deleteText: 'Удалить',
    conditionLabels: { new: 'Новый', like_new: 'Как новый', good: 'Хороший', fair: 'С недостатками' },
    categories: ['Мебель', 'Бытовая техника', 'Электроника', 'Детские товары', 'Одежда и обувь', 'Спорт и отдых', 'Книги и учёба', 'Посуда и кухня', 'Стройматериалы', 'Растения', 'Другое'],
    searchButton: 'Поиск',
    searchTitle: 'Поиск товаров по критериям',
    searchName: 'Название товара',
    searchCategory: 'Категория',
    searchCondition: 'Состояние',
    searchPriceFrom: 'Цена от',
    searchPriceTo: 'Цена до',
    searchContact: 'Контакт',
    searchDescription: 'Описание',
    searchAnyCategory: 'Любая категория',
    searchAnyCondition: 'Любое состояние',
    searchPlaceholderName: 'Например: велосипед',
    searchPlaceholderContact: '+380... или другой контакт',
    searchPlaceholderDescription: 'Поиск по описанию',
    searchReset: 'Сбросить',
    searchApply: 'Показать',
    clearSearch: 'Сбросить поиск',
    noSearchResults: 'Ничего не найдено по критериям',
    noSearchResultsSub: 'Попробуйте убрать часть фильтров.',
    live: 'LIVE',
    liveCount: (count: number) => `всего ${count} активных объявлений на сегодня`,
  },
  en: {
    title: 'Buy / Sell',
    subtitle: 'Listings for Chaika Life residents',
    categoryLabel: 'Item category',
    conditionLabel: 'Item condition',
    priceLabel: 'Price',
    priceError: 'Enter a valid price greater than 0.',
    phoneLabel: 'Contact phone',
    photoLabel: 'Item photo',
    addPhoto: 'Choose from My photos',
    removePhoto: 'Remove photo',
    descriptionLabel: 'Description',
    submitBtn: 'Send to moderation',
    addRequest: '+ Add listing',
    formTitle: 'Listing',
    errorFill: 'Fill all fields',
    errorPhone: 'Check phone number',
    successTitle: 'Success',
    successMsg: 'Your listing has been sent to moderation. It will appear after review.',
    deleteConfirmTitle: 'Delete?',
    deleteConfirmMsg: 'Are you sure you want to delete this listing?',
    deleteCancel: 'Cancel',
    deleteBtn: 'Delete',
    listingsTitle: 'Active listings',
    filterLabel: 'Items filter',
    filterAll: 'All categories',
    pending: 'Pending moderation',
    approved: 'Approved',
    rejected: 'Rejected',
    noDesc: 'No description',
    selectCategory: 'Select category...',
    selectCondition: 'Select condition...',
    errorSave: 'Failed to save listing',
    errorTitle: 'Error',
    deleteText: 'Delete',
    conditionLabels: { new: 'New', like_new: 'Like new', good: 'Good', fair: 'With flaws' },
    categories: ['Furniture', 'Appliances', 'Electronics', 'Kids items', 'Clothes & shoes', 'Sport & leisure', 'Books', 'Kitchen & dishes', 'Construction', 'Plants', 'Other'],
    searchButton: 'Search',
    searchTitle: 'Search items by criteria',
    searchName: 'Item name',
    searchCategory: 'Category',
    searchCondition: 'Condition',
    searchPriceFrom: 'Price from',
    searchPriceTo: 'Price to',
    searchContact: 'Contact',
    searchDescription: 'Description',
    searchAnyCategory: 'Any category',
    searchAnyCondition: 'Any condition',
    searchPlaceholderName: 'For example: bicycle',
    searchPlaceholderContact: '+380... or other contact',
    searchPlaceholderDescription: 'Search in description',
    searchReset: 'Reset',
    searchApply: 'Apply',
    clearSearch: 'Clear search',
    noSearchResults: 'No items match your criteria',
    noSearchResultsSub: 'Try removing some filters.',
    live: 'LIVE',
    liveCount: (count: number) => `${count} active listings today`,
  },
} as const;

const BuySellScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector((state: RootState) => state.auth.user);
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const text = UI_TEXT[language];
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('+380');
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [listings, setListings] = useState<BuySellListing[]>([]);
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string>>({});
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
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const pickerActiveRef = useRef(false);

  const handlePickerOpenChange = useCallback((isOpen: boolean) => {
    pickerActiveRef.current = isOpen;
  }, []);

  const handleRequestCloseModal = useCallback(() => {
    if (pickerActiveRef.current) return;
    setAddFormVisible(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = buySellService.subscribe(setListings);
    // Restore draft if Android restarted the activity while picker was open
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@chaika:buy_sell_draft');
        if (!isMounted || !raw) return;
        const draft = JSON.parse(raw) as Partial<{ category: string; condition: string; price: string; description: string; phone: string; addFormVisible: boolean }>;
        if (draft.category) setCategory(draft.category);
        if (draft.condition) setCondition(draft.condition);
        if (draft.price) setPrice(draft.price);
        if (draft.description) setDescription(draft.description);
        if (draft.phone) setPhone(draft.phone);
        if (draft.addFormVisible) setAddFormVisible(true);
        await AsyncStorage.removeItem('@chaika:buy_sell_draft');
      } catch { /* ignore */ }
    })();
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!addFormVisible) return;
    void AsyncStorage.setItem(
      '@chaika:buy_sell_draft',
      JSON.stringify({ category, condition, price, description, phone, addFormVisible: true }),
    ).catch(() => {});
  }, [addFormVisible, category, condition, price, description, phone]);

  useEffect(() => {
    const userIds = Array.from(new Set(listings.map((item) => item.userId).filter((id): id is string => Boolean(id))));
    if (userIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      const resolved = await Promise.all(
        userIds.map(async (uid) => {
          try {
            const snap = await get(ref(database, `users/${uid}`));
            const data = snap.val() as { photoURL?: unknown; photoURLs?: unknown } | null;
            const photoURLs = Array.isArray(data?.photoURLs)
              ? data.photoURLs.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
              : [];
            const photo = photoURLs[0] || (typeof data?.photoURL === 'string' ? data.photoURL : '');
            return [uid, photo] as const;
          } catch {
            return [uid, ''] as const;
          }
        }),
      );
      if (cancelled) return;
      setAvatarByUserId((prev) => {
        const next = { ...prev };
        resolved.forEach(([uid, photo]) => { if (photo) next[uid] = photo; });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [listings]);

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
    setCategory('');
    setCondition('');
    setPrice('');
    setDescription('');
    setPhone('+380');
    setFormPhotos([]);
    void AsyncStorage.removeItem('@chaika:buy_sell_draft').catch(() => {});
  };

  const mapToDetailData = useCallback((item: BuySellListing): DetailItemData => {
    const categoryIndex = ITEM_CATEGORY_VALUES.indexOf(item.category as typeof ITEM_CATEGORY_VALUES[number]);
    const categoryLabel = categoryIndex >= 0 ? text.categories[categoryIndex] : item.category;

    return {
      id: item.id,
      title: item.itemName,
      description: item.description,
      phone: item.phone,
      photoUri: item.photoUri,
      photoStoragePath: item.photoStoragePath,
      price: item.price ? `${item.price} грн` : undefined,
      category: categoryLabel,
      status: getModerationLabel(item.moderationStatus, {
        pending: text.pending,
        approved: text.approved,
        rejected: text.rejected,
      }),
      userId: item.userId,
      createdAt: item.createdAt,
      sourceType: 'buysell',
      sourceId: item.id,
    };
  }, [text.approved, text.categories, text.pending, text.rejected]);

  const openDetail = useCallback((item: BuySellListing) => {
    navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item) });
  }, [mapToDetailData, navigation]);

  const handleSubmit = async () => {
    if (!user) {
      navigation.navigate('LoginScreen');
      return;
    }
    const normalizedPrice = price.replace(',', '.').replace(/[^\d.]/g, '');
    const numericPrice = Number(normalizedPrice);

    if (!category || !condition || !description.trim() || !phone.trim() || !normalizedPrice) {
      Alert.alert(text.errorTitle, text.errorFill);
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      Alert.alert(text.errorTitle, text.priceError);
      return;
    }
    if (phone.replace(/\D/g, '').length < 7) {
      Alert.alert(text.errorTitle, text.errorPhone);
      return;
    }

    setSubmitting(true);
    try {
      const resolvedPhotoUri = formPhotos[0]?.downloadUrl ?? '';
      const resolvedStoragePath = formPhotos[0]?.storagePath ?? '';

      const categoryIndex = ITEM_CATEGORY_VALUES.indexOf(category as typeof ITEM_CATEGORY_VALUES[number]);
      const itemName = categoryIndex >= 0 ? text.categories[categoryIndex] : category;
      const createdAt = new Date();

      await buySellService.add({
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
        expiresAt: new Date(createdAt.getTime() + THREE_MONTHS_MS).toISOString(),
        userId: user?.id || '',
      });

      Alert.alert(text.successTitle, text.successMsg);
      resetForm();
      setAddFormVisible(false);
    } catch (error) {
      showUserError(language, 'send', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(text.deleteConfirmTitle, text.deleteConfirmMsg, [
      { text: text.deleteCancel, style: 'cancel' },
      {
        text: text.deleteBtn,
        style: 'destructive',
        onPress: async () => {
          try {
            await buySellService.remove(id);
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
                value={searchItemName}
                onChangeText={setSearchItemName}
                placeholder={text.searchPlaceholderName}
                placeholderTextColor="#A0938D"
              />

              <Text style={styles.formLabel}>{text.searchCategory}</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={searchCategory} onValueChange={setSearchCategory} style={styles.picker}>
                  <Picker.Item label={text.searchAnyCategory} value="" />
                  {ITEM_CATEGORY_VALUES.map((value, index) => (
                    <Picker.Item key={`search-category-${value}`} label={text.categories[index]} value={value} />
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
            <Animated.Text style={[styles.liveDot, { opacity: blinkAnim }]}>?</Animated.Text>
            <Text style={styles.liveText}>{text.live}</Text>
            <Text style={styles.liveCount}>{text.liveCount(listings.length)}</Text>
          </View>
        </View>

        {listings.length > 0 && (
          <View style={styles.listingsSection}>
            <Text style={styles.formLabel}>{text.filterLabel}</Text>
            <View style={styles.pickerWrapper}>
              <Picker selectedValue={selectedFilterCategory} onValueChange={setSelectedFilterCategory} style={styles.picker}>
                <Picker.Item label={text.filterAll} value="" />
                {ITEM_CATEGORY_VALUES.map((value, index) => (
                  <Picker.Item key={`filter-${value}`} label={text.categories[index]} value={value} />
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
              filteredListings.map((item) => (
                <TouchableOpacity key={item.id} style={styles.listingCard} onPress={() => openDetail(item)} activeOpacity={0.86}>
                  <View style={styles.listingHeader}>
                    <MiniUserAvatar uri={(item.userId && avatarByUserId[item.userId]) || item.photoUri || ''} name={item.itemName} size={34} borderRadius={11} backgroundColor="#6A8BA5" />
                    <Text style={[styles.listingName, { marginLeft: 8 }]}>{item.itemName}</Text>
                    {item.userId === user?.id ? (
                      <TouchableOpacity onPress={(event) => { event.stopPropagation(); handleDelete(item.id); }}>
                        <Text style={styles.deleteText}>{text.deleteText}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={styles.listingMeta}>
                    <Text style={styles.listingBadgeText}>{text.conditionLabels[item.condition as keyof typeof text.conditionLabels] ?? item.condition}</Text>
                    <Text style={styles.listingPrice}>{item.price} грн</Text>
                    {item.isArchived ? (
                      <Text style={styles.archiveBadge}>Архів</Text>
                    ) : (
                      <Text style={styles.statusBadge}>
                        {getModerationLabel(item.moderationStatus, {
                          pending: text.pending,
                          approved: text.approved,
                          rejected: text.rejected,
                        })}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.listingDescription} numberOfLines={2}>{item.description || text.noDesc}</Text>
                  {Boolean(item.photoUri || item.photoStoragePath) ? (
                    <AppPhotoImage
                      uri={item.photoUri}
                      storagePath={item.photoStoragePath}
                      style={styles.listingPhoto}
                      resizeMode="cover"
                      debugLabel={`BuySell:${item.id}`}
                    />
                  ) : (
                    <View style={[styles.listingPhoto, styles.listingPhotoPlaceholder]}>
                      <MaterialCommunityIcons name="image-off-outline" size={26} color="#B8A888" />
                    </View>
                  )}
                  <Text style={styles.moderationInfo}>
                    {getModerationUserMessage(language, item.moderationStatus, item.rejectionReason || item.moderationReason)}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    {item.phone ? (
                      <TouchableOpacity style={styles.phoneAction} onPress={(event) => { event.stopPropagation(); void safeCallPhone(item.phone, language); }} activeOpacity={0.75}>
                        <TactileIcon icon="phone-outline" size={30} iconSize={13} backgroundColor="#403933" />
                      </TouchableOpacity>
                    ) : null}
                    {item.userId && item.userId !== user?.id ? (
                      <TouchableOpacity style={styles.phoneAction} onPress={(event) => { event.stopPropagation(); openContactModal({ userId: item.userId as string, name: item.itemName ?? 'Unknown', sourceType: 'buysell', sourceId: item.id, sourceTitle: item.itemName }); }} activeOpacity={0.75}>
                        <TactileIcon icon="account-arrow-right-outline" size={30} iconSize={13} backgroundColor="#7A1E5C" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>
      <View style={styles.addBar}>
        <TouchableOpacity style={styles.addBarBtn} onPress={() => setAddFormVisible(true)} activeOpacity={0.85}>
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
              <TouchableOpacity onPress={() => setAddFormVisible(false)} style={styles.sheetCloseBtn} activeOpacity={0.7}>
                <Text style={styles.sheetCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
              style={styles.sheetScroll}
            >
              <Text style={styles.formLabel}>{text.categoryLabel}</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={category} onValueChange={setCategory} style={styles.picker}>
                  <Picker.Item label={text.selectCategory} value="" />
                  {ITEM_CATEGORY_VALUES.map((value, index) => (
                    <Picker.Item key={value} label={text.categories[index]} value={value} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.formLabel}>{text.conditionLabel}</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={condition} onValueChange={(itemValue) => setCondition(itemValue)} style={styles.picker}>
                  <Picker.Item label={text.selectCondition} value="" />
                  {ITEM_CONDITION_VALUES.map((value) => (
                    <Picker.Item key={value} label={text.conditionLabels[value]} value={value} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.formLabel}>{text.priceLabel}</Text>
              <TextInput
                placeholder="0"
                value={price}
                onChangeText={(value) => setPrice(value.replace(',', '.').replace(/[^\d.]/g, ''))}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholderTextColor="#A0938D"
              />

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

              <Text style={styles.formLabel}>{text.phoneLabel}</Text>
              <TextInput placeholder="+380..." value={phone} onChangeText={(value) => setPhone(normalizePhoneText(value))} keyboardType="phone-pad" style={styles.input} placeholderTextColor="#A0938D" />

              <Text style={styles.formLabel}>{text.photoLabel}</Text>
              <PhotoUploadField
                uid={user?.id ?? ''}
                userName={user?.name ?? ''}
                maxPhotos={5}
                storagePath="buy_sell"
                onPhotosChange={(photos) => setFormPhotos(photos.filter((p) => p.status === 'done'))}
                onPickerOpenChange={handlePickerOpenChange}
              />

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
  headerCard: { backgroundColor: '#E6F0E9', borderRadius: 28, padding: 18, marginBottom: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#B8D3BF' },
  headerTitle: { fontSize: 28, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 8 },
  headerSubtitle: { marginTop: 6, color: SCREEN_THEME.textSecondary, textAlign: 'center' },
  liveLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 },
  liveDot: { color: '#2D7E4D', fontSize: 12, fontWeight: '900', marginRight: 4 },
  liveText: { color: '#2D7E4D', fontSize: 11, fontWeight: '900', marginRight: 6 },
  liveCount: { color: SCREEN_THEME.textSecondary, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  formLabel: { fontWeight: '700', color: SCREEN_THEME.textPrimary, marginBottom: 8, marginTop: 8 },
  input: { backgroundColor: '#F7F3EE', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: SCREEN_THEME.textPrimary, borderWidth: 1, borderColor: '#E8DDD3' },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  pickerWrapper: { backgroundColor: '#F7F3EE', borderRadius: 16, borderWidth: 1, borderColor: '#E8DDD3', overflow: 'hidden' },
  picker: { color: SCREEN_THEME.textPrimary, height: 50 },
  submitBtn: { backgroundColor: SCREEN_THEME.terracotta, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800' },
  listingsSection: { marginBottom: 16 },
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
  listingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  listingName: { fontWeight: '800', color: SCREEN_THEME.textPrimary, flex: 1, marginRight: 8 },
  deleteText: { color: '#D05B4D', fontWeight: '700' },
  listingMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  archiveBadge: { fontSize: 10, fontWeight: '700', color: '#fff', backgroundColor: '#8B7355', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, overflow: 'hidden' },
  listingBadgeText: { fontSize: 11, fontWeight: '700', color: '#7B1FA2' },
  listingPrice: { fontSize: 15, fontWeight: '900', color: '#00897B' },
  statusBadge: { fontSize: 11, fontWeight: '900', color: '#8A5A00', backgroundColor: '#FFF2C7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  listingDescription: { color: SCREEN_THEME.textSecondary, lineHeight: 18, marginBottom: 8 },
  listingPhoto: { width: '100%', height: 170, borderRadius: 16, marginBottom: 8, backgroundColor: '#FFF3E0' },
  listingPhotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  moderationInfo: { color: '#5F5043', backgroundColor: '#FFF8EA', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  phoneAction: { marginTop: 8, alignItems: 'flex-start' },
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
});

export default BuySellScreen;









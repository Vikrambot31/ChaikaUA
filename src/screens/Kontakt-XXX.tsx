import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
import { get, onValue, ref, runTransaction } from 'firebase/database';
import { database } from '../firebase-config';
import { useContactRequest } from '../hooks/useContactRequest';
import ContactReasonModal from '../components/ContactReasonModal';
import { pickUserAvatarUri } from '../utils/userAvatar';
import { safeOpenViber } from '../utils/communicationActions';
import type { DetailItemData } from '../utils/detailViewTypes';

const CONTACT_LISTING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CONTACT_LIKES_PATH = 'contact_likes';

const CONTACT_LEGACY_CATEGORY_VALUES = [
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

type ContactLegacyCategoryValue = typeof CONTACT_LEGACY_CATEGORY_VALUES[number];

const ITEM_CONDITION_VALUES = ['new', 'like_new', 'good', 'fair'] as const;

const UI_TEXT = {
  ua: {
    title: 'Контакти Чайки',
    subtitle: 'Люди ЖК Чайка: залиште контакт для зв\'язку',
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
    addRequest: '+ Додати контакт',
    formTitle: 'Контакт',
    errorFill: 'Заповніть усі поля',
    errorPhone: 'Перевірте номер телефону',
    successTitle: 'Готово',
    successMsg: 'Контакт опубліковано. Тепер інші можуть знайти вас.',
    deleteConfirmTitle: 'Видалити?',
    deleteConfirmMsg: 'Ви впевнені, що хочете видалити цей контакт?',
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
    live: 'LIVE',
    liveCount: (count: number) => `всього ${count} людей шукають знайомств`,
  },
  ru: {
    title: 'Контакты Чайки',
    subtitle: 'Люди ЖК Чайка: оставьте контакт для связи',
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
    addRequest: '+ Добавить контакт',
    formTitle: 'Контакт',
    errorFill: 'Заполните все поля',
    errorPhone: 'Проверьте номер телефона',
    successTitle: 'Готово',
    successMsg: 'Контакт опубликован. Теперь другие могут найти вас.',
    deleteConfirmTitle: 'Удалить?',
    deleteConfirmMsg: 'Вы уверены, что хотите удалить этот контакт?',
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
    live: 'LIVE',
    liveCount: (count: number) => `всего ${count} людей ищут знакомства`,
  },
  en: {
    title: 'Chaika Contacts',
    subtitle: 'Chaika Life people: leave your contact',
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
    addRequest: '+ Add contact',
    formTitle: 'Contact',
    errorFill: 'Fill all fields',
    errorPhone: 'Check phone number',
    successTitle: 'Done',
    successMsg: 'Contact published. Now others can find you.',
    deleteConfirmTitle: 'Delete?',
    deleteConfirmMsg: 'Are you sure you want to delete this contact?',
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
    live: 'LIVE',
    liveCount: (count: number) => `${count} people looking for contacts`,
  },
} as const;

const KontaktiChaikyScreen: React.FC = () => {
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
  const [showPhoneOnCard, setShowPhoneOnCard] = useState(true);
  const [listings, setListings] = useState<ContactListing[]>([]);
  const [profileByUserId, setProfileByUserId] = useState<Record<string, { name?: string; avatarUri?: string }>>({});
  const [likeMap, setLikeMap] = useState<Record<string, Record<string, true>>>({});
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);
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

  const getCategoryLabel = useCallback(
    (value: string) => text.categories[value as ContactLegacyCategoryValue] ?? value,
    [text.categories],
  );

  const handlePickerOpenChange = useCallback((isOpen: boolean) => {
    pickerActiveRef.current = isOpen;
  }, []);

  const handleRequestCloseModal = useCallback(() => {
    if (pickerActiveRef.current) return;
    setAddFormVisible(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = contactsService.subscribe(setListings);
    // Restore draft if Android restarted the activity while picker was open
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@chaika:contacts_draft');
        if (!isMounted || !raw) return;
        const draft = JSON.parse(raw) as Partial<{ category: string; condition: string; price: string; description: string; phone: string; addFormVisible: boolean }>;
        if (draft.category) setCategory(draft.category);
        if (draft.condition) setCondition(draft.condition);
        if (draft.price) setPrice(draft.price);
        if (draft.description) setDescription(draft.description);
        if (draft.phone) setPhone(draft.phone);
        if (draft.addFormVisible) setAddFormVisible(true);
        await AsyncStorage.removeItem('@chaika:contacts_draft');
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
      '@chaika:contacts_draft',
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
            const data = snap.val() as Record<string, unknown> | null;
            const photo = pickUserAvatarUri(data);
            const name = typeof data?.name === 'string' ? data.name.trim() : '';
            return [uid, { name, avatarUri: photo }] as const;
          } catch {
            return [uid, {}] as const;
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
  }, [listings]);

  useEffect(() => {
    const unsubscribe = onValue(ref(database, CONTACT_LIKES_PATH), (snapshot) => {
      setLikeMap((snapshot.val() as Record<string, Record<string, true>> | null) ?? {});
    });
    return unsubscribe;
  }, []);

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

  const ACCENT = '#7A1E5C';

  const handleViber = (phoneRaw: string) => {
    void safeOpenViber(phoneRaw, language);
  };

  const toggleLike = async (id: string) => {
    if (!user?.id || likeBusyId) return;
    setLikeBusyId(id);
    try {
      await runTransaction(ref(database, `${CONTACT_LIKES_PATH}/${id}/${user.id}`), (current: boolean | null) => {
        if (current === true) return null;
        return true;
      });
    } catch {
      // Like failures are non-blocking for the contact card.
    } finally {
      setLikeBusyId(null);
    }
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
    void AsyncStorage.removeItem('@chaika:contacts_draft').catch(() => {});
  };

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

      const itemName = getCategoryLabel(category);
      const createdAt = new Date();

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
            await contactsService.remove(id);
          } catch (error) {
            showUserError(language, 'delete', error);
          }
        },
      },
    ]);
  };

  const mapToDetailData = (item: ContactListing): DetailItemData => {
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
      price: item.price ? `${item.price} р.` : undefined,
      status: conditionLabel,
      userId: item.userId,
      createdAt: item.createdAt,
      sourceType: 'lyudi',
      sourceId: item.id,
    };
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
                  {CONTACT_LEGACY_CATEGORY_VALUES.map((value) => (
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

        {listings.length > 0 && (
          <View style={styles.listingsSection}>
            <Text style={styles.formLabel}>{text.filterLabel}</Text>
            <View style={styles.pickerWrapper}>
              <Picker selectedValue={selectedFilterCategory} onValueChange={setSelectedFilterCategory} style={styles.picker}>
                <Picker.Item label={text.filterAll} value="" />
                {CONTACT_LEGACY_CATEGORY_VALUES.map((value) => (
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
                const avatarUri = pickUserAvatarUri(
                  item,
                  profile?.avatarUri ? { photoURL: profile.avatarUri } : undefined,
                );
                const isOwn = item.userId === user?.id;
                const showPhone = !!(item.phone && item.showPhone !== false);
                const conditionLabel = text.conditionLabels[item.condition as keyof typeof text.conditionLabels] ?? item.condition;
                const ageText = item.price ? `${item.price} р.` : '';
                const categoryLabel = getCategoryLabel(item.category);
                const descriptionText = item.description?.trim() || text.noDesc;
                const displayName = profile?.name || item.itemName;
                const likes = Object.keys(likeMap[item.id] ?? {}).length;
                const hasLiked = !!(user?.id && likeMap[item.id]?.[user.id]);
                const modMsg = getModerationUserMessage(language, item.moderationStatus, item.rejectionReason || item.moderationReason);
                const showModInfo = isOwn && item.moderationStatus !== 'approved';

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.kCard}
                    onPress={() => navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item) })}
                    activeOpacity={0.86}
                  >
                    <View style={styles.kCardTop}>
                      {Boolean(item.photoUri || item.photoStoragePath) ? (
                        <AppPhotoImage
                          uri={item.photoUri}
                          storagePath={item.photoStoragePath}
                          style={styles.kPhoto}
                          resizeMode="cover"
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

                        <View style={styles.kDescBox}>
                          <Text style={styles.kDescText} numberOfLines={3}>{descriptionText}</Text>
                        </View>

                        {/* Moderation info (own listings only) */}
                        {showModInfo && modMsg ? (
                          <Text style={styles.kModInfo} numberOfLines={2}>{modMsg}</Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Actions row */}
                    <View style={styles.kActionsRow}>
                      {item.userId ? (
                        <TouchableOpacity
                          style={styles.kBtnOutlined}
                          onPress={() => navigation.navigate('ViewUserProfile', { userId: item.userId as string })}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons name="badge-account-horizontal-outline" size={13} color={ACCENT} />
                          <Text style={styles.kBtnOutlinedText}>
                            {language === 'en' ? 'Profile' : language === 'ru' ? 'Профиль' : 'Профіль'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        style={[styles.kBtnLike, hasLiked && styles.kBtnLikeActive, (!user?.id || likeBusyId === item.id) && styles.kBtnDisabled]}
                        onPress={() => void toggleLike(item.id)}
                        disabled={!user?.id || likeBusyId === item.id}
                        activeOpacity={0.8}
                      >
                        {likeBusyId === item.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <MaterialCommunityIcons name={hasLiked ? 'heart' : 'heart-outline'} size={14} color="#fff" />
                            <Text style={styles.kBtnLikeText}>{likes}</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.kBtnViber, !showPhone && styles.kBtnViberDisabled]}
                        onPress={() => showPhone && handleViber(item.phone)}
                        disabled={!showPhone}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="message-text-outline" size={13} color="#fff" />
                        <Text style={styles.kBtnViberText}>Viber</Text>
                      </TouchableOpacity>

                      {isOwn ? (
                        <TouchableOpacity
                          style={styles.kBtnRoundDelete}
                          onPress={() => handleDelete(item.id)}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color="#fff" />
                        </TouchableOpacity>
                      ) : item.userId && item.userId !== user?.id ? (
                        <TouchableOpacity
                          style={styles.kBtnRoundContact}
                          onPress={() => openContactModal({ userId: item.userId as string, name: item.itemName ?? 'Unknown', sourceType: 'lyudi', sourceId: item.id, sourceTitle: item.itemName })}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons name="account-arrow-right-outline" size={16} color="#fff" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })
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
                  {CONTACT_LEGACY_CATEGORY_VALUES.map((value) => (
                    <Picker.Item key={value} label={getCategoryLabel(value)} value={value} />
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
                storagePath="contacts"
                onPhotosChange={(photos) => setFormPhotos(photos.filter((p) => p.status === 'done'))}
                onPickerOpenChange={handlePickerOpenChange}
              />

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
  listingBadgeText: { fontSize: 11, fontWeight: '700', color: '#7B1FA2' },
  listingPrice: { fontSize: 15, fontWeight: '900', color: '#00897B' },
  statusBadge: { fontSize: 11, fontWeight: '900', color: '#8A5A00', backgroundColor: '#FFF2C7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  listingDescription: { color: SCREEN_THEME.textSecondary, lineHeight: 18, marginBottom: 8 },
  listingPhoto: { width: '100%', height: 170, borderRadius: 16, marginBottom: 8, backgroundColor: '#FFF3E0' },
  moderationInfo: { color: '#5F5043', backgroundColor: '#FFF8EA', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  phoneAction: { marginTop: 8, alignItems: 'flex-start' },
  // New card styles (incoming-style layout)
  kCard: {
    backgroundColor: '#F7F3EE',
    borderRadius: 14,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  kCardTop: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    marginBottom: 7,
  },
  kAvatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  kInfo: {
    flex: 1,
    gap: 5,
  },
  kNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'nowrap',
  },
  kName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2D2520',
    flexShrink: 1,
  },
  kMetaChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  kCategoryBadge: {
    backgroundColor: '#E6F0E9',
    borderWidth: 1,
    borderColor: '#B8D3BF',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: '52%',
  },
  kCategoryText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2D7E4D',
  },
  kArchiveBadge: { fontSize: 10, fontWeight: '700', color: '#fff', backgroundColor: '#8B7355', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden', flexShrink: 0 },
  kConditionBadge: {
    backgroundColor: '#F3E5F5',
    borderWidth: 1,
    borderColor: '#CE93D8',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  kConditionText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6A1B9A',
  },
  kAgeBadge: {
    backgroundColor: '#DDEAF0',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 'auto' as const,
  },
  kAgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3D5D87',
  },
  kDescBox: {
    borderWidth: 1,
    borderColor: '#E0D5C8',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#FAF7F3',
  },
  kDescText: {
    fontSize: 12,
    color: '#7A6D64',
    lineHeight: 17,
  },
  kModInfo: {
    fontSize: 11,
    color: '#8A6200',
    backgroundColor: '#FFF8EA',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    lineHeight: 16,
    fontWeight: '700',
  },
  kActionsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  kBtnOutlined: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#D4B9A8',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  kBtnOutlinedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7A1E5C',
  },
  kBtnDisabled: {
    opacity: 0.45,
  },
  kBtnDisabledText: {
    color: '#B0A090',
  },
  kBtnLike: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 46,
    backgroundColor: '#7A1E5C',
  },
  kBtnLikeActive: {
    backgroundColor: '#B13A70',
  },
  kBtnLikeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
  },
  kBtnViber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: '#7360F2',
  },
  kBtnViberDisabled: {
    backgroundColor: '#CCBEB2',
  },
  kBtnViberText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  kBtnRoundContact: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#7A1E5C',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto' as const,
  },
  kPhoto: {
    width: 92,
    height: 108,
    borderRadius: 14,
    backgroundColor: '#FFF3E0',
  },
  kBtnRoundDelete: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#C0392B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto' as const,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    backgroundColor: '#F7F3EE',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E8DDD3',
  },
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

export default KontaktiChaikyScreen;









import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import MiniUserAvatar from '../components/MiniUserAvatar';
import AppPhotoImage from '../components/AppPhotoImage';
import FeedLikeButton from '../components/FeedLikeButton';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { SCREEN_THEME } from '../utils/screenTheme';
import { RootState } from '../redux/store';
import { lostFoundService, LostFoundItem, RequestType } from '../services/lostFoundService';
import { showUserError } from '../utils/userFacingErrors';
import { validatePhone, normalizeUkrainianPhoneStrict } from '../utils/validators';
import { normalizePhoneText } from '../utils/textUtils';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import type { DetailItemData } from '../utils/detailViewTypes';
import { getDonePhotos, validateSubmissionRequirements } from '../utils/submissionRequirements';
import { checkYellowList } from '../utils/yellowListCheck';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';
import { useOperationTrace } from '../hooks/useOperationTrace';
import { requireAuthForDetails } from '../utils/authGuard';

type AppLanguage = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    categories: ['Ключі', 'Іграшка', 'Одяг', 'Документи', 'Картка / брелок', 'Телефон', 'Сумка / рюкзак', 'Прикраса', 'Інше'],
    typeFound: 'Я знайшов',
    typeLost: 'Я загубив',
    submittedTitle: 'Модерація',
    submittedMessage: 'Заявку надіслано на модерацію. Після перевірки вона з\'явиться у списку.',
    pending: 'На модерації',
    approved: 'Схвалено',
    rejected: 'Відхилено',
    formTitle: 'Анкета',
    formError: 'Заповніть телефон та категорію.',
    duplicateTitle: 'Схожа заявка вже є',
    duplicateBody: 'Ви вже створили схожу активну заявку. Перевірте список перед повторною відправкою.',
    sendErrorTitle: 'Помилка',
    sendError: 'Не вдалося надіслати заявку. Спробуйте ще раз.',
    photoUploading: 'Дочекайтесь завершення завантаження фото.',
    photoUploadError: 'Не вдалося завантажити фото. Видаліть його або спробуйте ще раз.',
    authRequired: 'Увійдіть в акаунт, щоб додати заявку.',
    phoneError: 'Введіть коректний номер телефону (+380...).',
    title: 'Хто загубив?',
    subtitle: 'Знайдені та загублені речі. Усі заявки видимі для мешканців селища.',
    namePlaceholder: 'Ім\'я',
    phonePlaceholder: 'Телефон',
    itemLabel: 'Річ',
    wherePlaceholder: 'Де загублено або знайдено?',
    searchPlaceholder: 'Пошук: ключі, телефон, сумка...',
    filterAll: 'Усі',
    todayBadge: 'Сьогодні',
    addRequest: '+ Додати заявку',
    listTitle: 'Заявки',
    empty: 'Поки немає заявок.',
    loadError: 'Не вдалося завантажити заявки. Спробуйте оновити екран.',
    closeItem: 'Знайдено - закрити',
    closeConfirmTitle: 'Закрити оголошення?',
    closeConfirmBody: 'Оголошення буде позначено як закрите і зникне з активного списку.',
    cancel: 'Скасувати',
    photoLabel: 'Фото предмету (необов\'язково)',
    descriptionPlaceholder: 'Опис: колір, особливості, де загублено...',
    descriptionPlaceholderFound: 'Опис: колір, особливості, де знайдено...',
    categoryError: 'Оберіть категорію речі.',
    contact: 'Подзвонити',
    anonymous: 'Мешканець',
  },
  ru: {
    categories: ['Ключи', 'Игрушка', 'Одежда', 'Документы', 'Карта / брелок', 'Телефон', 'Сумка / рюкзак', 'Украшение', 'Другое'],
    typeFound: 'Я нашёл',
    typeLost: 'Я потерял',
    submittedTitle: 'Модерация',
    submittedMessage: 'Заявка отправлена на модерацию. После проверки она появится в списке.',
    pending: 'На модерации',
    approved: 'Одобрено',
    rejected: 'Отклонено',
    formTitle: 'Анкета',
    formError: 'Заполните телефон и категорию.',
    duplicateTitle: 'Похожая заявка уже есть',
    duplicateBody: 'Вы уже создали похожую активную заявку. Проверьте список перед повторной отправкой.',
    sendErrorTitle: 'Ошибка',
    sendError: 'Не удалось отправить заявку. Попробуйте еще раз.',
    photoUploading: 'Дождитесь завершения загрузки фото.',
    photoUploadError: 'Не удалось загрузить фото. Удалите его или попробуйте еще раз.',
    authRequired: 'Войдите в аккаунт, чтобы добавить заявку.',
    phoneError: 'Введите корректный номер телефона (+380...).',
    title: 'Кто потерял?',
    subtitle: 'Найденные и потерянные вещи. Все заявки видны жителям поселка.',
    namePlaceholder: 'Имя',
    phonePlaceholder: 'Телефон',
    itemLabel: 'Вещь',
    wherePlaceholder: 'Где потеряли или нашли?',
    searchPlaceholder: 'Поиск: ключи, телефон, сумка...',
    filterAll: 'Все',
    todayBadge: 'Сегодня',
    addRequest: '+ Добавить заявку',
    listTitle: 'Заявки',
    empty: 'Пока нет заявок.',
    loadError: 'Не удалось загрузить заявки. Попробуйте обновить экран.',
    closeItem: 'Найдено - закрыть',
    closeConfirmTitle: 'Закрыть объявление?',
    closeConfirmBody: 'Объявление будет помечено как закрытое и исчезнет из активного списка.',
    cancel: 'Отмена',
    photoLabel: 'Фото предмета (необязательно)',
    descriptionPlaceholder: 'Описание: цвет, особенности, где потеряно...',
    descriptionPlaceholderFound: 'Описание: цвет, особенности, где найдено...',
    categoryError: 'Выберите категорию вещи.',
    contact: 'Позвонить',
    anonymous: 'Житель',
  },
  en: {
    categories: ['Keys', 'Toy', 'Clothes', 'Documents', 'Card / keychain', 'Phone', 'Bag / backpack', 'Jewelry', 'Other'],
    typeFound: 'I found it',
    typeLost: 'I lost it',
    submittedTitle: 'Moderation',
    submittedMessage: 'Request was sent to moderation. It will appear in the list after review.',
    pending: 'Pending moderation',
    approved: 'Approved',
    rejected: 'Rejected',
    formTitle: 'Request',
    formError: 'Fill in phone and category.',
    duplicateTitle: 'Similar request already exists',
    duplicateBody: 'You already created a similar active request. Check the list before sending again.',
    sendErrorTitle: 'Error',
    sendError: 'Could not send the request. Please try again.',
    photoUploading: 'Wait until the photo upload is complete.',
    photoUploadError: 'Photo upload failed. Remove it or try again.',
    authRequired: 'Sign in to add a request.',
    phoneError: 'Enter a valid phone number (+380...).',
    title: 'Who lost it?',
    subtitle: 'Lost and found items. All requests are visible to local residents.',
    namePlaceholder: 'Name',
    phonePlaceholder: 'Phone',
    itemLabel: 'Item',
    wherePlaceholder: 'Where was it lost or found?',
    searchPlaceholder: 'Search: keys, phone, bag...',
    filterAll: 'All',
    todayBadge: 'Today',
    addRequest: '+ Add request',
    listTitle: 'Requests',
    empty: 'No requests yet.',
    loadError: 'Could not load requests. Try refreshing the screen.',
    closeItem: 'Found - close',
    closeConfirmTitle: 'Close listing?',
    closeConfirmBody: 'The listing will be marked as closed and removed from the active list.',
    cancel: 'Cancel',
    photoLabel: 'Item photo (optional)',
    descriptionPlaceholder: 'Description: color, features, where lost...',
    descriptionPlaceholderFound: 'Description: color, features, where found...',
    categoryError: 'Please select an item category.',
    contact: 'Call',
    anonymous: 'Resident',
  },
} as const;

const getLostFoundCategoryLabel = (value: string, language: AppLanguage): string => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';

  for (const lang of ['ua', 'ru', 'en'] as const) {
    const index = UI_TEXT[lang].categories.findIndex((label) => label.toLowerCase() === normalized);
    if (index >= 0) return UI_TEXT[language].categories[index];
  }

  return value;
};

const formatItemDate = (value: string, language: AppLanguage): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = language === 'ua' ? 'uk-UA' : language === 'ru' ? 'ru-RU' : 'en-US';
  return date.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
};

const isToday = (value: string): boolean => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
};

const LostAndFoundScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as AppLanguage;
  const user = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];
  const { startOperation, trace } = useOperationTrace('Kto-Poteryal');
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [type, setType] = useState<RequestType>('lost');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(() => normalizePhoneText(user?.phone ?? ''));
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [locationText, setLocationText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<RequestType | 'all'>('all');
  const [addFormVisible, setAddFormVisible] = useState(false);
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleRequestCloseModal = useCallback(() => {
    // Bug #9 fix: skip confirmation if the form has not been touched
    const isDirty = category !== '' || description.trim() !== '' || locationText.trim() !== '' || formPhotos.length > 0;
    if (!isDirty) {
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
  }, [category, description, locationText, formPhotos]);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ uri: string; storagePath?: string } | null>(null);
  const hasUploadingPhotos = formPhotos.some((photo) => photo.status === 'uploading');
  const hasPhotoErrors = formPhotos.some((photo) => photo.status === 'error');
  const avatarByUserId = useUserAvatarMap(items.map((item) => item.userId));

  const typeLabels = useMemo<Record<RequestType, string>>(
    () => ({ found: text.typeFound, lost: text.typeLost }),
    [text.typeFound, text.typeLost]
  );

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (!query) return true;

      const categoryLabel = getLostFoundCategoryLabel(item.category, language);
      const haystack = [
        item.name,
        item.phone,
        item.category,
        categoryLabel,
        item.description,
        item.locationText,
        typeLabels[item.type],
      ].join(' ').toLowerCase();

      return haystack.includes(query);
    });
  }, [items, language, searchQuery, typeFilter, typeLabels]);

  useEffect(() => {
    setLoadingItems(true);
    setLoadError(false);
    const unsubscribe = lostFoundService.subscribe(
      (nextItems) => {
        setItems(nextItems);
        setLoadingItems(false);
        setLoadError(false);
      },
      user?.id,
      () => {
        setLoadingItems(false);
        setLoadError(true);
      },
    );
    return unsubscribe;
  }, [user?.id]);

  useEffect(() => {
    if (!name.trim() && user?.name) {
      setName(user.name);
    }
  }, [name, user?.name]);

  useEffect(() => {
    if (!phone.trim() && user?.phone) {
      setPhone(normalizePhoneText(user.phone));
    }
  }, [phone, user?.phone]);

  const resetForm = () => {
    setType('lost');
    setName(user?.name ?? '');
    setPhone(normalizePhoneText(user?.phone ?? ''));
    setCategory('');
    setDescription('');
    setLocationText('');
    setFormPhotos([]);
  };

  const handleSubmit = async () => {
    startOperation();

    trace('validate', 'start');
    if (!validateSubmissionRequirements({ language, userId: user?.id, userPhotoURL: user?.photoURL, userStartAvatarKey: user?.startAvatarKey, navigation })) {
      trace('validate', 'fail', { missing: 'submissionRequirements' });
      return;
    }
    if (await checkYellowList(user?.id, language)) {
      trace('validate', 'fail', { missing: 'yellowList' });
      return;
    }
    // Bug #3 fix: separate phone and category checks for precise error messages
    if (!phone.trim()) {
      trace('validate', 'fail', { missing: 'phone' });
      Alert.alert(text.sendErrorTitle, text.phoneError);
      return;
    }
    if (!category) {
      trace('validate', 'fail', { missing: 'category' });
      Alert.alert(text.formTitle, text.categoryError);
      return;
    }
    // Bug #4 fix: normalize Ukrainian formats (0XXXXXXXXX, 380XXXXXXXXX) before validation
    const normalizedPhone = normalizeUkrainianPhoneStrict(phone.trim()) ?? normalizePhoneText(phone);
    if (!validatePhone(normalizedPhone)) {
      trace('validate', 'fail', { missing: 'phoneFormat' });
      Alert.alert(text.sendErrorTitle, text.phoneError);
      return;
    }
    trace('validate', 'success');

    trace('photo_check', 'start');
    if (hasUploadingPhotos) {
      trace('photo_check', 'fail', { reason: 'uploadsInProgress' });
      Alert.alert(text.sendErrorTitle, text.photoUploading);
      return;
    }
    if (hasPhotoErrors) {
      trace('photo_check', 'fail', { reason: 'photoErrors' });
      Alert.alert(text.sendErrorTitle, text.photoUploadError);
      return;
    }
    trace('photo_check', 'success');

    const normalizedDescription = description.trim().toLowerCase();
    const hasDuplicate = items.some((item) => {
      if (item.isArchived || item.type !== type || item.category !== category) return false;
      if (item.userId && user?.id && item.userId !== user.id) return false;
      const samePhone = (normalizeUkrainianPhoneStrict(item.phone) ?? normalizePhoneText(item.phone)) === normalizedPhone;
      const sameDescription = (item.description ?? '').trim().toLowerCase() === normalizedDescription;
      return samePhone && sameDescription;
    });
    if (hasDuplicate) {
      trace('validate', 'fail', { missing: 'duplicate' });
      Alert.alert(text.duplicateTitle, text.duplicateBody);
      return;
    }
    setSubmitting(true);
    try {
      const createdAt = new Date();
      const donePhotos = getDonePhotos(formPhotos);
      const firstPhoto = donePhotos[0];

      trace('api_call', 'start', { path: 'lost_found' });
      // Bug #6 fix: capture returned key for optimistic UI update
      const newId = await lostFoundService.add({
        type,
        name: name.trim(),
        phone: normalizedPhone,
        category,
        description: description.trim(),
        locationText: locationText.trim(),
        photoUri: firstPhoto?.downloadUrl ?? '',
        photoStoragePath: firstPhoto?.storagePath ?? '',
        userPhotoURL: user?.photoURL || '',
        moderationStatus: 'pending',
        submittedForModerationAt: createdAt.toISOString(),
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        userId: user?.id || '',
        language,
      });
      trace('api_call', 'success');

      // Bug #6 fix: immediately show the pending item in the list for the creator
      const optimisticItem: LostFoundItem = {
        id: newId,
        type,
        name: name.trim(),
        phone: normalizedPhone,
        category,
        description: description.trim(),
        locationText: locationText.trim(),
        photoUri: firstPhoto?.downloadUrl ?? '',
        photoStoragePath: firstPhoto?.storagePath ?? '',
        userPhotoURL: user?.photoURL || '',
        moderationStatus: 'pending',
        submittedForModerationAt: createdAt.toISOString(),
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        userId: user?.id || '',
        language,
      };
      setItems((prev) => [optimisticItem, ...prev]);

      resetForm();
      setAddFormVisible(false);
      trace('user_alert', 'success', { type: 'success' });
      Alert.alert(text.submittedTitle, text.submittedMessage);
    } catch (error) {
      trace('api_call', 'fail', {}, error);
      showUserError(language, 'send', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseItem = (item: LostFoundItem) => {
    Alert.alert(text.closeConfirmTitle, text.closeConfirmBody, [
      { text: text.cancel, style: 'cancel' },
      {
        text: text.closeItem,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setClosingId(item.id);
            try {
              await lostFoundService.close(item.id);
              setItems((prev) => prev.filter((entry) => entry.id !== item.id));
            } catch (error) {
              showUserError(language, 'delete', error);
            } finally {
              setClosingId(null);
            }
          })();
        },
      },
    ]);
  };

  const mapToDetailData = (item: LostFoundItem): DetailItemData => ({
    id: item.id,
    title: item.name || getLostFoundCategoryLabel(item.category, language),
    description: item.description,
    photoUri: item.photoUri,
    photoStoragePath: item.photoStoragePath,
    phone: item.phone,
    category: item.type === 'lost' ? text.typeLost : text.typeFound,
    address: item.locationText,
    status: item.moderationStatus === 'approved'
      ? text.approved
      : item.moderationStatus === 'rejected'
        ? text.rejected
        : text.pending,
    userId: item.userId,
    createdAt: item.createdAt,
    sourceType: 'lostfound',
    sourceId: item.id,
  });

  const openDetail = (item: LostFoundItem) => {
    if (!requireAuthForDetails({ userId: user?.id, navigation, language })) return;
    navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item) });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* FlatList replaces the outer ScrollView for virtualized rendering of lost/found cards */}
      <FlatList
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        data={filteredItems}
        keyExtractor={(item) => item.id}
        initialNumToRender={8}
        windowSize={5}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.title}>{text.title}</Text>
              <Text style={styles.subtitle}>{text.subtitle}</Text>
            </View>

            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{text.listTitle}</Text>
              <Text style={styles.listCount}>{filteredItems.length}</Text>
            </View>

            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color={SCREEN_THEME.textMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={text.searchPlaceholder}
                placeholderTextColor={SCREEN_THEME.textMuted}
                style={styles.searchInput}
                returnKeyType="search"
              />
              {searchQuery.trim() ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.75}>
                  <MaterialCommunityIcons name="close-circle" size={20} color={SCREEN_THEME.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.filterRow}>
              {(['all', 'lost', 'found'] as const).map((filter) => {
                const isActive = typeFilter === filter;
                const label = filter === 'all' ? text.filterAll : typeLabels[filter];
                return (
                  <TouchableOpacity
                    key={filter}
                    style={[styles.filterChip, isActive && styles.filterChipActive]}
                    onPress={() => setTypeFilter(filter)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]} numberOfLines={1}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        }
        renderItem={({ item }) => {
          const itemDate = formatItemDate(item.createdAt, language);
          const freshToday = isToday(item.createdAt);
          const hasItemPhoto = Boolean(item.photoUri?.trim() || item.photoStoragePath?.trim());
          const authorAvatarUri = (item.userId && avatarByUserId[item.userId]) || undefined;
          const modIcon = item.moderationStatus === 'approved'
            ? { name: 'check-circle' as const, color: SCREEN_THEME.woodGreenDark }
            : item.moderationStatus === 'rejected'
              ? { name: 'close-circle' as const, color: SCREEN_THEME.terracottaDark }
              : { name: 'clock-outline' as const, color: '#A08860' };

          const cardContent = (
            <View style={styles.copy}>
                <View style={styles.cardTopRow}>
                  <Text style={[styles.typeBadge, item.type === 'lost' ? styles.lostBadge : styles.foundBadge]} numberOfLines={1}>
                    {typeLabels[item.type]}
                  </Text>
                  {item.isArchived ? <Text style={styles.archiveBadge}>Архів</Text> : null}
                  <View style={styles.dateModRow}>
                    {freshToday ? <Text style={styles.todayBadge}>{text.todayBadge}</Text> : null}
                    {!!itemDate && <Text style={styles.itemDate}>{itemDate}</Text>}
                    <MaterialCommunityIcons name={modIcon.name} size={15} color={modIcon.color} />
                  </View>
                </View>

                <View style={styles.itemTitleBox}>
                  <Text style={styles.itemTitle} numberOfLines={2}>{getLostFoundCategoryLabel(item.category, language)}</Text>
                  {!!item.description && (
                    <Text style={styles.itemDescription} numberOfLines={2}>{item.description}</Text>
                  )}
                  {!!item.locationText && (
                    <Text style={styles.itemLocation} numberOfLines={1}>{item.locationText}</Text>
                  )}
                </View>

                <View style={styles.bottomRow}>
                  <View style={styles.personRow}>
                    <MiniUserAvatar uri={authorAvatarUri} name={item.name || text.anonymous} size={28} borderRadius={10} backgroundColor="#6A8BA5" />
                    <Text style={styles.itemMeta} numberOfLines={1}>{item.name || text.anonymous}</Text>
                  </View>
                  <FeedLikeButton
                    currentUserId={user?.id}
                    likePath="feed_likes/lost_found"
                    likeId={item.id}
                    style={styles.likeAction}
                  />
                </View>

                {item.userId === user?.id ? (
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.closeBtn} onPress={(event) => { event.stopPropagation(); handleCloseItem(item); }} disabled={closingId === item.id} activeOpacity={0.82}>
                      {closingId === item.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.closeBtnText}>{text.closeItem}</Text>}
                    </TouchableOpacity>
                  </View>
                ) : null}
            </View>
          );

          if (hasItemPhoto) {
            return (
              <TouchableOpacity style={styles.card} onPress={() => openDetail(item)} activeOpacity={0.86}>
                <TouchableOpacity
                  style={styles.visualWrap}
                  onPress={(event) => {
                    event.stopPropagation();
                    setPreviewPhoto({ uri: item.photoUri || '', storagePath: item.photoStoragePath });
                  }}
                  activeOpacity={0.85}
                >
                  <AppPhotoImage
                    uri={item.photoUri}
                    storagePath={item.photoStoragePath}
                    style={styles.cardThumb}
                    resizeMode="contain"
                    debugLabel={`LostFound:${item.id}`}
                    showDebugInfo={false}
                  />
                  <View style={[styles.typeDot, item.type === 'lost' ? styles.lostDot : styles.foundDot]}>
                    <MaterialCommunityIcons name={item.type === 'lost' ? 'alert-circle-outline' : 'check-circle-outline'} size={13} color="#fff" />
                  </View>
                </TouchableOpacity>

                {cardContent}
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity style={[styles.card, styles.cardNoPhoto]} onPress={() => openDetail(item)} activeOpacity={0.86}>
              {cardContent}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            {loadingItems ? (
              <ActivityIndicator color={SCREEN_THEME.terracotta} />
            ) : (
              <>
                <MaterialCommunityIcons name={loadError ? 'alert-circle-outline' : 'magnify'} size={28} color={SCREEN_THEME.textMuted} />
                <Text style={styles.emptyText}>{loadError ? text.loadError : text.empty}</Text>
              </>
            )}
          </View>
        }
      />

      {/* -- Fixed "Add request" bar above MiniTabBar (same as Gallery) -- */}
      <View style={styles.addBar}>
        <TouchableOpacity
          style={styles.addBarBtn}
          onPress={() => {
            if (!user) {
              Alert.alert(text.formTitle, text.authRequired, [
                { text: text.cancel, style: 'cancel' },
                { text: text.addRequest, onPress: () => navigation.navigate('LoginScreen') },
              ]);
              return;
            }
            setAddFormVisible(true);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.addBarBtnText}>{text.addRequest}</Text>
        </TouchableOpacity>
      </View>

      <MiniTabBar />

      {/* -- Add request bottom sheet (same pattern as Gallery) -- */}
      <Modal
        visible={addFormVisible}
        transparent
        animationType="slide"
        onRequestClose={handleRequestCloseModal}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={handleRequestCloseModal}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheetWrapper}
        >
          <View style={styles.sheet}>
            {/* Sheet handle */}
            <View style={styles.sheetHandle} />

            {/* Sheet header */}
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
            >
              {/* Type toggle */}
              <View style={styles.typeRow}>
                {(['found', 'lost'] as RequestType[]).map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.typeButton, type === item && styles.typeButtonActive]}
                    onPress={() => setType(item)}
                    activeOpacity={0.82}
                  >
                    <Text style={[styles.typeButtonText, type === item && styles.typeButtonTextActive]}>{typeLabels[item]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput value={name} onChangeText={setName} placeholder={text.namePlaceholder} placeholderTextColor={SCREEN_THEME.textMuted} style={styles.input} />
              <TextInput value={phone} onChangeText={setPhone} placeholder={text.phonePlaceholder} placeholderTextColor={SCREEN_THEME.textMuted} keyboardType="phone-pad" style={styles.input} />
              <TextInput value={locationText} onChangeText={setLocationText} placeholder={text.wherePlaceholder} placeholderTextColor={SCREEN_THEME.textMuted} style={styles.input} />
              <TextInput value={description} onChangeText={setDescription} placeholder={type === 'lost' ? text.descriptionPlaceholder : text.descriptionPlaceholderFound} placeholderTextColor={SCREEN_THEME.textMuted} style={[styles.input, styles.inputMultiline]} multiline numberOfLines={3} />

              <Text style={styles.fieldLabel}>{text.itemLabel}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={true}
                contentContainerStyle={styles.categoryScroller}
              >
                {text.categories.map((item) => (
                  <TouchableOpacity key={item} style={[styles.categoryChip, category === item && styles.categoryChipActive]} onPress={() => setCategory(item)} activeOpacity={0.78}>
                    <Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Photo upload - optional */}
              <Text style={styles.fieldLabel}>{text.photoLabel}</Text>
              {user?.id ? (
                <PhotoUploadField
                  uid={user.id}
                  userName={user?.name ?? ''}
                  maxPhotos={1}
                  storagePath="lost_found"
                  onPhotosChange={setFormPhotos}
                />
              ) : (
                <Text style={styles.signInNote}>{text.authRequired}</Text>
              )}

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitButton, (submitting || hasUploadingPhotos) && styles.submitButtonDisabled]}
                onPress={() => { void handleSubmit(); }}
                activeOpacity={0.86}
                disabled={submitting || hasUploadingPhotos}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>{hasUploadingPhotos ? text.photoUploading : text.addRequest}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* -- Photo preview modal -- */}
      <Modal visible={Boolean(previewPhoto)} transparent animationType="fade" onRequestClose={() => setPreviewPhoto(null)}>
        <TouchableOpacity style={styles.previewBackdrop} activeOpacity={1} onPress={() => setPreviewPhoto(null)}>
          {previewPhoto ? (
            <AppPhotoImage
              uri={previewPhoto.uri}
              storagePath={previewPhoto.storagePath}
              style={styles.previewImage}
              resizeMode="contain"
              debugLabel="LostFoundPreview"
              showDebugInfo={false}
            />
          ) : null}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingBottom: 110 },

  header: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    alignItems: 'center',
    marginBottom: 14,
    ...SCREEN_THEME.raisedShadow,
  },
  title: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 10, textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },

  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  listTitle: { color: SCREEN_THEME.textPrimary, fontSize: 18, fontWeight: '900' },
  listCount: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '900' },
  list: { gap: 10 },
  searchBox: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    paddingVertical: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.cardCream,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  filterChipActive: {
    backgroundColor: SCREEN_THEME.woodGreenDark,
    borderColor: SCREEN_THEME.woodGreenDark,
  },
  filterChipText: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  filterChipTextActive: { color: '#fff' },

  emptyCard: {
    minHeight: 86,
    borderRadius: 18,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyText: { color: SCREEN_THEME.textSecondary, fontWeight: '800' },

  card: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 8,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 8,
  },
  cardNoPhoto: {
    flexDirection: 'column',
  },
  visualWrap: {
    position: 'relative',
    width: '38%',
    minWidth: 118,
    maxWidth: 132,
    flexShrink: 0,
  },
  cardThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 20,
    backgroundColor: '#F0E8D8',
  },
  typeDot: {
    position: 'absolute',
    left: 8,
    top: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: SCREEN_THEME.paperStrong,
  },
  foundDot: { backgroundColor: SCREEN_THEME.woodGreenDark },
  lostDot: { backgroundColor: SCREEN_THEME.terracottaDark },
  copy: { flex: 1, justifyContent: 'space-between', minWidth: 0 },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 5,
  },
  archiveBadge: { fontSize: 10, fontWeight: '700', color: '#fff', backgroundColor: '#8B7355', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  typeBadge: {
    maxWidth: '66%',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    overflow: 'hidden',
  },
  foundBadge: {
    color: SCREEN_THEME.woodGreenDark,
    backgroundColor: 'rgba(155, 183, 123, 0.20)',
  },
  lostBadge: {
    color: SCREEN_THEME.terracottaDark,
    backgroundColor: 'rgba(199, 122, 93, 0.16)',
  },
  todayBadge: {
    color: '#fff',
    backgroundColor: SCREEN_THEME.terracottaDark,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    overflow: 'hidden',
  },
  itemDate: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    flexShrink: 0,
  },
  dateModRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  itemTitleBox: {
    borderWidth: 1.5,
    borderColor: '#1E1A17',
    borderRadius: 16,
    backgroundColor: '#FFF8EA',
    paddingHorizontal: 9,
    paddingVertical: 6,
    minHeight: 52,
    justifyContent: 'center',
  },
  itemTitle: { fontSize: 20, lineHeight: 24, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  itemDescription: { fontSize: 12, lineHeight: 16, color: '#fff', fontWeight: '800', marginTop: 4, backgroundColor: '#7A1E5C', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, overflow: 'hidden' },
  itemLocation: { fontSize: 12, lineHeight: 16, color: SCREEN_THEME.woodGreenDark, fontWeight: '900', marginTop: 5 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 5 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, minWidth: 42 },
  itemMeta: { flex: 1, fontSize: 13, lineHeight: 16, color: SCREEN_THEME.textPrimary, fontWeight: '800' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  phoneAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeAction: {
    minWidth: 44,
    minHeight: 34,
    paddingHorizontal: 8,
  },
  phoneActionText: { color: '#8A5B00', fontSize: 11, fontWeight: '900' },
  closeBtn: { alignSelf: 'flex-start', borderRadius: 11, backgroundColor: SCREEN_THEME.terracotta, paddingHorizontal: 10, paddingVertical: 7 },
  closeBtnText: { color: '#fff', fontSize: 11, fontWeight: '900' },

  // Fixed add bar above MiniTabBar (same as Gallery)
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

  // Bottom sheet (same as Gallery)
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: '#FFFAF4',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '94%',
    minHeight: '88%',
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
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
    backgroundColor: '#EDE3D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseTxt: { fontSize: 14, fontWeight: '700', color: SCREEN_THEME.textSecondary },
  sheetContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },

  // Form fields
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.cardCream,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonActive: { backgroundColor: SCREEN_THEME.woodGreenDark, borderColor: SCREEN_THEME.woodGreenDark },
  typeButtonText: { color: SCREEN_THEME.textPrimary, fontWeight: '900' },
  typeButtonTextActive: { color: '#fff' },
  input: {
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: '#FFF8EA',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    paddingHorizontal: 14,
    marginBottom: 10,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '800',
  },
  inputMultiline: {
    minHeight: 72,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'top',
  },
  fieldLabel: { color: SCREEN_THEME.textPrimary, fontWeight: '900', marginBottom: 8 },
  signInNote: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '700', paddingVertical: 10, lineHeight: 18 },
  categoryScroller: { gap: 8, paddingRight: 20, paddingBottom: 12 },
  categoryChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: SCREEN_THEME.cardCream,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  categoryChipActive: { backgroundColor: '#DCE8D0', borderColor: SCREEN_THEME.woodGreenDark },
  categoryText: { color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '900' },
  categoryTextActive: { color: SCREEN_THEME.woodGreenDark },
  submitButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.woodGreenDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: { opacity: 0.65 },
  submitButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },

  // Photo preview modal
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(18, 16, 14, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  previewImage: { width: '100%', height: '100%' },
});

export default LostAndFoundScreen;

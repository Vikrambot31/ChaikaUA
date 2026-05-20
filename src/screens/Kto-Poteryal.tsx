import React, { useEffect, useMemo, useState } from 'react';
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
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import MiniUserAvatar from '../components/MiniUserAvatar';
import TactileIcon from '../components/TactileIcon';
import AppPhotoImage from '../components/AppPhotoImage';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { SCREEN_THEME } from '../utils/screenTheme';
import { RootState } from '../redux/store';
import { lostFoundService, LostFoundItem, RequestType } from '../services/lostFoundService';
import { showUserError } from '../utils/userFacingErrors';
import { safeCallPhone } from '../utils/communicationActions';
import { validatePhone } from '../utils/validators';
import { normalizePhoneText } from '../utils/textUtils';
import { get, ref } from 'firebase/database';
import { database } from '../firebase-config';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import type { DetailItemData } from '../utils/detailViewTypes';

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
    sendErrorTitle: 'Помилка',
    sendError: 'Не вдалося надіслати заявку. Спробуйте ще раз.',
    authRequired: 'Увійдіть в акаунт, щоб додати заявку.',
    phoneError: 'Введіть коректний номер телефону (+380...).',
    title: 'Хто загубив?',
    subtitle: 'Знайдені та загублені речі. Усі заявки видимі для мешканців селища.',
    namePlaceholder: 'Ім\'я',
    phonePlaceholder: 'Телефон',
    itemLabel: 'Річ',
    addRequest: '+ Додати заявку',
    listTitle: 'Заявки',
    empty: 'Поки немає заявок.',
    closeItem: 'Знайдено - закрити',
    closeConfirmTitle: 'Закрити оголошення?',
    closeConfirmBody: 'Після закриття воно зникне зі списку.',
    cancel: 'Скасувати',
    photoLabel: 'Фото (необов\'язково)',
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
    sendErrorTitle: 'Ошибка',
    sendError: 'Не удалось отправить заявку. Попробуйте еще раз.',
    authRequired: 'Войдите в аккаунт, чтобы добавить заявку.',
    phoneError: 'Введите корректный номер телефона (+380...).',
    title: 'Кто потерял?',
    subtitle: 'Найденные и потерянные вещи. Все заявки видны жителям поселка.',
    namePlaceholder: 'Имя',
    phonePlaceholder: 'Телефон',
    itemLabel: 'Вещь',
    addRequest: '+ Добавить заявку',
    listTitle: 'Заявки',
    empty: 'Пока нет заявок.',
    closeItem: 'Найдено - закрыть',
    closeConfirmTitle: 'Закрыть объявление?',
    closeConfirmBody: 'После закрытия оно исчезнет из списка.',
    cancel: 'Отмена',
    photoLabel: 'Фото (необязательно)',
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
    sendErrorTitle: 'Error',
    sendError: 'Could not send the request. Please try again.',
    authRequired: 'Sign in to add a request.',
    phoneError: 'Enter a valid phone number (+380...).',
    title: 'Who lost it?',
    subtitle: 'Lost and found items. All requests are visible to local residents.',
    namePlaceholder: 'Name',
    phonePlaceholder: 'Phone',
    itemLabel: 'Item',
    addRequest: '+ Add request',
    listTitle: 'Requests',
    empty: 'No requests yet.',
    closeItem: 'Found - close',
    closeConfirmTitle: 'Close listing?',
    closeConfirmBody: 'It will disappear from the list.',
    cancel: 'Cancel',
    photoLabel: 'Photo (optional)',
    contact: 'Call',
    anonymous: 'Resident',
  },
} as const;

const getItemIcon = (category: string): React.ComponentProps<typeof MaterialCommunityIcons>['name'] => {
  const value = category.toLowerCase();
  if (value.includes('ключ') || value.includes('key')) return 'key-variant';
  if (value.includes('документ') || value.includes('document')) return 'file-document-outline';
  if (value.includes('телефон') || value.includes('phone')) return 'cellphone';
  if (value.includes('сум') || value.includes('рюк') || value.includes('bag') || value.includes('backpack')) return 'bag-personal-outline';
  if (value.includes('карт') || value.includes('card') || value.includes('брел')) return 'card-account-details-outline';
  if (value.includes('іграш') || value.includes('игруш') || value.includes('toy')) return 'teddy-bear';
  if (value.includes('одяг') || value.includes('одеж') || value.includes('cloth')) return 'tshirt-crew-outline';
  if (value.includes('прикрас') || value.includes('украш') || value.includes('jewel')) return 'diamond-stone';
  return 'magnify';
};

const formatItemDate = (value: string, language: AppLanguage): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = language === 'ua' ? 'uk-UA' : language === 'ru' ? 'ru-RU' : 'en-US';
  return date.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
};

const LostAndFoundScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as AppLanguage;
  const user = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string>>({});
  const [type, setType] = useState<RequestType>('found');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('');
  const [addFormVisible, setAddFormVisible] = useState(false);
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ uri: string; storagePath?: string } | null>(null);

  const typeLabels = useMemo<Record<RequestType, string>>(
    () => ({ found: text.typeFound, lost: text.typeLost }),
    [text.typeFound, text.typeLost]
  );

  useEffect(() => {
    const unsubscribe = lostFoundService.subscribe(setItems);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const userIds = Array.from(new Set(items.map((item) => item.userId).filter((id): id is string => Boolean(id))));
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
  }, [items]);

  useEffect(() => {
    if (!name.trim() && user?.name) {
      setName(user.name);
    }
  }, [name, user?.name]);

  const resetForm = () => {
    setType('found');
    setName(user?.name ?? '');
    setPhone('');
    setCategory('');
    setFormPhotos([]);
  };

  const handleSubmit = async () => {
    if (!phone.trim() || !category) {
      Alert.alert(text.formTitle, text.formError);
      return;
    }
    if (!validatePhone(phone.trim())) {
      Alert.alert(text.sendErrorTitle, text.phoneError);
      return;
    }
    if (!user?.id) {
      Alert.alert(text.sendErrorTitle, text.authRequired);
      return;
    }

    setSubmitting(true);
    try {
      const createdAt = new Date();
      const donePhotos = formPhotos.filter((p) => p.status === 'done');
      const firstPhoto = donePhotos[0];

      await lostFoundService.add({
        type,
        name: name.trim(),
        phone: normalizePhoneText(phone),
        category,
        photoUri: firstPhoto?.downloadUrl ?? '',
        photoStoragePath: firstPhoto?.storagePath ?? '',
        userPhotoURL: user?.photoURL || '',
        moderationStatus: 'pending',
        submittedForModerationAt: createdAt.toISOString(),
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        userId: user?.id || '',
      });

      resetForm();
      setAddFormVisible(false);
      Alert.alert(text.submittedTitle, text.submittedMessage);
    } catch (error) {
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
              await lostFoundService.remove(item.id);
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
    title: item.name || item.category,
    photoUri: item.photoUri,
    photoStoragePath: item.photoStoragePath,
    phone: item.phone,
    category: item.type === 'lost' ? text.typeLost : text.typeFound,
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
    navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item) });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* -- Main scrollable content -- */}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.subtitle}>{text.subtitle}</Text>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>{text.listTitle}</Text>
          <Text style={styles.listCount}>{items.length}</Text>
        </View>

        <View style={styles.list}>
          {items.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="magnify" size={28} color={SCREEN_THEME.textMuted} />
              <Text style={styles.emptyText}>{text.empty}</Text>
            </View>
          ) : (
            items.map((item) => {
              const itemDate = formatItemDate(item.createdAt, language);
              const hasItemPhoto = Boolean(item.photoUri || item.photoStoragePath);
              const modIcon = item.moderationStatus === 'approved'
                ? { name: 'check-circle' as const, color: SCREEN_THEME.woodGreenDark }
                : item.moderationStatus === 'rejected'
                  ? { name: 'close-circle' as const, color: SCREEN_THEME.terracottaDark }
                  : { name: 'clock-outline' as const, color: '#A08860' };

              return (
                <TouchableOpacity key={item.id} style={styles.card} onPress={() => openDetail(item)} activeOpacity={0.86}>
                  <TouchableOpacity
                    style={styles.visualWrap}
                    onPress={(event) => {
                      event.stopPropagation();
                      if (hasItemPhoto) setPreviewPhoto({ uri: item.photoUri, storagePath: item.photoStoragePath });
                    }}
                    activeOpacity={hasItemPhoto ? 0.85 : 1}
                  >
                    {hasItemPhoto ? (
                      <AppPhotoImage
                        uri={item.photoUri}
                        storagePath={item.photoStoragePath}
                        style={styles.cardThumb}
                        resizeMode="cover"
                        debugLabel={`LostFound:${item.id}`}
                        showDebugInfo={false}
                      />
                    ) : (
                      <View style={[styles.cardThumb, styles.cardThumbPlaceholder]}>
                        <MaterialCommunityIcons name={getItemIcon(item.category)} size={26} color="#B8A888" />
                      </View>
                    )}
                    <View style={[styles.typeDot, item.type === 'lost' ? styles.lostDot : styles.foundDot]}>
                      <MaterialCommunityIcons name={item.type === 'lost' ? 'alert-circle-outline' : 'check-circle-outline'} size={13} color="#fff" />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.copy}>
                    <View style={styles.cardTopRow}>
                      <Text style={[styles.typeBadge, item.type === 'lost' ? styles.lostBadge : styles.foundBadge]} numberOfLines={1}>
                        {typeLabels[item.type]}
                      </Text>
                      <View style={styles.dateModRow}>
                        {!!itemDate && <Text style={styles.itemDate}>{itemDate}</Text>}
                        <MaterialCommunityIcons name={modIcon.name} size={15} color={modIcon.color} />
                      </View>
                    </View>

                    <View style={styles.itemTitleBox}>
                      <Text style={styles.itemTitle} numberOfLines={2}>{item.category}</Text>
                    </View>

                    <View style={styles.bottomRow}>
                      <View style={styles.personRow}>
                        <MiniUserAvatar uri={(item.userId && avatarByUserId[item.userId]) || item.userPhotoURL || ''} name={item.name || text.anonymous} size={28} borderRadius={10} backgroundColor="#6A8BA5" />
                        <Text style={styles.itemMeta} numberOfLines={1}>{item.name || text.anonymous}</Text>
                      </View>
                      <TouchableOpacity style={styles.phoneAction} onPress={(event) => { event.stopPropagation(); void safeCallPhone(item.phone, language); }} activeOpacity={0.75}>
                        <TactileIcon icon="phone-outline" size={34} iconSize={14} backgroundColor="#403933" />
                      </TouchableOpacity>
                    </View>

                    {item.userId === user?.id ? (
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.closeBtn} onPress={(event) => { event.stopPropagation(); handleCloseItem(item); }} disabled={closingId === item.id} activeOpacity={0.82}>
                          {closingId === item.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.closeBtnText}>{text.closeItem}</Text>}
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* -- Fixed "Add request" bar above MiniTabBar (same as Gallery) -- */}
      <View style={styles.addBar}>
        <TouchableOpacity
          style={styles.addBarBtn}
          onPress={() => setAddFormVisible(true)}
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
        onRequestClose={() => setAddFormVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setAddFormVisible(false)}
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
              <TouchableOpacity onPress={() => setAddFormVisible(false)} style={styles.sheetCloseBtn} activeOpacity={0.7}>
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

              <Text style={styles.fieldLabel}>{text.itemLabel}</Text>
              <View style={styles.categoryGrid}>
                {text.categories.map((item) => (
                  <TouchableOpacity key={item} style={[styles.categoryChip, category === item && styles.categoryChipActive]} onPress={() => setCategory(item)} activeOpacity={0.78}>
                    <Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Photo upload - optional, same as Gallery */}
              <Text style={styles.fieldLabel}>{text.photoLabel}</Text>
              <PhotoUploadField
                uid={user?.id ?? ''}
                userName={user?.name ?? ''}
                maxPhotos={1}
                storagePath="lost_found"
                onPhotosChange={(photos) => setFormPhotos(photos.filter((p) => p.status === 'done'))}
              />

              {/* Submit */}
              <TouchableOpacity
                style={styles.submitButton}
                onPress={() => { void handleSubmit(); }}
                activeOpacity={0.86}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>{text.addRequest}</Text>}
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
  cardThumbPlaceholder: {
    backgroundColor: '#F0E8D8',
    alignItems: 'center',
    justifyContent: 'center',
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
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 5 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, minWidth: 42 },
  itemMeta: { flex: 1, fontSize: 13, lineHeight: 16, color: SCREEN_THEME.textPrimary, fontWeight: '800' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  phoneAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  fieldLabel: { color: SCREEN_THEME.textPrimary, fontWeight: '900', marginBottom: 8 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
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

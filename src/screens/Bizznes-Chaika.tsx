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
import { normalizePhoneText, sanitizeStoredText } from '../utils/textUtils';
import { RootState } from '../redux/store';
import { getModerationUserMessage, showUserError } from '../utils/userFacingErrors';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { equalTo, get, limitToLast, onValue, orderByChild, push, query, ref, remove } from 'firebase/database';
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
import { assertTextMatchesLanguage, getLanguageValidationError, normalizeAppLang, type AppLang } from '../utils/contentLanguageGuard';
import UserCardActionBar from '../components/UserCardActionBar';
import { useUserAvatarMap } from '../hooks/useUserAvatarMap';
import { useOperationTrace } from '../hooks/useOperationTrace';
import { createPendingModeration, type ModerationStatus } from '../utils/moderation';
import { resolveMediaAccessUrls } from '../services/mediaAccess';
import { ensureFirebaseAuth, requireWriteSession } from '../firebase-auth-session';
import { getBuildingsByStreet, getStreets } from '../data/buildings';
import { subscribeActiveBonusPromotions, type BonusPromotion } from '../services/bonusService';
import ScreenTooltip from '../components/ScreenTooltip';
import { BUSINESS_CHAIKA_TOOLTIP } from '../utils/screenTooltips';

const BIZ_LISTING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BIZ_LISTINGS_PATH = 'biznes_chaika_listings';
const BIZ_PHOTO_STORAGE_PATH = 'biznes_chaika_listings';
const BIZ_ACTIVE_LIMIT = 100;
const BIZ_ACTIVE_LIMIT_BUFFER = 20;
const BIZ_FEED_MINIMUM = 10;
const BIZ_ARCHIVED_FALLBACK_LIMIT = 20;
const BIZ_INITIAL_PHOTO_RESOLVE_LIMIT = 25;
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const PROFILE_FETCH_TIMEOUT_MS = 5_000;
const MAX_PROFILE_CACHE_SIZE = 500;
const DRAFT_SAVE_DEBOUNCE_MS = 900;
const BIZ_DRAFT_KEY = '@chaika:biz_draft';

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

const BIZ_CATEGORY_VALUES = [
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
  'medicine',
  'auto',
  'pets',
  'real_estate',
  'legal_finance',
  'events',
  'tourism',
  'cleaning',
  'logistics',
  'home_food',
  'rentals',
  'other',
] as const;

type BizCategoryValue = typeof BIZ_CATEGORY_VALUES[number];

const OFFER_TYPE_VALUES = ['products', 'services', 'promotions', 'partnership'] as const;
/** Map legacy DB values (copied from Kuplu-Prodam condition) to business offer types */
const LEGACY_OFFER_TYPE_MAP: Record<string, string> = {
  new: 'products',
  like_new: 'services',
  good: 'promotions',
  fair: 'partnership',
};
const WORK_FORMAT_VALUES = ['offline', 'online', 'mixed'] as const;
const WORK_HOURS_VALUES = ['daily', 'weekdays', 'weekends', 'by_appointment'] as const;
const LOCATION_AREA_VALUES = ['phase_1', 'phase_2', 'phase_3', 'phase_4', 'sofia', 'other'] as const;

type BizDraft = Partial<{
  itemName: string;
  category: string;
  condition: string;
  price: string;
  priceFrom: string;
  priceTo: string;
  description: string;
  phone: string;
  contactName: string;
  addFormVisible: boolean;
  isExtraExpanded: boolean;
  workFormat: string;
  workHours: string;
  locationArea: string;
  locationStreet: string;
  locationHouseNumber: string;
}>;

interface BizListing {
  id: string;
  itemName: string;
  contactName?: string;
  category: string;
  condition: string;
  price: string;
  description: string;
  phone: string;
  photoUri: string;
  photoStoragePath?: string;
  photoId?: string;
  moderationStatus: ModerationStatus;
  submittedForModerationAt: string;
  createdAt: string;
  expiresAt: string;
  userId: string;
  moderationReason?: string;
  rejectionReason?: string;
  showPhone?: boolean;
  workFormat?: string;
  workHours?: string;
  locationArea?: string;
  locationStreet?: string;
  locationHouseNumber?: string;
  isArchived?: boolean;
  language?: AppLang;
}

const normalizeBizPrice = (value: string): string => {
  const sanitized = value.replace(',', '.').replace(/[^\d.]/g, '');
  const numeric = Number(sanitized);
  if (!Number.isFinite(numeric) || sanitized.trim() === '') {
    return sanitized;
  }
  return numeric.toFixed(Number.isInteger(numeric) ? 0 : 2);
};

const parseBizPriceRange = (value: string): { min: number | null; max: number | null } => {
  const parts = String(value || '')
    .split('-')
    .map((part) => Number(part.replace(',', '.').replace(/[^\d.]/g, '')))
    .filter((num) => Number.isFinite(num) && num > 0);
  if (parts.length >= 2) return { min: Math.min(parts[0], parts[1]), max: Math.max(parts[0], parts[1]) };
  if (parts.length === 1) return { min: parts[0], max: parts[0] };
  return { min: null, max: null };
};

const buildBizPriceRange = (from: string, to: string): string => {
  const normalizedFrom = normalizeBizPrice(from);
  const normalizedTo = normalizeBizPrice(to);
  if (normalizedFrom && normalizedTo) return `${normalizedFrom} - ${normalizedTo}`;
  return normalizedFrom || normalizedTo;
};

const normalizeStoredBizPrice = (value: string): string => {
  if (value.includes('-')) {
    const [from = '', to = ''] = value.split('-').map((part) => part.trim());
    return buildBizPriceRange(from, to);
  }
  return normalizeBizPrice(value);
};

const isRenderablePhotoUri = (value: unknown): boolean =>
  typeof value === 'string' && /^(https?:|file:|content:)\/\//i.test(value.trim());

const normalizeBizPhotoUri = (value: unknown): string =>
  typeof value === 'string' && isRenderablePhotoUri(value) ? value.trim() : '';

const normalizeBizPhotoStoragePath = (photoStoragePath: unknown, photoUri: unknown): string => {
  if (typeof photoStoragePath === 'string' && photoStoragePath.trim()) return photoStoragePath.trim();
  if (typeof photoUri === 'string' && photoUri.trim() && !isRenderablePhotoUri(photoUri)) return photoUri.trim();
  return '';
};

const mapBizItem = (id: string, data: any, isArchived?: boolean): BizListing => ({
  id,
  itemName: data.itemName || '',
  contactName: data.contactName || '',
  category: data.category || '',
  condition: LEGACY_OFFER_TYPE_MAP[data.condition] || data.condition || '',
  price: data.price || '',
  description: data.description || '',
  phone: data.phone || '',
  photoUri: normalizeBizPhotoUri(data.photoUri),
  photoStoragePath: normalizeBizPhotoStoragePath(data.photoStoragePath, data.photoUri),
  photoId: data.photoId || '',
  moderationStatus: isArchived ? 'approved' : (data.moderationStatus || 'pending'),
  submittedForModerationAt: data.submittedForModerationAt || '',
  createdAt: data.createdAt || '',
  expiresAt: data.expiresAt || '',
  userId: data.userId || '',
  moderationReason: isArchived ? '' : (data.moderationReason || data.reason || ''),
  rejectionReason: isArchived ? '' : (data.rejectionReason || data.reason || ''),
  showPhone: data.showPhone !== false,
  workFormat: data.workFormat || '',
  workHours: data.workHours || '',
  locationArea: data.locationArea || '',
  locationStreet: data.locationStreet || '',
  locationHouseNumber: data.locationHouseNumber || '',
  isArchived,
  language: normalizeAppLang(data.language, 'ua'),
});

const biznesChaikaService = {
  subscribe(callback: (items: BizListing[]) => void, currentUserId?: string, onError?: (error: unknown) => void): () => void {
    let requestId = 0;
    let disposed = false;
    let latestApprovedArchived: BizListing[] = [];
    let ownPendingItems: BizListing[] = [];
    let unsubscribeApprovedRef: (() => void) | undefined;
    let unsubscribeOwnRef: (() => void) | undefined;

    const buildMerged = (approvedArchived: BizListing[]): BizListing[] => {
      const ids = new Set(approvedArchived.map((item) => item.id));
      const extras = ownPendingItems.filter((item) => !ids.has(item.id));
      return [...extras, ...approvedArchived];
    };

    const resolvePhotosInBackground = (items: BizListing[], currentRequestId: number): void => {
      const resolvedPhotoUris = new Map<string, string>();
      const publishResolvedPhotos = () => {
        if (disposed || currentRequestId !== requestId) return;
        callback(items.map((item) => {
          const photoUri = resolvedPhotoUris.get(item.id);
          return photoUri ? { ...item, photoUri } : item;
        }));
      };

      const resolveChunk = async (chunk: BizListing[]) => {
        const resolved = await resolveMediaAccessUrls(
          chunk,
          BIZ_PHOTO_STORAGE_PATH,
          (item) => item.photoStoragePath || item.photoUri || '',
          (item, url) => ({ ...item, photoUri: url }),
          { profile: 'list' },
        );
        if (disposed || currentRequestId !== requestId) return;
        resolved.forEach((item) => {
          if (item.photoUri) {
            resolvedPhotoUris.set(item.id, item.photoUri);
          }
        });
        publishResolvedPhotos();
      };

      void resolveChunk(items.slice(0, BIZ_INITIAL_PHOTO_RESOLVE_LIMIT)).then(async () => {
        for (let index = BIZ_INITIAL_PHOTO_RESOLVE_LIMIT; index < items.length; index += BIZ_INITIAL_PHOTO_RESOLVE_LIMIT) {
          if (disposed || currentRequestId !== requestId) return;
          await resolveChunk(items.slice(index, index + BIZ_INITIAL_PHOTO_RESOLVE_LIMIT));
        }
      }).catch((error) => {
        console.warn('[biznesChaikaService] media resolve failed:', error);
      });
    };

    void ensureFirebaseAuth().then(() => {
      if (disposed) return;

      const listRef = query(
        ref(database, BIZ_LISTINGS_PATH),
        orderByChild('moderationStatus'),
        equalTo('approved'),
        limitToLast(BIZ_ACTIVE_LIMIT + BIZ_ACTIVE_LIMIT_BUFFER),
      );

      unsubscribeApprovedRef = onValue(listRef, (snapshot) => {
        if (disposed) return;
        requestId += 1;
        const currentRequestId = requestId;
        const raw = snapshot.val();
        const now = Date.now();
        const active: BizListing[] = raw
          ? Object.entries(raw as Record<string, any>)
              .map(([id, data]) => mapBizItem(id, data))
              .filter((item) => {
                const expired = item.expiresAt && new Date(item.expiresAt).getTime() < now;
                return item.moderationStatus === 'approved' && !expired;
              })
              .reverse()
              .slice(0, BIZ_ACTIVE_LIMIT)
          : [];

        if (active.length >= BIZ_FEED_MINIMUM) {
          latestApprovedArchived = active;
          const merged = buildMerged(active);
          callback(merged);
          resolvePhotosInBackground(merged, currentRequestId);
          return;
        }

        callback(buildMerged(active));

        void get(query(ref(database, BIZ_LISTINGS_PATH), orderByChild('moderationStatus'), equalTo('expired'), limitToLast(BIZ_ARCHIVED_FALLBACK_LIMIT))).then((expiredSnapshot) => {
          if (disposed || currentRequestId !== requestId) return;
          const expiredRaw = expiredSnapshot.val();
          const archived: BizListing[] = expiredRaw
            ? Object.entries(expiredRaw as Record<string, any>)
                .map(([id, data]) => mapBizItem(id, data, true))
                .reverse()
            : [];
          const combined = [...active, ...archived];
          latestApprovedArchived = combined;
          const merged = buildMerged(combined);
          callback(merged);
          resolvePhotosInBackground(merged, currentRequestId);
        }).catch((error) => {
          console.warn('[biznesChaikaService] expired fallback load failed:', error);
          if (disposed || currentRequestId !== requestId) return;
          latestApprovedArchived = active;
          resolvePhotosInBackground(buildMerged(active), currentRequestId);
        });
      }, (error) => {
        console.warn('[biznesChaikaService] approved subscription failed:', error);
        if (!disposed) {
          callback([]);
          onError?.(error);
        }
      });

      if (currentUserId) {
        const ownRef = query(ref(database, BIZ_LISTINGS_PATH), orderByChild('userId'), equalTo(currentUserId));
        unsubscribeOwnRef = onValue(ownRef, (snapshot) => {
          if (disposed) return;
          const raw = snapshot.val();
          ownPendingItems = raw
            ? Object.entries(raw as Record<string, any>)
                .map(([id, data]) => mapBizItem(id, data))
                .filter((item) => item.moderationStatus !== 'approved')
            : [];
          callback(buildMerged(latestApprovedArchived));
        }, (error) => {
          console.warn('[biznesChaikaService] own subscription failed:', error);
          ownPendingItems = [];
          if (!disposed) onError?.(error);
        });
      }
    }).catch((error) => {
      console.warn('[biznesChaikaService] auth bootstrap failed:', error);
      if (!disposed) {
        callback([]);
        onError?.(error);
      }
    });

    return () => {
      disposed = true;
      requestId += 1;
      unsubscribeApprovedRef?.();
      unsubscribeOwnRef?.();
    };
  },

  async add(item: Omit<BizListing, 'id'>): Promise<string> {
    try {
      const user = await requireWriteSession({
        expectedUserId: item.userId,
        operation: 'create',
        screen: 'Bizznes-Chaika',
      });
      const pendingModeration = createPendingModeration();
      const expiresAt = item.expiresAt || new Date(Date.now() + BIZ_LISTING_TTL_MS).toISOString();
      const photoStoragePath = item.photoStoragePath || item.photoUri;
      const sanitized = {
        ...item,
        itemName: sanitizeStoredText(item.itemName),
        contactName: sanitizeStoredText(item.contactName || ''),
        category: sanitizeStoredText(item.category),
        condition: sanitizeStoredText(item.condition),
        price: normalizeStoredBizPrice(item.price),
        description: sanitizeStoredText(item.description),
        phone: sanitizeStoredText(item.phone),
        userId: user.uid,
        photoStoragePath,
        photoUri: '',
        photoId: sanitizeStoredText(item.photoId || ''),
        workFormat: sanitizeStoredText(item.workFormat || ''),
        workHours: sanitizeStoredText(item.workHours || ''),
        locationArea: sanitizeStoredText(item.locationArea || ''),
        locationStreet: sanitizeStoredText(item.locationStreet || ''),
        locationHouseNumber: sanitizeStoredText(item.locationHouseNumber || ''),
        expiresAt,
        moderationStatus: pendingModeration.moderationStatus,
        submittedForModerationAt: pendingModeration.submittedForModerationAt,
        language: normalizeAppLang(item.language, 'ua'),
      };
      assertTextMatchesLanguage(`${sanitized.itemName} ${sanitized.description}`.trim(), sanitized.language);
      const newRef = await push(ref(database, BIZ_LISTINGS_PATH), sanitized);
      return newRef.key!;
    } catch (error) {
      console.error('[biznesChaikaService] add failed:', error);
      throw error;
    }
  },

  async remove(id: string): Promise<void> {
    try {
      const user = await requireWriteSession({
        operation: 'remove',
        screen: 'Bizznes-Chaika',
      });
      const snapshot = await get(ref(database, `${BIZ_LISTINGS_PATH}/${id}`));
      const existing = snapshot.exists() ? snapshot.val() as Partial<BizListing> : null;
      if (!existing || existing.userId !== user.uid) {
        throw new Error('owner_required');
      }
      await remove(ref(database, `${BIZ_LISTINGS_PATH}/${id}`));
    } catch (error) {
      console.error('[biznesChaikaService] remove failed:', error);
      throw error;
    }
  },
};

const WORK_FORMAT_LABELS = {
  offline: { ua: 'Офлайн', ru: 'Офлайн', en: 'Offline' },
  online: { ua: 'Онлайн', ru: 'Онлайн', en: 'Online' },
  mixed: { ua: 'Змішаний', ru: 'Смешанный', en: 'Mixed' },
} as const;

const WORK_HOURS_LABELS = {
  daily: { ua: 'Щоденно', ru: 'Ежедневно', en: 'Daily' },
  weekdays: { ua: 'Будні', ru: 'Будни', en: 'Weekdays' },
  weekends: { ua: 'Вихідні', ru: 'Выходные', en: 'Weekends' },
  by_appointment: { ua: 'За домовленістю', ru: 'По договоренности', en: 'By appointment' },
} as const;

const LOCATION_AREA_LABELS = {
  phase_1: { ua: '1 черга', ru: '1 очередь', en: 'Phase 1' },
  phase_2: { ua: '2 черга', ru: '2 очередь', en: 'Phase 2' },
  phase_3: { ua: '3 черга', ru: '3 очередь', en: 'Phase 3' },
  phase_4: { ua: '4 черга', ru: '4 очередь', en: 'Phase 4' },
  sofia: { ua: 'Софіївська', ru: 'Софиевская', en: 'Sofiivska' },
  other: { ua: 'Інше', ru: 'Другое', en: 'Other' },
} as const;

const UI_TEXT = {
  ua: {
    title: 'Бізнес на Чайці',
    subtitle: 'Розкажіть про свій бізнес мешканцям ЖК Чайка',
    businessNameLabel: 'Назва бізнесу',
    businessNamePlaceholder: 'Наприклад: Кава вдома',
    categoryLabel: 'Сфера бізнесу',
    conditionLabel: 'Тип пропозиції',
    priceLabel: 'Ціна',
    priceFromLabel: 'Ціна від',
    priceToLabel: 'Ціна до',
    priceError: 'Вкажіть коректну ціну від або до.',
    phoneLabel: 'Контактний телефон',
    contactNameLabel: 'Контактна особа',
    contactNamePlaceholder: 'Ім\'я людини для зв\'язку',
    photoLabel: 'Фото',
    addPhoto: 'Обрати з Моїх фотографій',
    removePhoto: 'Прибрати фото',
    descriptionLabel: 'Опис бізнесу',
    submitBtn: 'Опублікувати',
    addRequest: '+ Додати бізнес',
    formTitle: 'Мій бізнес',
    errorFill: 'Заповніть усі поля',
    errorPhone: 'Перевірте номер телефону',
    successTitle: 'Готово',
    successMsg: 'Бізнес опубліковано. Тепер мешканці можуть знайти вас.',
    deleteConfirmTitle: 'Видалити?',
    deleteConfirmMsg: 'Ви впевнені, що хочете видалити цей бізнес?',
    deleteCancel: 'Скасувати',
    deleteBtn: 'Видалити',
    listingsTitle: 'Бізнеси поруч',
    filterLabel: 'Фільтр',
    filterAll: 'Усі',
    pending: 'На модерації',
    approved: 'Схвалено',
    rejected: 'Відхилено',
    noDesc: 'Без тексту',
    selectCategory: 'Оберіть сферу...',
    selectCondition: 'Оберіть тип...',
    errorSave: 'Не вдалося зберегти бізнес',
    errorTitle: 'Помилка',
    deleteText: 'Видалити',
    conditionLabels: { products: 'Товари', services: 'Послуги', promotions: 'Акції', partnership: 'Партнерство' },
    categories: {
      furniture: 'Кафе / Ресторан',
      appliances: 'Магазин',
      electronics: 'Послуги',
      kids: 'Краса та здоров\'я',
      clothes: 'Спорт та фітнес',
      sport: 'Освіта',
      books: 'Ремонт та будівництво',
      kitchen: 'Доставка',
      construction: 'IT та технології',
      plants: 'Хендмейд та творчість',
      medicine: 'Медицина та консультації',
      auto: 'Авто та транспорт',
      pets: 'Тварини та зоотовари',
      real_estate: 'Нерухомість та оренда',
      legal_finance: 'Юридичні та фінансові послуги',
      events: 'Свята та події',
      tourism: 'Туризм та відпочинок',
      cleaning: 'Клінінг та побут',
      logistics: 'Переїзди та вантажі',
      home_food: 'Домашня їжа та випічка',
      rentals: 'Прокат та обладнання',
      other: 'Інше',
    },
    searchButton: 'Пошук',
    searchTitle: 'Пошук бізнесу',
    searchName: 'Назва бізнесу',
    searchCategory: 'Сфера',
    searchCondition: 'Пропозиція',
    searchPriceFrom: 'Ціна від',
    searchPriceTo: 'Ціна до',
    searchContact: 'Телефон або контактна особа',
    searchDescription: 'Опис',
    searchAnyCategory: 'Будь-яка сфера',
    searchAnyCondition: 'Будь-яка пропозиція',
    searchPlaceholderName: 'Наприклад: Кава вдома',
    searchPlaceholderContact: '+380... або інший контакт',
    searchPlaceholderDescription: 'Пошук по тексту',
    searchReset: 'Скинути',
    searchApply: 'Показати',
    clearSearch: 'Скинути пошук',
    noSearchResults: 'Бізнесів не знайдено',
    noSearchResultsSub: 'Спробуйте прибрати частину фільтрів.',
    showPhoneToggle: 'Показувати телефон на картці',
    categoryHint: 'Оберіть сферу, до якої належить ваш бізнес.',
    conditionHint: 'Оберіть тип вашої пропозиції.',
    ageHint: 'Вкажіть діапазон ціни або одне з полів.',
    phoneHint: "Залиште номер, за яким з вами можна зв'язатися.",
    contactNameHint: 'Необов\'язково: ім\'я менеджера, майстра або власника.',
    descriptionHint: 'Опишіть свій бізнес, товари або послуги.',
    makeInteresting: 'Додаткова інформація',
    workFormatLabel: 'Формат роботи',
    workHoursLabel: 'Графік роботи',
    locationAreaLabel: 'Розташування на Чайці',
    locationStreetLabel: 'Вулиця',
    locationHouseLabel: 'Номер будинку',
    selectWorkFormat: 'Оберіть формат...',
    selectWorkHours: 'Оберіть графік...',
    selectLocationArea: 'Оберіть розташування...',
    selectLocationStreet: 'Оберіть вулицю...',
    selectLocationHouse: 'Оберіть будинок...',
    descriptionRequired: 'Додайте опис вашого бізнесу.',
    authRequired: 'Для публікації бізнесу потрібна реєстрація.',
    live: 'НАЖИВО',
    liveCount: (count: number) => `всього ${count} бізнесів на Чайці`,
    topAnketyTitle: 'Топ бізнеси',
  },
  ru: {
    title: 'Бизнес на Чайке',
    subtitle: 'Расскажите о своем бизнесе жителям ЖК Чайка',
    businessNameLabel: 'Название бизнеса',
    businessNamePlaceholder: 'Например: Кофе на дом',
    categoryLabel: 'Сфера бизнеса',
    conditionLabel: 'Тип предложения',
    priceLabel: 'Цена',
    priceFromLabel: 'Цена от',
    priceToLabel: 'Цена до',
    priceError: 'Укажите корректную цену от или до.',
    phoneLabel: 'Контактный телефон',
    contactNameLabel: 'Контактное лицо',
    contactNamePlaceholder: 'Имя человека для связи',
    photoLabel: 'Фото',
    addPhoto: 'Выбрать из Моих фотографий',
    removePhoto: 'Убрать фото',
    descriptionLabel: 'Описание бизнеса',
    submitBtn: 'Опубликовать',
    addRequest: '+ Добавить бизнес',
    formTitle: 'Мой бизнес',
    errorFill: 'Заполните все поля',
    errorPhone: 'Проверьте номер телефона',
    successTitle: 'Готово',
    successMsg: 'Бизнес опубликован. Теперь жители могут найти вас.',
    deleteConfirmTitle: 'Удалить?',
    deleteConfirmMsg: 'Вы уверены, что хотите удалить этот бизнес?',
    deleteCancel: 'Отмена',
    deleteBtn: 'Удалить',
    listingsTitle: 'Бизнесы рядом',
    filterLabel: 'Фильтр',
    filterAll: 'Все',
    pending: 'На модерации',
    approved: 'Одобрено',
    rejected: 'Отклонено',
    noDesc: 'Без текста',
    selectCategory: 'Выберите сферу...',
    selectCondition: 'Выберите тип...',
    errorSave: 'Не удалось сохранить бизнес',
    errorTitle: 'Ошибка',
    deleteText: 'Удалить',
    conditionLabels: { products: 'Товары', services: 'Услуги', promotions: 'Акции', partnership: 'Партнерство' },
    categories: {
      furniture: 'Кафе / Ресторан',
      appliances: 'Магазин',
      electronics: 'Услуги',
      kids: 'Красота и здоровье',
      clothes: 'Спорт и фитнес',
      sport: 'Образование',
      books: 'Ремонт и строительство',
      kitchen: 'Доставка',
      construction: 'IT и технологии',
      plants: 'Хендмейд и творчество',
      medicine: 'Медицина и консультации',
      auto: 'Авто и транспорт',
      pets: 'Животные и зоотовары',
      real_estate: 'Недвижимость и аренда',
      legal_finance: 'Юридические и финансовые услуги',
      events: 'Праздники и события',
      tourism: 'Туризм и отдых',
      cleaning: 'Клининг и быт',
      logistics: 'Переезды и грузы',
      home_food: 'Домашняя еда и выпечка',
      rentals: 'Прокат и оборудование',
      other: 'Другое',
    },
    searchButton: 'Поиск',
    searchTitle: 'Поиск бизнеса',
    searchName: 'Название бизнеса',
    searchCategory: 'Сфера',
    searchCondition: 'Предложение',
    searchPriceFrom: 'Цена от',
    searchPriceTo: 'Цена до',
    searchContact: 'Телефон или контактное лицо',
    searchDescription: 'Описание',
    searchAnyCategory: 'Любая сфера',
    searchAnyCondition: 'Любое предложение',
    searchPlaceholderName: 'Например: Кофе на дом',
    searchPlaceholderContact: '+380... или другой контакт',
    searchPlaceholderDescription: 'Поиск по тексту',
    searchReset: 'Сбросить',
    searchApply: 'Показать',
    clearSearch: 'Сбросить поиск',
    noSearchResults: 'Бизнесов не найдено',
    noSearchResultsSub: 'Попробуйте убрать часть фильтров.',
    showPhoneToggle: 'Показывать телефон на карточке',
    categoryHint: 'Выберите сферу, к которой относится ваш бизнес.',
    conditionHint: 'Выберите тип вашего предложения.',
    ageHint: 'Укажите диапазон цены или одно из полей.',
    phoneHint: 'Оставьте номер, по которому с вами можно связаться.',
    contactNameHint: 'Необязательно: имя менеджера, мастера или владельца.',
    descriptionHint: 'Опишите свой бизнес, товары или услуги.',
    makeInteresting: 'Дополнительная информация',
    workFormatLabel: 'Формат работы',
    workHoursLabel: 'График работы',
    locationAreaLabel: 'Расположение на Чайке',
    locationStreetLabel: 'Улица',
    locationHouseLabel: 'Номер дома',
    selectWorkFormat: 'Выберите формат...',
    selectWorkHours: 'Выберите график...',
    selectLocationArea: 'Выберите расположение...',
    selectLocationStreet: 'Выберите улицу...',
    selectLocationHouse: 'Выберите дом...',
    descriptionRequired: 'Добавьте описание вашего бизнеса.',
    authRequired: 'Для публикации бизнеса требуется регистрация.',
    live: 'В ЭФИРЕ',
    liveCount: (count: number) => `всего ${count} бизнесов на Чайке`,
    topAnketyTitle: 'Топ бизнесы',
  },
  en: {
    title: 'Business at Chaika',
    subtitle: 'Tell Chaika residents about your business',
    businessNameLabel: 'Business name',
    businessNamePlaceholder: 'For example: Coffee at home',
    categoryLabel: 'Business type',
    conditionLabel: 'Offer type',
    priceLabel: 'Price',
    priceFromLabel: 'Price from',
    priceToLabel: 'Price to',
    priceError: 'Enter a valid price from or to.',
    phoneLabel: 'Phone',
    contactNameLabel: 'Contact person',
    contactNamePlaceholder: 'Name of the person to contact',
    photoLabel: 'Photo',
    addPhoto: 'Choose from My photos',
    removePhoto: 'Remove photo',
    descriptionLabel: 'Business description',
    submitBtn: 'Publish',
    addRequest: '+ Add business',
    formTitle: 'My business',
    errorFill: 'Fill all fields',
    errorPhone: 'Check phone number',
    successTitle: 'Done',
    successMsg: 'Business published. Now residents can find you.',
    deleteConfirmTitle: 'Delete?',
    deleteConfirmMsg: 'Are you sure you want to delete this business?',
    deleteCancel: 'Cancel',
    deleteBtn: 'Delete',
    listingsTitle: 'Businesses nearby',
    filterLabel: 'Filter',
    filterAll: 'All',
    pending: 'Pending moderation',
    approved: 'Approved',
    rejected: 'Rejected',
    noDesc: 'No text',
    selectCategory: 'Select type...',
    selectCondition: 'Select offer...',
    errorSave: 'Failed to save business',
    errorTitle: 'Error',
    deleteText: 'Delete',
    conditionLabels: { products: 'Products', services: 'Services', promotions: 'Promotions', partnership: 'Partnership' },
    categories: {
      furniture: 'Cafe / Restaurant',
      appliances: 'Store',
      electronics: 'Services',
      kids: 'Beauty & Health',
      clothes: 'Sports & Fitness',
      sport: 'Education',
      books: 'Repair & Construction',
      kitchen: 'Delivery',
      construction: 'IT & Technology',
      plants: 'Handmade & Crafts',
      medicine: 'Medicine & Consultations',
      auto: 'Auto & Transport',
      pets: 'Pets & Pet Goods',
      real_estate: 'Real Estate & Rent',
      legal_finance: 'Legal & Finance',
      events: 'Events & Celebrations',
      tourism: 'Tourism & Leisure',
      cleaning: 'Cleaning & Home Care',
      logistics: 'Moving & Cargo',
      home_food: 'Homemade Food & Bakery',
      rentals: 'Rentals & Equipment',
      other: 'Other',
    },
    searchButton: 'Search',
    searchTitle: 'Search business',
    searchName: 'Business name',
    searchCategory: 'Type',
    searchCondition: 'Offer',
    searchPriceFrom: 'Price from',
    searchPriceTo: 'Price to',
    searchContact: 'Phone or contact person',
    searchDescription: 'Description',
    searchAnyCategory: 'Any type',
    searchAnyCondition: 'Any offer',
    searchPlaceholderName: 'For example: Coffee at home',
    searchPlaceholderContact: '+380... or other contact',
    searchPlaceholderDescription: 'Search by text',
    searchReset: 'Reset',
    searchApply: 'Apply',
    clearSearch: 'Clear search',
    noSearchResults: 'No businesses found',
    noSearchResultsSub: 'Try removing some filters.',
    showPhoneToggle: 'Show phone on card',
    categoryHint: 'Choose the category of your business.',
    conditionHint: 'Choose your offer type.',
    ageHint: 'Enter a price range or at least one field.',
    phoneHint: 'Leave a number people can use to contact you.',
    contactNameHint: 'Optional: manager, specialist, or owner name.',
    descriptionHint: 'Describe your business, products or services.',
    makeInteresting: 'Additional info',
    workFormatLabel: 'Work format',
    workHoursLabel: 'Working hours',
    locationAreaLabel: 'Location at Chaika',
    locationStreetLabel: 'Street',
    locationHouseLabel: 'Building number',
    selectWorkFormat: 'Select format...',
    selectWorkHours: 'Select hours...',
    selectLocationArea: 'Select location...',
    selectLocationStreet: 'Select street...',
    selectLocationHouse: 'Select building...',
    descriptionRequired: 'Add a description of your business.',
    authRequired: 'Registration is required to publish a business.',
    live: 'LIVE',
    liveCount: (count: number) => `${count} businesses at Chaika`,
    topAnketyTitle: 'Top businesses',
  },
} as const;

const BiznesChaikaScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const navLock = useRef(false);
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector((state: RootState) => state.auth.user);
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const text = UI_TEXT[language];
  const toast = useSoftToast();
  const { startOperation, trace } = useOperationTrace('Biznes-XXX');
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState(() => (user?.phone ? normalizePhoneText(user.phone) : '+380'));
  const [contactName, setContactName] = useState('');
  const [isExtraExpanded, setIsExtraExpanded] = useState(false);
  const [workFormat, setWorkFormat] = useState('');
  const [workHours, setWorkHours] = useState('');
  const [locationArea, setLocationArea] = useState('');
  const [locationStreet, setLocationStreet] = useState('');
  const [locationHouseNumber, setLocationHouseNumber] = useState('');
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [showPhoneOnCard, setShowPhoneOnCard] = useState(true);
  const [listings, setListings] = useState<BizListing[]>([]);
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
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraftRef = useRef({ itemName, category, condition, priceFrom, priceTo, description, phone, contactName, addFormVisible, isExtraExpanded, workFormat, workHours, locationArea, locationStreet, locationHouseNumber });
  const avatarByUserId = useUserAvatarMap(listings.map((item) => item.userId));
  const previousAddFormVisibleRef = useRef(addFormVisible);
  const skipNextDraftFlushRef = useRef(false);

  const getCategoryLabel = useCallback(
    (value: string) => text.categories[value as BizCategoryValue] ?? value,
    [text.categories],
  );
  const chaikaStreets = useMemo(() => getStreets(), []);
  const chaikaBuildingsInStreet = useMemo(
    () => (locationStreet ? getBuildingsByStreet(locationStreet) : []),
    [locationStreet],
  );

  const handleLocationStreetChange = useCallback((street: string) => {
    setLocationStreet(street);
    setLocationHouseNumber('');
  }, []);

  const handleRequestCloseModal = useCallback(() => {
    const defaultPhone = user?.phone ? normalizePhoneText(user.phone) : '+380';
    const isDirty =
      itemName.trim() !== '' ||
      category !== '' ||
      condition !== '' ||
      priceFrom.trim() !== '' ||
      priceTo.trim() !== '' ||
      description.trim() !== '' ||
      phone.trim() !== defaultPhone ||
      contactName.trim() !== '' ||
      workFormat !== '' ||
      workHours !== '' ||
      locationArea !== '' ||
      locationStreet !== '' ||
      locationHouseNumber !== '' ||
      formPhotos.length > 0 ||
      !showPhoneOnCard;
    if (!isDirty) {
      skipNextDraftFlushRef.current = true;
      void AsyncStorage.removeItem(BIZ_DRAFT_KEY).catch(() => {});
      setAddFormVisible(false);
      return;
    }
    const closeTitle = language === 'ua' ? 'Закрити форму?' : language === 'ru' ? 'Закрыть форму?' : 'Close form?';
    const closeMsg = language === 'ua' ? 'Ви ще не зберегли. Закрити?' : language === 'ru' ? 'Вы еще не сохранили. Закрыть?' : 'You have not saved. Close?';
    Alert.alert(
      closeTitle,
      closeMsg,
      [
        { text: language === 'ua' ? 'Ні' : language === 'ru' ? 'Нет' : 'No', style: 'cancel' },
        { text: language === 'ua' ? 'Так' : language === 'ru' ? 'Да' : 'Yes', onPress: () => setAddFormVisible(false) },
      ],
    );
  }, [category, condition, contactName, description, formPhotos.length, itemName, language, locationArea, locationHouseNumber, locationStreet, phone, priceFrom, priceTo, showPhoneOnCard, user?.phone, workFormat, workHours]);

  useEffect(() => {
    let isMounted = true;
    setListingsReady(false);
    setListingsLoadError(false);
    const unsubscribe = biznesChaikaService.subscribe((items) => {
      setListingsReady(true);
      setListingsLoadError(false);
      setListings(items);
    }, user?.id, () => {
      setListingsReady(true);
      setListingsLoadError(true);
    });
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(BIZ_DRAFT_KEY);
        if (!isMounted || !raw) return;
        const draft = JSON.parse(raw) as BizDraft;
        if (draft.itemName) setItemName(draft.itemName);
        if (draft.category) setCategory(draft.category);
        if (draft.condition) setCondition(draft.condition);
        if (draft.priceFrom) setPriceFrom(draft.priceFrom);
        if (draft.priceTo) setPriceTo(draft.priceTo);
        if (!draft.priceFrom && !draft.priceTo && draft.price) {
          const [from = '', to = ''] = draft.price.split('-').map((part) => part.trim());
          setPriceFrom(from);
          setPriceTo(to);
        }
        if (draft.description) setDescription(draft.description);
        if (draft.phone) setPhone(draft.phone);
        if (draft.contactName) setContactName(draft.contactName);
        if (draft.isExtraExpanded) setIsExtraExpanded(true);
        if (draft.workFormat) setWorkFormat(draft.workFormat);
        if (draft.workHours) setWorkHours(draft.workHours);
        if (draft.locationArea) setLocationArea(draft.locationArea);
        if (draft.locationStreet) setLocationStreet(draft.locationStreet);
        if (draft.locationHouseNumber) setLocationHouseNumber(draft.locationHouseNumber);
        if (draft.addFormVisible) setAddFormVisible(true);
        await AsyncStorage.removeItem(BIZ_DRAFT_KEY);
      } catch { /* ignore */ }
    })();
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    return subscribeActiveBonusPromotions('business', setActivePromotions);
  }, []);

  useEffect(() => {
    latestDraftRef.current = { itemName, category, condition, priceFrom, priceTo, description, phone, contactName, addFormVisible, isExtraExpanded, workFormat, workHours, locationArea, locationStreet, locationHouseNumber };
  }, [addFormVisible, category, condition, contactName, description, itemName, locationArea, locationHouseNumber, locationStreet, phone, priceFrom, priceTo, workFormat, workHours, isExtraExpanded]);

  const saveDraftNow = useCallback((visible = latestDraftRef.current.addFormVisible) => {
    if (!visible) return;
    const { itemName: draftItemName, category: draftCategory, condition: draftCondition, priceFrom: draftPriceFrom, priceTo: draftPriceTo, description: draftDescription, phone: draftPhone, contactName: draftContactName, isExtraExpanded: draftExtra, workFormat: draftWorkFormat, workHours: draftWorkHours, locationArea: draftLocationArea, locationStreet: draftLocationStreet, locationHouseNumber: draftLocationHouseNumber } = latestDraftRef.current;
    void AsyncStorage.setItem(
      BIZ_DRAFT_KEY,
      JSON.stringify({ itemName: draftItemName, category: draftCategory, condition: draftCondition, priceFrom: draftPriceFrom, priceTo: draftPriceTo, description: draftDescription, phone: draftPhone, contactName: draftContactName, addFormVisible: true, isExtraExpanded: draftExtra, workFormat: draftWorkFormat, workHours: draftWorkHours, locationArea: draftLocationArea, locationStreet: draftLocationStreet, locationHouseNumber: draftLocationHouseNumber }),
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
  }, [addFormVisible, category, condition, contactName, description, itemName, locationArea, locationHouseNumber, locationStreet, phone, priceFrom, priceTo, saveDraftNow, workFormat, workHours, isExtraExpanded]);

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
      const itemPriceRange = parseBizPriceRange(item.price);

      if (selectedFilterCategory && item.category !== selectedFilterCategory) return false;
      if (searchCategory && item.category !== searchCategory) return false;
      if (searchCondition && item.condition !== searchCondition) return false;
      if (queryItemName && !item.itemName.toLowerCase().includes(queryItemName)) return false;
      if (queryContact) {
        const contactHaystack = `${item.phone} ${item.contactName || ''}`.toLowerCase();
        if (!contactHaystack.includes(queryContact)) return false;
      }
      if (queryDescription && !item.description.toLowerCase().includes(queryDescription)) return false;
      if (priceFrom !== null && Number.isFinite(priceFrom) && (itemPriceRange.max === null || itemPriceRange.max < priceFrom)) return false;
      if (priceTo !== null && Number.isFinite(priceTo) && (itemPriceRange.min === null || itemPriceRange.min > priceTo)) return false;
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
    const promotedByListingId = new Map(
      activePromotions
        .filter((promotion) => promotion.targetId)
        .map((promotion, index) => [promotion.targetId, index]),
    );
    return [...listings]
      .filter((item) => !item.isArchived && (item.photoUri || item.photoStoragePath || promotedByListingId.has(item.id)))
      .sort((a, b) => {
        const aPromoted = promotedByListingId.get(a.id);
        const bPromoted = promotedByListingId.get(b.id);
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
    setItemName('');
    setCategory('');
    setCondition('');
    setPriceFrom('');
    setPriceTo('');
    setDescription('');
    setPhone('+380');
    setContactName('');
    setIsExtraExpanded(false);
    setWorkFormat('');
    setWorkHours('');
    setLocationArea('');
    setLocationStreet('');
    setLocationHouseNumber('');
    setFormPhotos([]);
    setSubmitAttempted(false);
    void AsyncStorage.removeItem(BIZ_DRAFT_KEY).catch(() => {});
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
    const normalizedPriceFrom = priceFrom.replace(',', '.').replace(/[^\d.]/g, '');
    const normalizedPriceTo = priceTo.replace(',', '.').replace(/[^\d.]/g, '');
    const numericPriceFrom = Number(normalizedPriceFrom);
    const numericPriceTo = Number(normalizedPriceTo);
    const hasPriceFrom = Boolean(normalizedPriceFrom);
    const hasPriceTo = Boolean(normalizedPriceTo);
    const priceValid =
      (hasPriceFrom && Number.isFinite(numericPriceFrom) && numericPriceFrom > 0) ||
      (hasPriceTo && Number.isFinite(numericPriceTo) && numericPriceTo > 0);

    const trimmedItemName = itemName.trim();

    if (!category || !condition || !description.trim() || !phone.trim() || !priceValid) {
      trace('validate', 'fail', { missing: 'requiredFields' });
      toast.showWarning(text.errorTitle, text.errorFill);
      return;
    }
    if (!priceValid) {
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

      const finalItemName = trimmedItemName || getCategoryLabel(category);
      const createdAt = new Date();

      trace('api_call', 'start', { path: BIZ_LISTINGS_PATH });
      await biznesChaikaService.add({
        itemName: finalItemName,
        category,
        condition,
        price: buildBizPriceRange(normalizedPriceFrom, normalizedPriceTo),
        description: description.trim(),
        phone: normalizePhoneText(phone),
        contactName: contactName.trim(),
        photoUri: resolvedPhotoUri,
        photoStoragePath: resolvedStoragePath,
        photoId: '',
        moderationStatus: 'pending',
        submittedForModerationAt: createdAt.toISOString(),
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + BIZ_LISTING_TTL_MS).toISOString(),
        userId: user?.id || '',
        showPhone: showPhoneOnCard,
        workFormat,
        workHours,
        locationArea,
        locationStreet,
        locationHouseNumber,
        language,
      });
      trace('api_call', 'success');

      trace('user_alert', 'success', { type: 'success' });
      toast.showSuccess(text.successTitle, text.successMsg);
      resetForm();
      setAddFormVisible(false);
    } catch (error) {
      trace('api_call', 'fail', {}, error);
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
            await biznesChaikaService.remove(id);
          } catch (error) {
            showUserError(language, 'delete', error);
          }
        },
      },
    ]);
  };

  const mapToDetailData = (item: BizListing, ownerAvatarUri?: string): DetailItemData => {
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
      sourceType: 'biznes',
      sourceId: item.id,
    };
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenTooltip
        storageKey={BUSINESS_CHAIKA_TOOLTIP.storageKey}
        title={BUSINESS_CHAIKA_TOOLTIP.title}
        items={BUSINESS_CHAIKA_TOOLTIP.items}
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
                  {BIZ_CATEGORY_VALUES.map((value) => (
                    <Picker.Item key={`search-category-${value}`} label={getCategoryLabel(value)} value={value} />
                  ))}
                </Picker>
              </View>

              <Text style={styles.formLabel}>{text.searchCondition}</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={searchCondition} onValueChange={setSearchCondition} style={styles.picker}>
                  <Picker.Item label={text.searchAnyCondition} value="" />
                  {OFFER_TYPE_VALUES.map((value) => (
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
                const businessName = item.itemName || getCategoryLabel(item.category);
                const categoryLabel = getCategoryLabel(item.category);
                const conditionLabel = text.conditionLabels[item.condition as keyof typeof text.conditionLabels] ?? item.condition;
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
                    <Text style={styles.topAnketyName} numberOfLines={1} ellipsizeMode="tail">{businessName}</Text>
                    <Text style={styles.topAnketyMeta} numberOfLines={1} ellipsizeMode="tail">
                      {[categoryLabel, conditionLabel].filter(Boolean).join(' • ')}
                    </Text>
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
            <Text style={styles.emptyFilteredTitle}>{language === 'en' ? 'Could not load businesses' : language === 'ru' ? 'Не удалось загрузить бизнесы' : 'Не вдалося завантажити бізнеси'}</Text>
            <Text style={styles.emptyFilteredSub}>{language === 'en' ? 'Check the internet connection or try refreshing the screen.' : language === 'ru' ? 'Проверьте интернет или попробуйте обновить экран.' : 'Перевірте інтернет або спробуйте оновити екран.'}</Text>
          </View>
        )}

        {!listingsLoadError && listings.length > 0 && (
          <View style={styles.listingsSection}>
            <Text style={styles.formLabel}>{text.filterLabel}</Text>
            <View style={styles.pickerWrapper}>
              <Picker selectedValue={selectedFilterCategory} onValueChange={setSelectedFilterCategory} style={styles.picker}>
                <Picker.Item label={text.filterAll} value="" />
                {BIZ_CATEGORY_VALUES.map((value) => (
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
                const priceText = item.price ? `${item.price}` : '';
                const categoryLabel = getCategoryLabel(item.category);
                const descriptionText = item.description?.trim() || text.noDesc;
                const displayName = item.itemName || profile?.name || getCategoryLabel(item.category);
                const modMsg = getModerationUserMessage(language, item.moderationStatus, item.rejectionReason || item.moderationReason);
                const showModInfo = isOwn && item.moderationStatus !== 'approved';
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
                          debugLabel={`Biz:${item.id}`}
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
                          {priceText ? (
                            <View style={styles.kAgeBadge}>
                              <Text style={styles.kAgeText}>{priceText}</Text>
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
                      likePath="feed_likes/biznes"
                      likeId={item.id}
                      showLikeAvatars
                    />
                    {isOwn ? (
                      <TouchableOpacity style={styles.kDeleteLink} onPress={() => handleDelete(item.id)} activeOpacity={0.8}>
                        <MaterialCommunityIcons name="trash-can-outline" size={14} color="#C0392B" />
                        <Text style={styles.kDeleteLinkText}>{text.deleteText}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
      <View style={styles.addBar}>
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
              <View style={[styles.formSection, styles.formSectionGreen]}>
              <Text style={styles.formLabel}>{text.businessNameLabel}</Text>
              <TextInput
                placeholder={text.businessNamePlaceholder}
                value={itemName}
                onChangeText={setItemName}
                style={styles.input}
                placeholderTextColor="#A0938D"
                maxLength={80}
              />

              <Text style={styles.formLabel}>{text.categoryLabel}</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={category} onValueChange={setCategory} style={styles.picker}>
                  <Picker.Item label={text.selectCategory} value="" />
                  {BIZ_CATEGORY_VALUES.map((value) => (
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
                  {OFFER_TYPE_VALUES.map((value) => (
                    <Picker.Item key={value} label={text.conditionLabels[value]} value={value} />
                  ))}
                </Picker>
              </View>
              <InlineFieldHint message={text.conditionHint} type={condition ? 'success' : 'hint'} />
              <FormFieldError error={!condition && submitAttempted ? text.errorFill : undefined} />
              </View>

              <View style={[styles.formSection, styles.formSectionBlue]}>
              <Text style={styles.formLabel}>{text.priceLabel}</Text>
              <View style={styles.priceRangeRow}>
                <View style={styles.priceRangeField}>
                  <Text style={styles.miniLabel}>{text.priceFromLabel}</Text>
                  <TextInput
                    placeholder="0"
                    value={priceFrom}
                    onChangeText={(value) => setPriceFrom(value.replace(',', '.').replace(/[^\d.]/g, ''))}
                    keyboardType="decimal-pad"
                    style={styles.input}
                    placeholderTextColor="#A0938D"
                  />
                </View>
                <View style={styles.priceRangeField}>
                  <Text style={styles.miniLabel}>{text.priceToLabel}</Text>
                  <TextInput
                    placeholder="0"
                    value={priceTo}
                    onChangeText={(value) => setPriceTo(value.replace(',', '.').replace(/[^\d.]/g, ''))}
                    keyboardType="decimal-pad"
                    style={styles.input}
                    placeholderTextColor="#A0938D"
                  />
                </View>
              </View>
              <InlineFieldHint message={text.ageHint} type={priceFrom.trim() || priceTo.trim() ? 'success' : 'hint'} />
              <FormFieldError error={submitAttempted && (!priceFrom.trim() && !priceTo.trim()) ? text.priceError : undefined} />
              </View>

              <View style={[styles.formSection, styles.formSectionWarm]}>
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

              </View>

              <TouchableOpacity
                style={styles.interestingBtn}
                onPress={() => setIsExtraExpanded((prev) => !prev)}
                activeOpacity={0.84}
              >
                <MaterialCommunityIcons name="star-four-points-outline" size={18} color="#7A1E5C" />
                <Text style={styles.interestingBtnText}>{text.makeInteresting}</Text>
                <MaterialCommunityIcons name={isExtraExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#7A1E5C" />
              </TouchableOpacity>

              {isExtraExpanded ? (
                <View style={styles.interestingSection}>
                  <Text style={styles.formLabel}>{text.contactNameLabel}</Text>
                  <TextInput
                    placeholder={text.contactNamePlaceholder}
                    value={contactName}
                    onChangeText={setContactName}
                    style={styles.input}
                    placeholderTextColor="#A0938D"
                    maxLength={60}
                  />
                  <InlineFieldHint message={text.contactNameHint} type={contactName.trim() ? 'success' : 'hint'} />

                  <Text style={styles.formLabel}>{text.photoLabel}</Text>
                  {user?.id ? (
                    <PhotoUploadField
                      uid={user.id}
                      userName={user?.name ?? ''}
                      maxPhotos={5}
                      storagePath={BIZ_PHOTO_STORAGE_PATH}
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

                  <Text style={styles.formLabel}>{text.workFormatLabel}</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker selectedValue={workFormat} onValueChange={setWorkFormat} style={styles.picker}>
                      <Picker.Item label={text.selectWorkFormat} value="" />
                      {WORK_FORMAT_VALUES.map((value) => (
                        <Picker.Item key={value} label={WORK_FORMAT_LABELS[value][language]} value={value} />
                      ))}
                    </Picker>
                  </View>

                  <Text style={styles.formLabel}>{text.workHoursLabel}</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker selectedValue={workHours} onValueChange={setWorkHours} style={styles.picker}>
                      <Picker.Item label={text.selectWorkHours} value="" />
                      {WORK_HOURS_VALUES.map((value) => (
                        <Picker.Item key={value} label={WORK_HOURS_LABELS[value][language]} value={value} />
                      ))}
                    </Picker>
                  </View>

                  <Text style={styles.formLabel}>{text.locationAreaLabel}</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker selectedValue={locationArea} onValueChange={setLocationArea} style={styles.picker}>
                      <Picker.Item label={text.selectLocationArea} value="" />
                      {LOCATION_AREA_VALUES.map((value) => (
                        <Picker.Item key={value} label={LOCATION_AREA_LABELS[value][language]} value={value} />
                      ))}
                    </Picker>
                  </View>

                  <Text style={styles.formLabel}>{text.locationStreetLabel}</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker selectedValue={locationStreet} onValueChange={handleLocationStreetChange} style={styles.picker}>
                      <Picker.Item label={text.selectLocationStreet} value="" />
                      {chaikaStreets.map((street) => (
                        <Picker.Item key={street} label={street} value={street} />
                      ))}
                    </Picker>
                  </View>

                  <Text style={styles.formLabel}>{text.locationHouseLabel}</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker
                      selectedValue={locationHouseNumber}
                      onValueChange={setLocationHouseNumber}
                      style={styles.picker}
                      enabled={Boolean(locationStreet)}
                    >
                      <Picker.Item label={text.selectLocationHouse} value="" />
                      {chaikaBuildingsInStreet.map((building) => (
                        <Picker.Item key={building.id} label={building.houseNumber} value={building.houseNumber} />
                      ))}
                    </Picker>
                  </View>
                </View>
              ) : null}

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
  miniLabel: { color: SCREEN_THEME.textSecondary, fontSize: 11, fontWeight: '900', marginBottom: 6 },
  formSection: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  formSectionGreen: { backgroundColor: '#E6F0E9', borderColor: '#B8D3BF' },
  formSectionBlue: { backgroundColor: '#EDF5F8', borderColor: '#B7D4DF' },
  formSectionWarm: { backgroundColor: '#FFF8EA', borderColor: '#E4D0AB' },
  priceRangeRow: { flexDirection: 'row', gap: 10 },
  priceRangeField: { flex: 1 },
  signInNote: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '700', paddingVertical: 10, lineHeight: 18 },
  input: { backgroundColor: '#F7F3EE', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: SCREEN_THEME.textPrimary, borderWidth: 1, borderColor: '#E8DDD3' },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  pickerWrapper: { backgroundColor: '#F7F3EE', borderRadius: 16, borderWidth: 1, borderColor: '#E8DDD3', overflow: 'hidden' },
  picker: { color: SCREEN_THEME.textPrimary, height: 50 },
  submitBtn: { backgroundColor: SCREEN_THEME.terracotta, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800' },
  topAnketySection: { marginBottom: 16 },
  topAnketyTitle: { fontSize: 14, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 8 },
  topAnketyScroll: { paddingHorizontal: 4, paddingBottom: 4, gap: 12 },
  topAnketyItem: {
    width: 118,
    borderRadius: 14,
    padding: 8,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  topAnketyPhoto: {
    width: '100%',
    height: 76,
    borderRadius: 10,
    backgroundColor: '#FFF3E0',
    marginBottom: 7,
  },
  topAnketyName: {
    fontSize: 13,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    width: '100%',
    textAlign: 'left',
  },
  topAnketyMeta: {
    fontSize: 10,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    width: '100%',
    textAlign: 'left',
    marginTop: 3,
  },
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
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#7A1E5C',
  },
  kDescText: {
    fontSize: 12,
    color: '#fff',
    lineHeight: 17,
    fontWeight: '800',
  },
  kInterestingChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  kInterestingChip: {
    backgroundColor: '#FFF8EA',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    borderRadius: 999,
    color: '#5F5043',
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
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
  kPhoto: {
    width: 92,
    height: 108,
    borderRadius: 14,
    backgroundColor: '#FFF3E0',
  },
  kDeleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  kDeleteLinkText: { color: '#C0392B', fontSize: 11, fontWeight: '800' },
  interestingBtn: {
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    borderColor: '#CE93D8',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  interestingBtnText: { color: '#7A1E5C', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  interestingSection: {
    backgroundColor: '#FFF8EA',
    borderColor: '#E4D0AB',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  consultationLink: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
  },
  consultationLinkText: { color: '#2D7E4D', flex: 1, fontSize: 13, fontWeight: '900', lineHeight: 18 },
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
    borderBottomColor: '#B8D3BF',
    backgroundColor: '#E6F0E9',
  },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: '#2D7E4D' },
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

export default BiznesChaikaScreen;

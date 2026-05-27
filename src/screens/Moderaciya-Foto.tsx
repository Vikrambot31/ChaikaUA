import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { get, ref } from 'firebase/database';
import { useSelector } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import AppPhotoImage from '../components/AppPhotoImage';
import type { RootState } from '../redux/store';
import { CommunityPhoto } from '../types/app';
import { database, firebaseChatAPI, photoAPI } from '../firebase-config';
import { isModeratorUser } from '../firebase-auth-session';
import { buySellService, BuySellListing } from '../services/buySellService';
import { contactsService, ContactListing } from '../services/contactsService';
import { jobService, JobListing } from '../services/jobService';
import { lostFoundService, LostFoundItem } from '../services/lostFoundService';
import { moderateOsbbNews, OsbbNewsItem } from '../services/osbbNews';
import { SCREEN_THEME } from '../utils/screenTheme';
import { logClientError } from '../utils/errorLogger';

type Tab = 'requests' | 'photos' | 'buysell' | 'contacts' | 'jobs' | 'lostfound' | 'osbbnews';
type Lang = 'ua' | 'ru' | 'en';

type ModerationRequest = {
  id: string;
  name?: string;
  text?: string;
  phone?: string;
  category?: string;
  status?: string;
  createdAt?: number;
};

type ModerationOsbbNews = OsbbNewsItem & {
  buildingId: string;
};
type PreviewPhoto = { uri: string; storagePath?: string };

const TABS: { key: Tab; labelUa: string; labelRu: string; labelEn: string }[] = [
  { key: 'requests', labelUa: 'Заявки', labelRu: 'Заявки', labelEn: 'Requests' },
  { key: 'photos', labelUa: 'Фото', labelRu: 'Фото', labelEn: 'Photos' },
  { key: 'buysell', labelUa: 'Оголошення', labelRu: 'Объявления', labelEn: 'Buy/Sell' },
  { key: 'contacts', labelUa: 'Контакти', labelRu: 'Контакты', labelEn: 'Contacts' },
  { key: 'jobs', labelUa: 'Робота', labelRu: 'Работа', labelEn: 'Jobs' },
  { key: 'lostfound', labelUa: 'Знахідки', labelRu: 'Находки', labelEn: 'Lost & Found' },
  { key: 'osbbnews', labelUa: 'Новини', labelRu: 'Новости', labelEn: 'OSBB News' },
];

const T = {
  ua: {
    title: 'Центр модерації',
    subtitle: 'Керуйте всім контентом від користувачів',
    moderatorActive: 'Режим модератора активний',
    viewOnly: 'Лише перегляд',
    noAccess: 'Доступ тільки для модераторів',
    noItems: 'Нічого немає',
    author: 'Автор',
    phone: 'Телефон',
    status: 'Статус',
    category: 'Категорія',
    age: 'Вік',
    type: 'Тип',
    approve: 'Схвалити',
    reject: 'Відхилити',
    delete: 'Видалити',
    approved: 'Схвалено',
    pending: 'Очікує',
    rejected: 'Відхилено',
    price: 'Ціна',
    workType: 'Тип роботи',
    errorTitle: 'Помилка',
    actionFailed: 'Дію не вдалося виконати',
  },
  ru: {
    title: 'Центр модерации',
    subtitle: 'Управляйте всем контентом пользователей',
    moderatorActive: 'Режим модератора активен',
    viewOnly: 'Только просмотр',
    noAccess: 'Только для модераторов',
    noItems: 'Нет данных',
    author: 'Автор',
    phone: 'Телефон',
    status: 'Статус',
    category: 'Категория',
    age: 'Возраст',
    type: 'Тип',
    approve: 'Одобрить',
    reject: 'Отклонить',
    delete: 'Удалить',
    approved: 'Одобрено',
    pending: 'Ожидает',
    rejected: 'Отклонено',
    price: 'Цена',
    workType: 'Тип работы',
    errorTitle: 'Ошибка',
    actionFailed: 'Действие не выполнено',
  },
  en: {
    title: 'Moderation Center',
    subtitle: 'Manage all user-generated content',
    moderatorActive: 'Moderator mode active',
    viewOnly: 'View only',
    noAccess: 'Moderators only',
    noItems: 'Nothing here',
    author: 'Author',
    phone: 'Phone',
    status: 'Status',
    category: 'Category',
    age: 'Age',
    type: 'Type',
    approve: 'Approve',
    reject: 'Reject',
    delete: 'Delete',
    approved: 'Approved',
    pending: 'Pending',
    rejected: 'Rejected',
    price: 'Price',
    workType: 'Work type',
    errorTitle: 'Error',
    actionFailed: 'Action could not be completed',
  },
} as const;

const isPublicGalleryPhoto = (photo: CommunityPhoto): boolean => {
  const title = typeof photo.title === 'string' ? photo.title.trim() : '';
  const isLegacyPersonalDefault = title === 'Photo' || title === 'Р¤РѕС‚Рѕ';
  return photo.target === 'gallery_public' && !isLegacyPersonalDefault;
};

const PhotoModerationScreen: React.FC = () => {
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ru') as Lang);
  const text = T[language];

  const [activeTab, setActiveTab] = useState<Tab>('requests');
  const [isModerator, setIsModerator] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Data for each tab
  const [requests, setRequests] = useState<ModerationRequest[]>([]);
  const [photos, setPhotos] = useState<CommunityPhoto[]>([]);
  const [buysell, setBuysell] = useState<BuySellListing[]>([]);
  const [contacts, setContacts] = useState<ContactListing[]>([]);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [lostfound, setLostfound] = useState<LostFoundItem[]>([]);
  const [osbbNews, setOsbbNews] = useState<ModerationOsbbNews[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<PreviewPhoto | null>(null);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const tab = activeTab;
      const loaders: Promise<void>[] = [];

      loaders.push((async () => {
        const reqRes = await firebaseChatAPI.getRequestsPaginated({ limit: 200 });
        if (reqRes.success && reqRes.data) {
          setRequests(reqRes.data.map((item) => ({
            id: item.id,
            name: item.name,
            text: item.text ?? item.description,
            phone: item.phone,
            category: item.category,
            status: item.status || (item.isApproved ? 'approved' : 'pending'),
            createdAt: item.timestamp,
          })));
        }
      })());

      if (tab === 'photos' || tab === 'requests') {
        loaders.push((async () => {
          const photoRes = await photoAPI.getPhotosOnce();
          if (photoRes.success && photoRes.data) {
            setPhotos(photoRes.data.filter(isPublicGalleryPhoto));
          }
        })());
      }

      if (tab === 'buysell') {
        loaders.push((async () => {
          try {
            const snap = await get(ref(database, 'buy_sell_listings'));
            if (snap.exists()) {
              const raw = snap.val() as Record<string, Record<string, unknown>>;
              setBuysell(Object.entries(raw).map(([id, d]) => ({ ...(d as Omit<BuySellListing, 'id'>), id })));
            }
          } catch (error: unknown) {
            void logClientError('ModeraciyaFoto.loadBuySell', error, {
              firebasePath: 'buy_sell_listings',
              stage: 'read_moderation_list',
            });
            throw error;
          }
        })());
      }

      if (tab === 'contacts') {
        loaders.push((async () => {
          try {
            const snap = await get(ref(database, 'contacts_listings'));
            if (snap.exists()) {
              const raw = snap.val() as Record<string, Record<string, unknown>>;
              setContacts(Object.entries(raw).map(([id, d]) => ({ ...(d as Omit<ContactListing, 'id'>), id })));
            }
          } catch (error: unknown) {
            void logClientError('ModeraciyaFoto.loadContacts', error, {
              firebasePath: 'contacts_listings',
              stage: 'read_moderation_list',
            });
            throw error;
          }
        })());
      }

      if (tab === 'jobs') {
        loaders.push((async () => {
          try {
            const snap = await get(ref(database, 'job_listings'));
            if (snap.exists()) {
              const raw = snap.val() as Record<string, Record<string, unknown>>;
              setJobs(Object.entries(raw).map(([id, d]) => ({ ...(d as Omit<JobListing, 'id'>), id })));
            }
          } catch (error: unknown) {
            void logClientError('ModeraciyaFoto.loadJobs', error, {
              firebasePath: 'job_listings',
              stage: 'read_moderation_list',
            });
            throw error;
          }
        })());
      }

      if (tab === 'lostfound') {
        loaders.push((async () => {
          try {
            const snap = await get(ref(database, 'lost_found'));
            if (snap.exists()) {
              const raw = snap.val() as Record<string, Record<string, unknown>>;
              setLostfound(Object.entries(raw).map(([id, d]) => ({ ...(d as Omit<LostFoundItem, 'id'>), id })));
            }
          } catch (error: unknown) {
            void logClientError('ModeraciyaFoto.loadLostFound', error, {
              firebasePath: 'lost_found',
              stage: 'read_moderation_list',
            });
            throw error;
          }
        })());
      }

      if (tab === 'osbbnews') {
        loaders.push((async () => {
          try {
            const snap = await get(ref(database, 'osbb_news'));
            if (snap.exists()) {
              const raw = snap.val() as Record<string, Record<string, Record<string, unknown>>>;
              const items = Object.entries(raw).flatMap(([buildingId, newsById]) =>
                Object.entries(newsById || {}).map(([id, d]) => ({
                  ...(d as Omit<ModerationOsbbNews, 'id' | 'buildingId'>),
                  id,
                  buildingId,
                }))
              );
              setOsbbNews(items);
            }
          } catch (error: unknown) {
            void logClientError('ModeraciyaFoto.loadOsbbNews', error, {
              firebasePath: 'osbb_news',
              stage: 'read_moderation_list',
            });
            throw error;
          }
        })());
      }

      await Promise.allSettled(loaders);
    } finally {
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    const init = async () => {
      const mod = await isModeratorUser();
      setIsModerator(Boolean(mod));
      await loadAll();
    };
    void init();
  }, [loadAll]);

  // Actions

  const modAction = useCallback(async (id: string, action: () => Promise<unknown>) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await action();
      await loadAll();
    } catch (e: unknown) {
      Alert.alert(text.errorTitle, e instanceof Error ? e.message : text.actionFailed);
    } finally {
      setBusyId(null);
    }
  }, [busyId, loadAll]);

  const moderatePhoto = useCallback((id: string, status: 'approved' | 'rejected') =>
    modAction(id, () => photoAPI.moderatePhoto(id, status)),
  [modAction]);

  const deletePhoto = useCallback((id: string) =>
    modAction(id, () => photoAPI.deletePhoto(id)),
  [modAction]);

  const deleteRequest = useCallback((id: string) =>
    modAction(id, () => firebaseChatAPI.deleteRequest(id)),
  [modAction]);

  const moderateRequest = useCallback((id: string, status: 'approved' | 'rejected') =>
    modAction(id, () => firebaseChatAPI.moderateRequest(id, status)),
  [modAction]);

  const moderateBuySell = useCallback((id: string, status: 'approved' | 'rejected') =>
    modAction(id, () => buySellService.moderate(id, status)),
  [modAction]);

  const moderateJob = useCallback((id: string, status: 'approved' | 'rejected') =>
    modAction(id, () => jobService.moderate(id, status)),
  [modAction]);

  const moderateLostFound = useCallback((id: string, status: 'approved' | 'rejected') =>
    modAction(id, () => lostFoundService.moderate(id, status)),
  [modAction]);

  const moderateNews = useCallback((item: ModerationOsbbNews, status: 'approved' | 'rejected') =>
    modAction(item.id, () => moderateOsbbNews(item.buildingId, item.id, status)),
  [modAction]);

  const deleteBuySell = useCallback((id: string) =>
    modAction(id, () => buySellService.remove(id)),
  [modAction]);

  const moderateContacts = useCallback((id: string, status: 'approved' | 'rejected') =>
    modAction(id, () => contactsService.moderate(id, status)),
  [modAction]);

  const deleteContacts = useCallback((id: string) =>
    modAction(id, () => contactsService.remove(id)),
  [modAction]);

  const deleteJob = useCallback(async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try { await jobService.remove(id); await loadAll(); } finally { setBusyId(null); }
  }, [busyId, loadAll]);

  const deleteLostFound = useCallback(async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try { await lostFoundService.remove(id); await loadAll(); } finally { setBusyId(null); }
  }, [busyId, loadAll]);

  // Helpers

  const statusLabel = (s?: string) => {
    if (s === 'approved') return text.approved;
    if (s === 'rejected') return text.rejected;
    return text.pending;
  };

  const DeleteBtn = ({ id, onPress }: { id: string; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.actionBtn, styles.deleteBtn]}
      onPress={() => {
        const confirmTitle = language === 'ru' ? 'Удаление' : language === 'en' ? 'Delete' : 'Видалення';
        const confirmMsg = language === 'ru' ? 'Удалить навсегда?' : language === 'en' ? 'Delete permanently?' : 'Видалити назавжди?';
        const confirmYes = language === 'ru' ? 'Удалить' : language === 'en' ? 'Delete' : 'Видалити';
        const confirmNo = language === 'ru' ? 'Отмена' : language === 'en' ? 'Cancel' : 'Скасувати';
        Alert.alert(confirmTitle, confirmMsg, [
          { text: confirmNo, style: 'cancel' },
          { text: confirmYes, style: 'destructive', onPress },
        ]);
      }}
      disabled={busyId === id}
      activeOpacity={0.85}
    >
      {busyId === id
        ? <ActivityIndicator size="small" color="#fff" />
        : <Text style={styles.actionBtnText}>{text.delete}</Text>}
    </TouchableOpacity>
  );

  const ModerationBtns = ({
    id,
    status,
    onApprove,
    onReject,
  }: {
    id: string;
    status?: string;
    onApprove: () => void;
    onReject: () => void;
  }) => (
    <>
      {status !== 'approved' && (
        <TouchableOpacity
          style={[styles.actionBtn, styles.approveBtn]}
          onPress={onApprove}
          disabled={busyId === id}
          activeOpacity={0.85}
        >
          <Text style={styles.actionBtnText}>{text.approve}</Text>
        </TouchableOpacity>
      )}
      {status !== 'rejected' && (
        <TouchableOpacity
          style={[styles.actionBtn, styles.rejectBtn]}
          onPress={onReject}
          disabled={busyId === id}
          activeOpacity={0.85}
        >
          <Text style={styles.actionBtnText}>{text.reject}</Text>
        </TouchableOpacity>
      )}
    </>
  );

  // Tab counts

  const tabCount: Record<Tab, number> = {
    requests: requests.length,
    photos: photos.filter((p) => p.status === 'pending').length,
    buysell: buysell.length,
    contacts: contacts.length,
    jobs: jobs.length,
    lostfound: lostfound.length,
    osbbnews: osbbNews.length,
  };

  // Render tabs content

  const renderRequests = () => (
    <FlatList
      data={requests}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle} numberOfLines={3}>{item.text || '—'}</Text>
          <Text style={styles.cardMeta}>{text.author}: {item.name || '—'}</Text>
          {item.category ? <Text style={styles.cardMeta}>{text.category}: {item.category}</Text> : null}
          {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.status)}</Text>
          <View style={styles.actions}>
            <ModerationBtns
              id={item.id}
              status={item.status}
              onApprove={() => void moderateRequest(item.id, 'approved')}
              onReject={() => void moderateRequest(item.id, 'rejected')}
            />
            <DeleteBtn id={item.id} onPress={() => void deleteRequest(item.id)} />
          </View>
        </View>
      )}
    />
  );

  const renderPhotos = () => (
    <FlatList
      data={[...photos].sort((a, b) => {
        const o = { pending: 0, approved: 1, rejected: 2 };
        return (o[a.status] ?? 1) - (o[b.status] ?? 1);
      })}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setPreviewPhoto({ uri: String(item.imageUri || ''), storagePath: item.storagePath })}
          >
            <AppPhotoImage
              uri={item.imageUri}
              storagePath={item.storagePath}
              style={styles.photoThumb}
              resizeMode="cover"
              debugLabel={`ModeraciyaFoto:photo:${item.id}`}
            />
          </TouchableOpacity>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardMeta}>{text.author}: {item.uploadedBy}</Text>
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.status)}</Text>
          <View style={styles.actions}>
            {item.status !== 'approved' && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => void moderatePhoto(item.id, 'approved')}
                disabled={busyId === item.id}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnText}>{text.approve}</Text>
              </TouchableOpacity>
            )}
            {item.status !== 'rejected' && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => void moderatePhoto(item.id, 'rejected')}
                disabled={busyId === item.id}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnText}>{text.reject}</Text>
              </TouchableOpacity>
            )}
            <DeleteBtn id={item.id} onPress={() => void deletePhoto(item.id)} />
          </View>
        </View>
      )}
    />
  );

  const renderBuySell = () => (
    <FlatList
      data={buysell}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.itemName || '—'}</Text>
          <Text style={styles.cardMeta}>{text.category}: {item.category}</Text>
          {item.price ? <Text style={styles.cardMeta}>{text.price}: {item.price}</Text> : null}
          {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.moderationStatus)}</Text>
          <View style={styles.actions}>
            <ModerationBtns
              id={item.id}
              status={item.moderationStatus}
              onApprove={() => void moderateBuySell(item.id, 'approved')}
              onReject={() => void moderateBuySell(item.id, 'rejected')}
            />
            <DeleteBtn id={item.id} onPress={() => void deleteBuySell(item.id)} />
          </View>
        </View>
      )}
    />
  );

  const renderContacts = () => (
    <FlatList
      data={contacts}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.itemName || '—'}</Text>
          <Text style={styles.cardMeta}>{text.category}: {item.category}</Text>
          {item.price ? <Text style={styles.cardMeta}>{text.age}: {item.price}</Text> : null}
          {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.moderationStatus)}</Text>
          <View style={styles.actions}>
            <ModerationBtns
              id={item.id}
              status={item.moderationStatus}
              onApprove={() => void moderateContacts(item.id, 'approved')}
              onReject={() => void moderateContacts(item.id, 'rejected')}
            />
            <DeleteBtn id={item.id} onPress={() => void deleteContacts(item.id)} />
          </View>
        </View>
      )}
    />
  );

  const renderJobs = () => (
    <FlatList
      data={jobs}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.name || '—'}</Text>
          <Text style={styles.cardMeta}>{text.workType}: {item.workType}</Text>
          {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.moderationStatus)}</Text>
          <View style={styles.actions}>
            <ModerationBtns
              id={item.id}
              status={item.moderationStatus}
              onApprove={() => void moderateJob(item.id, 'approved')}
              onReject={() => void moderateJob(item.id, 'rejected')}
            />
            <DeleteBtn id={item.id} onPress={() => void deleteJob(item.id)} />
          </View>
        </View>
      )}
    />
  );

  const renderLostFound = () => (
    <FlatList
      data={lostfound}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.name || '—'}</Text>
          <Text style={styles.cardMeta}>{text.type}: {item.type}</Text>
          {item.category ? <Text style={styles.cardMeta}>{text.category}: {item.category}</Text> : null}
          {item.phone ? <Text style={styles.cardMeta}>{text.phone}: {item.phone}</Text> : null}
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.moderationStatus)}</Text>
          <View style={styles.actions}>
            <ModerationBtns
              id={item.id}
              status={item.moderationStatus}
              onApprove={() => void moderateLostFound(item.id, 'approved')}
              onReject={() => void moderateLostFound(item.id, 'rejected')}
            />
            <DeleteBtn id={item.id} onPress={() => void deleteLostFound(item.id)} />
          </View>
        </View>
      )}
    />
  );

  const renderOsbbNews = () => (
    <FlatList
      data={osbbNews}
      keyExtractor={(item) => `${item.buildingId}:${item.id}`}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadAll()} />}
      ListEmptyComponent={<Text style={styles.empty}>{text.noItems}</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{item.title || '—'}</Text>
          <Text style={styles.cardMeta}>{text.category}: {item.buildingId}</Text>
          <Text style={styles.cardMeta}>{text.status}: {statusLabel(item.moderationStatus)}</Text>
          <View style={styles.actions}>
            <ModerationBtns
              id={item.id}
              status={item.moderationStatus}
              onApprove={() => void moderateNews(item, 'approved')}
              onReject={() => void moderateNews(item, 'rejected')}
            />
          </View>
        </View>
      )}
    />
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'requests': return renderRequests();
      case 'photos': return renderPhotos();
      case 'buysell': return renderBuySell();
      case 'contacts': return renderContacts();
      case 'jobs': return renderJobs();
      case 'lostfound': return renderLostFound();
      case 'osbbnews': return renderOsbbNews();
    }
  };

  const tabLabel = (tab: typeof TABS[number]) =>
    language === 'ua' ? tab.labelUa : language === 'en' ? tab.labelEn : tab.labelRu;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{text.title}</Text>
        <Text style={styles.headerSub}>{text.subtitle}</Text>
        <View style={[styles.modeBadge, isModerator ? styles.modeBadgeActive : styles.modeBadgeView]}>
          <Text style={styles.modeBadgeText}>{isModerator ? text.moderatorActive : text.viewOnly}</Text>
        </View>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
        {TABS.map((tab) => {
          const count = tabCount[tab.key];
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.82}
            >
              <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
                {tabLabel(tab)}{count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      <View style={styles.content}>
        {renderContent()}
      </View>

      <MiniTabBar />

      <Modal visible={Boolean(previewPhoto)} transparent animationType="fade" onRequestClose={() => setPreviewPhoto(null)}>
        <TouchableOpacity style={styles.previewBackdrop} activeOpacity={1} onPress={() => setPreviewPhoto(null)}>
          {previewPhoto ? (
            <AppPhotoImage
              uri={previewPhoto.uri}
              storagePath={previewPhoto.storagePath}
              style={styles.previewImage}
              resizeMode="contain"
              debugLabel="ModerationPreview"
            />
          ) : null}
          <View style={styles.previewCloseHint}>
            <Text style={styles.previewCloseText}>✕</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg, paddingTop: 48 },
  header: { backgroundColor: '#7A1E5C', borderRadius: 20, padding: 16, marginHorizontal: 16, marginBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff' },
  headerSub: { color: 'rgba(255,255,255,0.82)', marginTop: 4, fontSize: 13 },
  modeBadge: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
  modeBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  modeBadgeView: { backgroundColor: 'rgba(0,0,0,0.2)' },
  modeBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  tabScroll: { flexGrow: 0, marginBottom: 8 },
  tabRow: { paddingHorizontal: 14, gap: 8 },
  tabBtn: { borderRadius: 14, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: '#EFE6DC' },
  tabBtnActive: { backgroundColor: '#7A1E5C' },
  tabBtnText: { color: '#5a2c2c', fontWeight: '800', fontSize: 13 },
  tabBtnTextActive: { color: '#fff' },
  content: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 110 },
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', color: '#1a1a1a', marginBottom: 4 },
  cardMeta: { fontSize: 13, color: '#7d736b', marginTop: 2 },
  photoThumb: { width: '100%', height: 280, borderRadius: 12, marginBottom: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  actionBtn: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14, alignItems: 'center', minWidth: 80 },
  approveBtn: { backgroundColor: '#2e8b57' },
  rejectBtn: { backgroundColor: '#9c3f2b' },
  deleteBtn: { backgroundColor: '#6b1f1f' },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { textAlign: 'center', color: '#7d736b', fontWeight: '700', marginTop: 40 },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '94%', height: '50%', borderRadius: 16 },
  previewCloseHint: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCloseText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default PhotoModerationScreen;

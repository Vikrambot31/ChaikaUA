import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { onValue, ref } from 'firebase/database';
import { database } from '../firebase-core';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { selectUser } from '../redux/slices/authSlice';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import AppPhotoImage from '../components/AppPhotoImage';
import type { RootState } from '../redux/store';
import { safeLogError } from '../utils/errorLogger';

type Lang = 'ua' | 'ru' | 'en';
type AppNav = NavigationProp<Record<string, object | undefined>>;

const UI_TEXT = {
  ua: {
    title: 'МОЇ ФОТО',
    loading: 'Завантаження…',
    filterAll: (n: number) => `Усі (${n})`,
    filterPending: (n: number) => `Очікують (${n})`,
    filterApproved: (n: number) => `Схвалені (${n})`,
    filterRejected: (n: number) => `Відхилені (${n})`,
    statusPending: 'На перевірці',
    statusApproved: 'Схвалено',
    statusRejected: 'Відхилено',
    reviewedAt: 'Перевірено: ',
    emptyNoPhotos: 'Фото ще не додано.\nНатисніть «+ Додати фото», щоб надіслати перше фото на модерацію.',
    emptyCategory: 'Немає фото в цій категорії.',
    addPhoto: '+ Додати фото',
    addPhotoTitle: 'Додати фото',
    infoText: 'Фото потрапить у галерею після перевірки модератором.',
    done: 'Готово',
  },
  ru: {
    title: 'МОИ ФОТО',
    loading: 'Загрузка…',
    filterAll: (n: number) => `Все (${n})`,
    filterPending: (n: number) => `Ожидают (${n})`,
    filterApproved: (n: number) => `Одобрены (${n})`,
    filterRejected: (n: number) => `Отклонены (${n})`,
    statusPending: 'На проверке',
    statusApproved: 'Одобрено',
    statusRejected: 'Отклонено',
    reviewedAt: 'Проверено: ',
    emptyNoPhotos: 'Фото ещё не добавлено.\nНажмите «+ Добавить фото», чтобы отправить первое фото на модерацию.',
    emptyCategory: 'Нет фото в этой категории.',
    addPhoto: '+ Добавить фото',
    addPhotoTitle: 'Добавить фото',
    infoText: 'Фото попадёт в галерею после проверки модератором.',
    done: 'Готово',
  },
  en: {
    title: 'MY PHOTOS',
    loading: 'Loading…',
    filterAll: (n: number) => `All (${n})`,
    filterPending: (n: number) => `Pending (${n})`,
    filterApproved: (n: number) => `Approved (${n})`,
    filterRejected: (n: number) => `Rejected (${n})`,
    statusPending: 'Under review',
    statusApproved: 'Approved',
    statusRejected: 'Rejected',
    reviewedAt: 'Reviewed: ',
    emptyNoPhotos: 'No photos yet.\nTap «+ Add photo» to submit your first photo for moderation.',
    emptyCategory: 'No photos in this category.',
    addPhoto: '+ Add photo',
    addPhotoTitle: 'Add photo',
    infoText: 'The photo will appear in the gallery after moderation.',
    done: 'Done',
  },
} as const;

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

type PhotoRecord = {
  firebaseKey: string;
  uid: string;
  userName: string;
  uploadedAt: number;
  downloadUrl: string;
  thumbUrl: string;
  storagePath?: string;
  status: ApprovalStatus;
  note?: string;
  reviewedAt?: number; // stored as moderatedAt in community_photos
};

const STATUS_LABEL_BY_LANG: Record<Lang, Record<ApprovalStatus, string>> = {
  ua: { pending: 'На перевірці', approved: 'Схвалено', rejected: 'Відхилено' },
  ru: { pending: 'На проверке', approved: 'Одобрено', rejected: 'Отклонено' },
  en: { pending: 'Under review', approved: 'Approved', rejected: 'Rejected' },
};

const STATUS_COLOR: Record<ApprovalStatus, string> = {
  pending: '#B8860B',
  approved: '#2E7D32',
  rejected: '#C62828',
};

const STATUS_BG: Record<ApprovalStatus, string> = {
  pending: '#FFF8E1',
  approved: '#E8F5E9',
  rejected: '#FFEBEE',
};

const STATUS_ICON: Record<ApprovalStatus, string> = {
  pending: 'clock-outline',
  approved: 'check-circle-outline',
  rejected: 'close-circle-outline',
};

const formatDate = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

export default function MyApprovedPhotosScreen() {
  const navigation = useNavigation<AppNav>();
  const user = useSelector(selectUser);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const statusLabel = STATUS_LABEL_BY_LANG[language];
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ApprovalStatus | 'all'>('all');
  const [addFormVisible, setAddFormVisible] = useState(false);
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const pickerActiveRef = useRef(false);

  const handlePickerOpenChange = useCallback((isOpen: boolean) => {
    pickerActiveRef.current = isOpen;
  }, []);

  const handleRequestCloseModal = useCallback(() => {
    if (pickerActiveRef.current) return;
    setAddFormVisible(false);
  }, []);

  useEffect(() => {
    let active = true;
    let unsub: (() => void) | undefined;

    if (!user?.id) {
      setLoading(false);
      return () => { active = false; };
    }

    void ensureFirebaseAuth()
      .then(() => {
        if (!active) return;
        const dbRef = ref(database, 'community_photos');
        unsub = onValue(
          dbRef,
          (snap) => {
            if (!active) return;
            const raw = snap.val() as Record<string, unknown> | null;
            if (!raw) { setPhotos([]); setLoading(false); return; }
            const list: PhotoRecord[] = Object.entries(raw)
              .reduce<PhotoRecord[]>((acc, [key, val]) => {
                if (!val || typeof val !== 'object') return acc;
                const v = val as Record<string, unknown>;
                // community_photos uses uid OR userId
                const recordUid = String(v.uid ?? v.userId ?? '');
                if (recordUid !== user.id) return acc;
                const imageUri = String(v.imageUri ?? v.downloadUrl ?? '');
                const httpsUrl = typeof v.downloadUrl === 'string' && v.downloadUrl.startsWith('https://')
                  ? v.downloadUrl
                  : imageUri.startsWith('https://')
                    ? imageUri
                    : '';
                acc.push({
                  firebaseKey: key,
                  uid: recordUid,
                  userName: String(v.uploadedBy ?? v.userName ?? ''),
                  uploadedAt: Number(v.uploadedAt ?? v.createdAt ?? 0),
                  downloadUrl: httpsUrl,
                  thumbUrl: typeof v.thumbnailUrl === 'string' && v.thumbnailUrl.startsWith('https://')
                    ? v.thumbnailUrl
                    : typeof v.thumbUrl === 'string' && v.thumbUrl.startsWith('https://')
                      ? v.thumbUrl
                      : httpsUrl,
                  storagePath: typeof v.storagePath === 'string' ? v.storagePath : undefined,
                  status: (['pending','approved','rejected'].includes(String(v.status))
                    ? v.status : 'pending') as ApprovalStatus,
                  note: typeof v.note === 'string' ? v.note : undefined,
                  // admin panel writes moderatedAt on approve/reject
                  reviewedAt: typeof v.moderatedAt === 'number' ? v.moderatedAt
                    : typeof v.reviewedAt === 'number' ? v.reviewedAt : undefined,
                });
                return acc;
              }, [])
              .sort((a, b) => b.uploadedAt - a.uploadedAt);
            setPhotos(list);
            setLoading(false);
          },
          (err) => {
            safeLogError('MyApprovedPhotosScreen.realtimeListener', err, { uid: user.id });
            if (active) setLoading(false);
          },
        );
      })
      .catch((err) => {
        safeLogError('MyApprovedPhotosScreen.auth', err, { uid: user.id });
        if (active) {
          setPhotos([]);
          setLoading(false);
        }
      });

    return () => {
      active = false;
      unsub?.();
    };
  }, [user?.id]);

  // Photos currently uploading (not yet in RTDB) — show immediately with local preview
  const uploadingFormPhotos = formPhotos.filter((p) => p.status === 'uploading' || p.status === 'done');
  // Dedup: exclude items already present in RTDB list (by downloadUrl)
  const rtdbUrls = new Set(photos.map((p) => p.downloadUrl));
  const pendingUploads = uploadingFormPhotos.filter((p) => !rtdbUrls.has(p.downloadUrl));

  const shown = filter === 'all' ? photos : photos.filter((p) => p.status === filter);

  const counts = {
    all: photos.length,
    pending: photos.filter((p) => p.status === 'pending').length,
    approved: photos.filter((p) => p.status === 'approved').length,
    rejected: photos.filter((p) => p.status === 'rejected').length,
  };

  const FILTERS: { key: ApprovalStatus | 'all'; label: string }[] = [
    { key: 'all', label: text.filterAll(counts.all) },
    { key: 'pending', label: text.filterPending(counts.pending) },
    { key: 'approved', label: text.filterApproved(counts.approved) },
    { key: 'rejected', label: text.filterRejected(counts.rejected) },
  ];

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{text.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.78}
          >
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4B7F9E" />
          <Text style={styles.loadingText}>{text.loading}</Text>
        </View>
      ) : shown.length === 0 && pendingUploads.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="image-off-outline" size={52} color="#C8B89A" />
          <Text style={styles.emptyText}>
            {photos.length === 0 ? text.emptyNoPhotos : text.emptyCategory}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {/* Uploading items — shown immediately with local preview */}
          {pendingUploads.map((p) => (
            <View key={p.localUri} style={[styles.card, styles.cardUploading]}>
              <Image
                source={{ uri: p.thumbUri || p.localUri }}
                style={styles.thumb}
                resizeMode="cover"
              />
              <View style={styles.cardBody}>
                <View style={[styles.statusBadge, { backgroundColor: '#E3F0FB' }]}>
                  <ActivityIndicator size="small" color="#4B7F9E" style={{ marginRight: 4 }} />
                  <Text style={[styles.statusText, { color: '#4B7F9E' }]}>
                    {p.status === 'uploading'
                      ? `${language === 'ru' ? 'Загрузка' : language === 'en' ? 'Uploading' : 'Завантаження'} ${p.progress > 0 ? `${p.progress}%` : '…'}`
                      : language === 'ru' ? 'Ожидает…' : language === 'en' ? 'Pending…' : 'Очікує…'}
                  </Text>
                </View>
                <Text style={styles.dateText}>
                  {language === 'ru' ? 'Отправляется на проверку…'
                    : language === 'en' ? 'Being sent for review…'
                    : 'Надсилається на перевірку…'}
                </Text>
              </View>
            </View>
          ))}
          {shown.map((photo) => (
            <View key={photo.firebaseKey} style={styles.card}>
              <AppPhotoImage
                uri={photo.thumbUrl || photo.downloadUrl || photo.storagePath}
                storagePath={photo.storagePath}
                style={[
                  styles.thumb,
                  photo.status === 'pending' && styles.thumbPending,
                  photo.status === 'rejected' && styles.thumbRejected,
                ]}
                resizeMode="cover"
                debugLabel="MyApprovedPhotosScreen"
                showDebugInfo={false}
              />
              <View style={styles.cardBody}>
                {/* Status badge */}
                <View style={[styles.statusBadge, { backgroundColor: STATUS_BG[photo.status] }]}>
                  <MaterialCommunityIcons
                    name={STATUS_ICON[photo.status] as never}
                    size={14}
                    color={STATUS_COLOR[photo.status]}
                  />
                  <Text style={[styles.statusText, { color: STATUS_COLOR[photo.status] }]}>
                    {statusLabel[photo.status]}
                  </Text>
                </View>

                <Text style={styles.dateText}>{formatDate(photo.uploadedAt)}</Text>

                {photo.note ? (
                  <View style={styles.noteRow}>
                    <MaterialCommunityIcons name="message-text-outline" size={13} color="#9A8F80" />
                    <Text style={styles.noteText}>{photo.note}</Text>
                  </View>
                ) : null}

                {photo.reviewedAt ? (
                  <Text style={styles.reviewedText}>
                    {text.reviewedAt}{formatDate(photo.reviewedAt)}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      {/* ── Fixed "Add photo" bar ── */}
      <View style={styles.addBar}>
        <TouchableOpacity
          style={styles.addBarBtn}
          onPress={() => setAddFormVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.addBarBtnText}>{text.addPhoto}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Add photo bottom sheet ── */}
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
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{text.addPhotoTitle}</Text>
              <TouchableOpacity
                onPress={() => setAddFormVisible(false)}
                style={styles.sheetCloseBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.sheetCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
            >
              <PhotoUploadField
                uid={user?.id ?? ''}
                userName={user?.name ?? ''}
                maxPhotos={5}
                storagePath="community_photos"
                onPhotosChange={(p) => setFormPhotos(p)}
                onPickerOpenChange={handlePickerOpenChange}
              />
              <View style={styles.infoCard}>
                <Text style={styles.infoText}>
                  {text.infoText}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => setAddFormVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.doneBtnText}>{text.done}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const ACCENT = '#4B7F9E';
const BG = '#F5EFE6';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 1 },

  filterBar: { flexGrow: 0, backgroundColor: '#FFFDF8', borderBottomWidth: 1, borderBottomColor: '#E0D5C5' },
  filterBarContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, backgroundColor: '#EDE7DC',
    borderWidth: 1, borderColor: '#DDD0C0',
  },
  filterTabActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  filterTabText: { fontSize: 12, fontWeight: '700', color: '#5A4E42' },
  filterTabTextActive: { color: '#FFFFFF' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingText: { color: '#9A8F80', fontSize: 14 },
  emptyText: { color: '#9A8F80', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  list: { padding: 16, gap: 12, paddingBottom: 90 },

  cardUploading: {
    borderColor: '#B0CCE0',
    borderStyle: 'dashed',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFDF8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0D5C5',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  thumb: {
    width: 90,
    height: 90,
    backgroundColor: '#E8E0D4',
  },
  thumbPending: { opacity: 0.45 },
  thumbRejected: { opacity: 0.3 },
  cardBody: {
    flex: 1,
    padding: 10,
    gap: 5,
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontWeight: '800' },
  dateText: { fontSize: 11, color: '#9A8F80' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  noteText: { fontSize: 11, color: '#6A5F50', flex: 1, lineHeight: 16 },
  reviewedText: { fontSize: 10, color: '#B0A090' },

  // Add photo bar
  addBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: '#E0D5C5',
  },
  addBarBtn: {
    backgroundColor: ACCENT,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBarBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },

  // Bottom sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
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
  sheetTitle: { fontSize: 17, fontWeight: '900', color: '#3A2E24' },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EDE3D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseTxt: { fontSize: 14, fontWeight: '700', color: '#7A6A58' },
  sheetContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  infoCard: {
    backgroundColor: '#FFF7E8',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EDD9A3',
  },
  infoText: { color: '#7A6A58', lineHeight: 19, fontWeight: '600', fontSize: 13 },
  doneBtn: {
    backgroundColor: ACCENT,
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});

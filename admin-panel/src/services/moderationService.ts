import { get, ref } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { database, firebaseApp } from '../firebase/firebase';
import { resolveMediaUrl } from './mediaService';
import { MODERATION_PATHS } from './securityPaths';

export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type ModerationSectionKey =
  | 'requests'
  | 'appSuggestions'
  | 'communityPhotos'
  | 'datingProfiles'
  | 'datingAnketaListings'
  | 'coffeeRequests'
  | 'buySell'
  | 'contactsListings'
  | 'localBusiness'
  | 'jobs'
  | 'lostFound'
  | 'osbbNews'
  | 'osbbVotes'
  | 'osbbHouseTopics'
  | 'osbbCollections';

export type ModerationItem = {
  id: string;
  section: ModerationSectionKey;
  path: string;
  status: ModerationStatus;
  title: string;
  subtitle: string;
  userId: string;
  email: string;
  deviceId: string;
  timestamp: number;
  timestampLabel: string;
  photoUrl: string;
  mediaUrl: string;
  raw: Record<string, unknown>;
};

export type ModerationSummary = Record<ModerationStatus, number> & {
  total: number;
};

type SectionConfig = {
  key: ModerationSectionKey;
  label: string;
  path: string;
  statusField: 'status' | 'moderationStatus';
  approvedValue: 'approved' | 'active';
  rejectedValue: 'rejected';
  nested?: boolean;
};

type AdminModerationAction = 'approved' | 'rejected' | 'delete';

type AdminModerationPayload = {
  section: ModerationSectionKey;
  path: string;
  currentStatus: ModerationStatus;
  action: AdminModerationAction;
};

type CallableResult = {
  ok: boolean;
};

export const MODERATION_SECTIONS: SectionConfig[] = [
  { key: 'requests', label: 'Заявки', path: MODERATION_PATHS.requests, statusField: 'status', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'appSuggestions', label: 'Предложения по приложению', path: MODERATION_PATHS.appSuggestions, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'communityPhotos', label: 'Фото сообщества', path: MODERATION_PATHS.communityPhotos, statusField: 'status', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'datingProfiles', label: 'Профили знакомств', path: MODERATION_PATHS.datingProfiles, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'datingAnketaListings', label: 'Анкеты знакомств', path: MODERATION_PATHS.datingAnketaListings, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'coffeeRequests', label: 'Кофе-заявки', path: MODERATION_PATHS.coffeeRequests, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'buySell', label: 'Куплю/Продам', path: MODERATION_PATHS.buySell, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'contactsListings', label: 'Хочу связаться', path: MODERATION_PATHS.contactsListings, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'localBusiness', label: 'Локальный бизнес', path: MODERATION_PATHS.localBusiness, statusField: 'status', approvedValue: 'active', rejectedValue: 'rejected' },
  { key: 'jobs', label: 'Работа', path: MODERATION_PATHS.jobs, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'lostFound', label: 'Потеряно/Найдено', path: MODERATION_PATHS.lostFound, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'osbbNews', label: 'OSBB новости', path: MODERATION_PATHS.osbbNews, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected', nested: true },
  { key: 'osbbVotes', label: 'OSBB голосования', path: MODERATION_PATHS.osbbVotes, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected', nested: true },
  { key: 'osbbHouseTopics', label: 'OSBB темы дома', path: MODERATION_PATHS.osbbHouseTopics, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected', nested: true },
  { key: 'osbbCollections', label: 'OSBB сборы', path: MODERATION_PATHS.osbbCollections, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected', nested: true },
];

const functions = getFunctions(firebaseApp);

const getString = (value: unknown): string => typeof value === 'string' ? value : '';

const getNumber = (value: unknown): number => Number.isFinite(value) ? Number(value) : 0;

const getStatus = (config: SectionConfig, value: Record<string, unknown>): ModerationStatus => {
  const raw = value[config.statusField];
  if (raw === 'approved' || raw === 'active') return 'approved';
  if (raw === 'rejected') return 'rejected';
  if (raw === 'expired') return 'expired';
  return 'pending';
};

const MIN_VALID_TS = 100000000000; // 1973 год
const MAX_VALID_TS = 4102444800000; // 2100 год

const isValidTimestamp = (ts: number): boolean =>
  Number.isFinite(ts) && ts > MIN_VALID_TS && ts < MAX_VALID_TS;

const getTimestamp = (value: Record<string, unknown>): number => {
  const numeric = getNumber(value.timestamp) || getNumber(value.createdAt) || getNumber(value.updated_at);
  if (isValidTimestamp(numeric)) return numeric;

  const iso =
    getString(value.submittedForModerationAt) ||
    getString(value.createdAt) ||
    getString(value.publishedAt) ||
    getString(value.moderatedAt);
  const parsed = Date.parse(iso);
  return isValidTimestamp(parsed) ? parsed : 0;
};

const getTitle = (config: SectionConfig, value: Record<string, unknown>, id: string): string =>
  getString(value.title) ||
  getString(value.name) ||
  getString(value.itemName) ||
  getString(value.category) ||
  getString(value.text).slice(0, 60) ||
  config.label.replace(/s$/, '') ||
  id;

const getSubtitle = (config: SectionConfig, value: Record<string, unknown>): string | null => {
  if (config.key === 'datingAnketaListings') {
    const parts: string[] = [];
    const age = getString(value.age);
    const condition = getString(value.condition);
    const phone = getString(value.phone);
    const description = getString(value.description);
    if (age) parts.push(`Вік: ${age}`);
    if (condition) parts.push(condition);
    if (phone) parts.push(phone);
    if (description) parts.push(description);
    return parts.length ? parts.join(' | ') : null;
  }
  return (
    getString(value.description) ||
    getString(value.text) ||
    getString(value.about) ||
    getString(value.goal) ||
    getString(value.phone) ||
    null
  );
};

const getPhotoUrl = (value: Record<string, unknown>): string =>
  getString(value.imageUri) ||
  getString(value.photoUri) ||
  getString(value.photoStoragePath) ||
  getString(value.storagePath);

const normalizeItem = (
  config: SectionConfig,
  id: string,
  path: string,
  value: Record<string, unknown>,
): ModerationItem => {
  const timestamp = getTimestamp(value);
  return {
    id,
    section: config.key,
    path,
    status: getStatus(config, value),
    title: getTitle(config, value, id),
    subtitle: getSubtitle(config, value) || '',
    userId: getString(value.userId) || getString(value.uid) || id,
    email: getString(value.email),
    deviceId: getString(value.deviceId) || getString(value.device_id),
    timestamp,
    timestampLabel: timestamp ? new Date(timestamp).toLocaleString() : '-',
    photoUrl: getPhotoUrl(value),
    mediaUrl: '',
    raw: value,
  };
};

const flattenNested = (config: SectionConfig, raw: Record<string, unknown> | null): ModerationItem[] => {
  if (!raw) return [];

  return Object.entries(raw).flatMap(([buildingId, records]) => {
    if (!records || typeof records !== 'object') return [];

    return Object.entries(records as Record<string, Record<string, unknown>>).map(([id, value]) =>
      normalizeItem(config, id, `${config.path}/${buildingId}/${id}`, {
        ...value,
        buildingId,
      }),
    );
  });
};

export const loadModerationItems = async (): Promise<ModerationItem[]> => {
  const snapshots = await Promise.all(
    MODERATION_SECTIONS.map(async (config) => ({
      config,
      snapshot: await get(ref(database, config.path)),
    })),
  );

  const items = snapshots.flatMap(({ config, snapshot }) => {
    const raw = snapshot.val() as Record<string, unknown> | null;
    if (config.nested) return flattenNested(config, raw);
    if (!raw) return [];

    return Object.entries(raw).flatMap(([id, value]) => {
      if (!value || typeof value !== 'object') return [];
      return [normalizeItem(config, id, `${config.path}/${id}`, value as Record<string, unknown>)];
    });
  });

  items.sort((left, right) => right.timestamp - left.timestamp);

  return Promise.all(
    items.map(async (item) => ({
      ...item,
      mediaUrl: await resolveMediaUrl(item.photoUrl),
    })),
  );
};

export const getModerationSummary = (items: ModerationItem[]): ModerationSummary => ({
  total: items.length,
  pending: items.filter((item) => item.status === 'pending').length,
  approved: items.filter((item) => item.status === 'approved').length,
  rejected: items.filter((item) => item.status === 'rejected').length,
  expired: items.filter((item) => item.status === 'expired').length,
});

export const moderateItem = async (
  item: ModerationItem,
  status: 'approved' | 'rejected',
): Promise<void> => {
  const config = MODERATION_SECTIONS.find((section) => section.key === item.section);
  if (!config) throw new Error('Неизвестный раздел модерации.');

  const callable = httpsCallable<AdminModerationPayload, CallableResult>(functions, 'adminModerateContentItem');
  await callable({
    section: item.section,
    path: item.path,
    currentStatus: item.status,
    action: status,
  });
};

export const deleteModerationItem = async (item: ModerationItem): Promise<void> => {
  const config = MODERATION_SECTIONS.find((section) => section.key === item.section);
  if (!config) throw new Error('Неизвестный раздел модерации.');

  const callable = httpsCallable<AdminModerationPayload, CallableResult>(functions, 'adminModerateContentItem');
  await callable({
    section: item.section,
    path: item.path,
    currentStatus: item.status,
    action: 'delete',
  });
};

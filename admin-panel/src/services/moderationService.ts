import { get, ref } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { database, firebaseApp } from '../firebase/firebase';
import { resolveMediaUrl } from './mediaService';
import { MODERATION_PATHS } from './securityPaths';
import { LOCAL_MODE, localGet, localPatch } from '../local/LOCAL_MODE';

export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type ModerationSectionKey =
  | 'requests'
  | 'appSuggestions'
  | 'communityPhotos'
  | 'buySell'
  | 'contactsListings'
  | 'biznesChaikaListings'
  | 'localBusiness'
  | 'jobs'
  | 'lostFound'
  | 'osbbNews'
  | 'osbbVotes'
  | 'osbbHouseTopics'
  | 'osbbCollections';

export type EditHistoryEntry = {
  field: string;
  previousValue: string;
  newValue: string;
  moderatorUid: string;
  moderatorEmail: string;
  timestamp: number;
  aiSuggestionId?: string | null;
};

export type ModerationItem = {
  id: string;
  section: ModerationSectionKey;
  path: string;
  status: ModerationStatus;
  title: string;
  subtitle: string;
  userName: string;
  userId: string;
  email: string;
  deviceId: string;
  timestamp: number;
  timestampLabel: string;
  photoUrl: string;
  mediaUrl: string;
  photoUrls: string[];
  mediaUrls: string[];
  priority: 'urgent' | 'standard' | 'low';
  priorityRank: number;
  statusPriority: string;
  raw: Record<string, unknown>;
  editedAt?: number;
  editedBy?: string;
  editHistory?: EditHistoryEntry[];
};

export type EditResult = {
  editedFields: string[];
  totalEdits: number;
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
  reason?: string;
};

type CallableResult = {
  ok: boolean;
};

export const MODERATION_SECTIONS: SectionConfig[] = [
  { key: 'requests', label: 'Заявки', path: MODERATION_PATHS.requests, statusField: 'status', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'appSuggestions', label: 'Предложения по приложению', path: MODERATION_PATHS.appSuggestions, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'communityPhotos', label: 'Фото сообщества', path: MODERATION_PATHS.communityPhotos, statusField: 'status', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'buySell', label: 'Куплю/Продам', path: MODERATION_PATHS.buySell, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'contactsListings', label: 'Хочу связаться', path: MODERATION_PATHS.contactsListings, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'biznesChaikaListings', label: 'Бизнес на Чайке', path: MODERATION_PATHS.biznesChaikaListings, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'localBusiness', label: 'Локальный бизнес', path: MODERATION_PATHS.localBusiness, statusField: 'status', approvedValue: 'active', rejectedValue: 'rejected' },
  { key: 'jobs', label: 'Работа', path: MODERATION_PATHS.jobs, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'lostFound', label: 'Потеряно/Найдено', path: MODERATION_PATHS.lostFound, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  { key: 'osbbNews', label: 'OSBB новости', path: MODERATION_PATHS.osbbNews, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected', nested: true },
  { key: 'osbbVotes', label: 'OSBB голосования', path: MODERATION_PATHS.osbbVotes, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected', nested: true },
  { key: 'osbbHouseTopics', label: 'OSBB темы дома', path: MODERATION_PATHS.osbbHouseTopics, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected', nested: true },
  { key: 'osbbCollections', label: 'OSBB сборы', path: MODERATION_PATHS.osbbCollections, statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected', nested: true },
];

const functions = LOCAL_MODE ? null : getFunctions(firebaseApp);

const getString = (value: unknown): string => typeof value === 'string' ? value : '';

const getNumber = (value: unknown): number => Number.isFinite(value) ? Number(value) : 0;

const getTimestampFromIso = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  const ts = Date.parse(value);
  return Number.isFinite(ts) && ts > 0 ? ts : undefined;
};

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

const getTitle = (config: SectionConfig, value: Record<string, unknown>, id: string): string => {
  if (config.key === 'requests') {
    return (
      getString(value.text).slice(0, 60) ||
      getString(value.description).slice(0, 60) ||
      getString(value.title) ||
      getString(value.name) ||
      id
    );
  }
  return (
    getString(value.title) ||
    getString(value.contactName) ||
    getString(value.name) ||
    getString(value.itemName) ||
    getString(value.categoryLabel) ||
    getString(value.category) ||
    getString(value.text).slice(0, 60) ||
    config.label ||
    id
  );
};

const getSubtitle = (config: SectionConfig, value: Record<string, unknown>): string | null => {
  return (
    getString(value.description) ||
    getString(value.text) ||
    getString(value.about) ||
    getString(value.goal) ||
    getString(value.phone) ||
    null
  );
};

const getUserName = (value: Record<string, unknown>): string =>
  getString(value.name) ||
  getString(value.userName) ||
  getString(value.displayName) ||
  getString(value.contactName) ||
  getString(value.uploadedBy);

const getPhotoUrl = (value: Record<string, unknown>): string =>
  getString(value.imageUri) ||
  getString(value.photoUri) ||
  getString(value.photoStoragePath) ||
  getString(value.storagePath);

const getPhotoUrls = (value: Record<string, unknown>): string[] => {
  // Prefer the full array saved by the mobile form (photoUris / photoStoragePaths).
  const urisField = value.photoUris;
  if (Array.isArray(urisField) && urisField.length > 0) {
    return urisField.filter((u): u is string => typeof u === 'string' && u.length > 0);
  }
  const pathsField = value.photoStoragePaths;
  if (Array.isArray(pathsField) && pathsField.length > 0) {
    return pathsField.filter((u): u is string => typeof u === 'string' && u.length > 0);
  }
  // Fall back to single photo fields.
  const single = getPhotoUrl(value);
  return single ? [single] : [];
};

const URGENT_CATEGORIES = new Set(['medical', 'electricity', 'care', 'repair']);
const LOW_PRIORITY_CATEGORIES = new Set(['feedback', 'suggestions', 'app_suggestion', 'appSuggestions']);

const getPriority = (value: Record<string, unknown>): Pick<ModerationItem, 'priority' | 'priorityRank' | 'statusPriority'> => {
  const rawCategory = getString(value.category) || getString(value.type) || getString(value.section);
  const normalized = rawCategory.trim().toLowerCase();
  const statusPriority = getString(value.status_priority);
  if (statusPriority.includes('_01_') || URGENT_CATEGORIES.has(normalized)) {
    return { priority: 'urgent', priorityRank: 1, statusPriority };
  }
  if (statusPriority.includes('_03_') || LOW_PRIORITY_CATEGORIES.has(normalized)) {
    return { priority: 'low', priorityRank: 3, statusPriority };
  }
  return { priority: 'standard', priorityRank: 2, statusPriority };
};

const normalizeItem = (
  config: SectionConfig,
  id: string,
  path: string,
  value: Record<string, unknown>,
): ModerationItem => {
  const timestamp = getTimestamp(value);
  const priority = getPriority(value);
  return {
    id,
    section: config.key,
    path,
    status: getStatus(config, value),
    title: getTitle(config, value, id),
    subtitle: getSubtitle(config, value) || '',
    userName: getUserName(value),
    userId: getString(value.userId) || getString(value.uid) || id,
    email: getString(value.email),
    deviceId: getString(value.deviceId) || getString(value.device_id),
    timestamp,
    timestampLabel: timestamp ? new Date(timestamp).toLocaleString() : '-',
    photoUrl: getPhotoUrl(value),
    mediaUrl: '',
    photoUrls: getPhotoUrls(value),
    mediaUrls: [],
    ...priority,
    raw: value,
    editedAt: getNumber(value.editedAt) || getTimestampFromIso(value.lastEditedAt) || undefined,
    editedBy: getString(value.editedBy) || undefined,
    editHistory: Array.isArray(value.editHistory) ? value.editHistory as EditHistoryEntry[] : undefined,
  };
};

const flattenNested = (config: SectionConfig, raw: Record<string, unknown> | null): ModerationItem[] => {
  if (!raw) return [];

  return Object.entries(raw).flatMap(([buildingId, records]) => {
    if (!records || typeof records !== 'object') {
      console.warn(`[moderationService] "${config.label}" — ожидался объект на уровне buildingId="${buildingId}", получено:`, typeof records);
      return [];
    }

    return Object.entries(records as Record<string, unknown>).flatMap(([id, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        console.warn(`[moderationService] "${config.label}" — ожидался объект-запись для id="${id}" в buildingId="${buildingId}", получено:`, typeof value);
        return [];
      }
      return [normalizeItem(config, id, `${config.path}/${buildingId}/${id}`, {
        ...(value as Record<string, unknown>),
        buildingId,
      })];
    });
  });
};

export const loadModerationItems = async (): Promise<ModerationItem[]> => {
  // LOCAL_MODE: fetch moderation_items from local json-server
  if (LOCAL_MODE) {
    const raw = await localGet<ModerationItem[]>('/moderation_items');
    return Array.isArray(raw) ? raw : [];
  }

  const results = await Promise.allSettled(
    MODERATION_SECTIONS.map(async (config) => ({
      config,
      snapshot: await get(ref(database, config.path)),
    })),
  );

  const snapshots = results.flatMap((result) => {
    if (result.status === 'rejected') {
      console.warn('[moderationService] Не удалось загрузить раздел:', result.reason);
      return [];
    }
    return [result.value];
  });

  const items = snapshots.flatMap(({ config, snapshot }) => {
    const raw = snapshot.val() as Record<string, unknown> | null;
    if (config.nested) return flattenNested(config, raw);
    if (!raw) return [];

    const entries = Object.entries(raw).flatMap(([id, value]) => {
      if (!value || typeof value !== 'object') return [];
      return [normalizeItem(config, id, `${config.path}/${id}`, value as Record<string, unknown>)];
    });

    return entries;
  });

  items.sort((left, right) =>
    left.priorityRank - right.priorityRank ||
    right.timestamp - left.timestamp,
  );

  // Resolve media URLs in batches to avoid Storage rate limiting
  const MEDIA_BATCH_SIZE = 25;
  const resolvedItems: ModerationItem[] = [];
  for (let i = 0; i < items.length; i += MEDIA_BATCH_SIZE) {
    const batch = items.slice(i, i + MEDIA_BATCH_SIZE);
    const batchResult = await Promise.all(
      batch.map(async (item) => {
        const mediaUrls = await Promise.all(item.photoUrls.map((url) => resolveMediaUrl(url)));
        const resolved = mediaUrls.filter(Boolean);
        return {
          ...item,
          mediaUrls: resolved,
          mediaUrl: resolved[0] ?? '',
        };
      }),
    );
    resolvedItems.push(...batchResult);
  }
  return resolvedItems;
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
  reason?: string,
): Promise<void> => {
  // LOCAL_MODE: patch status on local json-server record
  if (LOCAL_MODE) {
    await localPatch(`/moderation_items/${item.id}`, { status, moderationReason: reason?.trim() || undefined });
    return;
  }

  const config = MODERATION_SECTIONS.find((section) => section.key === item.section);
  if (!config) throw new Error('Неизвестный раздел модерации.');
  if (!functions) throw new Error('Firebase Functions не инициализированы.');

  const callable = httpsCallable<AdminModerationPayload, CallableResult>(functions, 'adminModerateContentItem');
  await callable({
    section: item.section,
    path: item.path,
    currentStatus: item.status,
    action: status,
    reason: reason?.trim() || undefined,
  });
};

export const deleteModerationItem = async (item: ModerationItem): Promise<void> => {
  // LOCAL_MODE: stub — returns ok without deleting from local server
  if (LOCAL_MODE) {
    return;
  }

  const config = MODERATION_SECTIONS.find((section) => section.key === item.section);
  if (!config) throw new Error('Неизвестный раздел модерации.');
  if (!functions) throw new Error('Firebase Functions не инициализированы.');

  const callable = httpsCallable<{ section: ModerationSectionKey; path: string }, CallableResult>(functions, 'adminDeleteContentItem');
  await callable({
    section: item.section,
    path: item.path,
  });
};

type EditPayload = {
  section: ModerationSectionKey;
  path: string;
  edits: Record<string, string>;
  aiSuggestionId?: string;
};

const EDITABLE_FIELDS = new Set([
  'title', 'subtitle', 'description', 'text', 'name', 'address',
  'phone', 'category', 'price', 'location', 'details', 'comment',
  'reason', 'moderationReason', 'tags',
]);

export const editModerationItem = async (
  item: ModerationItem,
  edits: Record<string, string>,
  options?: { aiSuggestionId?: string },
): Promise<EditResult> => {
  const disallowedFields = Object.keys(edits).filter((f) => !EDITABLE_FIELDS.has(f));
  if (disallowedFields.length > 0) {
    throw new Error(`Заборонені поля для редагування: ${disallowedFields.join(', ')}`);
  }
  if (LOCAL_MODE) {
    await localPatch(`/moderation_items/${item.id}`, {
      ...edits,
      editedAt: Date.now(),
      editedBy: 'local-moderator',
    });
    return { editedFields: Object.keys(edits), totalEdits: 1 };
  }

  if (!functions) throw new Error('Firebase Functions не инициализированы.');

  const callable = httpsCallable<EditPayload, EditResult & { ok: boolean }>(
    functions,
    'adminEditContentItem',
  );
  const result = await callable({
    section: item.section,
    path: item.path,
    edits,
    aiSuggestionId: options?.aiSuggestionId,
  });
  return {
    editedFields: result.data.editedFields,
    totalEdits: result.data.totalEdits,
  };
};

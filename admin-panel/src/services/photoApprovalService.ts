import { get, ref, update, remove } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { database, firebaseApp, storage } from '../firebase/firebase';
import { LOCAL_MODE, LOCAL_API } from '../local/LOCAL_MODE';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type PhotoRecord = {
  id: string;
  title?: string;
  description?: string;
  imageUri: string;
  storagePath?: string;
  uploadedBy?: string;
  sourceScreen?: string;
  sourceScreenLabel?: string;
  sourceFeature?: string;
  sourcePathHint?: string;
  status: ApprovalStatus;
  target?: 'gallery_public' | 'my_photos';
  uploadedAt: number;
  moderationReason?: string;
  moderatedAt?: number;
};

const getString = (v: unknown): string => (typeof v === 'string' ? v : '');
const getNumber = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

const normalizeStatus = (v: unknown): ApprovalStatus => {
  if (v === 'approved' || v === 'rejected') return v;
  return 'pending';
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const getSourcePathHint = (r: Record<string, unknown>): string | undefined => {
  const sourceScreen = getString(r.sourceScreen);
  if (sourceScreen) return sourceScreen;

  const target = getString(r.target);
  const title = getString(r.title).trim();
  const storagePath = getString(r.storagePath) || getString(r.photoStoragePath) || getString(r.imageUri);

  if (target === 'my_photos') return 'MyApprovedPhotosScreen';
  if (title === 'Фото Чайки' || title === 'Р¤РѕС‚Рѕ Р§Р°Р№РєРё') return 'FotoRayonaScreen';
  if (storagePath.startsWith('community_photos/')) return 'Community photo upload';
  return undefined;
};

const getSourceScreenLabel = (r: Record<string, unknown>): string | undefined => {
  const explicitLabel = getString(r.sourceScreenLabel);
  if (explicitLabel) return explicitLabel;

  const hint = getSourcePathHint(r);
  if (hint === 'FotoRayonaScreen') return 'Фото района';
  if (hint === 'PhotoUploadScreen') return 'Добавить фото';
  if (hint === 'MyApprovedPhotosScreen') return 'Мои фото';
  if (hint === 'Community photo upload') return 'Галерея сообщества';
  return undefined;
};

const normalizeRecord = (key: string, raw: unknown): PhotoRecord | null => {
  if (!isRecord(raw)) return null;
  const r = raw;
  const imageUri = getString(r.imageUri);
  const sourcePathHint = getSourcePathHint(r);
  return {
    id: key,
    title: getString(r.title) || undefined,
    description: getString(r.description) || undefined,
    imageUri,
    storagePath: getString(r.storagePath) || getString(r.photoStoragePath) || undefined,
    uploadedBy: getString(r.uploadedBy) || getString(r.userName) || undefined,
    sourceScreen: getString(r.sourceScreen) || sourcePathHint,
    sourceScreenLabel: getSourceScreenLabel(r),
    sourceFeature: getString(r.sourceFeature) || undefined,
    sourcePathHint,
    status: normalizeStatus(r.status),
    target: r.target === 'my_photos' ? 'my_photos' : 'gallery_public',
    uploadedAt: getNumber(r.uploadedAt) || getNumber(r.createdAt) || getNumber(r.timestamp),
    moderationReason: getString(r.moderationReason) || undefined,
    moderatedAt: getNumber(r.moderatedAt) || undefined,
  };
};

const isPublicGalleryPhoto = (photo: PhotoRecord): boolean => {
  const title = typeof photo.title === 'string' ? photo.title.trim() : '';
  const isLegacyPersonalDefault = title === 'Photo' || title === 'Фото';
  return photo.target === 'gallery_public' && !isLegacyPersonalDefault;
};

export const loadPhotos = async (): Promise<PhotoRecord[]> => {
  if (LOCAL_MODE) {
    const data = await fetch(`${LOCAL_API}/photos`).then(r => r.json()) as Array<Record<string, unknown>>;
    return data.map(r => ({
      id: String(r.id),
      title: r.title ? String(r.title) : undefined,
      description: r.description ? String(r.description) : undefined,
      imageUri: String(r.imageUri ?? r.url ?? ''),
      uploadedBy: r.uploadedBy ? String(r.uploadedBy) : undefined,
      status: (r.status === 'approved' || r.status === 'rejected') ? r.status : 'pending',
      target: r.target === 'my_photos' ? 'my_photos' : 'gallery_public',
      uploadedAt: Number(r.createdAt ?? 0),
      moderationReason: r.moderationReason ? String(r.moderationReason) : undefined,
    } as PhotoRecord)).sort((a, b) => b.uploadedAt - a.uploadedAt);
  }
  const snap = await get(ref(database, 'community_photos'));
  if (!snap.exists()) return [];
  const raw = snap.val() as Record<string, unknown>;
  return Object.entries(raw)
    .map(([key, val]) => normalizeRecord(key, val))
    .filter((x): x is PhotoRecord => x !== null)
    .filter(isPublicGalleryPhoto)
    .sort((a, b) => b.uploadedAt - a.uploadedAt);
};

export const approvePhoto = async (id: string): Promise<void> => {
  if (LOCAL_MODE) {
    await fetch(`${LOCAL_API}/photos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved', moderatedAt: Date.now() }),
    });
    return;
  }
  return update(ref(database, `community_photos/${id}`), { status: 'approved', moderatedAt: Date.now() });
};

export const rejectPhoto = async (id: string, reason: string): Promise<void> => {
  if (LOCAL_MODE) {
    await fetch(`${LOCAL_API}/photos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected', moderatedAt: Date.now(), moderationReason: reason.trim() || 'rejected' }),
    });
    return;
  }
  return update(ref(database, `community_photos/${id}`), {
    status: 'rejected',
    moderatedAt: Date.now(),
    moderationReason: reason.trim() || 'rejected',
  });
};

export const deletePhoto = async (id: string): Promise<void> => {
  if (LOCAL_MODE) {
    await fetch(`${LOCAL_API}/photos/${id}`, { method: 'DELETE' });
    return;
  }
  return remove(ref(database, `community_photos/${id}`));
};

export const deletePhotos = async (ids: string[]): Promise<void> => {
  await Promise.all(ids.map((id) => deletePhoto(id)));
};

export const resolvePhotoAccessUrl = async (photo: PhotoRecord | null | undefined): Promise<string> => {
  if (!photo) throw new Error('Photo record is missing. Check the photo id used for diagnostics.');
  if (!photo.storagePath) return photo.imageUri;
  const getMediaAccessUrl = httpsCallable<
    { collection: 'community_photos'; itemId: string; storagePath: string },
    { url: string; expiresAt: number }
  >(getFunctions(firebaseApp), 'getMediaAccessUrl');
  const result = await getMediaAccessUrl({
    collection: 'community_photos',
    itemId: photo.id,
    storagePath: photo.storagePath,
  });
  return result.data.url || photo.imageUri;
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const decodeBase64 = (value: string): string => {
  const clean = value.replace(/\s/g, '');
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(clean);
  }

  if (clean.length % 4 !== 0) {
    throw new Error('Invalid base64 length');
  }

  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = clean[i];
    const c2 = clean[i + 1];
    const c3 = clean[i + 2];
    const c4 = clean[i + 3];

    const n1 = BASE64_ALPHABET.indexOf(c1);
    const n2 = BASE64_ALPHABET.indexOf(c2);
    const n3 = c3 === '=' ? 0 : BASE64_ALPHABET.indexOf(c3);
    const n4 = c4 === '=' ? 0 : BASE64_ALPHABET.indexOf(c4);
    if (n1 < 0 || n2 < 0 || (c3 !== '=' && n3 < 0) || (c4 !== '=' && n4 < 0)) {
      throw new Error('Invalid base64 character');
    }

    const triple = (n1 << 18) | (n2 << 12) | (n3 << 6) | n4;
    out += String.fromCharCode((triple >> 16) & 0xff);
    if (c3 !== '=') out += String.fromCharCode((triple >> 8) & 0xff);
    if (c4 !== '=') out += String.fromCharCode(triple & 0xff);
  }

  return out;
};

const b64ToBlob = (b64: string, contentType: string): Blob => {
  const bin = decodeBase64(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: contentType });
};

const getStoragePath_ = (v: string): string | null => {
  const t = v.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return null;
  if (t.startsWith('file:') || t.startsWith('content:')) return null;
  if (/^(community_photos|photo_uploads|profile_photos|lost_found|buy_sell|local_business|requests|uploads)\//i.test(t))
    return t;
  return null;
};

export const resolvePhotoUrl = async (photo: PhotoRecord): Promise<string> => {
  let url: string;

  if (/^https?:\/\//i.test(photo.imageUri)) {
    url = photo.imageUri;
  } else {
    const sp = getStoragePath_(photo.storagePath || '') || getStoragePath_(photo.imageUri);
    if (!sp) return photo.imageUri;
    const bucket = typeof storage.app.options.storageBucket === 'string'
      ? storage.app.options.storageBucket : '';
    const encoded = sp.split('/').map(encodeURIComponent).join('%2F');
    url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media`;
  }

  try {
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      if (
        text.startsWith('/9j/') ||
        text.startsWith('iVBOR') ||
        /^[A-Za-z0-9+/=]{100,}$/.test(text.slice(0, 100))
      ) {
        const blob = b64ToBlob(text, res.headers.get('content-type') || 'image/jpeg');
        return URL.createObjectURL(blob);
      }
    }
  } catch { /* ignore */ }

  return url;
};

export const resolvePhotoDataUrl = async (photo: PhotoRecord | null | undefined): Promise<string> => {
  if (!photo) throw new Error('Photo record is missing. Check the photo id used for diagnostics.');
  if (!photo.storagePath) return photo.imageUri;
  const getMediaAccessUrl = httpsCallable<
    { collection: 'community_photos'; itemId: string; storagePath: string; inlineDataUrl: true },
    { url: string; expiresAt: number; dataUrl?: string; contentType?: string; size?: number; bucketName?: string }
  >(getFunctions(firebaseApp), 'getMediaAccessUrl');
  const result = await getMediaAccessUrl({
    collection: 'community_photos',
    itemId: photo.id,
    storagePath: photo.storagePath,
    inlineDataUrl: true,
  });
  return result.data.dataUrl || photo.imageUri;
};

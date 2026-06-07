import {
  get, ref, update, onValue,
  type Unsubscribe,
} from 'firebase/database';
import { database } from '../firebase/firebase';

// ── Types ──

export type ClaimStatus = 'pending' | 'approved' | 'rejected';
export type CardModerationStatus = 'pending' | 'approved' | 'rejected';

export interface BusinessPlusClaim {
  placeId: string;
  placeName: string;
  placeAddress: string;
  ownerUid: string;
  ownerName: string;
  ownerPhone: string;
  comment: string;
  status: ClaimStatus;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectReason?: string;
}

export interface BusinessMenuItem {
  name: string;
  price: string;
}

export interface BusinessPromotion {
  title: string;
  description: string;
  dateUntil: string;
}

export interface BusinessPlusCard {
  placeId: string;
  placeName: string;
  ownerId: string;
  moderationStatus: CardModerationStatus;
  menuItems?: BusinessMenuItem[];
  promotions?: BusinessPromotion[];
  photoUri?: string;
  photoStoragePath?: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectReason?: string;
}

// ── Helpers ──

const toClaimList = (snap: import('firebase/database').DataSnapshot): BusinessPlusClaim[] => {
  const result: BusinessPlusClaim[] = [];
  snap.forEach((child) => {
    const d = child.val();
    if (!d) return;
    result.push({
      placeId: child.key ?? d.placeId ?? '',
      placeName: d.placeName ?? '',
      placeAddress: d.placeAddress ?? '',
      ownerUid: d.ownerUid ?? '',
      ownerName: d.ownerName ?? '',
      ownerPhone: d.ownerPhone ?? '',
      comment: d.comment ?? '',
      status: d.status ?? 'pending',
      createdAt: d.createdAt ?? '',
      updatedAt: d.updatedAt ?? '',
      approvedBy: d.approvedBy,
      approvedAt: d.approvedAt,
      rejectedBy: d.rejectedBy,
      rejectedAt: d.rejectedAt,
      rejectReason: d.rejectReason,
    });
  });
  return result.sort((a, b) => {
    // pending first, then by date desc
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
};

const toCardList = (snap: import('firebase/database').DataSnapshot): BusinessPlusCard[] => {
  const result: BusinessPlusCard[] = [];
  snap.forEach((child) => {
    const d = child.val();
    if (!d) return;
    result.push({
      placeId: child.key ?? d.placeId ?? '',
      placeName: d.placeName ?? '',
      ownerId: d.ownerId ?? '',
      moderationStatus: d.moderationStatus ?? 'pending',
      menuItems: Array.isArray(d.menuItems) ? d.menuItems : undefined,
      promotions: Array.isArray(d.promotions) ? d.promotions : undefined,
      photoUri: d.photoUri,
      photoStoragePath: d.photoStoragePath,
      updatedAt: d.updatedAt ?? '',
      approvedBy: d.approvedBy,
      approvedAt: d.approvedAt,
      rejectedBy: d.rejectedBy,
      rejectedAt: d.rejectedAt,
      rejectReason: d.rejectReason,
    });
  });
  return result.sort((a, b) => {
    if (a.moderationStatus === 'pending' && b.moderationStatus !== 'pending') return -1;
    if (a.moderationStatus !== 'pending' && b.moderationStatus === 'pending') return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
};

// ── Subscriptions ──

export const subscribeToBusinessPlusClaims = (
  callback: (claims: BusinessPlusClaim[]) => void,
): Unsubscribe =>
  onValue(ref(database, 'business_plus_claims'), (snap) => {
    callback(snap.exists() ? toClaimList(snap) : []);
  });

export const subscribeToBusinessPlusCards = (
  callback: (cards: BusinessPlusCard[]) => void,
): Unsubscribe =>
  onValue(ref(database, 'business_plus_cards'), (snap) => {
    callback(snap.exists() ? toCardList(snap) : []);
  });

// ── Claim actions ──

export const approveBusinessClaim = async (
  placeId: string,
  adminUid: string,
): Promise<void> => {
  const now = new Date().toISOString();
  // 1. Update claim status
  await update(ref(database, `business_plus_claims/${placeId}`), {
    status: 'approved',
    approvedBy: adminUid,
    approvedAt: now,
    updatedAt: now,
  });
  // 2. Seed business card with ownerId if not exists
  const cardSnap = await get(ref(database, `business_plus_cards/${placeId}`));
  if (!cardSnap.exists()) {
    const claimSnap = await get(ref(database, `business_plus_claims/${placeId}`));
    const claim = claimSnap.val() as BusinessPlusClaim | null;
    if (claim) {
      await update(ref(database, `business_plus_cards/${placeId}`), {
        placeId,
        placeName: claim.placeName,
        ownerId: claim.ownerUid,
        moderationStatus: 'approved',
        updatedAt: now,
      });
    }
  }
};

export const rejectBusinessClaim = async (
  placeId: string,
  adminUid: string,
  reason: string,
): Promise<void> => {
  const now = new Date().toISOString();
  await update(ref(database, `business_plus_claims/${placeId}`), {
    status: 'rejected',
    rejectedBy: adminUid,
    rejectedAt: now,
    rejectReason: reason,
    updatedAt: now,
  });
};

// ── Card actions ──

export const approveBusinessCard = async (
  placeId: string,
  adminUid: string,
): Promise<void> => {
  const now = new Date().toISOString();
  await update(ref(database, `business_plus_cards/${placeId}`), {
    moderationStatus: 'approved',
    approvedBy: adminUid,
    approvedAt: now,
  });
};

export const rejectBusinessCard = async (
  placeId: string,
  adminUid: string,
  reason: string,
): Promise<void> => {
  const now = new Date().toISOString();
  await update(ref(database, `business_plus_cards/${placeId}`), {
    moderationStatus: 'rejected',
    rejectedBy: adminUid,
    rejectedAt: now,
    rejectReason: reason,
  });
};

// ── User profile lookup (reuse from premiumAdminService pattern) ──

export const loadOwnerName = async (uid: string): Promise<string> => {
  try {
    const snap = await get(ref(database, `users/${uid}`));
    if (!snap.exists()) return uid.slice(0, 10) + '...';
    const d = snap.val() as Record<string, unknown>;
    return (typeof d.name === 'string' ? d.name : null)
      ?? (typeof d.displayName === 'string' ? d.displayName : null)
      ?? uid.slice(0, 10) + '...';
  } catch {
    return uid.slice(0, 10) + '...';
  }
};

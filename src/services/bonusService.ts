import { get, onValue, ref } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, database, firebaseApp } from '../firebase-core';

const functions = getFunctions(firebaseApp);

export type BonusCategory = {
  count: number;
  points: number;
};

export type UserBonuses = {
  total: number;
  invites: BonusCategory;
  likes: BonusCategory;
  help: BonusCategory;
  badge: string;
  updatedAt: number;
};

export type BonusBadge = 'newcomer' | 'good_neighbor' | 'active_resident' | 'guardian' | 'ambassador';

const EMPTY_BONUSES: UserBonuses = {
  total: 0,
  invites: { count: 0, points: 0 },
  likes: { count: 0, points: 0 },
  help: { count: 0, points: 0 },
  badge: 'newcomer',
  updatedAt: 0,
};

const normalizeCategory = (value: unknown): BonusCategory => {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return {
      count: Number(v.count || 0),
      points: Number(v.points || 0),
    };
  }
  return { count: 0, points: 0 };
};

const normalizeBonuses = (raw: unknown): UserBonuses => {
  if (!raw || typeof raw !== 'object') return EMPTY_BONUSES;
  const data = raw as Record<string, unknown>;
  return {
    total: Number(data.total || 0),
    invites: normalizeCategory(data.invites),
    likes: normalizeCategory(data.likes),
    help: normalizeCategory(data.help),
    badge: typeof data.badge === 'string' ? data.badge : 'newcomer',
    updatedAt: Number(data.updatedAt || 0),
  };
};

export const getMyBonuses = async (): Promise<UserBonuses> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return EMPTY_BONUSES;
  const snapshot = await get(ref(database, `user_bonuses/${uid}`));
  return normalizeBonuses(snapshot.val());
};

export const getUserBonuses = async (uid: string): Promise<UserBonuses> => {
  if (!uid) return EMPTY_BONUSES;
  const snapshot = await get(ref(database, `user_bonuses/${uid}`));
  return normalizeBonuses(snapshot.val());
};

export const subscribeMyBonuses = (
  onChanged: (bonuses: UserBonuses) => void,
): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onChanged(EMPTY_BONUSES);
    return () => {};
  }
  return onValue(ref(database, `user_bonuses/${uid}`), (snapshot) => {
    onChanged(normalizeBonuses(snapshot.val()));
  });
};

export const subscribeBonusesForUser = (
  uid: string,
  onChanged: (bonuses: UserBonuses) => void,
): (() => void) => {
  if (!uid) {
    onChanged(EMPTY_BONUSES);
    return () => {};
  }
  return onValue(ref(database, `user_bonuses/${uid}`), (snapshot) => {
    onChanged(normalizeBonuses(snapshot.val()));
  });
};

export const BONUS_BADGE_CONFIG: Record<BonusBadge, { minPoints: number }> = {
  newcomer: { minPoints: 0 },
  good_neighbor: { minPoints: 100 },
  active_resident: { minPoints: 500 },
  guardian: { minPoints: 2000 },
  ambassador: { minPoints: 5000 },
};

export const BONUS_CAPS = {
  invites: 5000,
  likes: 1000,
  help: 2000,
  total: 8000,
} as const;

type OfferHelpResponse = {
  ok: boolean;
  status: 'helped' | 'already_helped';
  points?: number;
};

export const offerHelp = async (requestId: string): Promise<OfferHelpResponse> => {
  const callable = httpsCallable<{ requestId: string }, OfferHelpResponse>(functions, 'offerHelp');
  const result = await callable({ requestId });
  return result.data;
};

export const checkIfHelped = async (requestId: string): Promise<boolean> => {
  const uid = auth.currentUser?.uid;
  if (!uid || !requestId) return false;
  const snap = await get(ref(database, `help_responses/${requestId}/${uid}`));
  return snap.exists();
};

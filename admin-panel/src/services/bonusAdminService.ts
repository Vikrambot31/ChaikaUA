import {
  ref,
  get,
  onValue,
  type Unsubscribe,
  type DataSnapshot,
} from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { database, functions } from '../firebase/firebase';

// ── Types ──

export interface UserBonusInfo {
  uid: string;
  balance: number;
  badge: string;
  totalEarned: number;
  weeklyUsed: number;
}

export interface UserPromoInfo {
  uid: string;
  balance: number;
  totalGranted: number;
  totalSpent: number;
}

export interface BonusTransaction {
  id: string;
  uid: string;
  type: 'earn' | 'spend' | 'admin_adjust';
  currency: 'trust' | 'promo';
  amount: number;
  category: string;
  createdAt: number;
  reason?: string;
}

export interface FraudFlag {
  uid1: string;
  uid2: string;
  score: number;
  reasons: string[];
  at: number;
  type: string;
}

export interface BonusPromotion {
  promotionId: string;
  uid: string;
  promoType: string;
  status: 'pending' | 'active' | 'expired' | 'rejected';
  currency: 'trust' | 'promo';
  cost: number;
  createdAt: number;
  expiresAt?: number;
  targetId?: string;
}

export interface BonusBlock {
  blocked: boolean;
  reason: string;
  at: number;
  by: string;
}

// ── Helpers ──

const snapshotToBonuses = (snap: DataSnapshot): UserBonusInfo[] => {
  const result: UserBonusInfo[] = [];
  snap.forEach((child) => {
    const data = child.val();
    if (data) {
      result.push({
        uid: child.key!,
        balance: data.balance ?? 0,
        badge: data.badge ?? '',
        totalEarned: data.earned?.total ?? 0,
        weeklyUsed: data.earned?.weekKey ? (data.earned?.help ?? 0) : 0,
      });
    }
  });
  return result;
};

const snapshotToPromoCredits = (snap: DataSnapshot): UserPromoInfo[] => {
  const result: UserPromoInfo[] = [];
  snap.forEach((child) => {
    const data = child.val();
    if (data) {
      result.push({
        uid: child.key!,
        balance: data.balance ?? 0,
        totalGranted: data.totalGranted ?? 0,
        totalSpent: data.totalSpent ?? 0,
      });
    }
  });
  return result;
};

// ── Subscriptions ──

export const subscribeToAllBonuses = (
  callback: (bonuses: UserBonusInfo[]) => void,
): Unsubscribe => {
  return onValue(ref(database, 'user_bonuses'), (snap) => {
    callback(snap.exists() ? snapshotToBonuses(snap) : []);
  });
};

export const subscribeToAllPromoCredits = (
  callback: (credits: UserPromoInfo[]) => void,
): Unsubscribe => {
  return onValue(ref(database, 'promo_credits'), (snap) => {
    callback(snap.exists() ? snapshotToPromoCredits(snap) : []);
  });
};

export const loadTransactions = async (uid: string): Promise<BonusTransaction[]> => {
  const snap = await get(ref(database, `bonus_transactions/${uid}`));
  if (!snap.exists()) return [];
  const result: BonusTransaction[] = [];
  snap.forEach((child) => {
    const data = child.val();
    if (data) {
      result.push({ ...data, id: child.key! } as BonusTransaction);
    }
  });
  return result.sort((a, b) => b.createdAt - a.createdAt);
};

export const loadFraudFlags = async (): Promise<FraudFlag[]> => {
  const snap = await get(ref(database, 'bonus_fraud_flags'));
  if (!snap.exists()) return [];
  const result: FraudFlag[] = [];
  snap.forEach((uidChild) => {
    uidChild.forEach((flagChild) => {
      const data = flagChild.val();
      if (data) {
        result.push(data as FraudFlag);
      }
    });
  });
  return result.sort((a, b) => b.at - a.at);
};

export const loadBonusBlocks = async (): Promise<Record<string, BonusBlock>> => {
  const snap = await get(ref(database, 'bonus_blocks'));
  if (!snap.exists()) return {};
  const result: Record<string, BonusBlock> = {};
  snap.forEach((child) => {
    const data = child.val();
    if (data) {
      result[child.key!] = data as BonusBlock;
    }
  });
  return result;
};

export const subscribeToPromotions = (
  callback: (promotions: BonusPromotion[]) => void,
): Unsubscribe => {
  return onValue(ref(database, 'bonus_promotions'), (snap) => {
    if (!snap.exists()) {
      callback([]);
      return;
    }
    const result: BonusPromotion[] = [];
    snap.forEach((child) => {
      const data = child.val();
      if (data) {
        result.push({ ...data, promotionId: child.key! } as BonusPromotion);
      }
    });
    result.sort((a, b) => b.createdAt - a.createdAt);
    callback(result);
  });
};

// ── Admin actions (Cloud Functions) ──

export const grantPromoCredits = async (
  targetUid: string,
  amount: number,
  reason: string,
): Promise<void> => {
  const fn = httpsCallable(functions, 'adminGrantPromoCredits');
  await fn({ targetUid, amount, reason });
};

export const adjustPromoCredits = async (
  targetUid: string,
  amount: number,
  reason: string,
): Promise<void> => {
  const fn = httpsCallable(functions, 'adminAdjustPromoCredits');
  await fn({ targetUid, amount, reason });
};

export const adjustTrustBonuses = async (
  targetUid: string,
  amount: number,
  reason: string,
): Promise<void> => {
  const fn = httpsCallable(functions, 'adminAdjustTrustBonuses');
  await fn({ targetUid, amount, reason });
};

export const blockUser = async (
  targetUid: string,
  blocked: boolean,
  reason: string,
): Promise<void> => {
  const fn = httpsCallable(functions, 'adminBlockBonusAccrual');
  await fn({ targetUid, blocked, reason });
};

export const moderatePromotion = async (
  promotionId: string,
  action: 'approve' | 'reject',
  reason: string,
): Promise<void> => {
  const fn = httpsCallable(functions, 'adminModeratePromotion');
  await fn({ promotionId, action, reason });
};

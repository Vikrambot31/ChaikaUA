import { equalTo, get, limitToLast, onValue, orderByChild, query, ref } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, database, firebaseApp } from '../firebase-core';

const functions = getFunctions(firebaseApp);

export type BonusCategory = {
  count: number;
  points: number;
};

export type UserBonuses = {
  total: number;
  available: number;
  invites: BonusCategory;
  likes: BonusCategory;
  help: BonusCategory;
  gratitude: BonusCategory;
  activity: BonusCategory;
  earned: {
    total: number;
    weeklyTotal: number;
    weeklyLimit: number;
    weekKey: string;
    weeklyByCategory: Record<string, number>;
  };
  spent: {
    total: number;
    contactsTop: number;
    businessTop: number;
    beautyTop: number;
    kidsTop: number;
  };
  badge: string;
  updatedAt: number;
};

export type PromoCredits = {
  balance: number;
  lifetime: number;
  spent: {
    total: number;
  };
  updatedAt: number;
};

export type BonusTransaction = {
  id: string;
  type: string;
  currency: 'trust' | 'promo' | string;
  category: string;
  points: number;
  balanceAfter: number;
  sourceId: string;
  sourceType: string;
  status: string;
  createdAt: number;
  createdBy: string;
  note: string;
};

export type BonusPromotion = {
  id: string;
  uid: string;
  currency: 'trust' | 'promo' | string;
  targetType: string;
  targetId: string;
  screen: string;
  pointsSpent: number;
  status: string;
  startsAt: number;
  expiresAt: number;
  createdAt: number;
  moderationStatus: string;
  badge: string;
};

export type HelpResponse = {
  helperUid: string;
  requestId: string;
  at: number;
  flagged: boolean;
};

export type HelpConfirmation = {
  helperUid: string;
  confirmedBy: string;
  at: number;
  bonusAwarded: boolean;
};

export type BonusBadge = 'newcomer' | 'good_neighbor' | 'active_resident' | 'guardian' | 'ambassador';

const EMPTY_BONUSES: UserBonuses = {
  total: 0,
  available: 0,
  invites: { count: 0, points: 0 },
  likes: { count: 0, points: 0 },
  help: { count: 0, points: 0 },
  gratitude: { count: 0, points: 0 },
  activity: { count: 0, points: 0 },
  earned: {
    total: 0,
    weeklyTotal: 0,
    weeklyLimit: 250,
    weekKey: '',
    weeklyByCategory: {},
  },
  spent: {
    total: 0,
    contactsTop: 0,
    businessTop: 0,
    beautyTop: 0,
    kidsTop: 0,
  },
  badge: 'newcomer',
  updatedAt: 0,
};

const EMPTY_PROMO_CREDITS: PromoCredits = {
  balance: 0,
  lifetime: 0,
  spent: { total: 0 },
  updatedAt: 0,
};

const toSafeNumber = (value: unknown, fallback = 0): number => {
  const next = Number(value ?? fallback);
  return Number.isFinite(next) ? next : fallback;
};

const normalizeCategory = (value: unknown): BonusCategory => {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return {
      count: toSafeNumber(v.count),
      points: toSafeNumber(v.points),
    };
  }
  return { count: 0, points: 0 };
};

const normalizeBonuses = (raw: unknown): UserBonuses => {
  if (!raw || typeof raw !== 'object') return EMPTY_BONUSES;
  const data = raw as Record<string, unknown>;
  const earnedRaw = data.earned && typeof data.earned === 'object' ? data.earned as Record<string, unknown> : {};
  const spentRaw = data.spent && typeof data.spent === 'object' ? data.spent as Record<string, unknown> : {};
  const earnedTotal = toSafeNumber(earnedRaw.total || data.total);
  const spentTotal = toSafeNumber(spentRaw.total);
  return {
    total: toSafeNumber(data.total || earnedTotal),
    available: toSafeNumber(data.available, Math.max(0, earnedTotal - spentTotal)),
    invites: normalizeCategory(data.invites),
    likes: normalizeCategory(data.likes),
    help: normalizeCategory(data.help),
    gratitude: normalizeCategory(data.gratitude),
    activity: normalizeCategory(data.activity),
    earned: {
      total: earnedTotal,
      weeklyTotal: toSafeNumber(earnedRaw.weeklyTotal),
      weeklyLimit: toSafeNumber(earnedRaw.weeklyLimit) || 250,
      weekKey: typeof earnedRaw.weekKey === 'string' ? earnedRaw.weekKey : '',
      weeklyByCategory: earnedRaw.weeklyByCategory && typeof earnedRaw.weeklyByCategory === 'object'
        ? Object.fromEntries(
          Object.entries(earnedRaw.weeklyByCategory as Record<string, unknown>)
            .map(([key, value]) => [key, toSafeNumber(value)])
        )
        : {},
    },
    spent: {
      total: spentTotal,
      contactsTop: toSafeNumber(spentRaw.contactsTop || spentRaw.contacts_top),
      businessTop: toSafeNumber(spentRaw.businessTop || spentRaw.business_top),
      beautyTop: toSafeNumber(spentRaw.beautyTop || spentRaw.beauty_top),
      kidsTop: toSafeNumber(spentRaw.kidsTop || spentRaw.kids_top),
    },
    badge: typeof data.badge === 'string' ? data.badge : 'newcomer',
    updatedAt: toSafeNumber(data.updatedAt),
  };
};

const normalizePromoCredits = (raw: unknown): PromoCredits => {
  if (!raw || typeof raw !== 'object') return EMPTY_PROMO_CREDITS;
  const data = raw as Record<string, unknown>;
  const spentRaw = data.spent && typeof data.spent === 'object' ? data.spent as Record<string, unknown> : {};
  return {
    balance: toSafeNumber(data.balance),
    lifetime: toSafeNumber(data.lifetime),
    spent: {
      total: toSafeNumber(spentRaw.total),
    },
    updatedAt: toSafeNumber(data.updatedAt),
  };
};

const normalizeTransaction = (id: string, raw: unknown): BonusTransaction => {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    id,
    type: String(data.type || ''),
    currency: String(data.currency || ''),
    category: String(data.category || ''),
    points: toSafeNumber(data.points),
    balanceAfter: toSafeNumber(data.balanceAfter),
    sourceId: String(data.sourceId || ''),
    sourceType: String(data.sourceType || ''),
    status: String(data.status || ''),
    createdAt: toSafeNumber(data.createdAt),
    createdBy: String(data.createdBy || ''),
    note: String(data.note || ''),
  };
};

const normalizePromotion = (id: string, raw: unknown): BonusPromotion => {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    id,
    uid: String(data.uid || ''),
    currency: String(data.currency || ''),
    targetType: String(data.targetType || ''),
    targetId: String(data.targetId || ''),
    screen: String(data.screen || ''),
    pointsSpent: toSafeNumber(data.pointsSpent),
    status: String(data.status || ''),
    startsAt: toSafeNumber(data.startsAt),
    expiresAt: toSafeNumber(data.expiresAt),
    createdAt: toSafeNumber(data.createdAt),
    moderationStatus: String(data.moderationStatus || ''),
    badge: String(data.badge || ''),
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
  }, (error) => {
    console.error('[subscribeMyBonuses] RTDB error:', error.message);
  });
};

export const subscribeMyPromoCredits = (
  onChanged: (credits: PromoCredits) => void,
): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onChanged(EMPTY_PROMO_CREDITS);
    return () => {};
  }
  return onValue(ref(database, `promo_credits/${uid}`), (snapshot) => {
    onChanged(normalizePromoCredits(snapshot.val()));
  }, (error) => {
    console.error('[subscribeMyPromoCredits] RTDB error:', error.message);
  });
};

export const subscribeMyBonusTransactions = (
  onChanged: (transactions: BonusTransaction[]) => void,
  maxItems = 30,
): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onChanged([]);
    return () => {};
  }
  const transactionsQuery = query(
    ref(database, `bonus_transactions/${uid}`),
    orderByChild('createdAt'),
    limitToLast(maxItems),
  );
  return onValue(transactionsQuery, (snapshot) => {
    const items: BonusTransaction[] = [];
    snapshot.forEach((child) => {
      items.push(normalizeTransaction(child.key || '', child.val()));
    });
    items.sort((a, b) => b.createdAt - a.createdAt);
    onChanged(items);
  });
};

export const subscribeMyBonusPromotions = (
  onChanged: (promotions: BonusPromotion[]) => void,
): (() => void) => {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onChanged([]);
    return () => {};
  }
  const promotionsQuery = query(
    ref(database, 'bonus_promotions'),
    orderByChild('uid'),
    equalTo(uid),
  );
  return onValue(promotionsQuery, (snapshot) => {
    const items: BonusPromotion[] = [];
    snapshot.forEach((child) => {
      items.push(normalizePromotion(child.key || '', child.val()));
    });
    items.sort((a, b) => b.createdAt - a.createdAt);
    onChanged(items);
  });
};

export const subscribeActiveBonusPromotions = (
  screen: string,
  onChanged: (promotions: BonusPromotion[]) => void,
): (() => void) => {
  if (!screen) {
    onChanged([]);
    return () => {};
  }
  const promotionsQuery = query(
    ref(database, 'bonus_promotions'),
    orderByChild('screen'),
    equalTo(screen),
  );
  return onValue(promotionsQuery, (snapshot) => {
    const now = Date.now();
    const items: BonusPromotion[] = [];
    snapshot.forEach((child) => {
      const item = normalizePromotion(child.key || '', child.val());
      if (item.status === 'active' && item.moderationStatus === 'approved' && item.expiresAt > now) {
        items.push(item);
      }
    });
    items.sort((a, b) => b.createdAt - a.createdAt);
    onChanged(items);
  }, (error) => {
    console.error('[subscribeActiveBonusPromotions] RTDB error:', error.message);
  });
};

// Subscribes to Business+ active entities for a given feed screen.
// Returns entity IDs sorted by activatedAt DESC (newest payer = position 1).
export const subscribeBiznesPlusPlaces = (
  screen: string,
  onChanged: (entityIds: string[]) => void,
): (() => void) => {
  const q = query(
    ref(database, 'business_plus_active'),
    orderByChild('screen'),
    equalTo(screen),
  );
  return onValue(q, (snapshot) => {
    const now = Date.now();
    const items: { id: string; activatedAt: number }[] = [];
    snapshot.forEach((child) => {
      const val = child.val() as { screen: string; activatedAt: number; expiresAt: number };
      if (!val.expiresAt || val.expiresAt > now) {
        items.push({ id: child.key!, activatedAt: val.activatedAt || 0 });
      }
    });
    items.sort((a, b) => b.activatedAt - a.activatedAt);
    onChanged(items.map((i) => i.id));
  }, (error) => {
    console.error('[subscribeBiznesPlusPlaces] RTDB error:', error.message);
  });
};

export const subscribeAdminBonusPromotions = (
  onChanged: (promotions: BonusPromotion[]) => void,
  maxItems = 100,
): (() => void) => {
  const promotionsQuery = query(
    ref(database, 'bonus_promotions'),
    orderByChild('createdAt'),
    limitToLast(maxItems),
  );
  return onValue(promotionsQuery, (snapshot) => {
    const items: BonusPromotion[] = [];
    snapshot.forEach((child) => {
      items.push(normalizePromotion(child.key || '', child.val()));
    });
    items.sort((a, b) => b.createdAt - a.createdAt);
    onChanged(items);
  });
};

const normalizeHelpResponse = (helperUid: string, raw: unknown): HelpResponse => {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    helperUid: String(data.helperUid || helperUid),
    requestId: String(data.requestId || ''),
    at: Number(data.at || 0),
    flagged: data.flagged === true,
  };
};

const normalizeHelpConfirmation = (helperUid: string, raw: unknown): HelpConfirmation => {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    helperUid,
    confirmedBy: String(data.confirmedBy || ''),
    at: Number(data.at || 0),
    bonusAwarded: data.bonusAwarded === true,
  };
};

export const subscribeHelpResponses = (
  requestId: string,
  onChanged: (responses: HelpResponse[]) => void,
): (() => void) => {
  if (!requestId) {
    onChanged([]);
    return () => {};
  }
  return onValue(ref(database, `help_responses/${requestId}`), (snapshot) => {
    const items: HelpResponse[] = [];
    snapshot.forEach((child) => {
      items.push(normalizeHelpResponse(child.key || '', child.val()));
    });
    items.sort((a, b) => a.at - b.at);
    onChanged(items);
  });
};

export const subscribeHelpConfirmations = (
  requestId: string,
  onChanged: (confirmations: HelpConfirmation[]) => void,
): (() => void) => {
  if (!requestId) {
    onChanged([]);
    return () => {};
  }
  return onValue(ref(database, `help_confirmations/${requestId}`), (snapshot) => {
    const items: HelpConfirmation[] = [];
    snapshot.forEach((child) => {
      items.push(normalizeHelpConfirmation(child.key || '', child.val()));
    });
    items.sort((a, b) => a.at - b.at);
    onChanged(items);
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
  status: 'helped' | 'already_helped' | 'responded' | 'already_responded' | 'flagged' | string;
  points?: number;
};

export const offerHelp = async (requestId: string): Promise<OfferHelpResponse> => {
  const callable = httpsCallable<{ requestId: string }, OfferHelpResponse>(functions, 'awardHelpRespondBonus');
  const result = await callable({ requestId });
  return result.data;
};

export const checkIfHelped = async (requestId: string): Promise<boolean> => {
  const uid = auth.currentUser?.uid;
  if (!uid || !requestId) return false;
  const snap = await get(ref(database, `help_responses/${requestId}/${uid}`));
  return snap.exists();
};

export const awardHelpRespondBonus = async (requestId: string): Promise<OfferHelpResponse> => {
  const callable = httpsCallable<{ requestId: string }, OfferHelpResponse>(functions, 'awardHelpRespondBonus');
  const result = await callable({ requestId });
  return result.data;
};

export const confirmHelperForRequest = async (
  requestId: string,
  helperUid: string,
): Promise<{ ok: boolean; status: string; points?: number }> => {
  const callable = httpsCallable<{ requestId: string; helperUid: string }, { ok: boolean; status: string; points?: number }>(
    functions,
    'confirmHelperForRequest',
  );
  const result = await callable({ requestId, helperUid });
  return result.data;
};

export const closeRequestWithBonus = async (
  requestId: string,
): Promise<{ ok: boolean; status: string; points?: number }> => {
  const callable = httpsCallable<{ requestId: string }, { ok: boolean; status: string; points?: number }>(
    functions,
    'closeRequestWithBonus',
  );
  const result = await callable({ requestId });
  return result.data;
};

export const awardGratitudeBonus = async (
  requestId: string,
  helperUid: string,
): Promise<{ ok: boolean; awarded: boolean; points?: number }> => {
  const callable = httpsCallable<{ requestId: string; helperUid: string }, { ok: boolean; awarded: boolean; points?: number }>(
    functions,
    'awardGratitudeBonus',
  );
  const result = await callable({ requestId, helperUid });
  return result.data;
};

export const adminGrantPromoCredits = async ({
  targetUid,
  amount,
  reason,
  ticketId,
}: {
  targetUid: string;
  amount: number;
  reason: string;
  ticketId?: string;
}): Promise<{ ok: boolean; newBalance: number }> => {
  const callable = httpsCallable<
    { targetUid: string; amount: number; reason: string; ticketId?: string },
    { ok: boolean; newBalance: number }
  >(functions, 'adminGrantPromoCredits');
  const result = await callable({ targetUid, amount, reason, ticketId });
  return result.data;
};

export const adminModeratePromotion = async ({
  promotionId,
  action,
  reason,
}: {
  promotionId: string;
  action: 'approve' | 'reject';
  reason?: string;
}): Promise<{ ok: boolean; action: 'approve' | 'reject' }> => {
  const callable = httpsCallable<
    { promotionId: string; action: 'approve' | 'reject'; reason?: string },
    { ok: boolean; action: 'approve' | 'reject' }
  >(functions, 'adminModeratePromotion');
  const result = await callable({ promotionId, action, reason });
  return result.data;
};

export const awardProfileThanksBonus = async (targetUid: string): Promise<{ ok: boolean; awarded: boolean; points?: number }> => {
  const callable = httpsCallable<{ targetUid: string }, { ok: boolean; awarded: boolean; points?: number }>(functions, 'awardProfileThanksBonus');
  const result = await callable({ targetUid });
  return result.data;
};

export const awardDailyLoginBonus = async (): Promise<{ ok: boolean; awarded: boolean }> => {
  const callable = httpsCallable<object, { ok: boolean; awarded: boolean }>(functions, 'awardDailyLoginBonus');
  const result = await callable({});
  return result.data;
};

export const awardMilestoneBonus = async (milestone: 'profile_complete' | 'first_request' | 'first_response'): Promise<{ ok: boolean; awarded: boolean; points?: number }> => {
  const callable = httpsCallable<{ milestone: string }, { ok: boolean; awarded: boolean; points?: number }>(functions, 'awardMilestoneBonus');
  const result = await callable({ milestone });
  return result.data;
};

export const purchaseBonusPromotion = async ({
  promoType,
  duration,
  targetId,
}: {
  promoType: string;
  duration: string;
  targetId: string;
}): Promise<{ ok: boolean; promotionId: string; expiresAt: number; moderationStatus: string }> => {
  const callable = httpsCallable<
    { promoType: string; duration: string; targetId: string },
    { ok: boolean; promotionId: string; expiresAt: number; moderationStatus: string }
  >(functions, 'purchaseBonusPromotion');
  const result = await callable({ promoType, duration, targetId });
  return result.data;
};

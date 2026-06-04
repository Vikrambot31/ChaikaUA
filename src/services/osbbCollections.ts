import { ref, push, onValue, query, orderByChild, limitToLast, runTransaction } from 'firebase/database';
import { database } from '../firebase-core';
import { ModerationStatus, createPendingModeration } from '../utils/moderation';
import { sanitizeStoredText } from '../utils/textUtils';

export type OsbbCollection = {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  targetAmount: number;
  collectedAmount: number;
  paymentUrl: string;
  createdAt: string;
  moderationStatus?: ModerationStatus;
  submittedForModerationAt?: string;
  moderatedAt?: string;
};

type StoredCollection = Omit<OsbbCollection, 'id'>;

const PATH = 'osbb_collections';
const SAFE_PAYMENT_HOSTS = ['send.monobank.ua', 'jar.monobank.ua', 'mono.bank'];

const normalizePaymentUrl = (value: string): string => {
  const trimmed = value.trim();
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('invalid-payment-url');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('invalid-payment-url');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!SAFE_PAYMENT_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    throw new Error('invalid-payment-url');
  }

  return parsed.toString();
};

const mapCollection = ([id, data]: [string, StoredCollection]): OsbbCollection => ({
  id,
  title: sanitizeStoredText(data.title || ''),
  description: typeof data.description === 'string' ? data.description : undefined,
  deadline: typeof data.deadline === 'string' ? data.deadline : undefined,
  targetAmount: typeof data.targetAmount === 'number' ? data.targetAmount : 0,
  collectedAmount: typeof data.collectedAmount === 'number' ? data.collectedAmount : 0,
  paymentUrl: typeof data.paymentUrl === 'string' ? data.paymentUrl : '',
  createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
  moderationStatus: data.moderationStatus,
  submittedForModerationAt: data.submittedForModerationAt,
  moderatedAt: data.moderatedAt,
});

export const calculateOsbbCollectionTotals = (items: Pick<OsbbCollection, 'targetAmount' | 'collectedAmount'>[]) => {
  const totalTarget = items.reduce((sum, item) => sum + item.targetAmount, 0);
  const totalCollected = items.reduce((sum, item) => sum + item.collectedAmount, 0);

  return {
    totalTarget,
    totalCollected,
    remaining: Math.max(0, totalTarget - totalCollected),
  };
};

export const subscribeOsbbCollections = (
  buildingId: string | null | undefined,
  callback: (items: OsbbCollection[]) => void
): (() => void) => {
  if (!buildingId) {
    callback([]);
    return () => {};
  }

  const listRef = query(ref(database, `${PATH}/${buildingId}`), orderByChild('createdAt'), limitToLast(100));

  const unsubscribe = onValue(listRef, (snapshot) => {
    const raw = snapshot.val();
    if (!raw) {
      callback([]);
      return;
    }

    const items = Object.entries(raw as Record<string, StoredCollection>)
      .map((entry) => mapCollection(entry as [string, StoredCollection]))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    callback(items);
  });

  return unsubscribe;
};

export const loadOsbbCollections = async (buildingId: string | null | undefined): Promise<OsbbCollection[]> => {
  return await new Promise((resolve) => {
    const unsubscribe = subscribeOsbbCollections(buildingId, (items) => {
      unsubscribe();
      resolve(items);
    });
  });
};

export const addOsbbCollection = async (
  buildingId: string,
  payload: Omit<OsbbCollection, 'id' | 'createdAt' | 'collectedAmount'>
) => {
  const listRef = ref(database, `${PATH}/${buildingId}`);
  const normalizedTarget = Number(payload.targetAmount);
  if (!Number.isFinite(normalizedTarget) || normalizedTarget <= 0) {
    throw new Error('invalid-target-amount');
  }
  const nextItem: StoredCollection = {
    title: sanitizeStoredText(payload.title),
    ...(payload.description ? { description: sanitizeStoredText(payload.description) } : {}),
    ...(payload.deadline ? { deadline: payload.deadline } : {}),
    targetAmount: normalizedTarget,
    collectedAmount: 0,
    paymentUrl: normalizePaymentUrl(payload.paymentUrl),
    createdAt: new Date().toISOString(),
    ...createPendingModeration(),
  };

  const newRef = await push(listRef, nextItem);
  return newRef.key!;
};

export const updateOsbbCollection = async (
  buildingId: string,
  id: string,
  updater: (item: OsbbCollection) => OsbbCollection
) => {
  const itemRef = ref(database, `${PATH}/${buildingId}/${id}`);
  await runTransaction(itemRef, (current: StoredCollection | null) => {
    if (!current) {
      return current;
    }

    const next = updater(mapCollection([id, current]));
    return {
      ...current,
      title: sanitizeStoredText(next.title),
      targetAmount: next.targetAmount,
      collectedAmount: next.collectedAmount,
      paymentUrl: next.paymentUrl.trim(),
      moderationStatus: next.moderationStatus,
      submittedForModerationAt: next.submittedForModerationAt,
      moderatedAt: next.moderatedAt,
    };
  });
};

// ---------------------------------------------------------------------------
// Payment entries
// ---------------------------------------------------------------------------

const PAYMENTS_PATH = 'osbb_collection_payments';

export type CollectionPayment = {
  id: string;
  payerName: string;
  amount: number;
  paidAt: string;
};

export const recordCollectionPayment = async (
  buildingId: string,
  collectionId: string,
  payerName: string,
  amount: number,
) => {
  const collectionRef = ref(database, `${PATH}/${buildingId}/${collectionId}`);
  await runTransaction(collectionRef, (current: StoredCollection | null) => {
    if (!current) return current;
    const newCollected = current.collectedAmount + amount;
    return {
      ...current,
      collectedAmount: Math.min(newCollected, current.targetAmount),
    };
  });

  const paymentsRef = ref(database, `${PAYMENTS_PATH}/${buildingId}/${collectionId}`);
  await push(paymentsRef, {
    payerName: sanitizeStoredText(payerName),
    amount,
    paidAt: new Date().toISOString(),
  });
};

export const subscribeOsbbCollectionPayments = (
  buildingId: string,
  collectionId: string,
  callback: (payments: CollectionPayment[]) => void,
): (() => void) => {
  const listRef = query(
    ref(database, `${PAYMENTS_PATH}/${buildingId}/${collectionId}`),
    orderByChild('paidAt'),
    limitToLast(50),
  );

  return onValue(
    listRef,
    (snapshot) => {
      const raw = snapshot.val() as Record<string, Omit<CollectionPayment, 'id'>> | null;
      if (!raw) { callback([]); return; }
      const payments = Object.entries(raw)
        .map(([id, data]) => ({
          id,
          payerName: typeof data.payerName === 'string' ? data.payerName : '',
          amount: typeof data.amount === 'number' ? data.amount : 0,
          paidAt: typeof data.paidAt === 'string' ? data.paidAt : '',
        }))
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
      callback(payments);
    },
    () => { callback([]); },
  );
};

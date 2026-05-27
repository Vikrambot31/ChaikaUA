const functions = require('firebase-functions');
const functionsV1 = require('firebase-functions/v1');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { createInviteAccessFunctions } = require('./inviteAccess');

admin.initializeApp();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID || '';
const CHAYKA_TELEGRAM_TOPIC = process.env.CHAYKA_TELEGRAM_TOPIC || '';
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
const OSBB_VOTE_PATH = 'osbb_votes';
const PUBLIC_IMAGE_PREFIXES = ['community_photos/', 'lost_found/', 'buy_sell/', 'local_business/', 'requests/'];
const FREE_PREMIUM_LIMIT = 500;
const PREMIUM_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PREMIUM_PLANS = new Set(['premium', 'premium_plus']);
const MEDIA_ACCESS_TTL_MS = 15 * 60 * 1000;
const MEDIA_DATA_URL_MAX_BYTES = 8 * 1024 * 1024;
const MEDIA_PATH_RE = /^(?:(?:community_photos|lost_found|buy_sell|buy_sell_listings|profile_photos|local_business|requests)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+|uploads\/users\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)\.(jpg|jpeg|png|webp|heic|heif)$/i;

const redactText = (value = '') =>
  String(value || '')
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(PHONE_RE, '[redacted-phone]');

const sanitizePayload = (payload) => {
  if (typeof payload === 'string') return redactText(payload);
  if (Array.isArray(payload)) return payload.map((v) => sanitizePayload(v));
  if (payload && typeof payload === 'object') {
    const out = {};
    Object.entries(payload).forEach(([k, v]) => {
      out[k] = sanitizePayload(v);
    });
    return out;
  }
  return payload;
};

const sendTelegramMessage = async (text, options = {}) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
      ...options,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`);
  }

  return response.json();
};

const normalizeNewsText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const sanitizeText = (value = '', maxLength = 500) => normalizeNewsText(value).slice(0, maxLength);
const HIGH_PRIORITY_REQUEST_CATEGORIES = new Set(['medical', 'electricity', 'care', 'repair']);

const getRequestPriorityParts = (category = '') => {
  const normalizedCategory = normalizeNewsText(category).toLowerCase();

  if (normalizedCategory === 'app_suggestion') {
    return {
      moderationPriority: 'low',
      moderationQueue: 'feedback',
      requiresManualModeration: true,
      priorityNumber: '03',
      priorityKey: 'low',
    };
  }

  if (HIGH_PRIORITY_REQUEST_CATEGORIES.has(normalizedCategory)) {
    return {
      moderationPriority: 'high',
      moderationQueue: 'urgent',
      requiresManualModeration: true,
      priorityNumber: '01',
      priorityKey: normalizedCategory,
    };
  }

  return {
    moderationPriority: 'standard',
    moderationQueue: 'standard',
    requiresManualModeration: true,
    priorityNumber: '02',
    priorityKey: 'standard',
  };
};

const getRequestStatusPriority = (status = 'pending', category = '') => {
  const parts = getRequestPriorityParts(category);
  const normalizedStatus = normalizeNewsText(status).toLowerCase() || 'pending';
  return `${normalizedStatus}_${parts.priorityNumber}_${parts.priorityKey}`;
};

const getRequestModerationMeta = (category = '', status = 'pending') => {
  const parts = getRequestPriorityParts(category);
  return {
    moderationPriority: parts.moderationPriority,
    moderationQueue: parts.moderationQueue,
    requiresManualModeration: parts.requiresManualModeration,
    status_priority: getRequestStatusPriority(status, category),
  };
};

const makeSafeTelegramUrl = (url = '') => {
  const value = normalizeNewsText(url);
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return parsed.toString();
  } catch {
    return value;
  }
};

const formatChaykaTelegramPost = (item = {}) => {
  const title = normalizeNewsText(item.title || 'Новости Чайки');
  const shortText = normalizeNewsText(item.shortText || item.body || item.summary || '');
  const sourceName = normalizeNewsText(item.sourceName || 'Источник');
  const sourceUrl = makeSafeTelegramUrl(item.sourceUrl || item.link || '');
  const metaLine = sourceUrl ? `Источник: ${sourceName}\n${sourceUrl}` : `Источник: ${sourceName}`;

  return [
    `📰 ${title}`,
    shortText,
    metaLine,
    CHAYKA_TELEGRAM_TOPIC ? `Тема: ${CHAYKA_TELEGRAM_TOPIC}` : '',
  ].filter(Boolean).join('\n\n');
};

const writeOpsEvent = async (type, payload = {}) => {
  try {
    await admin.database().ref('ops/events').push({
      type,
      at: Date.now(),
      source: 'functions',
      ...payload,
    });
  } catch (error) {
    console.error('Error writing ops event:', error);
  }
};

const writeOpsError = async (functionName, error, payload = {}) => {
  try {
    await admin.database().ref('ops/errors').push({
      functionName,
      at: Date.now(),
      source: 'functions',
      message: redactText(String(error?.message || error || 'Unknown error')),
      ...sanitizePayload(payload),
    });
  } catch (writeError) {
    console.error('Error writing ops error:', writeError);
  }
};

const PRIMARY_SERVICE_EMAIL = 'vikramsave@ukr.net';
const ADMIN_BACKUP_UID = String(process.env.ADMIN_BACKUP_UID || '').trim();
const EMERGENCY_ACCESS_PATH = 'security_config/emergency_access/current';
const EMERGENCY_ADMIN_LOG_PATH = 'security_logs/admin_actions';
const EMERGENCY_DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;
const EMERGENCY_MAX_TTL_MS = 6 * 60 * 60 * 1000;
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = 5;
const USER_CONTENT_COLLECTIONS = [
  'requests',
  'community_photos',
  'lost_found',
  'job_listings',
  'buy_sell_listings',
];
const USER_KEYED_PATHS = [
  'users',
  'user_roles',
];
const STORAGE_USER_PREFIXES = [
  'community_photos',
  'lost_found',
  'buy_sell',
  'voice_messages',
];

const isPrimaryServiceOwnerContext = (context) =>
  Boolean(
    (ADMIN_BACKUP_UID && context?.auth?.uid === ADMIN_BACKUP_UID) ||
    (context?.auth?.token?.email &&
    String(context.auth.token.email).toLowerCase() === PRIMARY_SERVICE_EMAIL &&
    context?.auth?.token?.email_verified === true),
  );

const isAdminRoleContext = async (context) => {
  if (!context?.auth?.uid) return false;
  const role = await getRoleForUid(context.auth.uid);
  return role === 'admin';
};

const getRoleForUid = async (uid) => {
  if (!uid) return '';
  const snapshot = await admin.database().ref(`user_roles/${uid}/role`).once('value');
  return String(snapshot.val() || '');
};

const getVerifiedActorEmail = (context) => {
  const email = String(context?.auth?.token?.email || '').trim().toLowerCase();
  const emailVerified = context?.auth?.token?.email_verified === true;
  return email && emailVerified ? email : '';
};

const assertEmergencyDebugActor = async (context) => {
  if (!context.auth?.uid) {
    throw new functionsV1.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const actorEmail = getVerifiedActorEmail(context);
  if (!actorEmail) {
    throw new functionsV1.https.HttpsError('permission-denied', 'Verified email is required');
  }

  const role = await getRoleForUid(context.auth.uid);
  const isPrimaryOwner = actorEmail === PRIMARY_SERVICE_EMAIL;
  const isAdmin = role === 'admin';
  if (!isPrimaryOwner && !isAdmin) {
    throw new functionsV1.https.HttpsError('permission-denied', 'Primary owner or admin access required');
  }

  return {
    uid: context.auth.uid,
    email: actorEmail,
    role: isPrimaryOwner ? 'primary_owner' : role,
  };
};

const setCustomClaimMerged = async (uid, key, value) => {
  if (!uid) return;
  const userRecord = await admin.auth().getUser(uid);
  const claims = { ...(userRecord.customClaims || {}) };
  if (value === undefined || value === null || value === false) {
    delete claims[key];
  } else {
    claims[key] = value;
  }
  await admin.auth().setCustomUserClaims(uid, claims);
};

const writeEmergencyAdminActionLog = async (payload) => {
  await admin.database().ref(EMERGENCY_ADMIN_LOG_PATH).push({
    ...payload,
    at: payload.at || Date.now(),
  });
};

Object.assign(exports, createInviteAccessFunctions({
  functions,
  admin,
  writeOpsEvent,
  writeOpsError,
  isPrimaryServiceOwnerContext,
  isAdminRoleContext,
  getRoleForUid,
}));

const userHasBuildingAccess = async (uid, buildingId) => {
  if (!uid || !buildingId) return false;

  const [roleSnapshot, memberSnapshot] = await Promise.all([
    admin.database().ref(`user_roles/${uid}`).once('value'),
    admin.database().ref(`osbb_members/${buildingId}/${uid}`).once('value'),
  ]);
  const roleValue = roleSnapshot.val() || {};
  const memberValue = memberSnapshot.val() || {};

  return (
    roleValue.buildingId === buildingId ||
    roleValue.osbbBuildingId === buildingId ||
    roleValue.buildingIds?.[buildingId] === true ||
    roleValue.managedBuildingIds?.[buildingId] === true ||
    memberValue.status === 'approved' ||
    memberValue.approved === true
  );
};

const assertOsbbManagerAccess = async (context, buildingId) => {
  if (!context.auth?.uid) {
    throw new functionsV1.https.HttpsError('unauthenticated', 'Authentication required');
  }

  if (!buildingId) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'buildingId is required');
  }

  if (isPrimaryServiceOwnerContext(context)) {
    return { uid: context.auth.uid, role: 'owner' };
  }

  const role = await getRoleForUid(context.auth.uid);
  if (role === 'admin' || role === 'moderator') {
    return { uid: context.auth.uid, role };
  }

  if (role === 'osbb_manager' && await userHasBuildingAccess(context.auth.uid, buildingId)) {
    return { uid: context.auth.uid, role };
  }

  throw new functionsV1.https.HttpsError('permission-denied', 'OSBB manager access required');
};

const assertOsbbResidentAccess = async (context, buildingId) => {
  if (!context.auth?.uid) {
    throw new functionsV1.https.HttpsError('unauthenticated', 'Authentication required');
  }

  if (!buildingId) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'buildingId is required');
  }

  if (isPrimaryServiceOwnerContext(context)) {
    return { uid: context.auth.uid, role: 'owner' };
  }

  const role = await getRoleForUid(context.auth.uid);
  if (role === 'admin' || role === 'moderator') {
    return { uid: context.auth.uid, role };
  }

  if (await userHasBuildingAccess(context.auth.uid, buildingId)) {
    return { uid: context.auth.uid, role: role || 'resident' };
  }

  throw new functionsV1.https.HttpsError('permission-denied', 'OSBB building membership required');
};

const normalizeOsbbVoteStatus = (status, deadline) => {
  if (status === 'closed') {
    return 'closed';
  }

  const deadlineMs = new Date(String(deadline || '')).getTime();
  return Number.isFinite(deadlineMs) && deadlineMs <= Date.now() ? 'closed' : 'active';
};

const normalizeOsbbVoteOptionId = (value) => (value === 'no' ? 'no' : 'yes');

const normalizeOsbbVoteOptions = (options) => {
  const normalized = Array.isArray(options)
    ? options
      .map((option, index) => ({
        id: typeof option?.id === 'string' ? option.id : index === 1 ? 'no' : 'yes',
        labelKey: normalizeOsbbVoteOptionId(option?.labelKey),
        votes: typeof option?.votes === 'number' ? option.votes : 0,
      }))
      .filter((option) => option.id === 'yes' || option.id === 'no')
    : [];

  if (
    normalized.length === 2 &&
    normalized.some((option) => option.id === 'yes') &&
    normalized.some((option) => option.id === 'no')
  ) {
    return normalized;
  }

  return [
    { id: 'yes', labelKey: 'yes', votes: 0 },
    { id: 'no', labelKey: 'no', votes: 0 },
  ];
};

const buildClosedVotePatch = (vote) => {
  if (!vote) return null;
  const normalizedStatus = normalizeOsbbVoteStatus(vote.status, vote.deadline);
  if (normalizedStatus !== 'closed' || vote.status === 'closed') {
    return null;
  }

  return {
    status: 'closed',
    closedAt: new Date().toISOString(),
  };
};

const isModeratorRole = (role) => role === 'admin' || role === 'moderator';

const getUserRoleRecord = async (uid) => {
  if (!uid) return {};
  const snapshot = await admin.database().ref(`user_roles/${uid}`).once('value');
  return snapshot.val() || {};
};

const assertSafeMediaPath = (storagePath) => {
  const value = String(storagePath || '').trim();
  if (!MEDIA_PATH_RE.test(value)) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'Invalid media path');
  }
  return value;
};

const getStorageBucketCandidates = () => {
  const projectId = process.env.GCLOUD_PROJECT || process.env.PROJECT_ID || '';
  const configured = String(admin.app().options.storageBucket || '').trim();
  const candidates = [
    configured,
    projectId ? `${projectId}.firebasestorage.app` : '',
    projectId ? `${projectId}.appspot.com` : '',
  ].filter(Boolean);
  return Array.from(new Set(candidates));
};

const issueSignedUrlForPath = async (storagePath, expiresAt) => {
  const bucketCandidates = getStorageBucketCandidates();
  let lastError = null;
  for (const bucketName of bucketCandidates) {
    try {
      const [url] = await admin.storage().bucket(bucketName).file(storagePath).getSignedUrl({
        action: 'read',
        expires: expiresAt,
      });
      return { url, bucketName };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('No storage buckets configured for signed URL generation');
};

const issueDownloadTokenUrlForPath = async (storagePath) => {
  const bucketCandidates = getStorageBucketCandidates();
  let lastError = null;

  for (const bucketName of bucketCandidates) {
    try {
      const file = admin.storage().bucket(bucketName).file(storagePath);
      const [metadata] = await file.getMetadata();
      const tokenSource = String(
        metadata?.metadata?.firebaseStorageDownloadTokens ||
        metadata?.firebaseStorageDownloadTokens ||
        '',
      ).trim();
      const token = tokenSource.split(',').map((part) => part.trim()).find(Boolean);
      if (!token) {
        continue;
      }

      const encodedPath = encodeURIComponent(storagePath);
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
      return { url, bucketName };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('No firebaseStorageDownloadTokens found for media object');
};

const sniffImageContentType = (buffer, fallback = '') => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  const safeFallback = String(fallback || '').toLowerCase();
  if (safeFallback.startsWith('image/')) return safeFallback;
  return 'image/jpeg';
};

const getExistingMediaFile = async (storagePath) => {
  const bucketCandidates = getStorageBucketCandidates();
  let lastError = null;
  for (const bucketName of bucketCandidates) {
    try {
      const file = admin.storage().bucket(bucketName).file(storagePath);
      const [exists] = await file.exists();
      if (exists) return { file, bucketName };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  throw new functionsV1.https.HttpsError('not-found', 'Media file not found in Storage');
};

const getMediaRecordRef = (collection, itemId) => {
  const db = admin.database();
  if (collection === 'community_photos') return db.ref(`community_photos/${itemId}`);
  if (collection === 'requests') return db.ref(`requests/${itemId}`);
  if (collection === 'lost_found') return db.ref(`lost_found/${itemId}`);
  if (collection === 'buy_sell_listings') return db.ref(`buy_sell_listings/${itemId}`);
  if (collection === 'local_business') return db.ref(`local_business/${itemId}`);
  throw new functionsV1.https.HttpsError('invalid-argument', 'Unsupported media collection');
};

const getRecordMediaPath = (record) => String(
  record?.storagePath || record?.photoStoragePath || record?.imageStoragePath || record?.imageUri || record?.photoUri || '',
);

const getRecordOwnerId = (collection, itemId, record) => {
  const ownerId = String(record?.userId || '').trim();
  if (!ownerId) {
    throw new functionsV1.https.HttpsError('failed-precondition', 'Media record owner is missing');
  }
  return ownerId;
};

const getRecordModerationStatus = (record) => String(record?.status || record?.moderationStatus || '').toLowerCase();

const sendUserNotification = async (uid, notification, data = {}) => {
  if (!uid) return { sent: false, reason: 'missing-uid' };
  const tokenSnapshot = await admin.database().ref(`user_roles/${uid}/fcmToken`).once('value');
  const token = String(tokenSnapshot.val() || '').trim();
  if (!token) return { sent: false, reason: 'missing-token' };

  try {
    await admin.messaging().send({
      token,
      notification,
      data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])),
    });
    return { sent: true };
  } catch (error) {
    await writeOpsError('sendUserNotification', error, { uid, type: data.type || null });
    return { sent: false, reason: 'send-failed' };
  }
};

const normalizeSubscriptionRecord = (value) => {
  const record = value && typeof value === 'object' ? value : {};
  const plan = PREMIUM_PLANS.has(record.plan) ? record.plan : 'free';
  const expiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : null;
  const activatedAt = typeof record.activatedAt === 'string' ? record.activatedAt : null;
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
  const isActive = plan !== 'free' && Number.isFinite(expiresMs) && expiresMs > Date.now();

  return {
    plan: isActive ? plan : 'free',
    expiresAt: isActive ? expiresAt : null,
    activatedAt: isActive ? activatedAt : null,
    isActive,
  };
};

const removeUserOwnedRecords = async (db, collectionName, uid) => {
  const snapshot = await db.ref(collectionName).orderByChild('userId').equalTo(uid).once('value');
  if (!snapshot.exists()) {
    return 0;
  }

  const removals = [];
  snapshot.forEach((child) => {
    removals.push(child.ref.remove());
  });
  await Promise.all(removals);
  return removals.length;
};

const deleteStoragePrefix = async (bucket, prefix) => {
  const [files] = await bucket.getFiles({ prefix });
  if (!files.length) {
    return 0;
  }

  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  return files.length;
};

// Автоматичне видалення заявок старше 3 днів
const hashRateLimitKey = (value = '') =>
  crypto.createHash('sha256').update(String(value).toLowerCase()).digest('hex');

const assertAuthAttemptAllowed = async (email, ip) => {
  const key = hashRateLimitKey(`${email}:${ip || 'unknown'}`);
  const ref = admin.database().ref(`_security/auth_rate_limits/${key}`);
  const snapshot = await ref.once('value');
  const current = snapshot.val() || {};
  const now = Date.now();

  if (current.lockedUntil && current.lockedUntil > now) {
    throw new functionsV1.https.HttpsError('resource-exhausted', 'Too many sign-in attempts. Try again later.');
  }

  return { ref, current, now };
};

const recordAuthFailure = async (rateLimit) => {
  const attempts = Number(rateLimit.current.attempts || 0) + 1;
  const lockedUntil = attempts >= AUTH_RATE_LIMIT_MAX_ATTEMPTS
    ? rateLimit.now + AUTH_RATE_LIMIT_WINDOW_MS
    : 0;
  await rateLimit.ref.set({
    attempts,
    lockedUntil,
    updatedAt: rateLimit.now,
    expiresAt: rateLimit.now + AUTH_RATE_LIMIT_WINDOW_MS,
  });
};

const signInWithEmailRateLimitedHandler = functionsV1
  .runWith({ minInstances: 1 })
  .https.onCall(async (data, context) => {
  const email = normalizeNewsText(data?.email || '').toLowerCase();
  const password = String(data?.password || '');
  if (!email || !password || password.length > 256) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'Email and password are required');
  }

  const rateLimit = await assertAuthAttemptAllowed(email, context.rawRequest?.ip);
  const apiKey = process.env.FIREBASE_API_KEY || '';
  if (!apiKey) {
    throw new functionsV1.https.HttpsError('failed-precondition', 'Server sign-in API key is not configured');
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  if (!response.ok) {
    await recordAuthFailure(rateLimit);
    throw new functionsV1.https.HttpsError('unauthenticated', 'Invalid email or password');
  }

  const body = await response.json();
  await rateLimit.ref.remove();
  const customToken = await admin.auth().createCustomToken(body.localId);
  return { customToken };
  });

exports.signInWithEmailRateLimited = signInWithEmailRateLimitedHandler;
// Backward-compatible alias for legacy callable name typo used in some deploy/client flows.
exports.signalWithEmailRateLimited = signInWithEmailRateLimitedHandler;

exports.getMediaAccessUrl = functionsV1.https.onCall(async (data, context) => {
  try {
    if (!context.auth?.uid) {
      throw new functionsV1.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const collection = String(data?.collection || '').trim();
    const itemId = String(data?.itemId || '').trim();
    const storagePath = assertSafeMediaPath(data?.storagePath);
    if (!itemId) {
      throw new functionsV1.https.HttpsError('invalid-argument', 'itemId is required');
    }

    const snapshot = await getMediaRecordRef(collection, itemId).once('value');
    if (!snapshot.exists()) {
      throw new functionsV1.https.HttpsError('not-found', 'Media record not found');
    }

    const record = snapshot.val() || {};
    const recordPath = getRecordMediaPath(record);
    if (recordPath !== storagePath) {
      throw new functionsV1.https.HttpsError('permission-denied', 'Media path is not attached to this record');
    }

    const roleRecord = await getUserRoleRecord(context.auth.uid);
    const role = String(roleRecord.role || '');
    const ownerId = getRecordOwnerId(collection, itemId, record);
    const isOwner = ownerId === context.auth.uid;
    const isPublicApproved = getRecordModerationStatus(record) === 'approved';
    if (!isOwner && !isPublicApproved && !isModeratorRole(role) && !isPrimaryServiceOwnerContext(context)) {
      throw new functionsV1.https.HttpsError('permission-denied', 'Media is not available');
    }

    const expiresAt = Date.now() + MEDIA_ACCESS_TTL_MS;
    let url = '';
    try {
      ({ url } = await issueSignedUrlForPath(storagePath, expiresAt));
    } catch (signedUrlError) {
      await writeOpsError('getMediaAccessUrl.signedUrl', signedUrlError, {
        uid: context.auth?.uid || null,
        collection,
        itemId,
        storagePath,
      });
      ({ url } = await issueDownloadTokenUrlForPath(storagePath));
    }

    if (data?.inlineDataUrl === true) {
      const { file, bucketName } = await getExistingMediaFile(storagePath);
      const [metadata] = await file.getMetadata();
      const size = Number(metadata?.size || 0);
      if (size > MEDIA_DATA_URL_MAX_BYTES) {
        throw new functionsV1.https.HttpsError('resource-exhausted', 'Media file is too large for inline data URL fallback');
      }

      const [buffer] = await file.download();
      const contentType = sniffImageContentType(buffer, metadata?.contentType || '');
      return {
        url,
        expiresAt,
        dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
        contentType,
        size: buffer.length,
        bucketName,
      };
    }

    return { url, expiresAt };
  } catch (error) {
    if (error instanceof functionsV1.https.HttpsError) throw error;
    await writeOpsError('getMediaAccessUrl', error, {
      uid: context.auth?.uid || null,
      collection: data?.collection || null,
      itemId: data?.itemId || null,
    });
    throw new functionsV1.https.HttpsError('internal', 'Failed to issue media access URL');
  }
});

exports.getMediaDataUrl = functionsV1.https.onCall(async (data, context) => {
  try {
    if (!context.auth?.uid) {
      throw new functionsV1.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const collection = String(data?.collection || '').trim();
    const itemId = String(data?.itemId || '').trim();
    const storagePath = assertSafeMediaPath(data?.storagePath);
    if (!itemId) {
      throw new functionsV1.https.HttpsError('invalid-argument', 'itemId is required');
    }

    const snapshot = await getMediaRecordRef(collection, itemId).once('value');
    if (!snapshot.exists()) {
      throw new functionsV1.https.HttpsError('not-found', 'Media record not found');
    }

    const record = snapshot.val() || {};
    const recordPath = getRecordMediaPath(record);
    if (recordPath !== storagePath) {
      throw new functionsV1.https.HttpsError('permission-denied', 'Media path is not attached to this record');
    }

    const roleRecord = await getUserRoleRecord(context.auth.uid);
    const role = String(roleRecord.role || '');
    const ownerId = getRecordOwnerId(collection, itemId, record);
    const isOwner = ownerId === context.auth.uid;
    const isPublicApproved = getRecordModerationStatus(record) === 'approved';
    if (!isOwner && !isPublicApproved && !isModeratorRole(role) && !isPrimaryServiceOwnerContext(context)) {
      throw new functionsV1.https.HttpsError('permission-denied', 'Media is not available');
    }

    const { file, bucketName } = await getExistingMediaFile(storagePath);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata?.size || 0);
    if (size > MEDIA_DATA_URL_MAX_BYTES) {
      throw new functionsV1.https.HttpsError('resource-exhausted', 'Media file is too large for inline data URL fallback');
    }

    const [buffer] = await file.download();
    const contentType = sniffImageContentType(buffer, metadata?.contentType || '');
    return {
      dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
      contentType,
      size: buffer.length,
      bucketName,
    };
  } catch (error) {
    if (error instanceof functionsV1.https.HttpsError) throw error;
    await writeOpsError('getMediaDataUrl', error, {
      uid: context.auth?.uid || null,
      collection: data?.collection || null,
      itemId: data?.itemId || null,
    });
    throw new functionsV1.https.HttpsError('internal', 'Failed to read media data');
  }
});

exports.getMediaDataUrlHttp = functionsV1.https.onRequest(async (req, res) => {
  const allowedOrigins = new Set([
    'http://localhost:5173',
    'http://localhost:5174',
    'https://chaikaua-3cd9d.web.app',
    'https://chaikaua-3cd9d.firebaseapp.com',
  ]);
  const origin = String(req.headers.origin || '');
  if (allowedOrigins.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }

  try {
    const authHeader = String(req.headers.authorization || '');
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = await admin.auth().verifyIdToken(match[1]);
    const uid = token.uid;
    const data = req.body || {};
    const collection = String(data?.collection || '').trim();
    const itemId = String(data?.itemId || '').trim();
    const storagePath = assertSafeMediaPath(data?.storagePath);
    if (!itemId) {
      res.status(400).json({ error: 'itemId is required' });
      return;
    }

    const snapshot = await getMediaRecordRef(collection, itemId).once('value');
    if (!snapshot.exists()) {
      res.status(404).json({ error: 'Media record not found' });
      return;
    }

    const record = snapshot.val() || {};
    const recordPath = getRecordMediaPath(record);
    if (recordPath !== storagePath) {
      res.status(403).json({ error: 'Media path is not attached to this record' });
      return;
    }

    const roleRecord = await getUserRoleRecord(uid);
    const role = String(roleRecord.role || '');
    const ownerId = getRecordOwnerId(collection, itemId, record);
    const isOwner = ownerId === uid;
    const isPublicApproved = getRecordModerationStatus(record) === 'approved';
    const isPrimaryOwner = Boolean(
      token.email &&
      String(token.email).toLowerCase() === PRIMARY_SERVICE_EMAIL &&
      token.email_verified === true,
    );
    if (!isOwner && !isPublicApproved && !isModeratorRole(role) && !isPrimaryOwner) {
      res.status(403).json({ error: 'Media is not available' });
      return;
    }

    const { file, bucketName } = await getExistingMediaFile(storagePath);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata?.size || 0);
    if (size > MEDIA_DATA_URL_MAX_BYTES) {
      res.status(413).json({ error: 'Media file is too large for inline data URL fallback' });
      return;
    }

    const [buffer] = await file.download();
    const contentType = sniffImageContentType(buffer, metadata?.contentType || '');
    res.json({
      dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
      contentType,
      size: buffer.length,
      bucketName,
    });
  } catch (error) {
    await writeOpsError('getMediaDataUrlHttp', error, {
      uid: null,
      collection: req.body?.collection || null,
      itemId: req.body?.itemId || null,
    });
    res.status(500).json({ error: 'Failed to read media data' });
  }
});

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;
const EXPIRED_DELETE_AFTER_MS = 45 * DAY_MS;
const STUCK_PENDING_MS = 7 * DAY_MS;
const MAX_ACTIONS_PER_COLLECTION = 500;

const EXPIRING_COLLECTIONS = [
  { path: 'lost_found', statusField: 'moderationStatus', ttlMs: 15 * DAY_MS },
  { path: 'job_listings', statusField: 'moderationStatus', ttlMs: 2 * MONTH_MS },
  { path: 'buy_sell_listings', statusField: 'moderationStatus', ttlMs: 3 * MONTH_MS },
  { path: 'contacts_listings', statusField: 'moderationStatus', ttlMs: 30 * DAY_MS },
];

const ADMIN_MODERATION_SECTIONS = {
  requests: { path: 'requests', statusField: 'status', approvedValue: 'approved', rejectedValue: 'rejected' },
  appSuggestions: { path: 'app_suggestions', statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  communityPhotos: { path: 'community_photos', statusField: 'status', approvedValue: 'approved', rejectedValue: 'rejected' },
  datingProfiles: { path: 'dating_profiles', statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  datingAnketaListings: { path: 'dating_anketa_listings', statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  coffeeRequests: { path: 'coffee_requests', statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  buySell: { path: 'buy_sell_listings', statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  contactsListings: { path: 'contacts_listings', statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  localBusiness: { path: 'local_business', statusField: 'status', approvedValue: 'active', rejectedValue: 'rejected' },
  jobs: { path: 'job_listings', statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  lostFound: { path: 'lost_found', statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected' },
  osbbNews: { path: 'osbb_news', statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected', nested: true },
  osbbVotes: { path: 'osbb_votes', statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected', nested: true },
  osbbHouseTopics: { path: 'osbb_house_topics', statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected', nested: true },
  osbbCollections: { path: 'osbb_collections', statusField: 'moderationStatus', approvedValue: 'approved', rejectedValue: 'rejected', nested: true },
};

const ADMIN_MODERATION_RESTORE_TTL_MS = {
  lostFound: 15 * DAY_MS,
  jobs: 60 * DAY_MS,
  buySell: 90 * DAY_MS,
  contactsListings: 30 * DAY_MS,
  requests: 15 * DAY_MS,
};

const SAFE_RTDB_PATH_RE = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+){1,2}$/;

const assertAdminModerationAccess = async (context) => {
  if (!context.auth?.uid) {
    throw new functionsV1.https.HttpsError('unauthenticated', 'Authentication required');
  }
  if (isPrimaryServiceOwnerContext(context)) {
    return { uid: context.auth.uid, role: 'owner' };
  }
  const role = await getRoleForUid(context.auth.uid);
  if (role === 'admin' || role === 'moderator') {
    return { uid: context.auth.uid, role };
  }
  throw new functionsV1.https.HttpsError('permission-denied', 'Moderator access required');
};

const assertModerationTargetPath = (data, config) => {
  const rawPath = String(data?.path || '').trim();
  if (!SAFE_RTDB_PATH_RE.test(rawPath)) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'Invalid moderation path');
  }

  const parts = rawPath.split('/');
  if (parts[0] !== config.path || parts.length !== (config.nested ? 3 : 2)) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'Moderation path does not match section');
  }
  return rawPath;
};

exports.adminModerateContentItem = functionsV1.https.onCall(async (data, context) => {
  try {
    const actor = await assertAdminModerationAccess(context);
    const section = String(data?.section || '').trim();
    const action = String(data?.action || '').trim();
    const itemStatus = String(data?.currentStatus || '').trim();
    const config = ADMIN_MODERATION_SECTIONS[section];

    if (!config) {
      throw new functionsV1.https.HttpsError('invalid-argument', 'Unknown moderation section');
    }
    if (action !== 'approved' && action !== 'rejected' && action !== 'delete') {
      throw new functionsV1.https.HttpsError('invalid-argument', 'Unsupported moderation action');
    }

    const targetPath = assertModerationTargetPath(data, config);
    const db = admin.database();
    const targetRef = db.ref(targetPath);
    const snapshot = await targetRef.once('value');
    if (!snapshot.exists()) {
      throw new functionsV1.https.HttpsError('not-found', 'Moderation item not found');
    }

    const now = Date.now();
    if (action === 'delete') {
      await targetRef.remove();
    } else {
      const target = snapshot.val() || {};
      const nextStatusValue = action === 'approved' ? config.approvedValue : config.rejectedValue;
      const reason = sanitizeText(data?.reason || '', 200);

      if (action === 'rejected' && (reason.length < 10 || reason.length > 200)) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'Rejection reason must be 10-200 characters');
      }

      const patch = {
        [config.statusField]: nextStatusValue,
        moderatedAt: now,
        moderatedBy: actor.uid,
      };

      if (section === 'requests') {
        patch.isApproved = action === 'approved';
        patch.status_priority = getRequestStatusPriority(nextStatusValue, target.category);
      }

      if (action === 'rejected') {
        patch.moderationReason = reason;
        patch.rejectionReason = reason;
      } else {
        patch.moderationReason = null;
        patch.rejectionReason = null;
      }

      if (section === 'communityPhotos' && action === 'approved') {
        patch.safetyStatus = 'manual_reviewed';
        patch.safetyReviewedAt = now;
        patch.safetyReviewedBy = actor.uid;
        patch.safetyReason = 'moderator_reviewed_before_publication';
      }

      if (itemStatus === 'expired' && action === 'approved') {
        const ttl = ADMIN_MODERATION_RESTORE_TTL_MS[section];
        if (ttl) {
          patch.expiresAt = now + ttl;
          patch.archivedAt = null;
          patch.archiveReason = null;
        }
      }

      await targetRef.update(patch);
    }

    await writeOpsEvent('admin_moderation_action', {
      actorUid: actor.uid,
      actorRole: actor.role,
      section,
      action,
      path: targetPath,
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof functionsV1.https.HttpsError) throw error;
    console.error('[adminModerateContentItem] unexpected error:', error?.message || error, error?.stack);
    await writeOpsError('adminModerateContentItem', error, {
      uid: context.auth?.uid || null,
      section: data?.section || null,
      action: data?.action || null,
      path: data?.path || null,
    });
    throw new functionsV1.https.HttpsError('internal', 'Failed to apply moderation action');
  }
});

const parseRecordTimeMs = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getCreatedTimeMs = (record = {}) => (
  parseRecordTimeMs(record.createdAt) ||
  parseRecordTimeMs(record.timestamp) ||
  parseRecordTimeMs(record.submittedForModerationAt) ||
  null
);

const getRequestTtlMs = (record = {}) => {
  const category = String(record.category || '').toLowerCase();
  const group = String(record.group || '').toLowerCase();
  const subcategory = String(record.subcategory || '').toLowerCase();

  if (category === 'problem') return 30 * DAY_MS;
  if (group === 'help_neighbors' || category === 'medical' || category === 'care') return 10 * DAY_MS;
  if (subcategory === 'going_shopping' || subcategory === 'ride_share' || group === 'foodsharing' || group === 'transport') return 10 * DAY_MS;
  return 15 * DAY_MS;
};

const getRecordExpiresAtMs = (record = {}, fallbackTtlMs) => {
  const explicit = parseRecordTimeMs(record.expiresAt) || parseRecordTimeMs(record.expires_at);
  if (explicit) return explicit;
  const createdAt = getCreatedTimeMs(record);
  return createdAt ? createdAt + fallbackTtlMs : null;
};

const expireFlatCollection = async ({ db, path, statusField, ttlMs, now, updates }) => {
  const snapshot = await db.ref(path).once('value');
  const records = snapshot.val() || {};
  let scannedCount = 0;
  let expiredCount = 0;
  let deletedCount = 0;
  let stuckCount = 0;

  Object.entries(records).forEach(([id, record]) => {
    if (expiredCount + deletedCount + stuckCount >= MAX_ACTIONS_PER_COLLECTION) return;
    if (!record || typeof record !== 'object') return;
    scannedCount += 1;

    const currentStatus = String(record[statusField] || '').toLowerCase();
    const createdAt = getCreatedTimeMs(record);
    const expiresAt = getRecordExpiresAtMs(record, ttlMs(record));
    const archivedAt = parseRecordTimeMs(record.archivedAt) || parseRecordTimeMs(record.expiredAt);

    if ((currentStatus === 'processing' || currentStatus === 'pending') && createdAt && createdAt + STUCK_PENDING_MS < now) {
      updates[`${path}/${id}/${statusField}`] = 'expired';
      updates[`${path}/${id}/archivedAt`] = now;
      updates[`${path}/${id}/archiveReason`] = 'stuck_processing_or_pending';
      stuckCount += 1;
      return;
    }

    if (currentStatus === 'expired') {
      if (archivedAt && archivedAt + EXPIRED_DELETE_AFTER_MS < now) {
        updates[`${path}/${id}`] = null;
        deletedCount += 1;
      }
      return;
    }

    if (currentStatus === 'approved' && expiresAt && expiresAt < now) {
      updates[`${path}/${id}/${statusField}`] = 'expired';
      updates[`${path}/${id}/archivedAt`] = now;
      updates[`${path}/${id}/archiveReason`] = 'expired_by_schedule';
      expiredCount += 1;
    }
  });

  return { path, scannedCount, expiredCount, deletedCount, stuckCount };
};

const cleanupExpiredRecordsHandler = async () => {
  const db = admin.database();
  const now = Date.now();
  const updates = {};
  const summaries = [];

  try {
    summaries.push(await expireFlatCollection({
      db,
      path: 'requests',
      statusField: 'status',
      ttlMs: getRequestTtlMs,
      now,
      updates,
    }));

    for (const config of EXPIRING_COLLECTIONS) {
      summaries.push(await expireFlatCollection({
        db,
        ...config,
        ttlMs: () => config.ttlMs,
        now,
        updates,
      }));
    }

    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }

    await writeOpsEvent('cleanup_expired_records', {
      checkedAt: now,
      updateCount: Object.keys(updates).length,
      summaries,
    });
    return null;
  } catch (error) {
    console.error('Error cleaning up expired records:', error);
    await writeOpsError('cleanupExpiredRecords', error, { checkedAt: now });
    return null;
  }
};

// Legacy export name kept for existing schedules/deployments. It now archives first, then deletes old archive records.
exports.cleanupExpiredRequests = functionsV1.pubsub
  .schedule('every 24 hours')
  .timeZone('Europe/Kiev')
  .onRun(cleanupExpiredRecordsHandler);

// Відправка сповіщення модераторам про нову заявку
exports.notifyModeratorsOnNewRequest = functionsV1.database
  .ref('/requests/{requestId}')
  .onCreate(async (snapshot, context) => {
    const request = snapshot.val();
    const requestId = context.params.requestId;
    const moderationMeta = getRequestModerationMeta(request.category);

    console.log(`New request created: ${requestId}`);
    await writeOpsEvent('request_created', {
      requestId: String(requestId),
      category: String(request.category || 'other'),
    });

    // Отримати всіх модераторів
    const rolesSnapshot = await admin.database().ref('user_roles').once('value');
    const roles = rolesSnapshot.val();
    
    if (!roles) {
      console.log('No moderators found');
      return null;
    }

    const moderatorTokens = [];
    Object.entries(roles).forEach(([userId, userData]) => {
      if (userData.role === 'admin' || userData.role === 'moderator') {
        if (typeof userData.fcmToken === 'string' && userData.fcmToken.trim()) {
          moderatorTokens.push(userData.fcmToken);
        }
      }
    });

    const uniqueModeratorTokens = [...new Set(moderatorTokens.map((token) => token.trim()))];

    if (uniqueModeratorTokens.length === 0) {
      console.log('No moderator tokens found');
      return null;
    }

    // Відправити push-сповіщення
    const message = {
      notification: {
        title: '🆕 Нова заявка',
        body: `${request.name}: ${String(request.text || request.description || '').substring(0, 50)}...`,
      },
      data: {
        requestId: String(requestId),
        category: String(request.category || 'other'),
        type: 'new_request',
      },
      tokens: uniqueModeratorTokens,
    };

    try {
      const response = await admin.messaging().sendMulticast(message);
      await writeOpsEvent('notifications_sent', {
        requestId: String(requestId),
        successCount: response.successCount,
        failureCount: response.failureCount,
        tokenCount: uniqueModeratorTokens.length,
      });
      console.log(`Sent ${response.successCount} notifications to moderators`);
      return null;
    } catch (error) {
      console.error('Error sending notifications:', error);
      await writeOpsError('notifyModeratorsOnNewRequest', error, {
        requestId: String(requestId),
        tokenCount: uniqueModeratorTokens.length,
      });
      return null;
    }
  });

// Автоматична модерація (базова фільтрація)
exports.autoModerateRequest = functionsV1.database
  .ref('/requests/{requestId}')
  .onCreate(async (snapshot, context) => {
    const request = snapshot.val();
    const requestId = context.params.requestId;
    const moderationMeta = getRequestModerationMeta(request.category);

    // Список заборонених слів (приклад)
    const bannedWords = ['спам', 'реклама', 'продам', 'куплю дешево'];
    const text = (request.text || '').toLowerCase();

    let isCensored = false;
    for (const word of bannedWords) {
      if (text.includes(word)) {
        isCensored = true;
        break;
      }
    }

    if (isCensored) {
      console.log(`Request ${requestId} flagged as spam`);
      await writeOpsEvent('request_auto_rejected', {
        requestId: String(requestId),
        category: String(request.category || 'other'),
      });
      await snapshot.ref.update({
        isCensored: true,
        status: 'rejected',
        isApproved: false,
        moderatedAt: Date.now(),
        moderatedBy: 'auto-moderator',
        ...getRequestModerationMeta(request.category, 'rejected'),
      });
      return null;
    }

    await snapshot.ref.update({
      ...moderationMeta,
      status: 'pending',
      isApproved: false,
      submittedForModerationAt: request.submittedForModerationAt || new Date().toISOString(),
    });

    return null;
  });

const buildModerationNotification = (status, kind, reason = '') => {
  if (status === 'approved') {
    return {
      title: 'Chaika Life: матеріал схвалено',
      body: `${kind} опубліковано після модерації.`,
    };
  }
  if (status === 'rejected') {
    const cleanReason = sanitizeText(reason, 160);
    return {
      title: 'Chaika Life: матеріал відхилено',
      body: cleanReason
        ? `${kind} не пройшло модерацію. Причина: ${cleanReason}`
        : `${kind} не пройшло модерацію. Перевірте правила публікації.`,
    };
  }
  return null;
};

const notifyOwnerOnModerationChange = async (change, context, options) => {
  const before = change.before.val() || {};
  const after = change.after.val() || {};
  const statusField = options.statusField || 'moderationStatus';
  const beforeStatus = String(before[statusField] || '').toLowerCase();
  const afterStatus = String(after[statusField] || '').toLowerCase();
  if (beforeStatus === afterStatus || !['approved', 'rejected'].includes(afterStatus)) {
    return null;
  }

  const uid = String(after.userId || after.uid || after.createdBy || '');
  const notification = buildModerationNotification(afterStatus, options.kind, after.moderationReason || after.rejectionReason || '');
  if (!uid || !notification) return null;

  const result = await sendUserNotification(uid, notification, {
    type: 'moderation_result',
    status: afterStatus,
    collection: options.collection,
    itemId: String(context.params[options.paramName] || ''),
    reason: String(after.moderationReason || after.rejectionReason || ''),
  });

  await writeOpsEvent('moderation_result_notification', {
    uid,
    status: afterStatus,
    collection: options.collection,
    itemId: String(context.params[options.paramName] || ''),
    sent: result.sent === true,
    reason: result.reason || null,
  });
  return null;
};

const buildPublicCommunityPhoto = (photo) => {
  const status = String(photo.status || '').toLowerCase();
  const target = String(photo.target || 'gallery_public');
  const title = String(photo.title || '').trim();
  const imageUri = String(photo.imageUri || photo.downloadUrl || photo.storagePath || '').trim();
  const storagePath = String(photo.storagePath || '').trim();
  if (status !== 'approved' || target === 'my_photos' || (!imageUri && !storagePath)) return null;

  const publicPhoto = {
    title: title || 'Photo',
    description: String(photo.description || '').trim(),
    imageUri: imageUri || storagePath,
    uploadedBy: String(photo.uploadedBy || photo.userName || 'Anonymous').trim(),
    createdAt: Number(photo.createdAt || photo.uploadedAt || Date.now()),
    uploadedAt: Number(photo.uploadedAt || photo.createdAt || Date.now()),
    status: 'approved',
    target: 'gallery_public',
    likes: Number(photo.likes || 0),
  };

  if (storagePath) publicPhoto.storagePath = storagePath;
  if (typeof photo.userId === 'string' && photo.userId.trim()) publicPhoto.userId = photo.userId.trim();
  if (typeof photo.locationLabel === 'string' && photo.locationLabel.trim()) publicPhoto.locationLabel = photo.locationLabel.trim();
  if (photo.locationType === 'building' || photo.locationType === 'place') publicPhoto.locationType = photo.locationType;
  if (Number.isFinite(Number(photo.moderatedAt))) publicPhoto.moderatedAt = Number(photo.moderatedAt);

  return publicPhoto;
};

exports.syncPublicCommunityPhoto = functionsV1.database
  .ref('/community_photos/{photoId}')
  .onWrite(async (change, context) => {
    const publicRef = admin.database().ref(`/community_photos_public/${context.params.photoId}`);
    if (!change.after.exists()) {
      await publicRef.remove();
      return null;
    }

    const publicPhoto = buildPublicCommunityPhoto(change.after.val() || {});
    if (!publicPhoto) {
      await publicRef.remove();
      return null;
    }

    await publicRef.set(publicPhoto);
    return null;
  });

exports.notifyRequestOwnerOnModeration = functionsV1.database
  .ref('/requests/{requestId}')
  .onUpdate((change, context) => notifyOwnerOnModerationChange(change, context, {
    collection: 'requests',
    paramName: 'requestId',
    kind: 'Заявку',
    statusField: 'status',
  }));

exports.notifyPhotoOwnerOnModeration = functionsV1.database
  .ref('/community_photos/{photoId}')
  .onUpdate((change, context) => notifyOwnerOnModerationChange(change, context, {
    collection: 'community_photos',
    paramName: 'photoId',
    kind: 'Фото',
    statusField: 'status',
  }));

exports.notifyListingOwnerOnModeration = functionsV1.database
  .ref('/buy_sell_listings/{itemId}')
  .onUpdate((change, context) => notifyOwnerOnModerationChange(change, context, {
    collection: 'buy_sell_listings',
    paramName: 'itemId',
    kind: 'Оголошення',
  }));

exports.notifyLostFoundOwnerOnModeration = functionsV1.database
  .ref('/lost_found/{itemId}')
  .onUpdate((change, context) => notifyOwnerOnModerationChange(change, context, {
    collection: 'lost_found',
    paramName: 'itemId',
    kind: 'Заявку Lost&Found',
  }));

// Обработка голосового сообщения при загрузке в Storage
// Сохраняет метаданные аудио в RTDB под путём voice_messages/{encodedPath}
// Для транскрипции подключите Google Cloud Speech-to-Text API:
//   GOOGLE_CLOUD_STT_KEY нужно добавить в firebase functions config
exports.processVoiceMessage = functionsV1.storage
  .object()
  .onFinalize(async (object) => {
    const filePath = object.name || '';
    if (!filePath.startsWith('voice_messages/')) return null;

    const db = admin.database();
    const safeKey = filePath.replace(/[.#$[\]/]/g, '_');

    try {
      await db.ref(`voice_messages/${safeKey}`).set({
        storagePath: filePath,
        contentType: object.contentType || 'audio/m4a',
        size: object.size ? Number(object.size) : 0,
        uploadedAt: Date.now(),
        status: 'uploaded',
        transcript: null,
      });

      await writeOpsEvent('voice_message_uploaded', { filePath });
      console.log(`Voice message metadata saved: ${filePath}`);
      return null;
    } catch (error) {
      console.error('Error processing voice message:', error);
      await writeOpsError('processVoiceMessage', error, { filePath });
      return null;
    }
  });

exports.stripImageMetadataOnUpload = functionsV1.storage
  .object()
  .onFinalize(async (object) => {
    const filePath = String(object.name || '');
    const contentType = String(object.contentType || '').toLowerCase();
    const metadata = object.metadata || {};

    if (!PUBLIC_IMAGE_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
      return null;
    }

    if (!contentType.startsWith('image/')) {
      return null;
    }

    if (metadata.exifStripped === 'true') {
      return null;
    }

    const bucket = admin.storage().bucket(object.bucket);
    const file = bucket.file(filePath);
    const sharp = require('sharp');

    try {
      const [buffer] = await file.download();
      const sanitizedBuffer = await sharp(buffer)
        .rotate()
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();

      await file.save(sanitizedBuffer, {
        resumable: false,
        contentType: 'image/jpeg',
        metadata: {
          metadata: {
            ...metadata,
            exifStripped: 'true',
            originalContentType: contentType,
          },
        },
      });

      await writeOpsEvent('image_metadata_stripped', {
        filePath,
        sourceContentType: contentType,
      });

      return null;
    } catch (error) {
      console.error('Error stripping image metadata:', error);
      await writeOpsError('stripImageMetadataOnUpload', error, { filePath, contentType });
      return null;
    }
  });

// Статистика заявок
exports.updateRequestStats = functionsV1.database
  .ref('/requests/{requestId}')
  .onWrite(async (change, context) => {
    const db = admin.database();
    const statsRef = db.ref('stats/requests');

    try {
      const snapshot = await db.ref('requests').once('value');
      const requests = snapshot.val();

      if (!requests) {
        await statsRef.set({
          total: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
          lastUpdated: Date.now(),
        });
        return null;
      }

      const stats = {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        byCategory: {},
      };

      Object.values(requests).forEach((request) => {
        stats.total++;
        stats[request.status] = (stats[request.status] || 0) + 1;
        stats.byCategory[request.category] = (stats.byCategory[request.category] || 0) + 1;
      });

      stats.lastUpdated = Date.now();
      await statsRef.set(stats);
      await writeOpsEvent('request_stats_updated', {
        total: stats.total,
        pending: stats.pending,
        approved: stats.approved,
        rejected: stats.rejected,
      });
      
      console.log('Request stats updated:', stats);
      return null;
    } catch (error) {
      console.error('Error updating stats:', error);
      await writeOpsError('updateRequestStats', error);
      return null;
    }
  });

// Публикація новин Чайки в Telegram-групу/канал
exports.publishChaykaNewsToTelegram = functionsV1.database
  .ref('/chayka_news/publications/{publicationId}')
  .onCreate(async (snapshot, context) => {
    const publicationId = context.params.publicationId;
    const item = snapshot.val() || {};

    try {
      const telegramStatus = String(item.telegramStatus || '').toLowerCase();
      const alreadySent = item.telegramStatus === 'sent' || item.sentToTelegram === true;
      if (alreadySent) {
        return null;
      }

      if (telegramStatus === 'sent' || telegramStatus === 'sending') {
        return null;
      }

      await snapshot.ref.update({
        telegramStatus: 'sending',
        telegramSendingAt: Date.now(),
      });

      const text = formatChaykaTelegramPost(item);
      const result = await sendTelegramMessage(text);

      await snapshot.ref.update({
        telegramStatus: 'sent',
        sentToTelegram: true,
        telegramSentAt: Date.now(),
        telegramMessageId: result?.result?.message_id || null,
      });

      await writeOpsEvent('chayka_news_sent_to_telegram', {
        publicationId: String(publicationId),
        telegramMessageId: result?.result?.message_id || null,
      });

      return null;
    } catch (error) {
      console.error('Error publishing Chayka news to Telegram:', error);
      await snapshot.ref.update({
        telegramStatus: 'error',
        telegramError: String(error?.message || error || 'Unknown error'),
        telegramErrorAt: Date.now(),
      });

      await writeOpsError('publishChaykaNewsToTelegram', error, {
        publicationId: String(publicationId),
      });

      return null;
    }
  });

exports.addOsbbVote = functionsV1.https.onCall(async (data, context) => {
  const buildingId = String(data?.buildingId || '').trim();
  const title = normalizeNewsText(data?.title || '');
  const question = normalizeNewsText(data?.question || title);
  const totalApartments = Number(data?.totalApartments || 0);
  const { uid } = await assertOsbbManagerAccess(context, buildingId);

  if (!title || !question) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'title and question are required');
  }

  const now = Date.now();
  const votePayload = {
    title: title.slice(0, 120),
    question: question.slice(0, 240),
    status: 'active',
    options: [
      { id: 'yes', labelKey: 'yes', votes: 0 },
      { id: 'no', labelKey: 'no', votes: 0 },
    ],
    deadline: new Date(now + 7 * 86_400_000).toISOString(),
    totalApartments: Number.isFinite(totalApartments) && totalApartments > 0 ? totalApartments : 0,
    voterIds: {},
    createdAt: new Date(now).toISOString(),
    createdBy: uid,
    moderationStatus: 'pending',
    submittedForModerationAt: new Date(now).toISOString(),
  };

  try {
    const newRef = await admin.database().ref(`${OSBB_VOTE_PATH}/${buildingId}`).push(votePayload);
    await writeOpsEvent('osbb_vote_created', {
      buildingId,
      voteId: String(newRef.key || ''),
      createdBy: uid,
    });
    return { id: newRef.key || null };
  } catch (error) {
    await writeOpsError('addOsbbVote', error, { buildingId, createdBy: uid });
    throw new functionsV1.https.HttpsError('internal', 'Failed to create OSBB vote');
  }
});

exports.castOsbbVote = functionsV1.https.onCall(async (data, context) => {
  const buildingId = String(data?.buildingId || '').trim();
  const voteId = String(data?.voteId || '').trim();
  const optionId = normalizeOsbbVoteOptionId(data?.optionId);

  if (!context.auth?.uid) {
    throw new functionsV1.https.HttpsError('unauthenticated', 'Authentication required');
  }

  if (!buildingId || !voteId) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'buildingId and voteId are required');
  }

  await assertOsbbResidentAccess(context, buildingId);

  const voteRef = admin.database().ref(`${OSBB_VOTE_PATH}/${buildingId}/${voteId}`);
  let blockReason = null;

  try {
    const result = await voteRef.transaction((current) => {
      if (!current) {
        blockReason = 'vote-not-found';
        return current;
      }

      if (current.moderationStatus !== 'approved') {
        blockReason = 'vote-not-approved';
        return current;
      }

      const closedPatch = buildClosedVotePatch(current);
      if (closedPatch) {
        blockReason = 'vote-closed';
        return {
          ...current,
          ...closedPatch,
        };
      }

      if (normalizeOsbbVoteStatus(current.status, current.deadline) === 'closed') {
        blockReason = 'vote-closed';
        return current;
      }

      const currentVoterIds = current.voterIds || {};
      if (currentVoterIds[context.auth.uid]) {
        blockReason = 'already-voted';
        return current;
      }

      const options = normalizeOsbbVoteOptions(current.options);
      if (!options.some((option) => option.id === optionId)) {
        blockReason = 'invalid-option';
        return current;
      }

      return {
        ...current,
        options: options.map((option) => (
          option.id === optionId
            ? { ...option, votes: (typeof option.votes === 'number' ? option.votes : 0) + 1 }
            : option
        )),
        voterIds: {
          ...currentVoterIds,
          [context.auth.uid]: optionId,
        },
      };
    });

    if (blockReason) {
      throw new functionsV1.https.HttpsError('failed-precondition', blockReason);
    }

    if (!result.committed) {
      throw new functionsV1.https.HttpsError('aborted', 'vote-not-committed');
    }

    await writeOpsEvent('osbb_vote_cast', {
      buildingId,
      voteId,
      optionId,
      votedBy: context.auth.uid,
    });

    return { ok: true };
  } catch (error) {
    if (error instanceof functionsV1.https.HttpsError) {
      throw error;
    }
    await writeOpsError('castOsbbVote', error, {
      buildingId,
      voteId,
      votedBy: context.auth?.uid || null,
    });
    throw new functionsV1.https.HttpsError('internal', 'Failed to cast OSBB vote');
  }
});

exports.closeExpiredOsbbVotes = functionsV1.pubsub
  .schedule('every 15 minutes')
  .timeZone('Europe/Kiev')
  .onRun(async () => {
    const db = admin.database();
    const now = Date.now();

    try {
      const snapshot = await db.ref(OSBB_VOTE_PATH).once('value');
      const raw = snapshot.val() || {};
      const updates = {};
      let closedCount = 0;

      Object.entries(raw).forEach(([buildingId, votesById]) => {
        Object.entries(votesById || {}).forEach(([voteId, vote]) => {
          const patch = buildClosedVotePatch(vote);
          if (patch) {
            updates[`${OSBB_VOTE_PATH}/${buildingId}/${voteId}/status`] = patch.status;
            updates[`${OSBB_VOTE_PATH}/${buildingId}/${voteId}/closedAt`] = patch.closedAt;
            closedCount += 1;
          }
        });
      });

      if (closedCount > 0) {
        await db.ref().update(updates);
      }

      await writeOpsEvent('osbb_votes_closed_by_schedule', {
        checkedAt: now,
        closedCount,
      });

      return null;
    } catch (error) {
      await writeOpsError('closeExpiredOsbbVotes', error, { checkedAt: now });
      return null;
    }
  });

exports.getUserSubscription = functionsV1.https.onCall(async (_data, context) => {
  try {
    if (!context.auth?.uid) {
      throw new functionsV1.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const snapshot = await admin.database().ref(`user_subscription/${context.auth.uid}`).once('value');
    const normalized = normalizeSubscriptionRecord(snapshot.val());

    if (!normalized.isActive && snapshot.exists()) {
      await snapshot.ref.set({
        plan: 'free',
        expiresAt: null,
        activatedAt: null,
        updatedAt: new Date().toISOString(),
      });
    }

    return normalized;
  } catch (error) {
    await writeOpsError('getUserSubscription', error, {
      uid: context.auth?.uid || null,
    });
    throw error;
  }
});

exports.activatePromoPremium = functionsV1.https.onCall(async (data, context) => {
  try {
    if (!context.auth?.uid) {
      throw new functionsV1.https.HttpsError('unauthenticated', 'Authentication required');
    }

    const plan = PREMIUM_PLANS.has(data?.plan) ? data.plan : null;
    if (!plan) {
      throw new functionsV1.https.HttpsError('invalid-argument', 'Unsupported premium plan');
    }

    const db = admin.database();
    const subscriptionRef = db.ref(`user_subscription/${context.auth.uid}`);
    const existingSnapshot = await subscriptionRef.once('value');
    const existing = normalizeSubscriptionRecord(existingSnapshot.val());
    if (existing.isActive) {
      const nowIso = existing.activatedAt || new Date().toISOString();
      const expiresAt = existing.expiresAt || new Date(Date.now() + PREMIUM_DURATION_MS).toISOString();
      await subscriptionRef.update({
        plan,
        activatedAt: nowIso,
        expiresAt,
        updatedAt: new Date().toISOString(),
        source: 'promo',
      });

      return {
        ok: true,
        plan,
        activatedAt: nowIso,
        expiresAt,
        isActive: true,
      };
    }

    const counterRef = db.ref('stats/free_premium_counter');
    const counterResult = await counterRef.transaction((current) => {
      const numericCurrent = typeof current === 'number' ? current : 0;
      if (numericCurrent >= FREE_PREMIUM_LIMIT) {
        return;
      }
      return numericCurrent + 1;
    });

    const nextValue = typeof counterResult.snapshot.val() === 'number'
      ? counterResult.snapshot.val()
      : FREE_PREMIUM_LIMIT;

    if (!counterResult.committed || nextValue > FREE_PREMIUM_LIMIT) {
      throw new functionsV1.https.HttpsError('resource-exhausted', 'Free promo limit reached');
    }

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + PREMIUM_DURATION_MS).toISOString();
    await subscriptionRef.set({
      plan,
      activatedAt: nowIso,
      expiresAt,
      updatedAt: nowIso,
      source: 'promo',
    });

    return {
      ok: true,
      plan,
      activatedAt: nowIso,
      expiresAt,
      isActive: true,
    };
  } catch (error) {
    await writeOpsError('activatePromoPremium', error, {
      uid: context.auth?.uid || null,
      plan: data?.plan || null,
    });
    throw error;
  }
});

exports.cancelUserSubscription = functionsV1.https.onCall(async (_data, context) => {
  try {
    if (!context.auth?.uid) {
      throw new functionsV1.https.HttpsError('unauthenticated', 'Authentication required');
    }

    await admin.database().ref(`user_subscription/${context.auth.uid}`).set({
      plan: 'free',
      activatedAt: null,
      expiresAt: null,
      updatedAt: new Date().toISOString(),
      source: 'client_cancel',
    });

    return {
      plan: 'free',
      activatedAt: null,
      expiresAt: null,
      isActive: false,
    };
  } catch (error) {
    await writeOpsError('cancelUserSubscription', error, {
      uid: context.auth?.uid || null,
    });
    throw error;
  }
});

exports.enableEmergencyDebugUnlock = functionsV1.https.onCall(async (data, context) => {
  const actor = await assertEmergencyDebugActor(context);
  const reason = normalizeNewsText(data?.reason || '').slice(0, 300);
  if (!reason) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'reason is required');
  }

  const requestedTtlMs = Number(data?.ttlMs || Number(data?.ttlMinutes || 0) * 60 * 1000 || EMERGENCY_DEFAULT_TTL_MS);
  const ttlMs = Number.isFinite(requestedTtlMs)
    ? Math.min(Math.max(requestedTtlMs, 5 * 60 * 1000), EMERGENCY_MAX_TTL_MS)
    : EMERGENCY_DEFAULT_TTL_MS;

  if (requestedTtlMs > EMERGENCY_MAX_TTL_MS) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'ttl exceeds maximum emergency debug duration');
  }

  const now = Date.now();
  const expiresAt = now + ttlMs;
  const payload = {
    enabled: true,
    mode: 'owner_debug_unlock',
    reason,
    enabledByUid: actor.uid,
    enabledByEmail: actor.email,
    enabledAt: now,
    expiresAt,
    allowAnonymousRead: false,
    bypassDeviceAuthorization: true,
    bypassForceUpdate: true,
    bypassMaintenance: true,
    bypassInviteAccess: true,
    bypassUserAccess: true,
    bypassDiagnosticsRestrictions: true,
  };

  await admin.database().ref(EMERGENCY_ACCESS_PATH).set(payload);
  await setCustomClaimMerged(actor.uid, 'emergencyDebug', true);
  await setCustomClaimMerged(actor.uid, 'emergencyDebugExpiresAt', expiresAt);
  await writeEmergencyAdminActionLog({
    action: 'enable_emergency_debug_unlock',
    actorUid: actor.uid,
    actorEmail: actor.email,
    at: now,
    expiresAt,
    reason,
  });
  await writeOpsEvent('enable_emergency_debug_unlock', {
    actorUid: actor.uid,
    actorEmail: actor.email,
    expiresAt,
  });

  return { ok: true, current: payload };
});

exports.disableEmergencyDebugUnlock = functionsV1.https.onCall(async (data, context) => {
  const actor = await assertEmergencyDebugActor(context);
  const now = Date.now();
  const reason = normalizeNewsText(data?.reason || 'Protection restored').slice(0, 300);
  const currentRef = admin.database().ref(EMERGENCY_ACCESS_PATH);
  const currentSnapshot = await currentRef.once('value');
  const current = currentSnapshot.val() || {};
  const enabledByUid = String(current.enabledByUid || '').trim();

  await currentRef.update({
    enabled: false,
    disabledByUid: actor.uid,
    disabledByEmail: actor.email,
    disabledAt: now,
    disabledReason: reason,
  });

  const claimUids = Array.from(new Set([actor.uid, enabledByUid].filter(Boolean)));
  await Promise.all(claimUids.flatMap((uid) => [
    setCustomClaimMerged(uid, 'emergencyDebug', false),
    setCustomClaimMerged(uid, 'emergencyDebugExpiresAt', false),
  ]));
  await writeEmergencyAdminActionLog({
    action: 'disable_emergency_debug_unlock',
    actorUid: actor.uid,
    actorEmail: actor.email,
    at: now,
    reason,
  });
  await writeOpsEvent('disable_emergency_debug_unlock', {
    actorUid: actor.uid,
    actorEmail: actor.email,
  });

  return {
    ok: true,
    current: {
      ...current,
      enabled: false,
      disabledByUid: actor.uid,
      disabledByEmail: actor.email,
      disabledAt: now,
      disabledReason: reason,
    },
  };
});

exports.deleteCommunityUserFully = functionsV1.https.onCall(async (data, context) => {
  if (!context.auth || !(isPrimaryServiceOwnerContext(context) || await isAdminRoleContext(context))) {
    throw new functionsV1.https.HttpsError('permission-denied', 'Primary service owner or admin access required');
  }

  const uid = String(data?.uid || '').trim();
  if (!uid) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'User uid is required');
  }

  const db = admin.database();
  const bucket = admin.storage().bucket();
  const deletedAt = new Date().toISOString();
  const normalizedReason = redactText(String(data?.reason || 'Deleted in service moderation')).slice(0, 300);
  const sanitizedName = redactText(String(data?.name || 'User')).slice(0, 80);
  const sanitizedEmail = data?.email ? redactText(String(data.email)).slice(0, 120) : null;
  const sanitizedPhone = data?.phone ? redactText(String(data.phone)).slice(0, 30) : null;

  try {
    await Promise.all([
      db.ref(`service_moderation/deleted_users/${uid}`).set({
        uid,
        name: sanitizedName,
        email: sanitizedEmail,
        phone: sanitizedPhone,
        deletedAt,
        deletedBy: context.auth.uid,
      }),
      db.ref(`service_moderation/blocked_users/${uid}`).set({
        uid,
        name: sanitizedName,
        email: sanitizedEmail,
        phone: sanitizedPhone,
        reason: normalizedReason,
        blockedAt: deletedAt,
        blockedBy: context.auth.uid,
      }),
    ]);

    const directRemovals = USER_KEYED_PATHS.map((pathName) => db.ref(`${pathName}/${uid}`).remove());
    const collectionResults = await Promise.all(
      USER_CONTENT_COLLECTIONS.map(async (collectionName) => ({
        collectionName,
        deleted: await removeUserOwnedRecords(db, collectionName, uid),
      })),
    );
    await Promise.all(directRemovals);

    const storageResults = await Promise.all(
      STORAGE_USER_PREFIXES.map(async (prefix) => ({
        prefix,
        deleted: await deleteStoragePrefix(bucket, `${prefix}/${uid}/`),
      })),
    );

    try {
      await admin.auth().deleteUser(uid);
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    await writeOpsEvent('service_user_full_delete', {
      targetUid: uid,
      deletedBy: context.auth.uid,
      collections: collectionResults,
      storage: storageResults,
    });

    return {
      ok: true,
      uid,
      deletedCollections: collectionResults,
      deletedStorage: storageResults,
    };
  } catch (error) {
    await writeOpsError('deleteCommunityUserFully', error, {
      targetUid: uid,
      deletedBy: context.auth.uid,
    });
    throw new functionsV1.https.HttpsError('internal', 'Failed to delete user fully');
  }
});

// When an admin assigns a role in user_roles/{uid}, sync moderator custom claim
// so Storage rules can check request.auth.token.moderator == true
exports.onRoleChanged = functionsV1.database
  .ref('user_roles/{userId}')
  .onWrite(async (change, context) => {
    const uid = context.params.userId;
    const newValue = change.after.val();
    const role = newValue?.role ?? null;
    const isMod = role === 'admin' || role === 'moderator';
    try {
      await setCustomClaimMerged(uid, 'moderator', isMod);
    } catch (error) {
      console.error('[onRoleChanged] setCustomUserClaims failed', uid, error?.message);
    }
  });

exports.sendChaykaTelegramTest = functionsV1.https.onRequest(async (req, res) => {
  try {
    const configuredSecret = process.env.TELEGRAM_TEST_SECRET || '';
    const providedSecret = req.get('x-telegram-test-secret') || req.query.secret || '';
    if (!configuredSecret || providedSecret !== configuredSecret) {
      res.status(403).json({ ok: false, error: 'Forbidden' });
      return;
    }

    const title = req.query.title || 'Тест новостей Чайки';
    const shortText = req.query.text || 'Это пробная отправка в группу Chaika_ua_APP.';
    const sourceName = req.query.source || 'ChaikaUA';
    const sourceUrl = req.query.url || 'https://dah-online.com/';
    const text = formatChaykaTelegramPost({ title, shortText, sourceName, sourceUrl });
    const result = await sendTelegramMessage(text);

    res.status(200).json({ ok: true, telegram: result?.ok ?? true });
  } catch (error) {
    await writeOpsError('sendChaykaTelegramTest', error);
    res.status(500).json({ ok: false, error: String(error?.message || error || 'Unknown error') });
  }
});

// ─── Critical Error Alert ───────────────────────────────────────────────────
// Fires when any new entry is written to diagnostics/runtime.
// Sends a Telegram alert if severity === 'critical' or source === 'error_boundary'.
// Rate-limited: one alert per fingerprint per 15 minutes (stored in RTDB).
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const ALERT_COOLDOWN_PATH = 'diagnostics/alert_cooldown';

exports.alertCriticalRuntimeError = functionsV1.database
  .ref('diagnostics/runtime/{entryId}')
  .onCreate(async (snap) => {
    try {
      const data = snap.val();
      if (!data || typeof data !== 'object') return null;

      const severity = data.severity || '';
      const source = data.source || '';
      const isCritical = severity === 'critical' || source === 'error_boundary' || source === 'global_handler';
      if (!isCritical) return null;

      // Build a dedup fingerprint
      const screen = redactText(String(data.screen || 'unknown')).slice(0, 80);
      const shortType = redactText(String(data.shortType || data.rawMessage || 'error')).slice(0, 80);
      const fingerprint = `${screen}|${shortType}`;
      const fingerprintKey = fingerprint.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);

      // Check cooldown
      const cooldownRef = admin.database().ref(`${ALERT_COOLDOWN_PATH}/${fingerprintKey}`);
      const cooldownSnap = await cooldownRef.once('value');
      const lastAlertAt = cooldownSnap.val() || 0;
      if (Date.now() - lastAlertAt < ALERT_COOLDOWN_MS) {
        return null; // Same error alerted recently — skip
      }
      await cooldownRef.set(Date.now());

      // Compose Telegram message
      const appVersion = String(data.appVersion || '-');
      const sessionId = String(data.sessionId || '-');
      const uid = String(data.uid || '-');
      const network = String(data.networkState || '-');
      const device = String(data.deviceInfo || '-');
      const rawMsg = redactText(String(data.rawMessage || '')).slice(0, 300);
      const humanMsg = redactText(String(data.humanMessage || '')).slice(0, 200);
      const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });

      const text = [
        `🚨 *CRITICAL ERROR — ChaikaUA*`,
        ``,
        `📌 *${shortType}*`,
        `🖥 Экран: \`${screen}\``,
        `💬 ${humanMsg || rawMsg}`,
        ``,
        `📱 v${appVersion} · ${device} · ${network}`,
        `👤 uid: \`${uid}\``,
        `🔗 session: \`${sessionId}\``,
        `🕐 ${time}`,
        rawMsg ? `\`\`\`\n${rawMsg}\n\`\`\`` : '',
      ].filter(Boolean).join('\n');

      await sendTelegramMessage(text, { parse_mode: 'Markdown' });
      return null;
    } catch (err) {
      // Alert failures must never break the app
      console.error('[alertCriticalRuntimeError]', err?.message || err);
      return null;
    }
  });

// Sync user_roles/{uid}/role changes to Firebase Auth custom claims
// This allows storage.rules to check request.auth.token.admin === true
exports.syncRoleToAuthCustomClaim = functionsV1.database
  .ref('/user_roles/{userId}/role')
  .onWrite(async (change, context) => {
    const { userId } = context.params;
    const newRole = change.after.val();

  try {
    if (newRole === 'admin') {
      await setCustomClaimMerged(userId, 'admin', true);
      console.log(`[syncRoleToAuthCustomClaim] Set admin:true for ${userId}`);
    } else {
      await setCustomClaimMerged(userId, 'admin', false);
      console.log(`[syncRoleToAuthCustomClaim] Set admin:false for ${userId}`);
    }
    } catch (err) {
      console.error(`[syncRoleToAuthCustomClaim] Error for ${userId}:`, err.message);
    }
  });

// Callable function to set a user's role (admin/moderator/user)
// Only the primary owner (vikramsave@ukr.net) or existing admin can call this
exports.setUserRole = functionsV1.https.onCall(async (data, context) => {
  if (!context.auth || !(isPrimaryServiceOwnerContext(context) || await isAdminRoleContext(context))) {
    throw new functionsV1.https.HttpsError('permission-denied', 'Primary service owner or admin access required');
  }

  const targetUid = String(data?.uid || '').trim();
  const newRole = String(data?.role || '').trim().toLowerCase();

  if (!targetUid) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'target uid is required');
  }
  if (!['admin', 'moderator', 'user', null, ''].includes(newRole)) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'Role must be admin, moderator, or user');
  }

  try {
    const db = admin.database();
    const effectiveRole = newRole || null;

    if (effectiveRole) {
      await db.ref(`user_roles/${targetUid}/role`).set(effectiveRole);
    } else {
      await db.ref(`user_roles/${targetUid}/role`).remove();
    }

    // Sync auth custom claim (handles admin role for storage rules)
    if (effectiveRole === 'admin') {
      await setCustomClaimMerged(targetUid, 'admin', true);
    } else {
      await setCustomClaimMerged(targetUid, 'admin', false);
    }

    await writeOpsEvent('set_user_role', {
      targetUid,
      newRole: effectiveRole,
      setBy: context.auth.uid,
    });

    return { success: true, uid: targetUid, role: effectiveRole };
  } catch (err) {
    console.error('[setUserRole] Error:', err.message);
    throw new functionsV1.https.HttpsError('internal', 'Failed to set user role');
  }
});

// ============================================================
// SHADOW-MODE — ШАГ 1.2
// Логирует попытки записи в user_roles/{uid}/role из клиента.
// Admin SDK обходит правила, поэтому CF-записи сюда не попадают.
// ============================================================
const SHADOW_DENY_PATH = 'ops/shadow_deny';
const SHADOW_DENY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

// Триггер: любая запись в user_roles/{uid}/role
// (до enforcement .write:false в rules — ловит «клиентские» попытки)
exports.shadowLogUserRoleWrite = functionsV1.database
  .ref('/user_roles/{uid}/role')
  .onWrite(async (change, context) => {
    // Запись через Admin SDK (CF setUserRole) не имеет context.auth — пропускаем
    if (!context.auth) return null;

    const uid = context.auth.uid;
    const targetUid = context.params.uid;
    const prevVal = change.before.val();
    const newVal = change.after.val();
    const key = `${Date.now()}_${uid}`;

    try {
      await admin.database().ref(`${SHADOW_DENY_PATH}/${key}`).set({
        uid,
        targetUid,
        path: `user_roles/${targetUid}/role`,
        operation: 'write',
        prevValue: prevVal,
        newValue: newVal,
        timestamp: Date.now(),
        appVersion: context.params.appVersion || 'unknown',
      });
    } catch (err) {
      console.error('[shadowLogUserRoleWrite] Failed to log:', err.message);
    }
    return null;
  });

// Плановая очистка shadow_deny старше 7 дней (запускается каждые 24ч)
exports.cleanupShadowDenyLogs = functionsV1.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const db = admin.database();
    const cutoff = Date.now() - SHADOW_DENY_TTL_MS;

    try {
      const snapshot = await db.ref(SHADOW_DENY_PATH)
        .orderByChild('timestamp')
        .endAt(cutoff)
        .once('value');

      if (!snapshot.exists()) return null;

      const updates = {};
      snapshot.forEach((child) => {
        updates[child.key] = null; // удалить
      });

      await db.ref(SHADOW_DENY_PATH).update(updates);
      console.log(`[cleanupShadowDenyLogs] Removed ${Object.keys(updates).length} entries older than 7 days`);
    } catch (err) {
      console.error('[cleanupShadowDenyLogs] Error:', err.message);
    }
    return null;
  });

// ============================================================
// createRequest — ШАГ 1.5
// Rate-limit 60с между созданием заявок одним пользователем.
// Возвращает HttpsError('resource-exhausted') с оставшимся временем.
// ============================================================
const REQUEST_RATE_LIMIT_MS = 60 * 1000;

exports.createRequest = functionsV1.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functionsV1.https.HttpsError('unauthenticated', 'Требуется авторизация');
  }

  const uid = context.auth.uid;
  const db = admin.database();

  // Проверяем timestamp последней заявки пользователя
  const lastRequestSnap = await db.ref('requests')
    .orderByChild('userId')
    .equalTo(uid)
    .limitToLast(1)
    .once('value');

  if (lastRequestSnap.exists()) {
    let lastAt = 0;
    lastRequestSnap.forEach((child) => {
      const createdAt = child.val()?.createdAt;
      if (typeof createdAt === 'number' && createdAt > lastAt) {
        lastAt = createdAt;
      }
    });
    const elapsed = Date.now() - lastAt;
    if (elapsed < REQUEST_RATE_LIMIT_MS) {
      const remaining = Math.ceil((REQUEST_RATE_LIMIT_MS - elapsed) / 1000);
      throw new functionsV1.https.HttpsError(
        'resource-exhausted',
        `Подождите ${remaining} сек. перед созданием следующей заявки`,
      );
    }
  }

  // Валидация полей
  const category = String(data?.category || '').trim();
  const description = String(data?.description || '').trim();
  if (!category) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'Поле category обязательно');
  }
  if (!description) {
    throw new functionsV1.https.HttpsError('invalid-argument', 'Поле description обязательно');
  }

  const newRequestRef = db.ref('requests').push();
  const requestData = {
    ...sanitizePayload(data),
    userId: uid,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...getRequestModerationMeta(category),
  };

  await newRequestRef.set(requestData);

  await writeOpsEvent('create_request', { uid, requestId: newRequestRef.key, category });

  return { success: true, requestId: newRequestRef.key };
});

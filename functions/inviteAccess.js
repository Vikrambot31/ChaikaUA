const crypto = require('crypto');
const functionsV1 = require('firebase-functions/v1');

const PHONE_RE = /^\+380\d{9}$/;
const FEATURE_FLAG_PATH = 'feature_flags/invite_access/current';
const FEATURE_CONFIG_PATH = 'feature_flags/invite_access/config';
const TRUSTED_SPONSORS_PATH = 'trusted_sponsors';
const TRUST_TREE_PATH = 'trust_tree';
const TRUST_TREE_PHONE_INDEX_PATH = 'trust_tree_index/by_phone';
const INVITE_REQUESTS_PATH = 'invite_requests';
const INVITE_ATTEMPTS_PATH = 'invite_attempts';
const INVITE_LOGS_PATH = 'invite_logs';
const INVITE_RUNTIME_LOCKS_PATH = 'invite_runtime_locks';
const SPONSOR_CONFIRMATIONS_PATH = 'sponsor_confirmations';
const IN_APP_NOTIFICATIONS_PATH = 'in_app_notifications';
const USER_ACCESS_PATH = 'user_access';
const USER_BONUSES_PATH = 'user_bonuses';
const USERS_PATH = 'users';
const GENERIC_SUBMIT_RESPONSE = { ok: true, status: 'received' };
const OWNER_UID = 'LfqIMCAyEzLAb7TNc83lYGW9RiV2';
const OWNER_PHONE = '+380509000127';
const SUBMIT_LOCK_TTL_MS = 60 * 1000;
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;
const TEMPORARY_ACCESS_MIN_HOURS = 1;
const TEMPORARY_ACCESS_MAX_HOURS = 168;

const ACCESS_STATUSES = new Set([
  'guest',
  'not_started',
  'pending',
  'pending_sponsor',
  'approved',
  'denied',
  'blocked',
  'needs_manual_review',
  'temporary_access',
  'whitelist_access',
]);

const ACTIVE_REQUEST_STATUSES = new Set([
  'pending',
  'pending_sponsor',
  'needs_manual_review',
]);

const USER_ACCESS_NUMBER_FIELDS = new Set([
  'guest_expires_at',
  'temp_expires_at',
  'denied_count',
  'manual_grant_at',
  'last_request_at',
  'last_denied_at',
  'updatedAt',
  'version',
]);

const USER_ACCESS_STRING_FIELDS = new Set([
  'current_request_id',
  'manual_grant_reason',
  'manual_grant_by',
]);

const DEFAULT_INVITE_CONFIG = {
  enabled: false,
  mode: 'disabled',
  mandatory_sections_enabled: false,
  auto_approve_enabled: false,
  max_auto_depth: 2,
  max_invites_per_sponsor: {
    depth_0: 999,
    depth_1: 10,
    depth_2: 3,
    depth_3_plus: 0,
  },
  risk_score_enabled: true,
  risk_thresholds: {
    low: 25,
    medium: 50,
    high: 75,
    blocked: 76,
  },
  sponsor_confirmation_required: false,
  sponsor_confirmation_timeout_hours: 48,
  cascade_block_policy: 'review',
  cooldown_after_denied_hours: 24,
  max_denied_before_block: 5,
  max_sponsors_per_30_days: 3,
  guest_access_enabled: false,
  guest_access_hours: 0,
  guest_write_restricted: true,
  fallback_mode: 'open',
  whitelist_uids: [],
};

const RATE_LIMITS = [
  { bucket: 'uid', limit: 3, windowMs: 24 * 60 * 60 * 1000, lockMs: 60 * 60 * 1000 },
  { bucket: 'phone', limit: 3, windowMs: 24 * 60 * 60 * 1000, lockMs: 60 * 60 * 1000 },
  { bucket: 'sponsor', limit: 10, windowMs: 24 * 60 * 60 * 1000, lockMs: 30 * 60 * 1000 },
  { bucket: 'ip', limit: 20, windowMs: 60 * 60 * 1000, lockMs: 30 * 60 * 1000 },
];

const sanitizeText = (value = '', maxLength = 280) =>
  String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);

const normalizePhone = (value) => {
  const raw = sanitizeText(value, 32).replace(/[\s().-]/g, '');
  if (/^0\d{9}$/.test(raw)) return `+38${raw}`;
  if (/^380\d{9}$/.test(raw)) return `+${raw}`;
  return raw;
};

const normalizePhoneDigits = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return `38${digits}`;
  if (digits.length === 11 && digits.startsWith('80')) return `3${digits}`;
  if (digits.length === 12 && digits.startsWith('380')) return digits;
  return digits;
};

const assertPhone = (functions, value, fieldName) => {
  const phone = normalizePhone(value);
  if (!PHONE_RE.test(phone)) {
    const code = fieldName === 'sponsorPhone' ? 'INVALID_SPONSOR_PHONE' : 'INVALID_REQUESTER_PHONE';
    throw new functionsV1.https.HttpsError('invalid-argument', code, {
      code,
      field: fieldName,
    });
  }
  return phone;
};

const toCanonicalPhone = (value) => {
  const digits = normalizePhoneDigits(value);
  return digits.length === 12 && digits.startsWith('380') ? `+${digits}` : '';
};

const controlledError = (functions, firebaseCode, code, details = {}) =>
  new functionsV1.https.HttpsError(firebaseCode, code, {
    code,
    ...details,
  });

const maskPhone = (phone) => `${phone.slice(0, 4)}***${phone.slice(-3)}`;

const assertSafePathKey = (functions, value, fieldName) => {
  const key = sanitizeText(value, 128);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(key)) {
    throw new functionsV1.https.HttpsError('invalid-argument', `${fieldName} is invalid`);
  }
  return key;
};

const assertPhoneHash = (functions, value, fieldName) => {
  const key = sanitizeText(value, 128);
  if (!/^[a-f0-9]{64}$/.test(key)) {
    throw new functionsV1.https.HttpsError('invalid-argument', `${fieldName} is invalid`);
  }
  return key;
};

const getHashSecret = (functions) => {
  const config = functions.config?.() || {};
  const secret = process.env.INVITE_ACCESS_HASH_SECRET ||
    config.invite_access?.hash_secret ||
    config.invite?.hash_secret;
  return typeof secret === 'string' ? secret.trim() : '';
};

const assertHashSecret = (functions) => {
  const secret = getHashSecret(functions);
  if (!secret) {
    throw new functionsV1.https.HttpsError('failed-precondition', 'Invite access is not configured');
  }
  return secret;
};

const hashValue = (secret, value) =>
  crypto.createHmac('sha256', secret).update(String(value).toLowerCase()).digest('hex');

const getClientIp = (context) =>
  String(
    context?.rawRequest?.headers?.['x-forwarded-for'] ||
    context?.rawRequest?.ip ||
    'unknown',
  ).split(',')[0].trim() || 'unknown';

const isInviteEnabled = async (db) => {
  const snapshot = await db.ref(FEATURE_FLAG_PATH).once('value');
  return snapshot.child('enabled').val() === true;
};

const normalizeInviteMode = (value, enabled) => {
  if (value === 'soft' || value === 'medium') return value;
  return enabled ? 'medium' : 'disabled';
};

const modeDefaults = (mode) => {
  if (mode === 'medium') {
    return {
      enabled: true,
      mandatory_sections_enabled: true,
      auto_approve_enabled: true,
      sponsor_confirmation_required: false,
      cascade_block_policy: 'review',
      cooldown_after_denied_hours: 24,
      max_invites_per_sponsor: { depth_0: 999, depth_1: 10, depth_2: 3, depth_3_plus: 0 },
    };
  }
  if (mode === 'soft') {
    return {
      enabled: true,
      mandatory_sections_enabled: false,
      auto_approve_enabled: true,
      sponsor_confirmation_required: false,
      cascade_block_policy: 'none',
      cooldown_after_denied_hours: 12,
      max_invites_per_sponsor: { depth_0: 999, depth_1: 15, depth_2: 5, depth_3_plus: 2 },
    };
  }
  return {
    enabled: false,
    mandatory_sections_enabled: false,
    auto_approve_enabled: false,
    sponsor_confirmation_required: false,
    cascade_block_policy: 'none',
  };
};

const getInviteConfig = async (db) => {
  const snapshot = await db.ref(FEATURE_FLAG_PATH).once('value');
  const raw = snapshot.val() && typeof snapshot.val() === 'object' ? snapshot.val() : {};
  const enabled = raw.enabled === true;
  const mode = normalizeInviteMode(raw.mode, enabled);
  const defaults = modeDefaults(mode);
  return {
    ...DEFAULT_INVITE_CONFIG,
    ...defaults,
    ...raw,
    enabled: raw.enabled === undefined ? defaults.enabled : enabled,
    mode,
    max_invites_per_sponsor: {
      ...DEFAULT_INVITE_CONFIG.max_invites_per_sponsor,
      ...(defaults.max_invites_per_sponsor || {}),
      ...(raw.max_invites_per_sponsor || {}),
    },
    risk_thresholds: {
      ...DEFAULT_INVITE_CONFIG.risk_thresholds,
      ...(raw.risk_thresholds || {}),
    },
    whitelist_uids: Array.isArray(raw.whitelist_uids) ? raw.whitelist_uids : [],
  };
};

const toPublicInviteConfig = (config) => ({
  mode: config.mode,
  enabled: config.enabled === true,
  mandatory_sections_enabled: config.mandatory_sections_enabled === true,
  soft_banner_enabled: config.mode === 'soft',
  guest_access_enabled: config.guest_access_enabled === true,
  guest_access_hours: Number(config.guest_access_hours || 0),
  fallback_mode: config.fallback_mode || 'open',
  updatedAt: Number(config.updatedAt || Date.now()),
});

const writePublicInviteConfig = async (db, config) => {
  await db.ref(FEATURE_CONFIG_PATH).set(toPublicInviteConfig(config));
};

const compactDefined = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));

const monthKey = (timestamp) => new Date(timestamp).toISOString().slice(0, 7);

const writeInviteLog = async (db, action, payload = {}) => {
  const now = Date.now();
  await db.ref(`${INVITE_LOGS_PATH}/${monthKey(now)}`).push({
    action,
    actorType: payload.actorType || 'system',
    createdAt: now,
    ...payload,
  });
};

const writeInAppNotification = async (db, uid, payload = {}) => {
  if (!uid) return;
  await db.ref(`${IN_APP_NOTIFICATIONS_PATH}/${uid}`).push({
    status: 'unread',
    createdAt: Date.now(),
    ...payload,
  });
};

const sendOptionalPush = async (admin, db, uid, notification, data = {}) => {
  if (!uid || typeof admin.messaging !== 'function') return { sent: false, reason: 'missing-uid' };
  const tokenSnapshot = await db.ref(`user_roles/${uid}/fcmToken`).once('value');
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
    return { sent: false, reason: String(error?.message || 'send-failed') };
  }
};

const getUserPhone = async (db, uid) => {
  const snapshot = await db.ref(`${USERS_PATH}/${uid}/phone`).once('value');
  const phone = normalizePhone(snapshot.val());
  return PHONE_RE.test(phone) ? phone : '';
};

const readUserAccess = async (db, uid) => {
  const snapshot = await db.ref(`${USER_ACCESS_PATH}/${uid}`).once('value');
  const value = snapshot.val() && typeof snapshot.val() === 'object' ? snapshot.val() : {};
  const status = ACCESS_STATUSES.has(value.status) ? value.status : 'not_started';
  const access = { status };

  USER_ACCESS_NUMBER_FIELDS.forEach((field) => {
    if (typeof value[field] === 'number' && Number.isFinite(value[field])) {
      access[field] = value[field];
    }
  });

  USER_ACCESS_STRING_FIELDS.forEach((field) => {
    if (typeof value[field] === 'string') {
      access[field] = sanitizeText(value[field], field === 'manual_grant_reason' ? 280 : 128);
    }
  });

  return access;
};

const publicUserAccess = (userAccess) => ({
  status: userAccess.status,
  guest_expires_at: Number(userAccess.guest_expires_at || 0),
  temp_expires_at: Number(userAccess.temp_expires_at || 0),
  denied_count: Number(userAccess.denied_count || 0),
  current_request_id: String(userAccess.current_request_id || ''),
  manual_grant_reason: String(userAccess.manual_grant_reason || ''),
  manual_grant_by: String(userAccess.manual_grant_by || ''),
  manual_grant_at: Number(userAccess.manual_grant_at || 0),
  last_request_at: Number(userAccess.last_request_at || 0),
  last_denied_at: Number(userAccess.last_denied_at || 0),
  updatedAt: Number(userAccess.updatedAt || 0),
});

const createGuestAccessIfMissing = async (db, uid, config, now) => {
  if (!uid || config.mode === 'disabled') return { created: false, reason: 'disabled' };

  const guestExpiresAt = 0;
  const accessRef = db.ref(`${USER_ACCESS_PATH}/${uid}`);
  const result = await accessRef.transaction((current) => {
    if (current && typeof current === 'object' && current.status) return current;
    return {
      status: 'guest',
      guest_expires_at: guestExpiresAt,
      updatedAt: now,
      version: 1,
    };
  });

  const value = result.snapshot.val() || {};
  return {
    created: result.committed && value.status === 'guest' && Number(value.guest_expires_at || 0) === guestExpiresAt,
    status: String(value.status || ''),
    guest_expires_at: Number(value.guest_expires_at || 0),
  };
};

const isBypassUid = async (db, uid, config, helpers) => {
  if (!uid) return false;
  if (uid === OWNER_UID) return true;
  if (Array.isArray(config.whitelist_uids) && config.whitelist_uids.includes(uid)) return true;
  const role = await helpers.getRoleForUid(uid);
  return role === 'admin' || role === 'moderator';
};

const getInviteLimitForDepth = (config, depth) => {
  const limits = config.max_invites_per_sponsor || {};
  if (depth <= 0) return Number(limits.depth_0 ?? 999);
  if (depth === 1) return Number(limits.depth_1 ?? 10);
  if (depth === 2) return Number(limits.depth_2 ?? 3);
  return Number(limits.depth_3_plus ?? limits.depth_3 ?? 0);
};

const riskLevelFromScore = (score, thresholds = DEFAULT_INVITE_CONFIG.risk_thresholds) => {
  const blocked = Number(thresholds.blocked ?? 76);
  const high = Number(thresholds.high ?? 75);
  const medium = Number(thresholds.medium ?? 50);
  const low = Number(thresholds.low ?? 25);
  if (score >= blocked) return 'blocked';
  if (score > medium && score <= high) return 'high';
  if (score > low) return 'medium';
  return 'low';
};

const findSponsorNode = async (db, sponsorPhoneHash) => {
  const uidSnapshot = await db.ref(`${TRUST_TREE_PHONE_INDEX_PATH}/${sponsorPhoneHash}`).once('value');
  const sponsorUid = String(uidSnapshot.val() || '');
  if (sponsorUid) {
    const nodeSnapshot = await db.ref(`${TRUST_TREE_PATH}/${sponsorUid}`).once('value');
    const node = nodeSnapshot.val() && typeof nodeSnapshot.val() === 'object' ? nodeSnapshot.val() : null;
    if (node) return { uid: sponsorUid, node, source: 'trust_tree' };
  }

  const legacySnapshot = await db.ref(`${TRUSTED_SPONSORS_PATH}/${sponsorPhoneHash}`).once('value');
  const legacy = legacySnapshot.val() && typeof legacySnapshot.val() === 'object' ? legacySnapshot.val() : null;
  if (legacy) return { uid: '', node: legacy, source: 'trusted_sponsors' };
  return null;
};

const calculateRisk = ({ sponsor, userAccess, config }) => {
  let score = 0;
  if (!sponsor) score += 30;
  const sponsorStatus = sponsor?.node?.status || '';
  if (sponsorStatus === 'blocked' || sponsorStatus === 'disabled') score += 50;
  if (sponsorStatus === 'revoked') score += 40;

  const sponsorDepth = Number(sponsor?.node?.depthToRoot ?? 0);
  const inviteCount = Number(sponsor?.node?.inviteCount ?? sponsor?.node?.approvedInviteCount ?? 0);
  const inviteLimit = Number(sponsor?.node?.inviteLimit ?? getInviteLimitForDepth(config, sponsorDepth));
  if (inviteLimit > 0 && inviteCount >= inviteLimit) score += 25;
  else if (inviteLimit > 0 && inviteCount / inviteLimit >= 0.8) score += 10;
  if (sponsor && sponsor.source === 'trust_tree' && sponsorDepth + 1 > Number(config.max_auto_depth || 2)) score += 15;

  const deniedCount = Number(userAccess.denied_count || 0);
  if (deniedCount > 2) score += 40;
  else if (deniedCount > 0) score += 20;

  const lastDeniedAt = Number(userAccess.last_denied_at || 0);
  if (lastDeniedAt && Date.now() - lastDeniedAt < 24 * 60 * 60 * 1000) score += 30;

  const riskScore = Math.min(100, score);
  return { riskScore, riskLevel: riskLevelFromScore(riskScore, config.risk_thresholds) };
};

const canAutoApprove = ({ config, sponsor, riskLevel }) => {
  if (config.auto_approve_enabled !== true) return false;
  if (!sponsor || sponsor.source !== 'trust_tree') return false;
  if (riskLevel !== 'low') return false;
  const node = sponsor.node || {};
  if (node.status !== 'active') return false;
  const depth = Number(node.depthToRoot || 0);
  const inviteCount = Number(node.inviteCount || 0);
  const inviteLimit = Number(node.inviteLimit ?? getInviteLimitForDepth(config, depth));
  return depth + 1 <= Number(config.max_auto_depth || 2) && inviteCount < inviteLimit;
};

const buildTrustNode = ({ uid, phoneHash, phoneMasked, sponsor, request, actorUid, approvalSource, config, riskScore, riskLevel, now }) => {
  const sponsorNode = sponsor?.node || {};
  const sponsorDepth = sponsor?.source === 'trust_tree' ? Number(sponsorNode.depthToRoot || 0) : -1;
  const depthToRoot = sponsorDepth + 1;
  const sponsorRootPath = Array.isArray(sponsorNode.rootPath) ? sponsorNode.rootPath : [];
  const rootPath = sponsor?.uid ? [...sponsorRootPath, sponsor.uid] : [];
  return {
    userUid: uid,
    phoneHash,
    phoneMasked,
    sponsorUid: sponsor?.uid || null,
    sponsorPhoneHash: request.sponsorPhoneHash || null,
    sponsorName: request.sponsorName || request.comment || '',
    approvedBy: actorUid || 'auto_system',
    approvedAt: now,
    approvalSource,
    depthToRoot: Math.max(0, depthToRoot),
    rootPath,
    riskScore,
    riskLevel,
    inviteCount: 0,
    inviteLimit: getInviteLimitForDepth(config, Math.max(0, depthToRoot)),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
};

// ── Bonus system constants ──────────────────────────────────────────────
const BONUS_INVITE_POINTS = 50;
const BONUS_INVITE_CAP = 5000;
const BONUS_LIKE_POINTS = 5;
const BONUS_LIKE_CAP = 1000;
const BONUS_HELP_POINTS = 20;
const BONUS_HELP_CAP = 2000;
const BONUS_TOTAL_CAP = BONUS_INVITE_CAP + BONUS_LIKE_CAP + BONUS_HELP_CAP;

const BONUS_BADGES = [
  { min: 5000, badge: 'ambassador' },
  { min: 2000, badge: 'guardian' },
  { min: 500,  badge: 'active_resident' },
  { min: 100,  badge: 'good_neighbor' },
];

const resolveBadge = (total) => {
  for (const tier of BONUS_BADGES) {
    if (total >= tier.min) return tier.badge;
  }
  return 'newcomer';
};

const awardInviteBonus = async (db, sponsorUid, invitedUid, invitedName, now) => {
  if (!sponsorUid || !invitedUid) return;
  const bonusRef = db.ref(`${USER_BONUSES_PATH}/${sponsorUid}`);
  await bonusRef.transaction((current) => {
    const data = current && typeof current === 'object' ? current : {};
    const invites = data.invites && typeof data.invites === 'object' ? data.invites : { count: 0, points: 0 };
    const currentInvitePoints = Number(invites.points || 0);
    if (currentInvitePoints >= BONUS_INVITE_CAP) return current;
    const history = Array.isArray(data.inviteHistory) ? data.inviteHistory : [];
    if (history.some((entry) => entry && entry.uid === invitedUid)) return current;
    const newInvitePoints = Math.min(currentInvitePoints + BONUS_INVITE_POINTS, BONUS_INVITE_CAP);
    const newInviteCount = Number(invites.count || 0) + 1;
    const likes = data.likes && typeof data.likes === 'object' ? data.likes : { count: 0, points: 0 };
    const help = data.help && typeof data.help === 'object' ? data.help : { count: 0, points: 0 };
    const newTotal = newInvitePoints + Number(likes.points || 0) + Number(help.points || 0);
    const newHistory = [...history, { uid: invitedUid, name: String(invitedName || '').slice(0, 60), points: BONUS_INVITE_POINTS, at: now }];
    return {
      total: Math.min(newTotal, BONUS_TOTAL_CAP),
      invites: { count: newInviteCount, points: newInvitePoints },
      likes: likes,
      help: help,
      badge: resolveBadge(newTotal),
      inviteHistory: newHistory.slice(-100),
      updatedAt: now,
    };
  });
};

const normalizeUserPhone = (value = {}) =>
  toCanonicalPhone(value.phone || value.phoneNumber || value.mobile || '');

const findUsersByCanonicalPhones = async (db, canonicalPhones) => {
  const targets = new Set(canonicalPhones);
  const snapshot = await db.ref(USERS_PATH).once('value');
  const matches = new Map();
  snapshot.forEach((child) => {
    const value = child.val() && typeof child.val() === 'object' ? child.val() : {};
    const phone = normalizeUserPhone(value);
    if (targets.has(phone) && !matches.has(phone)) {
      matches.set(phone, {
        uid: child.key,
        phone,
      });
    }
  });
  return matches;
};

const buildManualRootNode = ({ uid, phone, phoneHash, ownerPhoneHash, actorUid, existingNode, config, now }) => ({
  userUid: uid,
  phoneHash,
  phoneMasked: maskPhone(phone),
  sponsorUid: OWNER_UID,
  sponsorPhoneHash: ownerPhoneHash,
  sponsorName: 'root',
  approvedBy: actorUid,
  approvedAt: now,
  approvalSource: 'manual_admin',
  depthToRoot: 1,
  rootPath: [OWNER_UID],
  riskScore: 0,
  riskLevel: 'low',
  inviteCount: Number(existingNode?.inviteCount || 0),
  inviteLimit: getInviteLimitForDepth(config, 1),
  status: 'active',
  createdAt: Number(existingNode?.createdAt || now),
  updatedAt: now,
});

const buildSponsorConfirmation = (requestId, requestData, config, now) => {
  const timeoutHours = Math.max(1, Number(config.sponsor_confirmation_timeout_hours || DEFAULT_INVITE_CONFIG.sponsor_confirmation_timeout_hours));
  const expiresAt = now + timeoutHours * 60 * 60 * 1000;
  return {
    requesterUid: requestData.requesterUid,
    sponsorUid: requestData.sponsorUid,
    requestId,
    status: 'pending',
    createdAt: now,
    expiresAt,
  };
};

const sendSponsorConfirmationNotification = async (admin, db, requestId, requestData, confirmation) => {
  await writeInAppNotification(db, requestData.sponsorUid, {
    type: 'sponsor_confirmation_request',
    title: 'Підтвердіть знайомство',
    body: 'Користувач вказав вас як поручителя. Підтвердіть, якщо ви знаєте цю людину.',
    requestId,
    confirmationId: requestId,
    requesterUid: requestData.requesterUid,
    expiresAt: confirmation.expiresAt,
  });
  await sendOptionalPush(admin, db, requestData.sponsorUid, {
    title: 'Chaika Life: підтвердіть знайомство',
    body: 'Користувач вказав вас як поручителя. Відкрийте застосунок, щоб відповісти.',
  }, {
    type: 'sponsor_confirmation_request',
    requestId,
    confirmationId: requestId,
  });
};

const assertAuthenticated = (functions, context) => {
  if (!context.auth?.uid) {
    throw new functionsV1.https.HttpsError('unauthenticated', 'Authentication required');
  }
};

const assertAdminAccess = async (functions, context, helpers) => {
  assertAuthenticated(functions, context);
  if (helpers.isPrimaryServiceOwnerContext(context) || await helpers.isAdminRoleContext(context)) {
    return { uid: context.auth.uid, role: 'admin' };
  }
  throw new functionsV1.https.HttpsError('permission-denied', 'Admin access required');
};

const assertModeratorAccess = async (functions, context, helpers) => {
  assertAuthenticated(functions, context);
  if (helpers.isPrimaryServiceOwnerContext(context)) {
    return { uid: context.auth.uid, role: 'owner' };
  }
  const role = await helpers.getRoleForUid(context.auth.uid);
  if (role === 'admin' || role === 'moderator') {
    return { uid: context.auth.uid, role };
  }
  throw new functionsV1.https.HttpsError('permission-denied', 'Moderator access required');
};

const recordRateLimitAttempt = async (db, bucket, key, config, now) => {
  const attemptRef = db.ref(`${INVITE_ATTEMPTS_PATH}/${bucket}/${key}/current`);
  const result = await attemptRef.transaction((current) => {
    const record = current && typeof current === 'object' ? current : {};
    const windowStartAt = Number(record.windowStartAt || 0);
    const lockedUntil = Number(record.lockedUntil || 0);
    const count = Number(record.count || 0);

    if (lockedUntil > now) {
      return {
        ...record,
        lastRejectedAt: now,
        lastRejectReason: 'locked',
        updatedAt: now,
      };
    }

    if (!windowStartAt || now - windowStartAt > config.windowMs) {
      return {
        count: 1,
        limit: config.limit,
        windowMs: config.windowMs,
        windowStartAt: now,
        lastAt: now,
        lockedUntil: 0,
        updatedAt: now,
      };
    }

    if (count >= config.limit) {
      return {
        ...record,
        limit: config.limit,
        windowMs: config.windowMs,
        lockedUntil: now + config.lockMs,
        lastRejectedAt: now,
        lastRejectReason: 'limit',
        updatedAt: now,
      };
    }

    return {
      ...record,
      count: count + 1,
      limit: config.limit,
      windowMs: config.windowMs,
      lastAt: now,
      updatedAt: now,
    };
  });

  const value = result.snapshot.val() || {};
  return {
    bucket,
    allowed: value.lastRejectedAt !== now,
    count: Number(value.count || 0),
    limit: config.limit,
    lockedUntil: Number(value.lockedUntil || 0),
    reason: value.lastRejectedAt === now ? String(value.lastRejectReason || 'limit') : null,
  };
};

const recordInviteRateLimits = async (db, keys, now) => {
  const byBucket = {
    uid: keys.uid,
    phone: keys.requesterPhoneHash,
    sponsor: keys.sponsorPhoneHash,
    ip: keys.ipHash,
  };

  const results = [];
  for (const config of RATE_LIMITS) {
    results.push(await recordRateLimitAttempt(db, config.bucket, byBucket[config.bucket], config, now));
  }
  return results;
};

const acquireSubmitLock = async (db, uid, requestId, now) => {
  const lockRef = db.ref(`${INVITE_RUNTIME_LOCKS_PATH}/${uid}`);
  const result = await lockRef.transaction((current) => {
    const lock = current && typeof current === 'object' ? current : null;
    const expiresAt = Number(lock?.expiresAt || 0);
    if (lock && expiresAt > now) return lock;
    return {
      requestId,
      createdAt: now,
      expiresAt: now + SUBMIT_LOCK_TTL_MS,
    };
  });

  const lock = result.snapshot.val() || {};
  return {
    acquired: result.committed && lock.requestId === requestId,
    lock,
  };
};

const releaseSubmitLock = async (db, uid, requestId) => {
  const lockRef = db.ref(`${INVITE_RUNTIME_LOCKS_PATH}/${uid}`);
  await lockRef.transaction((current) => {
    if (!current || typeof current !== 'object') return current;
    return current.requestId === requestId ? null : current;
  });
};

const findLatestRequestForUid = async (db, uid) => {
  const snapshot = await db.ref(INVITE_REQUESTS_PATH).orderByChild('requesterUid').equalTo(uid).once('value');
  const items = [];
  snapshot.forEach((child) => {
    const value = child.val() || {};
    items.push({
      id: child.key,
      value,
      createdAt: Number(value.createdAt || 0),
    });
  });
  items.sort((left, right) => right.createdAt - left.createdAt);
  return items[0] || null;
};

const findActiveRequestForUid = async (db, uid) => {
  const snapshot = await db.ref(INVITE_REQUESTS_PATH).orderByChild('requesterUid').equalTo(uid).once('value');
  const items = [];
  snapshot.forEach((child) => {
    const value = child.val() || {};
    if (ACTIVE_REQUEST_STATUSES.has(String(value.status || ''))) {
      items.push({
        id: child.key,
        value,
        createdAt: Number(value.createdAt || 0),
      });
    }
  });
  items.sort((left, right) => right.createdAt - left.createdAt);
  return items[0] || null;
};

const handleUnexpectedError = async (functions, helpers, functionName, error, payload = {}) => {
  if (error instanceof functionsV1.https.HttpsError) {
    throw error;
  }
  await helpers.writeOpsError(functionName, error, payload);
  throw new functionsV1.https.HttpsError('internal', 'Invite access operation failed');
};

const createInviteAccessFunctions = (deps) => {
  const {
    functions,
    admin,
    writeOpsEvent,
    writeOpsError,
    isPrimaryServiceOwnerContext,
    isAdminRoleContext,
    getRoleForUid,
  } = deps;

  const helpers = {
    writeOpsEvent,
    writeOpsError,
    isPrimaryServiceOwnerContext,
    isAdminRoleContext,
    getRoleForUid,
  };

  const initializeGuestAccessOnUserCreate = functionsV1.auth.user().onCreate(async (user) => {
    const uid = user.uid;
    try {
      const db = admin.database();
      const config = await getInviteConfig(db);
      const now = Date.now();
      const result = await createGuestAccessIfMissing(db, uid, config, now);

      await writeOpsEvent('guest_access_init_checked', {
        uid,
        created: result.created,
        status: result.status || null,
        mode: config.mode,
        guest_expires_at: result.guest_expires_at || null,
      });
      return null;
    } catch (error) {
      await writeOpsError('initializeGuestAccessOnUserCreate', error, { uid });
      return null;
    }
  });

  const processExpiredGuestAccess = functionsV1.pubsub.schedule('every 60 minutes').onRun(async () => {
    const db = admin.database();
    const now = Date.now();
    try {
      const snapshot = await db.ref(USER_ACCESS_PATH).orderByChild('status').equalTo('guest').once('value');
      const updates = {};
      const expired = [];

      snapshot.forEach((child) => {
        const value = child.val() || {};
        const expiresAt = Number(value.guest_expires_at || 0);
        if (expiresAt > 0 && expiresAt < now) {
          const uid = child.key;
          updates[`${USER_ACCESS_PATH}/${uid}/status`] = 'not_started';
          updates[`${USER_ACCESS_PATH}/${uid}/guest_expires_at`] = null;
          updates[`${USER_ACCESS_PATH}/${uid}/updatedAt`] = now;
          updates[`${USER_ACCESS_PATH}/${uid}/version`] = Number(value.version || 0) + 1;
          expired.push(uid);
        }
      });

      if (expired.length === 0) {
        await writeOpsEvent('expired_guest_access_processed', { expiredCount: 0 });
        return null;
      }

      await db.ref().update(updates);

      await Promise.all(expired.map((uid) => writeInviteLog(db, 'onboarding_guest_expired', {
        requesterUid: uid,
        actorType: 'system',
        reason: 'guest_expired',
      })));

      await writeOpsEvent('expired_guest_access_processed', {
        expiredCount: expired.length,
      });
      return null;
    } catch (error) {
      await writeOpsError('processExpiredGuestAccess', error, { at: now });
      return null;
    }
  });

  const grantTemporaryAccess = functionsV1.https.onCall(async (data, context) => {
    try {
      const actor = await assertAdminAccess(functions, context, helpers);
      const uid = assertSafePathKey(functions, data?.uid, 'uid');
      const durationHours = Number(data?.durationHours);
      const reason = sanitizeText(data?.reason || '', 200);

      if (!Number.isFinite(durationHours) || durationHours < TEMPORARY_ACCESS_MIN_HOURS || durationHours > TEMPORARY_ACCESS_MAX_HOURS) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'durationHours must be between 1 and 168');
      }
      if (!reason) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'reason is required');
      }

      const db = admin.database();
      const now = Date.now();
      const tempExpiresAt = now + durationHours * 60 * 60 * 1000;
      const accessRef = db.ref(`${USER_ACCESS_PATH}/${uid}`);
      const accessSnapshot = await accessRef.once('value');
      const current = accessSnapshot.val() && typeof accessSnapshot.val() === 'object' ? accessSnapshot.val() : {};
      const currentRequestId = sanitizeText(current.current_request_id || data?.requestId || '', 128);

      const updates = {
        [`${USER_ACCESS_PATH}/${uid}/status`]: 'temporary_access',
        [`${USER_ACCESS_PATH}/${uid}/temp_expires_at`]: tempExpiresAt,
        [`${USER_ACCESS_PATH}/${uid}/manual_grant_reason`]: reason,
        [`${USER_ACCESS_PATH}/${uid}/manual_grant_by`]: actor.uid,
        [`${USER_ACCESS_PATH}/${uid}/manual_grant_at`]: now,
        [`${USER_ACCESS_PATH}/${uid}/updatedAt`]: now,
        [`${USER_ACCESS_PATH}/${uid}/version`]: Number(current.version || 0) + 1,
      };
      if (currentRequestId) {
        updates[`${USER_ACCESS_PATH}/${uid}/current_request_id`] = currentRequestId;
        updates[`${INVITE_REQUESTS_PATH}/${currentRequestId}/status`] = 'temporary_access';
        updates[`${INVITE_REQUESTS_PATH}/${currentRequestId}/temp_expires_at`] = tempExpiresAt;
        updates[`${INVITE_REQUESTS_PATH}/${currentRequestId}/moderationReason`] = reason;
        updates[`${INVITE_REQUESTS_PATH}/${currentRequestId}/updatedAt`] = now;
        updates[`${INVITE_REQUESTS_PATH}/${currentRequestId}/moderatedAt`] = now;
        updates[`${INVITE_REQUESTS_PATH}/${currentRequestId}/moderatedBy`] = actor.uid;
      }
      await db.ref().update(updates);

      await writeOpsEvent('temporary_access_granted', {
        targetUid: uid,
        actorUid: actor.uid,
        durationHours,
        temp_expires_at: tempExpiresAt,
      });
      await writeInviteLog(db, 'temporary_grant', {
        requesterUid: uid,
        actorType: 'admin',
        actorUid: actor.uid,
        reason,
        durationHours,
        temp_expires_at: tempExpiresAt,
      });

      return { ok: true, uid, status: 'temporary_access', temp_expires_at: tempExpiresAt };
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'grantTemporaryAccess', error, {
        uid: context.auth?.uid || null,
        targetUid: data?.uid || null,
      });
    }
  });

  const processExpiredTemporaryAccess = functionsV1.pubsub.schedule('every 60 minutes').onRun(async () => {
    const db = admin.database();
    const now = Date.now();
    try {
      const snapshot = await db.ref(USER_ACCESS_PATH).orderByChild('status').equalTo('temporary_access').once('value');
      const updates = {};
      const expired = [];

      snapshot.forEach((child) => {
        const value = child.val() || {};
        const expiresAt = Number(value.temp_expires_at || 0);
        if (expiresAt > 0 && expiresAt < now) {
          const uid = child.key;
          const currentRequestId = sanitizeText(value.current_request_id || '', 128);
          updates[`${USER_ACCESS_PATH}/${uid}/status`] = 'needs_manual_review';
          updates[`${USER_ACCESS_PATH}/${uid}/temp_expires_at`] = null;
          updates[`${USER_ACCESS_PATH}/${uid}/updatedAt`] = now;
          updates[`${USER_ACCESS_PATH}/${uid}/version`] = Number(value.version || 0) + 1;
          if (currentRequestId) {
            updates[`${INVITE_REQUESTS_PATH}/${currentRequestId}/status`] = 'needs_manual_review';
            updates[`${INVITE_REQUESTS_PATH}/${currentRequestId}/temp_expires_at`] = null;
            updates[`${INVITE_REQUESTS_PATH}/${currentRequestId}/updatedAt`] = now;
          }
          expired.push({ uid, expiresAt });
        }
      });

      if (expired.length === 0) {
        await writeOpsEvent('expired_temporary_access_processed', { expiredCount: 0 });
        return null;
      }

      await db.ref().update(updates);

      await Promise.all(expired.map((item) => writeInviteLog(db, 'temporary_access_expired', {
        requesterUid: item.uid,
        actorType: 'system',
        reason: 'temporary_access_expired',
        temp_expires_at: item.expiresAt,
      })));

      await writeOpsEvent('expired_temporary_access_processed', {
        expiredCount: expired.length,
      });
      return null;
    } catch (error) {
      await writeOpsError('processExpiredTemporaryAccess', error, { at: now });
      return null;
    }
  });

  const submitInviteRequest = functionsV1
    .runWith({ minInstances: 1 })
    .https.onCall(async (data, context) => {
    let db;
    let uid = context.auth?.uid || null;
    let lockRequestId = '';
    let lockAcquired = false;
    try {
      assertAuthenticated(functions, context);

      const secret = assertHashSecret(functions);
      db = admin.database();
      const config = await getInviteConfig(db);
      const profilePhone = await getUserPhone(db, context.auth.uid);
      const requesterPhone = assertPhone(functions, data?.requesterPhone || profilePhone, 'requesterPhone');
      const sponsorPhone = assertPhone(functions, data?.sponsorPhone, 'sponsorPhone');
      const text = sanitizeText(data?.text || data?.comment || '', 280);
      const apartment = sanitizeText(data?.apartment || '', 80);
      const comment = text;

      if (requesterPhone === sponsorPhone) {
        throw controlledError(functions, 'invalid-argument', 'SELF_SPONSOR_NOT_ALLOWED');
      }
      if (text.length < 20 || text.length > 280) {
        throw controlledError(functions, 'invalid-argument', 'INVALID_INVITE_TEXT', {
          field: 'text',
        });
      }

      const now = Date.now();
      const requesterPhoneHash = hashValue(secret, requesterPhone);
      const sponsorPhoneHash = hashValue(secret, sponsorPhone);
      const ipHash = hashValue(secret, getClientIp(context));
      uid = context.auth.uid;
      const requestRef = db.ref(INVITE_REQUESTS_PATH).push();
      lockRequestId = requestRef.key;

      if (config.enabled !== true || config.mode === 'disabled') {
        await writeOpsEvent('invite_submit_ignored', {
          reason: 'feature_disabled',
          mode: config.mode,
          uid,
          requesterPhoneHash,
          sponsorPhoneHash,
        });
        return GENERIC_SUBMIT_RESPONSE;
      }

      const lockResult = await acquireSubmitLock(db, uid, lockRequestId, now);
      lockAcquired = lockResult.acquired;
      if (!lockAcquired) {
        throw controlledError(functions, 'aborted', 'INVITE_REQUEST_IN_PROGRESS', {
          requestId: String(lockResult.lock.requestId || ''),
          expiresAt: Number(lockResult.lock.expiresAt || 0),
        });
      }

      const userAccess = await readUserAccess(db, uid);
      if (userAccess.status === 'blocked') {
        await writeOpsEvent('invite_submit_ignored', {
          reason: 'requester_blocked',
          uid,
          requesterPhoneHash,
          sponsorPhoneHash,
        });
        throw controlledError(functions, 'failed-precondition', 'ACCESS_REQUEST_BLOCKED');
      }

      if (userAccess.status === 'approved' || userAccess.status === 'whitelist_access') {
        await writeOpsEvent('invite_submit_ignored', {
          reason: 'access_already_granted',
          uid,
          requesterPhoneHash,
          sponsorPhoneHash,
          accessStatus: userAccess.status,
        });
        return {
          ok: true,
          status: 'already_granted',
          accessStatus: userAccess.status,
        };
      }

      const cooldownUntil = Number(userAccess.last_denied_at || 0) + Number(config.cooldown_after_denied_hours || 24) * 60 * 60 * 1000;
      if (Number(userAccess.last_denied_at || 0) > 0 && cooldownUntil > now) {
        await writeOpsEvent('invite_submit_ignored', {
          reason: 'cooldown',
          uid,
          requesterPhoneHash,
          sponsorPhoneHash,
          cooldownUntil,
        });
        throw controlledError(functions, 'failed-precondition', 'ACCESS_REQUEST_COOLDOWN', {
          cooldownUntil,
        });
      }

      const activeRequest = await findActiveRequestForUid(db, uid);
      if (activeRequest) {
        if (userAccess.current_request_id !== activeRequest.id) {
          await db.ref(`${USER_ACCESS_PATH}/${uid}`).update({
            current_request_id: activeRequest.id,
            status: String(activeRequest.value.status || 'pending'),
            updatedAt: now,
          });
        }
        await writeOpsEvent('invite_submit_ignored', {
          reason: 'duplicate_pending',
          uid,
          requesterPhoneHash,
          sponsorPhoneHash,
          requestId: activeRequest.id,
          status: String(activeRequest.value.status || 'pending'),
        });
        throw controlledError(functions, 'already-exists', 'ACCESS_REQUEST_ALREADY_PENDING', {
          requestId: activeRequest.id,
          status: String(activeRequest.value.status || 'pending'),
        });
      }

      const rateLimitResults = await recordInviteRateLimits(db, {
        uid,
        requesterPhoneHash,
        sponsorPhoneHash,
        ipHash,
      }, now);
      const blocked = rateLimitResults.filter((item) => !item.allowed);

      if (blocked.length > 0) {
        await writeOpsEvent('invite_submit_ignored', {
          reason: 'rate_limited',
          uid,
          requesterPhoneHash,
          sponsorPhoneHash,
          blockedBuckets: blocked.map((item) => item.bucket),
        });
        const retryAfterSeconds = Math.max(60, Math.ceil(Math.max(...blocked.map((item) => Number(item.lockedUntil || 0))) - now) / 1000);
        throw controlledError(functions, 'resource-exhausted', 'INVITE_RATE_LIMIT', {
          retryAfterSeconds,
        });
      }

      const sponsor = await findSponsorNode(db, sponsorPhoneHash);
      const sponsorTrusted = Boolean(sponsor && (sponsor.node.status === 'active' || sponsor.source === 'trusted_sponsors'));
      const risk = calculateRisk({ sponsor, userAccess, config });
      const sponsorCanConfirm = Boolean(
        sponsor?.uid &&
        sponsor.source === 'trust_tree' &&
        sponsor.node?.status === 'active',
      );
      const sponsorNotActive = config.sponsor_confirmation_required === true && Boolean(sponsor) && !sponsorCanConfirm;
      const riskScore = risk.riskScore;
      let riskLevel = risk.riskLevel;
      if (sponsorNotActive && riskLevel === 'low') riskLevel = 'high';
      const requiresSponsorConfirmation = config.sponsor_confirmation_required === true && sponsorCanConfirm && riskLevel !== 'blocked';
      const autoApprove = canAutoApprove({ config, sponsor, riskLevel });
      const autoDeny = riskLevel === 'blocked' || Number(userAccess.denied_count || 0) >= Number(config.max_denied_before_block || 5);
      const initialStatus = autoDeny ? 'denied' : requiresSponsorConfirmation ? 'pending_sponsor' : autoApprove ? 'approved' : 'needs_manual_review';
      const decisionReason = autoApprove && !requiresSponsorConfirmation ? 'low_risk_tree_match' : autoDeny ? 'risk_blocked' : requiresSponsorConfirmation ? 'sponsor_confirmation_required' : sponsorNotActive ? 'sponsor_not_active' : 'manual_review_required';
      const requestData = {
        requesterUid: uid,
        requesterPhoneHash,
        requesterPhoneMasked: maskPhone(requesterPhone),
        sponsorUid: sponsor?.uid || '',
        sponsorPhoneHash,
        sponsorPhoneMasked: maskPhone(sponsorPhone),
        sponsorTrusted,
        comment,
        text,
        apartment,
        status: initialStatus,
        modeAtCreation: config.mode,
        riskScore,
        riskLevel,
        decisionSource: autoApprove && !requiresSponsorConfirmation ? 'auto_tree' : autoDeny ? 'auto_deny' : requiresSponsorConfirmation ? 'sponsor_confirmation' : 'auto_review',
        decisionReason,
        version: 1,
        createdAt: now,
        updatedAt: now,
        source: 'mobile',
        rateLimitSnapshot: rateLimitResults.map((item) => ({
          bucket: item.bucket,
          count: item.count,
          limit: item.limit,
        })),
      };

      const updates = {
        [`${INVITE_REQUESTS_PATH}/${requestRef.key}`]: requestData,
        [`${USER_ACCESS_PATH}/${uid}/status`]: initialStatus,
        [`${USER_ACCESS_PATH}/${uid}/current_request_id`]: requestRef.key,
        [`${USER_ACCESS_PATH}/${uid}/last_request_at`]: now,
        [`${USER_ACCESS_PATH}/${uid}/updatedAt`]: now,
        [`${USER_ACCESS_PATH}/${uid}/version`]: Number(userAccess.version || 0) + 1,
      };

      let sponsorConfirmation = null;
      if (requiresSponsorConfirmation) {
        sponsorConfirmation = buildSponsorConfirmation(requestRef.key, requestData, config, now);
        updates[`${SPONSOR_CONFIRMATIONS_PATH}/${requestRef.key}`] = sponsorConfirmation;
      }

      if (autoDeny) {
        updates[`${USER_ACCESS_PATH}/${uid}/denied_count`] = Number(userAccess.denied_count || 0) + 1;
        updates[`${USER_ACCESS_PATH}/${uid}/last_denied_at`] = now;
      }

      if (autoApprove && !requiresSponsorConfirmation) {
        const trustNode = buildTrustNode({
          uid,
          phoneHash: requesterPhoneHash,
          phoneMasked: maskPhone(requesterPhone),
          sponsor,
          request: requestData,
          actorUid: 'auto_system',
          approvalSource: 'auto_tree',
          config,
          riskScore,
          riskLevel,
          now,
        });
        updates[`${TRUST_TREE_PATH}/${uid}`] = trustNode;
        updates[`${TRUST_TREE_PHONE_INDEX_PATH}/${requesterPhoneHash}`] = uid;
      }

      await db.ref().update(updates);

      if (requiresSponsorConfirmation && sponsorConfirmation) {
        try {
          await sendSponsorConfirmationNotification(admin, db, requestRef.key, requestData, sponsorConfirmation);
        } catch (notificationError) {
          await writeOpsEvent('sponsor_confirmation_notification_warning', {
            requestId: requestRef.key,
            requesterUid: uid,
            sponsorUid: requestData.sponsorUid,
            message: String(notificationError?.message || notificationError || 'notification_failed'),
          });
        }
      }

      await db.ref(`${TRUSTED_SPONSORS_PATH}/${sponsorPhoneHash}`).update({
        lastInviteAt: now,
        updatedAt: now,
      });

      if (autoApprove && !requiresSponsorConfirmation && sponsor?.uid) {
        await db.ref(`${TRUST_TREE_PATH}/${sponsor.uid}/inviteCount`).transaction((current) => Number(current || 0) + 1);
        await awardInviteBonus(db, sponsor.uid, uid, requestData.name || requestData.requesterPhoneMasked || '', now);
      }

      await writeOpsEvent('invite_request_submitted', {
        requestId: requestRef.key,
        uid,
        requesterPhoneHash,
        sponsorPhoneHash,
        status: initialStatus,
        riskLevel,
      });

      await writeInviteLog(db, autoApprove && !requiresSponsorConfirmation ? 'auto_approve' : autoDeny ? 'auto_deny' : 'status_change', {
        requestId: requestRef.key,
        requesterUid: uid,
        sponsorUid: sponsor?.uid || '',
        riskScore,
        riskLevel,
        actorType: 'system',
        reason: requestData.decisionReason,
      });

      return {
        ok: true,
        status: autoApprove && !requiresSponsorConfirmation ? 'auto_approved' : initialStatus === 'pending_sponsor' ? 'pending_sponsor' : 'pending',
        requestId: requestRef.key,
      };
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'submitInviteRequest', error, {
        uid,
      });
    } finally {
      if (db && uid && lockAcquired && lockRequestId) {
        try {
          await releaseSubmitLock(db, uid, lockRequestId);
        } catch (releaseError) {
          await helpers.writeOpsError('submitInviteRequest.lockCleanup', releaseError, { uid, lockRequestId });
        }
      }
    }
    });

  const getMyInviteRequestStatus = functionsV1.https.onCall(async (_data, context) => {
    try {
      assertAuthenticated(functions, context);
      const db = admin.database();
      const config = await getInviteConfig(db);
      const bypass = await isBypassUid(db, context.auth.uid, config, helpers);
      const userAccess = await readUserAccess(db, context.auth.uid);
      const latest = await findLatestRequestForUid(db, context.auth.uid);

      if (!latest) {
        return {
          featureEnabled: config.enabled === true,
          mode: config.mode,
          configUpdatedAt: Number(config.updatedAt || 0),
          bypass,
          accessStatus: bypass ? 'approved' : userAccess.status,
          userAccess: publicUserAccess(userAccess),
          status: bypass ? 'approved' : userAccess.status === 'not_started' ? 'none' : userAccess.status,
        };
      }

      const value = latest.value || {};
      return {
        featureEnabled: config.enabled === true,
        mode: config.mode,
        configUpdatedAt: Number(config.updatedAt || 0),
        bypass,
        accessStatus: bypass ? 'approved' : userAccess.status,
        userAccess: publicUserAccess(userAccess),
        requestId: latest.id,
        status: String(value.status || 'pending'),
        createdAt: Number(value.createdAt || 0),
        updatedAt: Number(value.updatedAt || 0),
        moderatedAt: Number(value.moderatedAt || 0),
        moderationReason: typeof value.moderationReason === 'string' ? value.moderationReason : '',
        riskScore: Number(value.riskScore || 0),
        riskLevel: String(value.riskLevel || ''),
      };
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'getMyInviteRequestStatus', error, {
        uid: context.auth?.uid || null,
      });
    }
  });

  const adminCreateTrustedSponsor = functionsV1.https.onCall(async (data, context) => {
    try {
      const actor = await assertAdminAccess(functions, context, helpers);
      const secret = assertHashSecret(functions);
      const sponsorPhone = assertPhone(functions, data?.sponsorPhone, 'sponsorPhone');
      const sponsorPhoneHash = hashValue(secret, sponsorPhone);
      const db = admin.database();
      const sponsorRef = db.ref(`${TRUSTED_SPONSORS_PATH}/${sponsorPhoneHash}`);
      const existingSnapshot = await sponsorRef.once('value');
      const existing = existingSnapshot.val() || {};
      const now = Date.now();
      const note = data?.note === undefined ? existing.note : sanitizeText(data.note, 280);

      await sponsorRef.set(compactDefined({
        phoneMasked: maskPhone(sponsorPhone),
        status: 'active',
        note,
        createdAt: Number(existing.createdAt || now),
        createdBy: existing.createdBy || actor.uid,
        updatedAt: now,
        updatedBy: actor.uid,
        approvedInviteCount: Number(existing.approvedInviteCount || 0),
        lastInviteAt: Number(existing.lastInviteAt || 0) || undefined,
      }));

      await writeOpsEvent(existingSnapshot.exists() ? 'trusted_sponsor_reactivated' : 'trusted_sponsor_created', {
        sponsorPhoneHash,
        phoneMasked: maskPhone(sponsorPhone),
        actorUid: actor.uid,
      });

      return {
        ok: true,
        sponsorPhoneHash,
        phoneMasked: maskPhone(sponsorPhone),
        status: 'active',
      };
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'adminCreateTrustedSponsor', error, {
        uid: context.auth?.uid || null,
      });
    }
  });

  const adminUpdateTrustedSponsor = functionsV1.https.onCall(async (data, context) => {
    try {
      const actor = await assertAdminAccess(functions, context, helpers);
      const secret = assertHashSecret(functions);
      const sponsorPhone = data?.sponsorPhone === undefined
        ? ''
        : assertPhone(functions, data?.sponsorPhone, 'sponsorPhone');
      const sponsorPhoneHash = sponsorPhone
        ? hashValue(secret, sponsorPhone)
        : assertPhoneHash(functions, data?.sponsorPhoneHash, 'sponsorPhoneHash');
      const status = data?.status === undefined ? undefined : sanitizeText(data.status, 32);

      if (status !== undefined && status !== 'active' && status !== 'disabled') {
        throw new functionsV1.https.HttpsError('invalid-argument', 'status must be active or disabled');
      }

      const db = admin.database();
      const sponsorRef = db.ref(`${TRUSTED_SPONSORS_PATH}/${sponsorPhoneHash}`);
      const existingSnapshot = await sponsorRef.once('value');
      if (!existingSnapshot.exists()) {
        throw new functionsV1.https.HttpsError('not-found', 'Trusted sponsor not found');
      }

      const patch = {
        updatedAt: Date.now(),
        updatedBy: actor.uid,
      };
      if (status !== undefined) patch.status = status;
      if (Object.prototype.hasOwnProperty.call(data || {}, 'note')) {
        patch.note = data.note === null ? null : sanitizeText(data.note, 280);
      }

      await sponsorRef.update(patch);

      const phoneMasked = sponsorPhone
        ? maskPhone(sponsorPhone)
        : String(existingSnapshot.child('phoneMasked').val() || '');

      await writeOpsEvent('trusted_sponsor_updated', {
        sponsorPhoneHash,
        phoneMasked,
        actorUid: actor.uid,
        status: status || existingSnapshot.child('status').val() || 'active',
      });

      return {
        ok: true,
        sponsorPhoneHash,
        phoneMasked,
        status: status || existingSnapshot.child('status').val() || 'active',
      };
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'adminUpdateTrustedSponsor', error, {
        uid: context.auth?.uid || null,
      });
    }
  });

  const adminGrantRootAccessByPhones = functionsV1.https.onCall(async (data, context) => {
    try {
      const actor = await assertAdminAccess(functions, context, helpers);
      const secret = assertHashSecret(functions);
      const rawPhones = Array.isArray(data?.phones) ? data.phones : [];
      const requestedPhones = [...new Set(rawPhones.map((phone) => sanitizeText(phone, 64)).filter(Boolean))];
      if (requestedPhones.length === 0) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'phones is required');
      }

      const db = admin.database();
      const now = Date.now();
      const config = await getInviteConfig(db);
      const ownerPhoneHash = hashValue(secret, OWNER_PHONE);
      const canonicalByInput = new Map();
      const validPhones = [];

      for (const phone of requestedPhones) {
        const canonicalPhone = toCanonicalPhone(phone);
        canonicalByInput.set(phone, canonicalPhone);
        if (canonicalPhone) validPhones.push(canonicalPhone);
      }

      const usersByPhone = await findUsersByCanonicalPhones(db, validPhones);
      const results = [];
      const updates = {};
      const grantLogs = [];

      for (const phone of requestedPhones) {
        const canonicalPhone = canonicalByInput.get(phone);
        if (!canonicalPhone) {
          results.push({
            phone,
            uid: '',
            status: 'error',
            message: 'Номер не распознан. Поддерживаются украинские номера 0XXXXXXXXX, 380XXXXXXXXX, +380XXXXXXXXX.',
          });
          continue;
        }

        const user = usersByPhone.get(canonicalPhone);
        if (!user) {
          results.push({
            phone,
            uid: '',
            status: 'not_found',
            message: 'Пользователь с таким телефоном не найден в /users.',
          });
          continue;
        }

        const phoneHash = hashValue(secret, canonicalPhone);
        const [accessSnapshot, nodeSnapshot] = await Promise.all([
          db.ref(`${USER_ACCESS_PATH}/${user.uid}`).once('value'),
          db.ref(`${TRUST_TREE_PATH}/${user.uid}`).once('value'),
        ]);
        const currentAccess = accessSnapshot.val() && typeof accessSnapshot.val() === 'object' ? accessSnapshot.val() : {};
        const existingNode = nodeSnapshot.val() && typeof nodeSnapshot.val() === 'object' ? nodeSnapshot.val() : {};

        const trustNode = buildManualRootNode({
          uid: user.uid,
          phone: canonicalPhone,
          phoneHash,
          ownerPhoneHash,
          actorUid: actor.uid,
          existingNode,
          config,
          now,
        });

        updates[`${TRUST_TREE_PATH}/${user.uid}`] = trustNode;
        updates[`${TRUST_TREE_PHONE_INDEX_PATH}/${phoneHash}`] = user.uid;
        updates[`${USER_ACCESS_PATH}/${user.uid}/status`] = 'approved';
        updates[`${USER_ACCESS_PATH}/${user.uid}/manual_grant_reason`] = 'manual_root_grant';
        updates[`${USER_ACCESS_PATH}/${user.uid}/manual_grant_by`] = actor.uid;
        updates[`${USER_ACCESS_PATH}/${user.uid}/manual_grant_at`] = now;
        updates[`${USER_ACCESS_PATH}/${user.uid}/updatedAt`] = now;
        updates[`${USER_ACCESS_PATH}/${user.uid}/version`] = Number(currentAccess.version || 0) + 1;

        grantLogs.push({
          actorType: 'admin',
          actorUid: actor.uid,
          requesterUid: user.uid,
          reason: 'admin_grant_root_access_by_phone',
        });

        results.push({
          phone,
          uid: user.uid,
          status: 'granted',
          message: 'Привязан к корню и получил полный trusted-доступ.',
        });
      }

      if (Object.keys(updates).length > 0) {
        await db.ref('/').update(updates);
      }

      await Promise.all(grantLogs.map((payload) => writeInviteLog(db, 'manual_root_grant', payload)));

      await writeOpsEvent('manual_root_access_granted', {
        actorUid: actor.uid,
        requestedCount: requestedPhones.length,
        grantedCount: results.filter((result) => result.status === 'granted').length,
      });

      return { ok: true, results };
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'adminGrantRootAccessByPhones', error, {
        uid: context.auth?.uid || null,
      });
    }
  });

  const adminModerateInviteRequest = functionsV1.https.onCall(async (data, context) => {
    try {
      const actor = await assertModeratorAccess(functions, context, helpers);
      const requestId = assertSafePathKey(functions, data?.requestId, 'requestId');
      const decision = sanitizeText(data?.status || data?.decision, 32);
      const status = decision === 'approve' ? 'approved' : decision === 'deny' ? 'denied' : decision;

      if (status !== 'approved' && status !== 'denied') {
        throw new functionsV1.https.HttpsError('invalid-argument', 'status must be approved or denied');
      }

      const db = admin.database();
      const requestRef = db.ref(`${INVITE_REQUESTS_PATH}/${requestId}`);
      const requestSnapshot = await requestRef.once('value');
      if (!requestSnapshot.exists()) {
        throw new functionsV1.https.HttpsError('not-found', 'Invite request not found');
      }

      const request = requestSnapshot.val() || {};
      const now = Date.now();
      const moderationReason = sanitizeText(data?.reason || '', 280);
      const previousStatus = String(request.status || 'pending');
      if (previousStatus !== 'pending' && previousStatus !== 'pending_sponsor' && previousStatus !== 'needs_manual_review') {
        throw new functionsV1.https.HttpsError('failed-precondition', 'Invite request was already decided');
      }

      const transactionResult = await requestRef.transaction((current) => {
        if (!current || typeof current !== 'object') return current;
        const currentStatus = String(current.status || 'pending');
        if (currentStatus !== 'pending' && currentStatus !== 'pending_sponsor' && currentStatus !== 'needs_manual_review') return;
        return {
          ...current,
          status,
          updatedAt: now,
          moderatedAt: now,
          moderatedBy: actor.uid,
          moderationReason,
          decisionSource: 'manual_admin',
          decisionReason: moderationReason,
          version: Number(current.version || 0) + 1,
        };
      });
      if (!transactionResult.committed) {
        throw new functionsV1.https.HttpsError('failed-precondition', 'Invite request was already decided');
      }

      const currentAccess = await readUserAccess(db, request.requesterUid);
      const updates = {
        [`${USER_ACCESS_PATH}/${request.requesterUid}/status`]: status,
        [`${USER_ACCESS_PATH}/${request.requesterUid}/updatedAt`]: now,
        [`${USER_ACCESS_PATH}/${request.requesterUid}/current_request_id`]: requestId,
        [`${USER_ACCESS_PATH}/${request.requesterUid}/version`]: Number(currentAccess.version || 0) + 1,
      };

      if (status === 'denied') {
        updates[`${USER_ACCESS_PATH}/${request.requesterUid}/denied_count`] = Number(currentAccess.denied_count || 0) + 1;
        updates[`${USER_ACCESS_PATH}/${request.requesterUid}/last_denied_at`] = now;
      }

      let sponsor;
      if (status === 'approved' && request.status !== 'approved' && request.sponsorPhoneHash) {
        const config = await getInviteConfig(db);
        sponsor = await findSponsorNode(db, request.sponsorPhoneHash);
        const trustNode = buildTrustNode({
          uid: request.requesterUid,
          phoneHash: request.requesterPhoneHash,
          phoneMasked: request.requesterPhoneMasked || '',
          sponsor,
          request,
          actorUid: actor.uid,
          approvalSource: 'manual_admin',
          config,
          riskScore: Number(request.riskScore || 0),
          riskLevel: String(request.riskLevel || 'low'),
          now,
        });
        updates[`${TRUST_TREE_PATH}/${request.requesterUid}`] = trustNode;
        updates[`${TRUST_TREE_PHONE_INDEX_PATH}/${request.requesterPhoneHash}`] = request.requesterUid;
      }

      await db.ref('/').update(updates);

      if (status === 'approved' && request.status !== 'approved' && request.sponsorPhoneHash) {
        const sponsorRef = db.ref(`${TRUSTED_SPONSORS_PATH}/${request.sponsorPhoneHash}`);
        await sponsorRef.child('approvedInviteCount').transaction((current) => Number(current || 0) + 1);
        await sponsorRef.update({
          lastInviteAt: now,
          updatedAt: now,
          updatedBy: actor.uid,
        });

        if (sponsor?.uid) {
          await db.ref(`${TRUST_TREE_PATH}/${sponsor.uid}/inviteCount`).transaction((current) => Number(current || 0) + 1);
          await awardInviteBonus(db, sponsor.uid, request.requesterUid, request.requesterPhoneMasked || request.name || '', now);
        }
      }

      await writeOpsEvent('invite_request_moderated', {
        requestId,
        status,
        actorUid: actor.uid,
        requesterUid: request.requesterUid || null,
        sponsorPhoneHash: request.sponsorPhoneHash || null,
      });

      await writeInviteLog(db, status === 'approved' ? 'manual_approve' : 'manual_deny', {
        requestId,
        requesterUid: request.requesterUid || null,
        sponsorPhoneHash: request.sponsorPhoneHash || null,
        actorType: actor.role === 'moderator' ? 'moderator' : 'admin',
        actorUid: actor.uid,
        reason: moderationReason,
      });

      try {
        const notificationTitle = status === 'approved'
          ? 'Ваша заявка одобрена'
          : 'Заявка на доступ отклонена';
        const notificationBody = status === 'approved'
          ? 'Добро пожаловать в Чайку. Полный доступ открыт.'
          : (moderationReason || 'Вы можете подать новую заявку с уточнёнными данными.');

        await writeInAppNotification(db, request.requesterUid, {
          type: 'invite_access_result',
          title: notificationTitle,
          body: notificationBody,
          requestId,
          status,
          reason: moderationReason,
        });
        await sendOptionalPush(admin, db, request.requesterUid, {
          title: `Chaika Life: ${notificationTitle}`,
          body: notificationBody,
        }, {
          type: 'invite_access_result',
          requestId,
          status,
        });
      } catch (notificationError) {
        await writeOpsEvent('invite_result_notification_warning', {
          requestId,
          requesterUid: request.requesterUid || null,
          message: String(notificationError?.message || notificationError || 'notification_failed'),
        });
      }

      return { ok: true, requestId, status };
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'adminModerateInviteRequest', error, {
        uid: context.auth?.uid || null,
        requestId: data?.requestId || null,
      });
    }
  });

  const listMySponsorConfirmations = functionsV1.https.onCall(async (_data, context) => {
    try {
      assertAuthenticated(functions, context);
      const db = admin.database();
      const snapshot = await db.ref(SPONSOR_CONFIRMATIONS_PATH).orderByChild('sponsorUid').equalTo(context.auth.uid).once('value');
      const confirmations = [];
      snapshot.forEach((child) => {
        const value = child.val() || {};
        confirmations.push({
          confirmationId: child.key,
          requestId: String(value.requestId || child.key || ''),
          requesterUid: String(value.requesterUid || ''),
          sponsorUid: String(value.sponsorUid || ''),
          status: String(value.status || 'pending'),
          createdAt: Number(value.createdAt || 0),
          expiresAt: Number(value.expiresAt || 0),
        });
      });

      const requestSnapshots = await Promise.all(confirmations.map((item) => db.ref(`${INVITE_REQUESTS_PATH}/${item.requestId}`).once('value')));
      return {
        ok: true,
        confirmations: confirmations.map((item, index) => {
          const request = requestSnapshots[index].val() || {};
          return {
            ...item,
            requesterPhoneMasked: String(request.requesterPhoneMasked || ''),
            comment: String(request.comment || ''),
            riskLevel: String(request.riskLevel || ''),
            requestStatus: String(request.status || ''),
          };
        }).sort((left, right) => right.createdAt - left.createdAt),
      };
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'listMySponsorConfirmations', error, {
        uid: context.auth?.uid || null,
      });
    }
  });

  const respondToSponsorConfirmation = async (data, context, responseStatus) => {
    const db = admin.database();
    const sponsorUid = context.auth.uid;
    const confirmationId = assertSafePathKey(functions, data?.confirmationId || data?.requestId, 'confirmationId');
    const confirmationRef = db.ref(`${SPONSOR_CONFIRMATIONS_PATH}/${confirmationId}`);
    const now = Date.now();
    const resetProcessingConfirmation = async () => {
      await confirmationRef.transaction((current) => {
        if (!current || typeof current !== 'object') return current;
        if (String(current.status || '') !== 'processing' || String(current.processingResponse || '') !== responseStatus) return current;
        return { ...current, status: 'pending', processingResponse: null, processingAt: null, updatedAt: Date.now() };
      });
    };
    const txResult = await confirmationRef.transaction((current) => {
      if (!current || typeof current !== 'object') return current;
      if (String(current.sponsorUid || '') !== sponsorUid) return;
      if (String(current.status || '') !== 'pending') return;
      if (Number(current.expiresAt || 0) <= now) {
        return { ...current, status: 'expired', updatedAt: now };
      }
      return {
        ...current,
        status: 'processing',
        processingResponse: responseStatus,
        processingAt: now,
        updatedAt: now,
      };
    });

    const nextConfirmation = txResult.snapshot.val() || {};
    if (!txResult.committed && !nextConfirmation.requestId) {
      throw new functionsV1.https.HttpsError('not-found', 'Sponsor confirmation not found');
    }
    if (String(nextConfirmation.sponsorUid || '') !== sponsorUid) {
      throw new functionsV1.https.HttpsError('permission-denied', 'Only the sponsor can respond');
    }
    if (!txResult.committed) {
      throw new functionsV1.https.HttpsError('failed-precondition', 'Sponsor confirmation is already closed');
    }
    if (String(nextConfirmation.status || '') === 'expired') {
      throw new functionsV1.https.HttpsError('failed-precondition', 'Sponsor confirmation has expired');
    }
    if (String(nextConfirmation.status || '') !== 'processing' || String(nextConfirmation.processingResponse || '') !== responseStatus) {
      throw new functionsV1.https.HttpsError('failed-precondition', 'Sponsor confirmation is already closed');
    }

    const requestId = String(nextConfirmation.requestId || confirmationId);
    const requestRef = db.ref(`${INVITE_REQUESTS_PATH}/${requestId}`);
    let request;
    let requesterUid;
    let nextRequestStatus;

    try {
      const requestSnapshot = await requestRef.once('value');
      if (!requestSnapshot.exists()) {
        throw new functionsV1.https.HttpsError('not-found', 'Invite request not found');
      }
      request = requestSnapshot.val() || {};
      if (String(request.status || '') !== 'pending_sponsor') {
        throw new functionsV1.https.HttpsError('failed-precondition', 'Invite request is no longer waiting for sponsor confirmation');
      }
      requesterUid = String(request.requesterUid || nextConfirmation.requesterUid || '');
      nextRequestStatus = responseStatus === 'approved' ? 'approved' : 'denied';

      const access = await readUserAccess(db, requesterUid);
      const updates = {
        [`${SPONSOR_CONFIRMATIONS_PATH}/${confirmationId}/status`]: responseStatus,
        [`${SPONSOR_CONFIRMATIONS_PATH}/${confirmationId}/processingResponse`]: null,
        [`${SPONSOR_CONFIRMATIONS_PATH}/${confirmationId}/processingAt`]: null,
        [`${SPONSOR_CONFIRMATIONS_PATH}/${confirmationId}/respondedAt`]: now,
        [`${SPONSOR_CONFIRMATIONS_PATH}/${confirmationId}/updatedAt`]: now,
        [`${INVITE_REQUESTS_PATH}/${requestId}/status`]: nextRequestStatus,
        [`${INVITE_REQUESTS_PATH}/${requestId}/updatedAt`]: now,
        [`${INVITE_REQUESTS_PATH}/${requestId}/moderatedAt`]: now,
        [`${INVITE_REQUESTS_PATH}/${requestId}/moderatedBy`]: sponsorUid,
        [`${INVITE_REQUESTS_PATH}/${requestId}/decisionSource`]: 'sponsor_confirmation',
        [`${INVITE_REQUESTS_PATH}/${requestId}/decisionReason`]: responseStatus === 'approved' ? 'sponsor_confirmed' : 'sponsor_denied',
        [`${INVITE_REQUESTS_PATH}/${requestId}/version`]: Number(request.version || 0) + 1,
        [`${USER_ACCESS_PATH}/${requesterUid}/status`]: nextRequestStatus,
        [`${USER_ACCESS_PATH}/${requesterUid}/updatedAt`]: now,
        [`${USER_ACCESS_PATH}/${requesterUid}/current_request_id`]: requestId,
        [`${USER_ACCESS_PATH}/${requesterUid}/version`]: Number(access.version || 0) + 1,
      };
      if (nextRequestStatus === 'denied') {
        updates[`${USER_ACCESS_PATH}/${requesterUid}/denied_count`] = Number(access.denied_count || 0) + 1;
        updates[`${USER_ACCESS_PATH}/${requesterUid}/last_denied_at`] = now;
      }

      if (nextRequestStatus === 'approved') {
        const config = await getInviteConfig(db);
        const sponsor = await findSponsorNode(db, request.sponsorPhoneHash);
        const trustNode = buildTrustNode({
          uid: requesterUid,
          phoneHash: request.requesterPhoneHash,
          phoneMasked: request.requesterPhoneMasked || '',
          sponsor,
          request,
          actorUid: sponsorUid,
          approvalSource: 'auto_tree',
          config,
          riskScore: Number(request.riskScore || 0),
          riskLevel: String(request.riskLevel || 'low'),
          now,
        });
        updates[`${TRUST_TREE_PATH}/${requesterUid}`] = trustNode;
        updates[`${TRUST_TREE_PHONE_INDEX_PATH}/${request.requesterPhoneHash}`] = requesterUid;
      }

      await db.ref().update(updates);
    } catch (transitionError) {
      await resetProcessingConfirmation();
      await writeInviteLog(db, 'failed_transition', {
        requestId,
        requesterUid: requesterUid || String(nextConfirmation.requesterUid || ''),
        sponsorUid,
        actorType: 'system',
        reason: 'sponsor_response_transition_failed',
      });
      throw transitionError;
    }

    if (nextRequestStatus === 'approved') {
      await db.ref(`${TRUST_TREE_PATH}/${sponsorUid}/inviteCount`).transaction((current) => Number(current || 0) + 1);
      await awardInviteBonus(db, sponsorUid, requesterUid, request.requesterPhoneMasked || request.name || '', now);
    }

    await writeInAppNotification(db, requesterUid, {
      type: 'sponsor_confirmation_result',
      title: nextRequestStatus === 'approved' ? 'Поручитель підтвердив знайомство' : 'Потрібна інша перевірка',
      body: nextRequestStatus === 'approved'
        ? 'Ваш доступ підтверджено. Дякуємо, що пройшли перевірку.'
        : 'Поручитель не підтвердив знайомство. Ви можете подати нову заявку з іншим поручителем.',
      requestId,
      confirmationId,
    });

    await writeInviteLog(db, nextRequestStatus === 'approved' ? 'sponsor_confirm' : 'sponsor_reject', {
      requestId,
      requesterUid,
      sponsorUid,
      actorType: 'sponsor',
      actorUid: sponsorUid,
      reason: nextRequestStatus === 'approved' ? 'sponsor_confirmed' : 'sponsor_denied',
    });

    return { ok: true, confirmationId, requestId, status: nextRequestStatus };
  };

  const approveSponsorConfirmation = functionsV1.https.onCall(async (data, context) => {
    try {
      assertAuthenticated(functions, context);
      return await respondToSponsorConfirmation(data, context, 'approved');
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'approveSponsorConfirmation', error, {
        uid: context.auth?.uid || null,
        confirmationId: data?.confirmationId || data?.requestId || null,
      });
    }
  });

  const denySponsorConfirmation = functionsV1.https.onCall(async (data, context) => {
    try {
      assertAuthenticated(functions, context);
      return await respondToSponsorConfirmation(data, context, 'denied');
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'denySponsorConfirmation', error, {
        uid: context.auth?.uid || null,
        confirmationId: data?.confirmationId || data?.requestId || null,
      });
    }
  });

  const processExpiredSponsorConfirmations = functionsV1.pubsub.schedule('every 60 minutes').onRun(async () => {
    const db = admin.database();
    const now = Date.now();
    try {
      const snapshot = await db.ref(SPONSOR_CONFIRMATIONS_PATH).orderByChild('status').equalTo('pending').once('value');
      const expired = [];
      const skipped = [];

      const candidates = [];
      snapshot.forEach((child) => {
        const value = child.val() || {};
        const expiresAt = Number(value.expiresAt || 0);
        if (expiresAt > 0 && expiresAt <= now) candidates.push({ confirmationId: child.key, value });
      });

      for (const candidate of candidates) {
        const confirmationId = candidate.confirmationId;
        const confirmationRef = db.ref(`${SPONSOR_CONFIRMATIONS_PATH}/${confirmationId}`);
        const txResult = await confirmationRef.transaction((current) => {
          if (!current || typeof current !== 'object') return current;
          if (String(current.status || '') !== 'pending') return;
          if (Number(current.expiresAt || 0) > now) return;
          return { ...current, status: 'expired', updatedAt: now };
        });

        const confirmation = txResult.snapshot.val() || {};
        if (!txResult.committed || String(confirmation.status || '') !== 'expired') {
          skipped.push({ confirmationId, reason: 'confirmation_not_pending' });
          continue;
        }

        const requestId = String(confirmation.requestId || confirmationId);
        const requesterUid = String(confirmation.requesterUid || '');
        const requestSnapshot = await db.ref(`${INVITE_REQUESTS_PATH}/${requestId}`).once('value');
        const request = requestSnapshot.val() && typeof requestSnapshot.val() === 'object' ? requestSnapshot.val() : null;
        if (!request || String(request.status || '') !== 'pending_sponsor') {
          skipped.push({ confirmationId, requestId, reason: 'request_resolved' });
          await writeInviteLog(db, 'skipped_expire', {
            requestId,
            requesterUid,
            sponsorUid: String(confirmation.sponsorUid || ''),
            actorType: 'system',
            reason: 'request_resolved',
          });
          continue;
        }

        const access = requesterUid ? await readUserAccess(db, requesterUid) : {};
        const updates = {
          [`${INVITE_REQUESTS_PATH}/${requestId}/status`]: 'needs_manual_review',
          [`${INVITE_REQUESTS_PATH}/${requestId}/updatedAt`]: now,
          [`${INVITE_REQUESTS_PATH}/${requestId}/decisionReason`]: 'sponsor_confirmation_expired',
          [`${INVITE_REQUESTS_PATH}/${requestId}/version`]: Number(request.version || 0) + 1,
        };
        if (requesterUid) {
          updates[`${USER_ACCESS_PATH}/${requesterUid}/status`] = 'needs_manual_review';
          updates[`${USER_ACCESS_PATH}/${requesterUid}/updatedAt`] = now;
          updates[`${USER_ACCESS_PATH}/${requesterUid}/version`] = Number(access.version || 0) + 1;
        }
        try {
          await db.ref().update(updates);
        } catch (transitionError) {
          await confirmationRef.transaction((current) => {
            if (!current || typeof current !== 'object') return current;
            if (String(current.status || '') !== 'expired') return current;
            return { ...current, status: 'pending', updatedAt: now };
          });
          await writeInviteLog(db, 'failed_transition', {
            requestId,
            requesterUid,
            sponsorUid: String(confirmation.sponsorUid || ''),
            actorType: 'system',
            reason: 'sponsor_expire_transition_failed',
          });
          throw transitionError;
        }
        expired.push({ confirmationId, requestId, requesterUid, sponsorUid: String(confirmation.sponsorUid || '') });
      }

      // Recover stuck 'processing' confirmations (Cloud Function crash recovery)
      const stuckSnapshot = await db.ref(SPONSOR_CONFIRMATIONS_PATH).orderByChild('status').equalTo('processing').once('value');
      const stuckCandidates = [];
      stuckSnapshot.forEach((child) => {
        const value = child.val() || {};
        const updatedAt = Number(value.updatedAt || 0);
        if (updatedAt > 0 && now - updatedAt >= PROCESSING_TIMEOUT_MS) {
          stuckCandidates.push({ confirmationId: child.key, value });
        }
      });
      for (const candidate of stuckCandidates) {
        const confirmationRef = db.ref(`${SPONSOR_CONFIRMATIONS_PATH}/${candidate.confirmationId}`);
        await confirmationRef.transaction((current) => {
          if (!current || typeof current !== 'object') return current;
          if (String(current.status || '') !== 'processing') return;
          if (now - Number(current.updatedAt || 0) < PROCESSING_TIMEOUT_MS) return;
          return { ...current, status: 'pending', updatedAt: now };
        });
      }
      if (stuckCandidates.length > 0) {
        await writeOpsEvent('stuck_processing_confirmations_recovered', { recoveredCount: stuckCandidates.length });
      }

      if (expired.length === 0 && skipped.length === 0 && stuckCandidates.length === 0) {
        await writeOpsEvent('expired_sponsor_confirmations_processed', { expiredCount: 0 });
        return null;
      }

      await Promise.all(expired.map((item) => writeInviteLog(db, 'sponsor_confirmation_expired', {
        requestId: item.requestId,
        requesterUid: item.requesterUid,
        sponsorUid: item.sponsorUid,
        actorType: 'system',
        reason: 'sponsor_confirmation_expired',
      })));
      await writeOpsEvent('expired_sponsor_confirmations_processed', {
        expiredCount: expired.length,
        skippedCount: skipped.length,
      });
      return null;
    } catch (error) {
      await writeOpsError('processExpiredSponsorConfirmations', error, { at: now });
      return null;
    }
  });

  const adminSetInviteAccessEnabled = functionsV1.https.onCall(async (data, context) => {
    try {
      const actor = await assertAdminAccess(functions, context, helpers);
      if (typeof data?.enabled !== 'boolean') {
        throw new functionsV1.https.HttpsError('invalid-argument', 'enabled must be a boolean');
      }

      if (data.enabled) {
        assertHashSecret(functions);
      }

      const flagRef = admin.database().ref(FEATURE_FLAG_PATH);
      const snapshot = await flagRef.once('value');
      const currentVersion = Number(snapshot.child('version').val() || 0);
      const now = Date.now();
      const current = snapshot.val() && typeof snapshot.val() === 'object' ? snapshot.val() : {};
      const mode = data.enabled ? normalizeInviteMode(current.mode, true) : 'disabled';
      const nextConfig = {
        ...DEFAULT_INVITE_CONFIG,
        ...modeDefaults(mode),
        ...current,
        enabled: data.enabled,
        mode,
        updatedAt: now,
        updatedBy: actor.uid,
        version: currentVersion + 1,
      };
      await flagRef.set(nextConfig);
      await writePublicInviteConfig(admin.database(), nextConfig);

      await writeOpsEvent('invite_access_flag_updated', {
        enabled: data.enabled,
        mode,
        actorUid: actor.uid,
        version: currentVersion + 1,
      });
      await writeInviteLog(admin.database(), 'mode_change', {
        actorType: 'admin',
        actorUid: actor.uid,
        fromMode: String(current.mode || (current.enabled ? 'soft' : 'disabled')),
        toMode: mode,
      });

      return {
        ok: true,
        enabled: data.enabled,
        mode,
        updatedAt: now,
        version: currentVersion + 1,
      };
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'adminSetInviteAccessEnabled', error, {
        uid: context.auth?.uid || null,
      });
    }
  });

  const adminSetInviteAccessMode = functionsV1.https.onCall(async (data, context) => {
    try {
      const actor = await assertAdminAccess(functions, context, helpers);
      const mode = sanitizeText(data?.mode, 20);
      if (mode !== 'disabled' && mode !== 'soft' && mode !== 'medium') {
        throw new functionsV1.https.HttpsError('invalid-argument', 'mode must be disabled, soft or medium');
      }
      if (mode !== 'disabled') {
        assertHashSecret(functions);
      }

      const db = admin.database();
      const flagRef = db.ref(FEATURE_FLAG_PATH);
      const snapshot = await flagRef.once('value');
      const current = snapshot.val() && typeof snapshot.val() === 'object' ? snapshot.val() : {};
      const currentVersion = Number(current.version || 0);
      const now = Date.now();
      const nextConfig = {
        ...DEFAULT_INVITE_CONFIG,
        ...modeDefaults(mode),
        ...current,
        ...modeDefaults(mode),
        enabled: mode !== 'disabled',
        mode,
        updatedAt: now,
        updatedBy: actor.uid,
        version: currentVersion + 1,
      };

      await flagRef.set(nextConfig);
      await writePublicInviteConfig(db, nextConfig);
      await writeOpsEvent('invite_access_mode_updated', {
        fromMode: String(current.mode || (current.enabled ? 'soft' : 'disabled')),
        mode,
        actorUid: actor.uid,
        version: currentVersion + 1,
      });
      await writeInviteLog(db, 'mode_change', {
        actorType: 'admin',
        actorUid: actor.uid,
        fromMode: String(current.mode || (current.enabled ? 'soft' : 'disabled')),
        toMode: mode,
      });

      return { ok: true, mode, enabled: mode !== 'disabled', updatedAt: now, version: currentVersion + 1 };
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'adminSetInviteAccessMode', error, {
        uid: context.auth?.uid || null,
      });
    }
  });

  const initializeInviteAccessRoot = functionsV1.https.onCall(async (data, context) => {
    try {
      const actor = await assertAdminAccess(functions, context, helpers);
      const secret = assertHashSecret(functions);
      const ownerPhone = assertPhone(functions, data?.ownerPhone || OWNER_PHONE, 'ownerPhone');
      const ownerUid = sanitizeText(data?.ownerUid || OWNER_UID, 128);
      const db = admin.database();
      const now = Date.now();
      const phoneHash = hashValue(secret, ownerPhone);
      const ownerAccess = await readUserAccess(db, ownerUid);
      const rootNode = {
        userUid: ownerUid,
        phoneHash,
        phoneMasked: maskPhone(ownerPhone),
        sponsorUid: null,
        sponsorPhoneHash: null,
        sponsorName: 'root',
        approvedBy: actor.uid,
        approvedAt: now,
        approvalSource: 'migration',
        depthToRoot: 0,
        rootPath: [],
        riskScore: 0,
        riskLevel: 'low',
        inviteCount: 0,
        inviteLimit: 999,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      await db.ref().update({
        [`${TRUST_TREE_PATH}/${ownerUid}`]: rootNode,
        [`${TRUST_TREE_PHONE_INDEX_PATH}/${phoneHash}`]: ownerUid,
        [`${USER_ACCESS_PATH}/${ownerUid}/status`]: 'approved',
        [`${USER_ACCESS_PATH}/${ownerUid}/updatedAt`]: now,
        [`${USER_ACCESS_PATH}/${ownerUid}/version`]: Number(ownerAccess.version || 0) + 1,
      });
      await writeInviteLog(db, 'status_change', {
        actorType: 'admin',
        actorUid: actor.uid,
        requesterUid: ownerUid,
        reason: 'initialize_root',
      });
      return { ok: true, ownerUid, phoneMasked: maskPhone(ownerPhone) };
    } catch (error) {
      return handleUnexpectedError(functions, helpers, 'initializeInviteAccessRoot', error, {
        uid: context.auth?.uid || null,
      });
    }
  });

  return {
    initializeGuestAccessOnUserCreate,
    processExpiredGuestAccess,
    grantTemporaryAccess,
    processExpiredTemporaryAccess,
    submitInviteRequest,
    getMyInviteRequestStatus,
    listMySponsorConfirmations,
    approveSponsorConfirmation,
    denySponsorConfirmation,
    processExpiredSponsorConfirmations,
    adminCreateTrustedSponsor,
    adminUpdateTrustedSponsor,
    adminGrantRootAccessByPhones,
    adminModerateInviteRequest,
    adminSetInviteAccessEnabled,
    adminSetInviteAccessMode,
    initializeInviteAccessRoot,
  };
};

module.exports = {
  createInviteAccessFunctions,
  BONUS_INVITE_POINTS,
  BONUS_INVITE_CAP,
  BONUS_LIKE_POINTS,
  BONUS_LIKE_CAP,
  BONUS_HELP_POINTS,
  BONUS_HELP_CAP,
  BONUS_TOTAL_CAP,
  resolveBadge,
  USER_BONUSES_PATH,
};

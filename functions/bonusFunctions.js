/**
 * bonusFunctions.js — Cloud Functions for "Бонусы доверия" & "Промо-кредиты"
 *
 * Security layer:
 * - All balance writes via RTDB transactions (atomic, no double-spend)
 * - Idempotency keys prevent duplicate awards on retries
 * - Weekly limits enforced server-side (UTC+2 / Europe/Kyiv)
 * - Trust-tree ring detection for collusion prevention
 * - Admin-only functions gated by role check
 * - All operations logged to bonus_transactions
 *
 * Exports: createBonusFunctions({ functions, admin, writeOpsEvent, writeOpsError, getRoleForUid })
 */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_BONUSES_PATH = 'user_bonuses';
const PROMO_CREDITS_PATH = 'promo_credits';
const BONUS_TX_PATH = 'bonus_transactions';
const FRAUD_FLAGS_PATH = 'bonus_fraud_flags';
const HELP_RESPONSES_PATH = 'help_responses';
const TRUST_TREE_PATH = 'trust_tree';

// Award amounts
const BONUS_HELP_RESPOND = 5;       // Responded to a request
const BONUS_HELP_CONFIRMED = 20;    // Author confirmed help
const BONUS_AUTHOR_CLOSED = 5;      // Author closed request properly
const BONUS_GRATITUDE = 10;         // Author thanked helper
const BONUS_THANKS_PROFILE = 3;     // "Thank you" on profile
const BONUS_INVITE = 50;            // Invited & approved new user
const BONUS_DAILY_LOGIN = 1;        // First daily login
const BONUS_PROFILE_COMPLETE = 30;  // One-time: filled profile fully
const BONUS_FIRST_REQUEST = 10;     // One-time: first request created
const BONUS_FIRST_RESPONSE = 10;    // One-time: first help response

// Weekly limits per category
const WEEKLY_LIMITS = {
  help: 100,
  gratitude: 50,
  invites: 150,
  activity: 7,
  total: 250,
};

// Newcomer limit (before access confirmed)
const NEWCOMER_WEEKLY_LIMIT = 100;

// Badge thresholds
const BONUS_BADGES = [
  { min: 5000, badge: 'ambassador' },
  { min: 2000, badge: 'guardian' },
  { min: 500, badge: 'active_resident' },
  { min: 100, badge: 'good_neighbor' },
];

const resolveBadge = (total) => {
  for (const tier of BONUS_BADGES) {
    if (total >= tier.min) return tier.badge;
  }
  return 'newcomer';
};

// ─── Week key (ISO 8601 week, UTC+2 for Ukraine) ────────────────────────────

const getWeekKey = (timestampMs) => {
  // Shift to UTC+2 (Ukraine standard time)
  const d = new Date(timestampMs + 2 * 60 * 60 * 1000);
  // ISO week number
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((d - jan1) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + jan1.getUTCDay()) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
};

// ─── Day key (UTC+2) ────────────────────────────────────────────────────────

const getDayKey = (timestampMs) => {
  const d = new Date(timestampMs + 2 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

// ─── Weekly usage tracker ────────────────────────────────────────────────────

/**
 * Read current weekly usage for a category.
 * Returns { weekKey, categoryUsed, totalUsed }.
 */
const getWeeklyUsage = (bonusData, now) => {
  const weekKey = getWeekKey(now);
  const earned = bonusData?.earned || {};

  // If week rolled over, reset
  if (earned.weekKey !== weekKey) {
    return { weekKey, categoryUsage: {}, totalUsed: 0 };
  }

  return {
    weekKey,
    categoryUsage: earned.weeklyByCategory || {},
    totalUsed: Number(earned.weeklyTotal || 0),
  };
};

/**
 * Check if adding `points` to `category` would exceed weekly limits.
 * Returns { allowed: boolean, reason: string|null }.
 */
const checkWeeklyLimit = (bonusData, category, points, now, isNewcomer) => {
  const { categoryUsage, totalUsed } = getWeeklyUsage(bonusData, now);
  const catUsed = Number(categoryUsage[category] || 0);
  const catLimit = WEEKLY_LIMITS[category] || 0;
  const totalLimit = isNewcomer ? NEWCOMER_WEEKLY_LIMIT : WEEKLY_LIMITS.total;

  if (catLimit > 0 && catUsed + points > catLimit) {
    return { allowed: false, reason: `weekly_limit_${category}` };
  }
  if (totalUsed + points > totalLimit) {
    return { allowed: false, reason: 'weekly_limit_total' };
  }
  return { allowed: true, reason: null };
};

// ─── Trust-tree anti-fraud ───────────────────────────────────────────────────

/**
 * Check for collusion risk between two users using trust_tree.
 *
 * Suspicious patterns:
 * 1. Same sponsor chain (distance 1 in trust tree = same sponsor invited both)
 * 2. One invited the other (direct parent-child)
 * 3. Frequent mutual help (>3 per week between same pair)
 *
 * Returns { suspicious: boolean, reason: string|null, riskScore: number }
 */
const checkCollusionRisk = async (db, uid1, uid2, now) => {
  let riskScore = 0;
  const reasons = [];

  // 1. Load trust tree nodes for both users
  const [node1Snap, node2Snap] = await Promise.all([
    db.ref(`${TRUST_TREE_PATH}/${uid1}`).once('value'),
    db.ref(`${TRUST_TREE_PATH}/${uid2}`).once('value'),
  ]);
  const node1 = node1Snap.val();
  const node2 = node2Snap.val();

  if (node1 && node2) {
    // Direct parent-child: one invited the other
    if (node1.sponsorUid === uid2 || node2.sponsorUid === uid1) {
      riskScore += 30;
      reasons.push('direct_invite_chain');
    }

    // Same sponsor
    if (node1.sponsorUid && node1.sponsorUid === node2.sponsorUid) {
      riskScore += 20;
      reasons.push('same_sponsor');
    }

    // Very close in tree (both within 2 hops of each other via rootPath)
    const path1 = Array.isArray(node1.rootPath) ? node1.rootPath : [];
    const path2 = Array.isArray(node2.rootPath) ? node2.rootPath : [];
    if (path1.includes(uid2) || path2.includes(uid1)) {
      riskScore += 15;
      reasons.push('in_root_path');
    }

    // Both high risk or suspended
    if (node1.riskLevel === 'high' || node2.riskLevel === 'high') {
      riskScore += 25;
      reasons.push('high_risk_participant');
    }
    if (node1.status === 'suspended' || node2.status === 'suspended') {
      riskScore += 40;
      reasons.push('suspended_participant');
    }
  }

  // 2. Check mutual help frequency this week
  const weekKey = getWeekKey(now);
  const pairKey = [uid1, uid2].sort().join('_');
  const freqSnap = await db.ref(`bonus_pair_frequency/${weekKey}/${pairKey}`).once('value');
  const pairCount = Number(freqSnap.val() || 0);

  if (pairCount >= 3) {
    riskScore += 35;
    reasons.push(`pair_frequency_${pairCount}`);
  } else if (pairCount >= 2) {
    riskScore += 15;
    reasons.push(`pair_frequency_${pairCount}`);
  }

  return {
    suspicious: riskScore >= 50,
    reason: reasons.length > 0 ? reasons.join(', ') : null,
    riskScore,
  };
};

/**
 * Increment pair frequency counter for the current week.
 */
const incrementPairFrequency = async (db, uid1, uid2, now) => {
  const weekKey = getWeekKey(now);
  const pairKey = [uid1, uid2].sort().join('_');
  const ref = db.ref(`bonus_pair_frequency/${weekKey}/${pairKey}`);
  await ref.transaction((current) => (Number(current || 0)) + 1);
};

// ─── Write transaction to bonus_transactions ─────────────────────────────────

const writeBonusTransaction = async (db, uid, tx) => {
  await db.ref(`${BONUS_TX_PATH}/${uid}`).push(tx);
};

// ─── Core bonus award (atomic transaction) ───────────────────────────────────

/**
 * Award trust bonuses atomically with optional plan multiplier.
 *
 * @param {object} db - admin.database()
 * @param {string} uid - recipient UID
 * @param {string} category - help|gratitude|invites|likes|activity
 * @param {number} points - base points to add
 * @param {string} idempotencyKey - unique key for this award
 * @param {object} txMeta - { sourceId, sourceType, note }
 * @param {number} now - timestamp
 * @param {boolean} isNewcomer - restrict to newcomer limits
 * @param {string} [plan] - user plan (free|premium|premium_plus|business_plus) for multiplier
 * @returns {{ awarded: boolean, reason: string|null, newTotal: number }}
 */
const awardTrustBonus = async (db, uid, category, points, idempotencyKey, txMeta, now, isNewcomer, plan) => {
  // Apply subscription multiplier: business_plus=x2, premium*=x1.5, free=x1
  let multipliedPoints = points;
  if (plan === 'business_plus') {
    multipliedPoints = Math.floor(points * 2);
  } else if (plan === 'premium' || plan === 'premium_plus') {
    multipliedPoints = Math.floor(points * 1.5);
  }
  // FIX BUG 1: Atomic idempotency via transaction on the idempotency key itself.
  // This prevents the race where two concurrent calls both pass the check.
  let alreadyExists = false;
  await db.ref(`bonus_idempotency/${uid}/${idempotencyKey}`).transaction((current) => {
    if (current !== null) {
      alreadyExists = true;
      return current; // Already awarded, don't overwrite
    }
    return now; // Claim the key atomically
  });
  if (alreadyExists) {
    return { awarded: false, reason: 'already_awarded', newTotal: 0 };
  }

  // FIX BUG 2: Check if bonus accrual is blocked for this user
  const blockSnap = await db.ref(`bonus_blocks/${uid}`).once('value');
  const blockData = blockSnap.val();
  if (blockData && blockData.blocked === true) {
    return { awarded: false, reason: 'accrual_blocked', newTotal: 0 };
  }

  const weekKey = getWeekKey(now);
  let result = { awarded: false, reason: null, newTotal: 0 };

  const bonusRef = db.ref(`${USER_BONUSES_PATH}/${uid}`);
  await bonusRef.transaction((current) => {
    const d = current && typeof current === 'object' ? { ...current } : {};

    // Weekly limit check
    const limitCheck = checkWeeklyLimit(d, category, points, now, isNewcomer);
    if (!limitCheck.allowed) {
      result = { awarded: false, reason: limitCheck.reason, newTotal: Number(d.total || 0) };
      return current; // Abort transaction
    }

    // Category counters
    const cat = d[category] && typeof d[category] === 'object' ? { ...d[category] } : { count: 0, points: 0 };
    cat.count = Number(cat.count || 0) + 1;
    cat.points = Number(cat.points || 0) + multipliedPoints;

    // Earned tracking
    const earned = d.earned && typeof d.earned === 'object' ? { ...d.earned } : {};
    const weeklyByCategory = earned.weekKey === weekKey
      ? (earned.weeklyByCategory && typeof earned.weeklyByCategory === 'object' ? { ...earned.weeklyByCategory } : {})
      : {};

    weeklyByCategory[category] = Number(weeklyByCategory[category] || 0) + multipliedPoints;

    earned.total = Number(earned.total || 0) + multipliedPoints;
    earned.weeklyTotal = earned.weekKey === weekKey ? Number(earned.weeklyTotal || 0) + multipliedPoints : multipliedPoints;
    earned.weekKey = weekKey;
    earned.weeklyByCategory = weeklyByCategory;
    earned.weeklyLimit = WEEKLY_LIMITS.total;

    // Spent tracking
    const spent = d.spent && typeof d.spent === 'object' ? d.spent : { total: 0 };

    // Compute totals
    const newTotal = Number(earned.total || 0);
    const available = newTotal - Number(spent.total || 0);

    const updated = {
      ...d,
      total: newTotal,
      available: Math.max(available, 0),
      earned,
      [category]: cat,
      spent,
      badge: resolveBadge(newTotal),
      updatedAt: now,
    };

    // Preserve other categories
    for (const key of ['invites', 'likes', 'help', 'gratitude', 'activity']) {
      if (key !== category && !updated[key]) {
        updated[key] = d[key] || { count: 0, points: 0 };
      }
    }

    result = { awarded: true, reason: null, newTotal };
    return updated;
  });

  // Post-transaction: write transaction log (idempotency already claimed above)
  if (result.awarded) {
    await writeBonusTransaction(db, uid, {
      type: 'earn',
      currency: 'trust',
      category,
      points,
      balanceAfter: result.newTotal,
      sourceId: txMeta.sourceId || '',
      sourceType: txMeta.sourceType || '',
      status: 'completed',
      createdAt: now,
      createdBy: 'system',
      note: txMeta.note || '',
    });
  }

  return result;
};

// ─── Promo credits (admin-only, atomic) ──────────────────────────────────────

/**
 * Grant promo credits to a user. Admin-only.
 * @returns {{ granted: boolean, newBalance: number }}
 */
const grantPromoCredits = async (db, uid, amount, adminUid, reason, sourceId, now) => {
  let newBalance = 0;

  const creditsRef = db.ref(`${PROMO_CREDITS_PATH}/${uid}`);
  await creditsRef.transaction((current) => {
    const d = current && typeof current === 'object' ? { ...current } : {};
    const balance = Number(d.balance || 0) + amount;
    const lifetime = Number(d.lifetime || 0) + amount;
    const spent = d.spent && typeof d.spent === 'object' ? d.spent : { total: 0 };

    newBalance = balance;
    return {
      ...d,
      balance,
      lifetime,
      spent,
      updatedAt: now,
    };
  });

  await writeBonusTransaction(db, uid, {
    type: 'topup',
    currency: 'promo',
    category: 'purchase',
    points: amount,
    balanceAfter: newBalance,
    sourceId: sourceId || '',
    sourceType: 'ad_ticket',
    status: 'completed',
    createdAt: now,
    createdBy: adminUid,
    note: reason || '',
  });

  return { granted: true, newBalance };
};

/**
 * Spend promo credits atomically. Returns { spent, newBalance } or throws.
 */
const spendPromoCredits = async (db, uid, amount, category, sourceId, now) => {
  let newBalance = 0;
  let success = false;

  const creditsRef = db.ref(`${PROMO_CREDITS_PATH}/${uid}`);
  await creditsRef.transaction((current) => {
    const d = current && typeof current === 'object' ? { ...current } : {};
    const balance = Number(d.balance || 0);
    if (balance < amount) {
      success = false;
      return current; // Abort — insufficient funds
    }

    const spent = d.spent && typeof d.spent === 'object' ? { ...d.spent } : { total: 0 };
    spent.total = Number(spent.total || 0) + amount;
    spent[category] = Number(spent[category] || 0) + amount;

    newBalance = balance - amount;
    success = true;
    return {
      ...d,
      balance: newBalance,
      spent,
      updatedAt: now,
    };
  });

  if (!success) {
    return { spent: false, newBalance: 0, reason: 'insufficient_credits' };
  }

  await writeBonusTransaction(db, uid, {
    type: 'spend',
    currency: 'promo',
    category,
    points: -amount,
    balanceAfter: newBalance,
    sourceId,
    sourceType: category.replace('Top', ''),
    status: 'completed',
    createdAt: now,
    createdBy: uid,
    note: '',
  });

  return { spent: true, newBalance };
};

/**
 * Spend trust bonuses atomically (for personal promotions: contacts top, services top).
 */
const spendTrustBonuses = async (db, uid, amount, category, sourceId, now) => {
  let newAvailable = 0;
  let success = false;

  const bonusRef = db.ref(`${USER_BONUSES_PATH}/${uid}`);
  await bonusRef.transaction((current) => {
    const d = current && typeof current === 'object' ? { ...current } : {};
    const available = Number(d.available || 0);
    if (available < amount) {
      success = false;
      return current;
    }

    const spent = d.spent && typeof d.spent === 'object' ? { ...d.spent } : { total: 0 };
    spent.total = Number(spent.total || 0) + amount;
    spent[category] = Number(spent[category] || 0) + amount;

    newAvailable = available - amount;
    success = true;
    return {
      ...d,
      available: newAvailable,
      spent,
      updatedAt: now,
    };
  });

  if (!success) {
    return { spent: false, newAvailable: 0, reason: 'insufficient_bonuses' };
  }

  await writeBonusTransaction(db, uid, {
    type: 'spend',
    currency: 'trust',
    category,
    points: -amount,
    balanceAfter: newAvailable,
    sourceId,
    sourceType: 'promotion',
    status: 'completed',
    createdAt: now,
    createdBy: uid,
    note: '',
  });

  return { spent: true, newAvailable };
};

// ─── Exported Cloud Functions factory ────────────────────────────────────────

const createBonusFunctions = ({ functions, admin, writeOpsEvent, writeOpsError, getRoleForUid }) => {
  const db = admin.database();
  const fns = {};

  // ────────────────────────────────────────────────────────────────────────
  //  awardHelpBonus — Helper responded to request (+5)
  // ────────────────────────────────────────────────────────────────────────
  fns.awardHelpRespondBonus = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');
    const requestId = String(data.requestId || '').trim();
    if (!requestId) throw new functions.https.HttpsError('invalid-argument', 'request_id_required');

    const helperUid = context.auth.uid;
    const now = Date.now();

    // Verify request exists and helper != author
    const reqSnap = await db.ref(`requests/${requestId}`).once('value');
    const reqVal = reqSnap.val();
    if (!reqVal) throw new functions.https.HttpsError('not-found', 'request_not_found');
    if (reqVal.userId === helperUid) throw new functions.https.HttpsError('failed-precondition', 'cannot_help_own_request');
    if (reqVal.status === 'closed') return { ok: true, status: 'request_closed', points: 0 };

    // Check if already responded
    const existSnap = await db.ref(`${HELP_RESPONSES_PATH}/${requestId}/${helperUid}`).once('value');
    if (existSnap.exists()) return { ok: true, status: 'already_responded', points: 0 };

    // Anti-fraud: collusion check
    const fraud = await checkCollusionRisk(db, helperUid, reqVal.userId, now);
    if (fraud.suspicious) {
      await db.ref(`${FRAUD_FLAGS_PATH}`).push({
        type: 'help_respond',
        uid1: helperUid,
        uid2: reqVal.userId,
        requestId,
        riskScore: fraud.riskScore,
        reason: fraud.reason,
        at: now,
      });
      // Still allow but don't award bonus
      await db.ref(`${HELP_RESPONSES_PATH}/${requestId}/${helperUid}`).set({
        helperUid, requestId, at: now, flagged: true,
      });
      return { ok: true, status: 'flagged', points: 0 };
    }

    // Write help response
    await db.ref(`${HELP_RESPONSES_PATH}/${requestId}/${helperUid}`).set({
      helperUid, requestId, at: now,
    });

    // Increment pair frequency
    await incrementPairFrequency(db, helperUid, reqVal.userId, now);

    // Check newcomer status
    const accessSnap = await db.ref(`trust_tree/${helperUid}/status`).once('value');
    const isNewcomer = accessSnap.val() !== 'active';

    // Load user's subscription plan for bonus multiplier
    const subSnap = await db.ref(`user_subscription/${helperUid}`).once('value');
    const userPlan = subSnap.val()?.plan || 'free';

    const helpRespCategory = reqVal.category || reqVal.subcategory || '';
    const result = await awardTrustBonus(
      db, helperUid, 'help', BONUS_HELP_RESPOND,
      `help_respond_${requestId}`,
      { sourceId: requestId, sourceType: 'request', note: `request_respond:${helpRespCategory}` },
      now, isNewcomer, userPlan,
    );

    await writeOpsEvent('bonus_help_respond', { uid: helperUid, requestId, awarded: result.awarded, points: BONUS_HELP_RESPOND });

    return { ok: true, status: result.awarded ? 'responded' : result.reason, points: result.awarded ? BONUS_HELP_RESPOND : 0 };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  confirmHelperForRequest — Author confirms helper received help (+20 to helper)
  // ────────────────────────────────────────────────────────────────────────
  fns.confirmHelperForRequest = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const requestId = String(data.requestId || '').trim();
    const helperUid = String(data.helperUid || '').trim();
    if (!requestId || !helperUid) throw new functions.https.HttpsError('invalid-argument', 'request_id_and_helper_uid_required');

    const authorUid = context.auth.uid;
    const now = Date.now();

    // Verify request exists and caller is author
    const reqSnap = await db.ref(`requests/${requestId}`).once('value');
    const reqVal = reqSnap.val();
    if (!reqVal) throw new functions.https.HttpsError('not-found', 'request_not_found');
    if (reqVal.userId !== authorUid) throw new functions.https.HttpsError('permission-denied', 'only_author_can_confirm');
    if (helperUid === authorUid) throw new functions.https.HttpsError('failed-precondition', 'cannot_confirm_self');

    // Check helper actually responded
    const helpSnap = await db.ref(`${HELP_RESPONSES_PATH}/${requestId}/${helperUid}`).once('value');
    if (!helpSnap.exists()) throw new functions.https.HttpsError('failed-precondition', 'helper_not_responded');
    const helpData = helpSnap.val();
    if (helpData.flagged) throw new functions.https.HttpsError('failed-precondition', 'help_flagged_for_review');

    // Check max confirmed helpers per request (1 main + 2 additional = 3 max)
    const confirmedSnap = await db.ref(`help_confirmations/${requestId}`).once('value');
    const confirmedVal = confirmedSnap.val() || {};
    if (confirmedVal[helperUid]) {
      return { ok: true, status: 'already_confirmed', points: 0 };
    }
    const confirmedCount = confirmedVal ? Object.keys(confirmedVal).length : 0;
    if (confirmedCount >= 3) throw new functions.https.HttpsError('failed-precondition', 'max_helpers_confirmed');

    // Anti-fraud
    const fraud = await checkCollusionRisk(db, authorUid, helperUid, now);
    if (fraud.suspicious) {
      await db.ref(`${FRAUD_FLAGS_PATH}`).push({
        type: 'help_confirm',
        uid1: authorUid,
        uid2: helperUid,
        requestId,
        riskScore: fraud.riskScore,
        reason: fraud.reason,
        at: now,
      });
      return { ok: false, status: 'flagged_for_review', points: 0 };
    }

    // Check newcomer
    const accessSnap = await db.ref(`trust_tree/${helperUid}/status`).once('value');
    const isNewcomer = accessSnap.val() !== 'active';

    // Load user's subscription plan for bonus multiplier
    const subSnap = await db.ref(`user_subscription/${helperUid}`).once('value');
    const userPlan = subSnap.val()?.plan || 'free';

    const confirmCategory = reqVal.category || reqVal.subcategory || '';
    const result = await awardTrustBonus(
      db, helperUid, 'help', BONUS_HELP_CONFIRMED,
      `help_confirmed_${requestId}_${helperUid}`,
      { sourceId: requestId, sourceType: 'request', note: `confirm_helper:${confirmCategory}` },
      now, isNewcomer, userPlan,
    );

    // Write confirmation record
    await db.ref(`help_confirmations/${requestId}/${helperUid}`).set({
      confirmedBy: authorUid,
      at: now,
      bonusAwarded: result.awarded,
    });

    // Increment pair frequency
    await incrementPairFrequency(db, authorUid, helperUid, now);

    await writeOpsEvent('bonus_help_confirmed', { authorUid, helperUid, requestId, awarded: result.awarded });

    return { ok: true, status: result.awarded ? 'confirmed' : result.reason, points: result.awarded ? BONUS_HELP_CONFIRMED : 0 };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  closeRequestWithBonus — Author closes request "solved" (+5 to author)
  // ────────────────────────────────────────────────────────────────────────
  fns.closeRequestWithBonus = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const requestId = String(data.requestId || '').trim();
    if (!requestId) throw new functions.https.HttpsError('invalid-argument', 'request_id_required');

    const authorUid = context.auth.uid;
    const now = Date.now();

    const reqSnap = await db.ref(`requests/${requestId}`).once('value');
    const reqVal = reqSnap.val();
    if (!reqVal) throw new functions.https.HttpsError('not-found', 'request_not_found');
    if (reqVal.userId !== authorUid) throw new functions.https.HttpsError('permission-denied', 'only_author_can_close');
    if (reqVal.status === 'closed') return { ok: true, status: 'already_closed', points: 0 };

    // Mark request as closed so helpers can no longer earn bonus on it
    await db.ref(`requests/${requestId}/status`).set('closed');

    const accessSnap = await db.ref(`trust_tree/${authorUid}/status`).once('value');
    const isNewcomer = accessSnap.val() !== 'active';

    // Load user's subscription plan for bonus multiplier
    const subSnap = await db.ref(`user_subscription/${authorUid}`).once('value');
    const userPlan = subSnap.val()?.plan || 'free';

    const result = await awardTrustBonus(
      db, authorUid, 'help', BONUS_AUTHOR_CLOSED,
      `request_closed_${requestId}`,
      { sourceId: requestId, sourceType: 'request', note: 'Author closed request' },
      now, isNewcomer, userPlan,
    );

    return { ok: true, status: result.awarded ? 'closed' : result.reason, points: result.awarded ? BONUS_AUTHOR_CLOSED : 0 };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  awardGratitudeBonus — Author thanks helper (+10 to helper)
  // ────────────────────────────────────────────────────────────────────────
  fns.awardGratitudeBonus = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const requestId = String(data.requestId || '').trim();
    const helperUid = String(data.helperUid || '').trim();
    if (!requestId || !helperUid) throw new functions.https.HttpsError('invalid-argument', 'missing_params');

    const authorUid = context.auth.uid;
    if (authorUid === helperUid) throw new functions.https.HttpsError('failed-precondition', 'cannot_thank_self');

    const now = Date.now();

    const reqSnap = await db.ref(`requests/${requestId}`).once('value');
    const reqVal = reqSnap.val();
    if (!reqVal) throw new functions.https.HttpsError('not-found', 'request_not_found');
    if (reqVal.userId !== authorUid) throw new functions.https.HttpsError('permission-denied', 'only_author_can_thank');

    // Verify confirmation exists (must confirm before thanking)
    const confirmSnap = await db.ref(`help_confirmations/${requestId}/${helperUid}`).once('value');
    if (!confirmSnap.exists()) throw new functions.https.HttpsError('failed-precondition', 'help_not_confirmed');

    const accessSnap = await db.ref(`trust_tree/${helperUid}/status`).once('value');
    const isNewcomer = accessSnap.val() !== 'active';

    // Load user's subscription plan for bonus multiplier
    const subSnap = await db.ref(`user_subscription/${helperUid}`).once('value');
    const userPlan = subSnap.val()?.plan || 'free';

    const gratCategory = reqVal.category || reqVal.subcategory || '';
    const result = await awardTrustBonus(
      db, helperUid, 'gratitude', BONUS_GRATITUDE,
      `gratitude_${requestId}_${authorUid}`,
      { sourceId: requestId, sourceType: 'request', note: `gratitude:${gratCategory}` },
      now, isNewcomer, userPlan,
    );

    return { ok: true, awarded: result.awarded, points: result.awarded ? BONUS_GRATITUDE : 0 };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  awardProfileThanksBonus — "Thank you" on someone's profile (+3)
  // ────────────────────────────────────────────────────────────────────────
  fns.awardProfileThanksBonus = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const targetUid = String(data.targetUid || '').trim();
    if (!targetUid) throw new functions.https.HttpsError('invalid-argument', 'target_uid_required');
    if (context.auth.uid === targetUid) throw new functions.https.HttpsError('failed-precondition', 'cannot_thank_self');

    const now = Date.now();
    const dayKey = getDayKey(now);

    // Rate limit: 1 thanks per sender per target per day
    const idempKey = `thanks_profile_${context.auth.uid}_${targetUid}_${dayKey}`;

    const accessSnap = await db.ref(`trust_tree/${targetUid}/status`).once('value');
    const isNewcomer = accessSnap.val() !== 'active';

    // Load user's subscription plan for bonus multiplier
    const subSnap = await db.ref(`user_subscription/${targetUid}`).once('value');
    const userPlan = subSnap.val()?.plan || 'free';

    const result = await awardTrustBonus(
      db, targetUid, 'gratitude', BONUS_THANKS_PROFILE,
      idempKey,
      { sourceId: context.auth.uid, sourceType: 'profile', note: 'Profile thanks' },
      now, isNewcomer, userPlan,
    );

    return { ok: true, awarded: result.awarded, points: result.awarded ? BONUS_THANKS_PROFILE : 0 };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  awardDailyLoginBonus — First login of the day (+1)
  // ────────────────────────────────────────────────────────────────────────
  fns.awardDailyLoginBonus = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const uid = context.auth.uid;
    const now = Date.now();
    const dayKey = getDayKey(now);

    const accessSnap = await db.ref(`trust_tree/${uid}/status`).once('value');
    const isNewcomer = accessSnap.val() !== 'active';

    // Load user's subscription plan for bonus multiplier
    const subSnap = await db.ref(`user_subscription/${uid}`).once('value');
    const userPlan = subSnap.val()?.plan || 'free';

    const result = await awardTrustBonus(
      db, uid, 'activity', BONUS_DAILY_LOGIN,
      `daily_login_${dayKey}`,
      { sourceId: dayKey, sourceType: 'activity', note: 'Daily login' },
      now, isNewcomer, userPlan,
    );

    return { ok: true, awarded: result.awarded, points: result.awarded ? BONUS_DAILY_LOGIN : 0 };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  awardMilestoneBonus — One-time milestone bonuses
  // ────────────────────────────────────────────────────────────────────────
  fns.awardMilestoneBonus = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const milestone = String(data.milestone || '').trim();
    const MILESTONES = {
      profile_complete: BONUS_PROFILE_COMPLETE,
      first_request: BONUS_FIRST_REQUEST,
      first_response: BONUS_FIRST_RESPONSE,
    };

    if (!MILESTONES[milestone]) throw new functions.https.HttpsError('invalid-argument', 'unknown_milestone');

    const uid = context.auth.uid;
    const now = Date.now();
    const points = MILESTONES[milestone];

    const accessSnap = await db.ref(`trust_tree/${uid}/status`).once('value');
    const isNewcomer = accessSnap.val() !== 'active';

    // Load user's subscription plan for bonus multiplier
    const subSnap = await db.ref(`user_subscription/${uid}`).once('value');
    const userPlan = subSnap.val()?.plan || 'free';

    const result = await awardTrustBonus(
      db, uid, 'activity', points,
      `milestone_${milestone}`,
      { sourceId: milestone, sourceType: 'activity', note: `Milestone: ${milestone}` },
      now, isNewcomer, userPlan,
    );

    return { ok: true, awarded: result.awarded, milestone, points: result.awarded ? points : 0 };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  adminGrantPromoCredits — Admin tops up promo credits after payment
  // ────────────────────────────────────────────────────────────────────────
  fns.adminGrantPromoCredits = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const role = await getRoleForUid(context.auth.uid);
    if (role !== 'admin') throw new functions.https.HttpsError('permission-denied', 'admin_only');

    const targetUid = String(data.targetUid || '').trim();
    const amount = Number(data.amount || 0);
    const reason = String(data.reason || '').trim();
    const ticketId = String(data.ticketId || '').trim();

    if (!targetUid) throw new functions.https.HttpsError('invalid-argument', 'target_uid_required');
    if (!amount || amount <= 0 || amount > 100000) throw new functions.https.HttpsError('invalid-argument', 'invalid_amount');
    if (!reason) throw new functions.https.HttpsError('invalid-argument', 'reason_required');

    // Idempotency: reject if this ticket was already paid
    if (ticketId) {
      const ticketSnap = await db.ref(`ad_tickets/${ticketId}`).once('value');
      const ticket = ticketSnap.val();
      if (!ticket) throw new functions.https.HttpsError('not-found', 'ticket_not_found');
      if (ticket.status === 'paid') throw new functions.https.HttpsError('already-exists', 'ticket_already_paid');
    }

    const now = Date.now();

    const result = await grantPromoCredits(db, targetUid, amount, context.auth.uid, reason, ticketId, now);

    // Mark ticket as paid so admin cannot double-grant
    if (ticketId) {
      await db.ref(`ad_tickets/${ticketId}`).update({
        status: 'paid',
        paidAt: now,
        paidByAdminUid: context.auth.uid,
        updatedAt: now,
      });
    }

    await writeOpsEvent('promo_credits_granted', {
      adminUid: context.auth.uid,
      targetUid,
      amount,
      reason,
      ticketId,
      newBalance: result.newBalance,
    });

    return { ok: true, newBalance: result.newBalance };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  adminAdjustPromoCredits — Admin adjusts (deduct/refund) credits
  // ────────────────────────────────────────────────────────────────────────
  fns.adminAdjustPromoCredits = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const role = await getRoleForUid(context.auth.uid);
    if (role !== 'admin') throw new functions.https.HttpsError('permission-denied', 'admin_only');

    const targetUid = String(data.targetUid || '').trim();
    const amount = Number(data.amount || 0); // positive = add, negative = deduct
    const reason = String(data.reason || '').trim();

    if (!targetUid) throw new functions.https.HttpsError('invalid-argument', 'target_uid_required');
    if (amount === 0) throw new functions.https.HttpsError('invalid-argument', 'amount_cannot_be_zero');
    if (Math.abs(amount) > 100000) throw new functions.https.HttpsError('invalid-argument', 'amount_too_large');
    if (!reason) throw new functions.https.HttpsError('invalid-argument', 'reason_required');

    const now = Date.now();
    let newBalance = 0;
    let adjusted = false;

    const creditsRef = db.ref(`${PROMO_CREDITS_PATH}/${targetUid}`);
    await creditsRef.transaction((current) => {
      const d = current && typeof current === 'object' ? { ...current } : {};
      const balance = Number(d.balance || 0) + amount;
      if (balance < 0) {
        newBalance = Number(d.balance || 0);
        adjusted = false;
        return current; // Can't go negative
      }
      newBalance = balance;
      adjusted = true;
      return {
        ...d,
        balance,
        lifetime: amount > 0 ? Number(d.lifetime || 0) + amount : Number(d.lifetime || 0),
        updatedAt: now,
      };
    });

    if (!adjusted) {
      return { ok: false, reason: 'would_go_negative', currentBalance: newBalance };
    }

    await writeBonusTransaction(db, targetUid, {
      type: 'admin_adjustment',
      currency: 'promo',
      category: 'admin',
      points: amount,
      balanceAfter: newBalance,
      sourceId: '',
      sourceType: 'admin',
      status: 'completed',
      createdAt: now,
      createdBy: context.auth.uid,
      note: reason,
    });

    await writeOpsEvent('promo_credits_adjusted', { adminUid: context.auth.uid, targetUid, amount, reason });

    return { ok: true, newBalance };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  adminAdjustTrustBonuses — Admin manually adjusts trust bonuses
  // ────────────────────────────────────────────────────────────────────────
  fns.adminAdjustTrustBonuses = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const role = await getRoleForUid(context.auth.uid);
    if (role !== 'admin') throw new functions.https.HttpsError('permission-denied', 'admin_only');

    const targetUid = String(data.targetUid || '').trim();
    const amount = Number(data.amount || 0);
    const reason = String(data.reason || '').trim();

    if (!targetUid) throw new functions.https.HttpsError('invalid-argument', 'target_uid_required');
    if (amount === 0) throw new functions.https.HttpsError('invalid-argument', 'amount_cannot_be_zero');
    if (Math.abs(amount) > 50000) throw new functions.https.HttpsError('invalid-argument', 'amount_too_large');
    if (!reason) throw new functions.https.HttpsError('invalid-argument', 'reason_required');

    const now = Date.now();
    let newTotal = 0;

    const bonusRef = db.ref(`${USER_BONUSES_PATH}/${targetUid}`);
    await bonusRef.transaction((current) => {
      const d = current && typeof current === 'object' ? { ...current } : {};
      const total = Number(d.total || 0) + amount;
      if (total < 0) return current; // Can't go negative

      const spent = d.spent && typeof d.spent === 'object' ? d.spent : { total: 0 };
      const available = total - Number(spent.total || 0);

      newTotal = total;
      return {
        ...d,
        total,
        available: Math.max(available, 0),
        earned: {
          ...(d.earned || {}),
          total,
        },
        badge: resolveBadge(total),
        updatedAt: now,
      };
    });

    await writeBonusTransaction(db, targetUid, {
      type: 'admin_adjustment',
      currency: 'trust',
      category: 'admin',
      points: amount,
      balanceAfter: newTotal,
      sourceId: '',
      sourceType: 'admin',
      status: 'completed',
      createdAt: now,
      createdBy: context.auth.uid,
      note: reason,
    });

    await writeOpsEvent('trust_bonus_adjusted', { adminUid: context.auth.uid, targetUid, amount, reason });

    return { ok: true, newTotal };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  adminBlockBonuses — Block/unblock bonus accrual for suspicious user
  // ────────────────────────────────────────────────────────────────────────
  fns.adminBlockBonusAccrual = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const role = await getRoleForUid(context.auth.uid);
    if (role !== 'admin') throw new functions.https.HttpsError('permission-denied', 'admin_only');

    const targetUid = String(data.targetUid || '').trim();
    const blocked = data.blocked === true;
    const reason = String(data.reason || '').trim();

    if (!targetUid) throw new functions.https.HttpsError('invalid-argument', 'target_uid_required');
    if (!reason) throw new functions.https.HttpsError('invalid-argument', 'reason_required');

    const now = Date.now();

    await db.ref(`bonus_blocks/${targetUid}`).set({
      blocked,
      reason,
      blockedBy: context.auth.uid,
      at: now,
    });

    await writeOpsEvent('bonus_block_changed', { adminUid: context.auth.uid, targetUid, blocked, reason });

    return { ok: true, blocked };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  getFraudFlags — Admin reads fraud flags
  // ────────────────────────────────────────────────────────────────────────
  fns.getFraudFlags = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const role = await getRoleForUid(context.auth.uid);
    if (role !== 'admin') throw new functions.https.HttpsError('permission-denied', 'admin_only');

    const limit = Math.min(Number(data.limit || 50), 200);
    const snap = await db.ref(FRAUD_FLAGS_PATH).orderByChild('at').limitToLast(limit).once('value');
    const flags = [];
    snap.forEach((child) => {
      flags.push({ id: child.key, ...child.val() });
    });

    return { ok: true, flags: flags.reverse() };
  });

  return fns;
};

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  createBonusFunctions,
  // Re-export utilities for use by promotionFunctions.js and index.js triggers
  awardTrustBonus,
  spendPromoCredits,
  spendTrustBonuses,
  writeBonusTransaction,
  resolveBadge,
  USER_BONUSES_PATH,
  PROMO_CREDITS_PATH,
  BONUS_TX_PATH,
  WEEKLY_LIMITS,
  BONUS_BADGES,
  BONUS_AUTHOR_CLOSED,
  BONUS_HELP_CONFIRMED,
  BONUS_GRATITUDE,
  getWeekKey,
  getDayKey,
  grantPromoCredits,
};

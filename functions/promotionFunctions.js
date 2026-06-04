/**
 * promotionFunctions.js — Cloud Functions for promotions & subscriptions
 *
 * Handles:
 * - purchaseBonusPromotion (trust or promo credits)
 * - expireBonusPromotions (scheduled cleanup)
 * - checkExpiringSubscriptions (daily notification sender)
 * - autoRenewSubscriptions (daily auto-renew)
 * - expireSubscriptions (hourly cleanup)
 *
 * Exports: createPromotionFunctions({ functions, functionsV1, admin, writeOpsEvent, writeOpsError, getRoleForUid })
 */

'use strict';

const {
  spendPromoCredits,
  spendTrustBonuses,
  writeBonusTransaction,
  resolveBadge,
  USER_BONUSES_PATH,
  PROMO_CREDITS_PATH,
} = require('./bonusFunctions');

// ─── Constants ───────────────────────────────────────────────────────────────

const PROMOTIONS_PATH = 'bonus_promotions';
const SUBSCRIPTIONS_PATH = 'promo_subscriptions';

// Badge requirements for trust-bonus promotions
const TRUST_PROMO_BADGE_REQUIREMENTS = {
  contacts_top: {
    '24h': { minBadge: 'good_neighbor', minPoints: 100 },
    '3d': { minBadge: 'active_resident', minPoints: 500 },
    '7d': { minBadge: 'active_resident', minPoints: 500 },
  },
  services_top: {
    '24h': { minBadge: 'active_resident', minPoints: 500 },
    '3d': { minBadge: 'active_resident', minPoints: 500 },
    '7d': { minBadge: 'guardian', minPoints: 2000 },
  },
};

// Pricing for trust bonuses (personal promotions)
const TRUST_PROMO_PRICES = {
  contacts_top: { '24h': 80, '3d': 200, '7d': 420 },
  services_top: { '24h': 100, '3d': 250, '7d': 500 },
};

// Pricing for promo credits (commercial promotions)
const PROMO_CREDIT_PRICES = {
  business_top: { '24h': 120, '3d': 300, '7d': 650, '30d': 2200 },
  beauty_salon_top: { '24h': 120, '7d': 650 },
  beauty_master_top: { '24h': 90, '7d': 480 },
  beauty_promo_top: { '24h': 100, '7d': 550 },
  kids_place_top: { '24h': 120, '7d': 650 },
  kids_club_top: { '24h': 100, '7d': 550 },
  kids_event_top: { '24h': 80, '7d': 420 },
  kids_promo_top: { '24h': 100, '7d': 550 },
};

// Duration in ms
const DURATION_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// Max simultaneous top slots per screen
const MAX_TOP_SLOTS = {
  contacts: 5,
  business: 10,
  beauty: 10,
  kids: 3,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isTrustPromotion = (promoType) =>
  promoType === 'contacts_top' || promoType === 'services_top';

const screenForPromoType = (promoType) => {
  if (promoType.startsWith('contacts') || promoType.startsWith('services')) return 'contacts';
  if (promoType.startsWith('business')) return 'business';
  if (promoType.startsWith('beauty')) return 'beauty';
  if (promoType.startsWith('kids')) return 'kids';
  return 'unknown';
};

// ─── Factory ─────────────────────────────────────────────────────────────────

const createPromotionFunctions = ({ functions, functionsV1, admin, writeOpsEvent, writeOpsError, getRoleForUid }) => {
  const db = admin.database();
  const fns = {};

  // ────────────────────────────────────────────────────────────────────────
  //  purchaseBonusPromotion — Buy a top placement with bonuses or credits
  // ────────────────────────────────────────────────────────────────────────
  fns.purchaseBonusPromotion = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const uid = context.auth.uid;
    const promoType = String(data.promoType || '').trim();   // e.g. 'contacts_top', 'business_top'
    const duration = String(data.duration || '').trim();       // '24h', '3d', '7d', '30d'
    const targetId = String(data.targetId || '').trim();       // listing/profile ID to promote

    if (!promoType || !duration || !targetId) {
      throw new functions.https.HttpsError('invalid-argument', 'promo_type_duration_target_required');
    }

    if (!DURATION_MS[duration]) {
      throw new functions.https.HttpsError('invalid-argument', 'invalid_duration');
    }

    const now = Date.now();
    const useTrust = isTrustPromotion(promoType);

    // Determine price
    const priceTable = useTrust ? TRUST_PROMO_PRICES : PROMO_CREDIT_PRICES;
    if (!priceTable[promoType] || !priceTable[promoType][duration]) {
      throw new functions.https.HttpsError('invalid-argument', 'invalid_promo_type_or_duration');
    }
    const price = priceTable[promoType][duration];

    // Badge requirement check (trust promotions only)
    if (useTrust) {
      const req = TRUST_PROMO_BADGE_REQUIREMENTS[promoType]?.[duration];
      if (req) {
        const bonusSnap = await db.ref(`${USER_BONUSES_PATH}/${uid}`).once('value');
        const bonusData = bonusSnap.val() || {};
        const total = Number(bonusData.total || 0);
        if (total < req.minPoints) {
          throw new functions.https.HttpsError('failed-precondition', `min_badge_${req.minBadge}_required`);
        }
        // Newcomer restriction
        const accessSnap = await db.ref(`trust_tree/${uid}/status`).once('value');
        if (accessSnap.val() !== 'active') {
          throw new functions.https.HttpsError('failed-precondition', 'access_not_confirmed');
        }
      }
    }

    // FIX BUG 7: Verify target ownership — user can only promote their own content
    if (promoType === 'contacts_top') {
      // For contacts, targetId must be the user's own UID
      if (targetId !== uid) {
        throw new functions.https.HttpsError('permission-denied', 'can_only_promote_own_profile');
      }
    } else if (promoType === 'services_top') {
      // Check contacts_listings ownership
      const listingSnap = await db.ref(`contacts_listings/${targetId}/userId`).once('value');
      if (listingSnap.val() !== uid) {
        throw new functions.https.HttpsError('permission-denied', 'can_only_promote_own_listing');
      }
    } else if (promoType === 'business_top') {
      // Check biznes_chaika_listings or local_business ownership
      const bizSnap = await db.ref(`biznes_chaika_listings/${targetId}/userId`).once('value');
      const localSnap = bizSnap.val() ? null : await db.ref(`local_business/${targetId}/userId`).once('value');
      const ownerId = bizSnap.val() || (localSnap && localSnap.val());
      if (ownerId !== uid) {
        throw new functions.https.HttpsError('permission-denied', 'can_only_promote_own_business');
      }
    } else {
      // For beauty/kids types — check the relevant collection
      // The listing must have userId === uid in the corresponding collection
      const collections = {
        beauty_salon_top: 'contacts_listings',
        beauty_master_top: 'contacts_listings',
        beauty_promo_top: 'contacts_listings',
        kids_place_top: 'contacts_listings',
        kids_club_top: 'contacts_listings',
        kids_event_top: 'contacts_listings',
        kids_promo_top: 'contacts_listings',
      };
      const collection = collections[promoType];
      if (collection) {
        const itemSnap = await db.ref(`${collection}/${targetId}/userId`).once('value');
        if (itemSnap.val() !== uid) {
          throw new functions.https.HttpsError('permission-denied', 'can_only_promote_own_listing');
        }
      }
    }

    // Check max top slots on the screen
    const screen = screenForPromoType(promoType);
    const maxSlots = MAX_TOP_SLOTS[screen] || 10;
    const activeSnap = await db.ref(PROMOTIONS_PATH)
      .orderByChild('screen')
      .equalTo(screen)
      .once('value');
    let activeCount = 0;
    if (activeSnap.exists()) {
      activeSnap.forEach((child) => {
        const v = child.val();
        if (v.status === 'active' && v.moderationStatus === 'approved' && v.expiresAt > now) {
          activeCount++;
        }
      });
    }
    if (activeCount >= maxSlots) {
      throw new functions.https.HttpsError('failed-precondition', 'max_top_slots_reached');
    }

    // Check no conflicting active promotion for this user+target
    if (activeSnap.exists()) {
      let conflict = false;
      activeSnap.forEach((child) => {
        const v = child.val();
        if (v.uid === uid && v.targetId === targetId && v.status === 'active' && v.expiresAt > now) {
          conflict = true;
        }
      });
      if (conflict) {
        throw new functions.https.HttpsError('failed-precondition', 'already_has_active_promotion');
      }
    }

    // Spend currency
    let spendResult;
    if (useTrust) {
      spendResult = await spendTrustBonuses(db, uid, price, promoType.replace('_top', 'Top'), targetId, now);
    } else {
      spendResult = await spendPromoCredits(db, uid, price, promoType.replace('_top', 'Top'), targetId, now);
    }

    if (!spendResult.spent) {
      throw new functions.https.HttpsError('failed-precondition', spendResult.reason || 'insufficient_funds');
    }

    // Create promotion record
    const promoRef = db.ref(PROMOTIONS_PATH).push();
    const promotion = {
      uid,
      currency: useTrust ? 'trust' : 'promo',
      targetType: promoType.replace('_top', ''),
      targetId,
      screen,
      pointsSpent: price,
      status: 'active',
      startsAt: now,
      expiresAt: now + DURATION_MS[duration],
      createdAt: now,
      // Trust promotions for contacts/services → auto-approved if profile passed moderation
      // Promo credit promotions → require moderation
      moderationStatus: useTrust ? 'approved' : 'pending',
      badge: useTrust ? 'bonus_promoted' : 'partner',
    };

    await promoRef.set(promotion);

    await writeOpsEvent('promotion_purchased', {
      uid, promoType, duration, price, currency: promotion.currency, promotionId: promoRef.key,
    });

    return {
      ok: true,
      promotionId: promoRef.key,
      expiresAt: promotion.expiresAt,
      moderationStatus: promotion.moderationStatus,
    };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  adminModeratePromotion — Approve/reject a pending promotion
  // ────────────────────────────────────────────────────────────────────────
  fns.adminModeratePromotion = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const role = await getRoleForUid(context.auth.uid);
    if (role !== 'admin') throw new functions.https.HttpsError('permission-denied', 'admin_only');

    const promotionId = String(data.promotionId || '').trim();
    const action = String(data.action || '').trim(); // 'approve' | 'reject'
    const reason = String(data.reason || '').trim();

    if (!promotionId) throw new functions.https.HttpsError('invalid-argument', 'promotion_id_required');
    if (action !== 'approve' && action !== 'reject') {
      throw new functions.https.HttpsError('invalid-argument', 'action_must_be_approve_or_reject');
    }

    const now = Date.now();

    const promoSnap = await db.ref(`${PROMOTIONS_PATH}/${promotionId}`).once('value');
    if (!promoSnap.exists()) throw new functions.https.HttpsError('not-found', 'promotion_not_found');

    const promo = promoSnap.val();

    if (action === 'approve') {
      await db.ref(`${PROMOTIONS_PATH}/${promotionId}`).update({
        moderationStatus: 'approved',
        moderatedBy: context.auth.uid,
        moderatedAt: now,
      });
    } else {
      // Reject → refund credits
      await db.ref(`${PROMOTIONS_PATH}/${promotionId}`).update({
        status: 'cancelled',
        moderationStatus: 'rejected',
        moderatedBy: context.auth.uid,
        moderatedAt: now,
        moderationNote: reason,
      });

      // Refund
      if (promo.currency === 'promo') {
        const creditsRef = db.ref(`${PROMO_CREDITS_PATH}/${promo.uid}`);
        await creditsRef.transaction((current) => {
          const d = current && typeof current === 'object' ? { ...current } : {};
          return {
            ...d,
            balance: Number(d.balance || 0) + promo.pointsSpent,
            updatedAt: now,
          };
        });
      } else {
        const bonusRef = db.ref(`${USER_BONUSES_PATH}/${promo.uid}`);
        await bonusRef.transaction((current) => {
          const d = current && typeof current === 'object' ? { ...current } : {};
          const spent = d.spent && typeof d.spent === 'object' ? { ...d.spent } : { total: 0 };
          spent.total = Math.max(Number(spent.total || 0) - promo.pointsSpent, 0);
          const available = Number(d.total || 0) - spent.total;
          return { ...d, spent, available: Math.max(available, 0), updatedAt: now };
        });
      }

      await writeBonusTransaction(db, promo.uid, {
        type: 'refund',
        currency: promo.currency,
        category: 'promotion_rejected',
        points: promo.pointsSpent,
        balanceAfter: 0, // Will be updated in the read
        sourceId: promotionId,
        sourceType: 'promotion',
        status: 'completed',
        createdAt: now,
        createdBy: context.auth.uid,
        note: reason || 'Promotion rejected by admin',
      });
    }

    await writeOpsEvent('promotion_moderated', {
      adminUid: context.auth.uid, promotionId, action, reason,
    });

    return { ok: true, action };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  expireBonusPromotions — Scheduled: mark expired promotions (hourly)
  // ────────────────────────────────────────────────────────────────────────
  fns.expireBonusPromotions = functions.pubsub
    .schedule('every 60 minutes')
    .onRun(async () => {
      const now = Date.now();

      const snap = await db.ref(PROMOTIONS_PATH)
        .orderByChild('expiresAt')
        .endAt(now)
        .once('value');

      if (!snap.exists()) return null;

      const updates = {};
      let count = 0;

      snap.forEach((child) => {
        const v = child.val();
        if (v.status === 'active') {
          updates[`${PROMOTIONS_PATH}/${child.key}/status`] = 'expired';
          updates[`${PROMOTIONS_PATH}/${child.key}/expiredAt`] = now;
          count++;
        }
      });

      if (count > 0) {
        await db.ref().update(updates);
        await writeOpsEvent('promotions_expired', { count });
      }

      return null;
    });

  // ────────────────────────────────────────────────────────────────────────
  //  createPromoSubscription — User creates a 30-day subscription
  // ────────────────────────────────────────────────────────────────────────
  fns.createPromoSubscription = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const uid = context.auth.uid;
    const promoType = String(data.promoType || '').trim();
    const targetId = String(data.targetId || '').trim();
    const autoRenew = data.autoRenew !== false; // default true

    if (!promoType || !targetId) {
      throw new functions.https.HttpsError('invalid-argument', 'promo_type_and_target_required');
    }

    // Only promo credit subscriptions (commercial)
    if (isTrustPromotion(promoType)) {
      throw new functions.https.HttpsError('invalid-argument', 'subscriptions_only_for_promo_credits');
    }

    const priceTable = PROMO_CREDIT_PRICES[promoType];
    if (!priceTable || !priceTable['30d']) {
      throw new functions.https.HttpsError('invalid-argument', 'no_30d_plan_for_this_type');
    }
    const price = priceTable['30d'];

    const now = Date.now();

    // FIX BUG 6: Check for existing active subscription on same target
    const existingSubsSnap = await db.ref(`${SUBSCRIPTIONS_PATH}/${uid}`).once('value');
    if (existingSubsSnap.exists()) {
      let duplicateFound = false;
      existingSubsSnap.forEach((child) => {
        const s = child.val();
        if (s.targetId === targetId && (s.status === 'active' || s.status === 'expiring') && s.expiresAt > now) {
          duplicateFound = true;
        }
      });
      if (duplicateFound) {
        throw new functions.https.HttpsError('failed-precondition', 'active_subscription_already_exists');
      }
    }

    // Spend credits
    const spendResult = await spendPromoCredits(db, uid, price, promoType.replace('_top', 'Top'), targetId, now);
    if (!spendResult.spent) {
      throw new functions.https.HttpsError('failed-precondition', spendResult.reason || 'insufficient_credits');
    }

    const screen = screenForPromoType(promoType);

    // Create subscription
    const subRef = db.ref(`${SUBSCRIPTIONS_PATH}/${uid}`).push();
    await subRef.set({
      uid,
      targetType: promoType.replace('_top', ''),
      targetId,
      screen,
      plan: '30d',
      creditsPerPeriod: price,
      autoRenew,
      status: 'active',
      startsAt: now,
      expiresAt: now + DURATION_MS['30d'],
      renewedAt: null,
      renewCount: 0,
      notifiedDays: [],
      createdAt: now,
      updatedAt: now,
    });

    // Create associated promotion
    const promoRef = db.ref(PROMOTIONS_PATH).push();
    await promoRef.set({
      uid,
      currency: 'promo',
      targetType: promoType.replace('_top', ''),
      targetId,
      screen,
      pointsSpent: price,
      status: 'active',
      startsAt: now,
      expiresAt: now + DURATION_MS['30d'],
      createdAt: now,
      moderationStatus: 'pending',
      badge: 'partner',
      subscriptionId: subRef.key,
    });

    await writeOpsEvent('subscription_created', {
      uid, promoType, price, subscriptionId: subRef.key, promotionId: promoRef.key,
    });

    return { ok: true, subscriptionId: subRef.key, promotionId: promoRef.key, expiresAt: now + DURATION_MS['30d'] };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  toggleAutoRenew — User toggles auto-renew on their subscription
  // ────────────────────────────────────────────────────────────────────────
  fns.toggleAutoRenew = functions.https.onCall(async (data, context) => {
    if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'auth_required');

    const subscriptionId = String(data.subscriptionId || '').trim();
    if (!subscriptionId) throw new functions.https.HttpsError('invalid-argument', 'subscription_id_required');

    const uid = context.auth.uid;
    const subSnap = await db.ref(`${SUBSCRIPTIONS_PATH}/${uid}/${subscriptionId}`).once('value');
    if (!subSnap.exists()) throw new functions.https.HttpsError('not-found', 'subscription_not_found');

    const sub = subSnap.val();
    const newAutoRenew = !sub.autoRenew;

    await db.ref(`${SUBSCRIPTIONS_PATH}/${uid}/${subscriptionId}`).update({
      autoRenew: newAutoRenew,
      updatedAt: Date.now(),
    });

    return { ok: true, autoRenew: newAutoRenew };
  });

  // ────────────────────────────────────────────────────────────────────────
  //  checkExpiringSubscriptions — Scheduled daily: send notifications
  // ────────────────────────────────────────────────────────────────────────
  fns.checkExpiringSubscriptions = functions.pubsub
    .schedule('every day 09:00')
    .timeZone('Europe/Kyiv')
    .onRun(async () => {
      const now = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;
      const notifyDays = [5, 4, 3, 2, 1];
      let notifiedCount = 0;

      // Read all subscriptions (iterate per-user)
      const allSubsSnap = await db.ref(SUBSCRIPTIONS_PATH).once('value');
      if (!allSubsSnap.exists()) return null;

      const updates = {};

      allSubsSnap.forEach((userSnap) => {
        const uid = userSnap.key;
        userSnap.forEach((subSnap) => {
          const sub = subSnap.val();
          if (sub.status !== 'active' && sub.status !== 'expiring') return;

          const daysLeft = Math.ceil((sub.expiresAt - now) / DAY_MS);

          for (const day of notifyDays) {
            if (daysLeft === day) {
              const notified = Array.isArray(sub.notifiedDays) ? sub.notifiedDays : [];
              if (!notified.includes(day)) {
                // Mark as notified
                const newNotified = [...notified, day];
                updates[`${SUBSCRIPTIONS_PATH}/${uid}/${subSnap.key}/notifiedDays`] = newNotified;
                if (daysLeft <= 2) {
                  updates[`${SUBSCRIPTIONS_PATH}/${uid}/${subSnap.key}/status`] = 'expiring';
                }
                notifiedCount++;

                // Push notification record (queued for batch write)
                updates[`notifications/${uid}/${db.ref('notifications').push().key}`] = {
                  type: 'subscription_expiring',
                  subscriptionId: subSnap.key,
                  daysLeft: day,
                  targetType: sub.targetType,
                  targetId: sub.targetId,
                  message: `subscription_expires_in_${day}_days`,
                  createdAt: now,
                  read: false,
                };
              }
            }
          }
        });
      });

      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }

      if (notifiedCount > 0) {
        await writeOpsEvent('subscriptions_notified', { count: notifiedCount });
      }

      return null;
    });

  // ────────────────────────────────────────────────────────────────────────
  //  autoRenewSubscriptions — Scheduled daily: auto-renew if sufficient credits
  // ────────────────────────────────────────────────────────────────────────
  fns.autoRenewSubscriptions = functions.pubsub
    .schedule('every day 10:00')
    .timeZone('Europe/Kyiv')
    .onRun(async () => {
      const now = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;
      let renewedCount = 0;
      let failedCount = 0;

      const allSubsSnap = await db.ref(SUBSCRIPTIONS_PATH).once('value');
      if (!allSubsSnap.exists()) return null;

      const toRenew = [];

      allSubsSnap.forEach((userSnap) => {
        const uid = userSnap.key;
        userSnap.forEach((subSnap) => {
          const sub = subSnap.val();
          if (!sub.autoRenew) return;
          if (sub.status !== 'active' && sub.status !== 'expiring') return;

          const daysLeft = Math.ceil((sub.expiresAt - now) / DAY_MS);
          if (daysLeft <= 1) {
            toRenew.push({ uid, subId: subSnap.key, sub });
          }
        });
      });

      for (const { uid, subId, sub } of toRenew) {
        const price = sub.creditsPerPeriod;

        // Try to spend credits
        const spendResult = await spendPromoCredits(
          db, uid, price,
          `${sub.targetType}Top`,
          sub.targetId, now,
        );

        if (spendResult.spent) {
          // Extend subscription
          const newExpiresAt = sub.expiresAt + DURATION_MS['30d'];
          await db.ref(`${SUBSCRIPTIONS_PATH}/${uid}/${subId}`).update({
            expiresAt: newExpiresAt,
            renewedAt: now,
            renewCount: Number(sub.renewCount || 0) + 1,
            status: 'active',
            notifiedDays: [], // Reset notifications for new period
            updatedAt: now,
          });

          // Update associated promotion expiry
          const promosSnap = await db.ref(PROMOTIONS_PATH)
            .orderByChild('uid')
            .equalTo(uid)
            .once('value');

          if (promosSnap.exists()) {
            const promoUpdates = {};
            promosSnap.forEach((promoChild) => {
              const p = promoChild.val();
              if (p.subscriptionId === subId && (p.status === 'active' || p.status === 'expired')) {
                promoUpdates[`${PROMOTIONS_PATH}/${promoChild.key}/expiresAt`] = newExpiresAt;
                promoUpdates[`${PROMOTIONS_PATH}/${promoChild.key}/status`] = 'active';
              }
            });
            if (Object.keys(promoUpdates).length > 0) {
              await db.ref().update(promoUpdates);
            }
          }

          renewedCount++;
        } else {
          // Not enough credits — notify
          await db.ref(`notifications/${uid}`).push({
            type: 'subscription_renew_failed',
            subscriptionId: subId,
            reason: 'insufficient_credits',
            creditsNeeded: price,
            message: 'subscription_renew_failed_insufficient_credits',
            createdAt: now,
            read: false,
          });
          failedCount++;
        }
      }

      if (renewedCount > 0 || failedCount > 0) {
        await writeOpsEvent('subscriptions_auto_renew', { renewed: renewedCount, failed: failedCount });
      }

      return null;
    });

  // ────────────────────────────────────────────────────────────────────────
  //  expireSubscriptions — Scheduled hourly: expire overdue subscriptions
  // ────────────────────────────────────────────────────────────────────────
  fns.expireSubscriptions = functions.pubsub
    .schedule('every 60 minutes')
    .onRun(async () => {
      const now = Date.now();
      let expiredCount = 0;

      const allSubsSnap = await db.ref(SUBSCRIPTIONS_PATH).once('value');
      if (!allSubsSnap.exists()) return null;

      const updates = {};

      allSubsSnap.forEach((userSnap) => {
        const uid = userSnap.key;
        userSnap.forEach((subSnap) => {
          const sub = subSnap.val();
          if ((sub.status === 'active' || sub.status === 'expiring') && sub.expiresAt <= now) {
            updates[`${SUBSCRIPTIONS_PATH}/${uid}/${subSnap.key}/status`] = 'expired';
            updates[`${SUBSCRIPTIONS_PATH}/${uid}/${subSnap.key}/updatedAt`] = now;
            expiredCount++;

            // Notify (included in batch update)
            updates[`notifications/${uid}/${db.ref('notifications').push().key}`] = {
              type: 'subscription_expired',
              subscriptionId: subSnap.key,
              targetType: sub.targetType,
              message: 'subscription_expired',
              createdAt: now,
              read: false,
            };
          }
        });
      });

      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }

      if (expiredCount > 0) {
        await writeOpsEvent('subscriptions_expired', { count: expiredCount });
      }

      return null;
    });

  return fns;
};

module.exports = { createPromotionFunctions };

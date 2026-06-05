import { get, limitToLast, query, ref } from 'firebase/database';
import { database } from '../firebase/firebase';
import firebaseRules from '../../../firebase.rules.json';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DenialCategory =
  | 'permission_denied'
  | 'write_session_anonymous'
  | 'write_session_auth_mismatch'
  | 'yellow_list'
  | 'daily_limit'
  | 'schema_mismatch'
  | 'unknown';

export type DenialEntry = {
  id: string;
  at: number;
  screen: string;
  action: string;
  firebasePath: string;
  uid: string;
  authUid: string;
  rawMessage: string;
  category: DenialCategory;
  recommendation: string;
  isAnonymous: boolean;
  appVersion: string;
};

export type RulesAuditResult = {
  collection: string;
  readRule: string;
  writeRule: string;
  checks: {
    authRequired: boolean;
    anonymousBlocked: boolean;
    userIdMatch: boolean;
    yellowListGuard: boolean;
    adminBypass: boolean;
    statusProtection: boolean;
  };
  warnings: string[];
};

export type DenialAggregates = {
  total24h: number;
  byCategory: Record<DenialCategory, number>;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const getString = (v: unknown): string => (typeof v === 'string' ? v : '');
const getNum = (v: unknown): number => (Number.isFinite(v) ? Number(v) : 0);

const ALL_CATEGORIES: DenialCategory[] = [
  'permission_denied',
  'write_session_anonymous',
  'write_session_auth_mismatch',
  'yellow_list',
  'daily_limit',
  'schema_mismatch',
  'unknown',
];

// ─── categorizeReason ───────────────────────────────────────────────────────

/** Classify raw error text into a known denial category. */
export const categorizeReason = (rawText: string): DenialCategory => {
  const lower = rawText.toLowerCase();

  if (lower.includes('permission_denied') || lower.includes('permission-denied')) {
    return 'permission_denied';
  }
  if (lower.includes('write_session_anonymous') || lower.includes('write_session_no_auth')) {
    return 'write_session_anonymous';
  }
  if (lower.includes('write_session_auth_mismatch') || lower.includes('write_session_token_refresh_failed')) {
    return 'write_session_auth_mismatch';
  }
  if (lower.includes('yellow_list') || lower.includes('banned')) {
    return 'yellow_list';
  }
  if ((lower.includes('daily') && lower.includes('limit')) || lower.includes('limit reached')) {
    return 'daily_limit';
  }
  if ((lower.includes('invalid') && lower.includes('payload')) || lower.includes('missing fields')) {
    return 'schema_mismatch';
  }

  return 'unknown';
};

// ─── getRecommendation ──────────────────────────────────────────────────────

/** Return a short recommendation string based on the denial category. */
export const getRecommendation = (category: DenialCategory): string => {
  switch (category) {
    case 'permission_denied':
      return 'проверить rules';
    case 'write_session_anonymous':
      return 'перезайти в аккаунт';
    case 'write_session_auth_mismatch':
      return 'перезайти — uid не совпадает';
    case 'yellow_list':
      return 'проверить yellow_list';
    case 'daily_limit':
      return 'лимит исчерпан';
    case 'schema_mismatch':
      return 'payload должен содержать userId';
    case 'unknown':
    default:
      return 'проверить логи';
  }
};

// ─── normalizeEntry ─────────────────────────────────────────────────────────

/** Normalize a raw RTDB record into a DenialEntry. */
const normalizeEntry = (id: string, raw: Record<string, unknown>): DenialEntry | null => {
  // diagnostics/runtime_moderation wrapper: { fingerprint, uid, submittedAt, entry: {...}, reporter: {...} }
  const entryRaw =
    raw.entry && typeof raw.entry === 'object'
      ? (raw.entry as Record<string, unknown>)
      : raw;

  const at =
    getNum(raw.submittedAt) ||
    getNum(entryRaw.at) ||
    getNum(raw.at) ||
    getNum(entryRaw.createdAt) ||
    getNum(raw.createdAt) ||
    getNum(entryRaw.created_at) ||
    getNum(raw.created_at) ||
    getNum(entryRaw.timestamp) ||
    getNum(raw.timestamp);

  if (!at) return null;

  const reporter =
    raw.reporter && typeof raw.reporter === 'object'
      ? (raw.reporter as Record<string, unknown>)
      : {};

  // Combine all text fields for categorization
  const allText = [
    getString(entryRaw.rawMessage),
    getString(entryRaw.humanMessage),
    getString(entryRaw.message),
    getString(entryRaw.code),
    getString(entryRaw.firebaseCode),
    getString(entryRaw.type),
    getString(raw.type),
    getString(raw.code),
    getString(raw.message),
  ]
    .filter(Boolean)
    .join(' ');

  const category = categorizeReason(allText);
  const recommendation = getRecommendation(category);

  const isAnonymous =
    entryRaw.isAnonymous === true ||
    raw.isAnonymous === true ||
    getString(entryRaw.signInProvider) === 'anonymous' ||
    category === 'write_session_anonymous';

  return {
    id,
    at,
    screen: getString(entryRaw.screen) || getString(entryRaw.functionName) || getString(raw.screen) || '',
    action: getString(entryRaw.action) || getString(raw.action) || '',
    firebasePath: getString(entryRaw.firebasePath) || getString(raw.firebasePath) || '',
    uid: getString(raw.uid) || getString(reporter.userId) || getString(entryRaw.uid) || '',
    authUid: getString(entryRaw.authUid) || getString(raw.authUid) || getString(reporter.authUid) || '',
    rawMessage: allText || getString(entryRaw.rawMessage) || getString(raw.message) || '',
    category,
    recommendation,
    isAnonymous,
    appVersion: getString(entryRaw.appVersion) || getString(raw.appVersion) || '',
  };
};

// ─── fetchSubmissionDenials ─────────────────────────────────────────────────

/**
 * Fetch ALL denial/error entries from `diagnostics/runtime_moderation` and `ops/errors`.
 * Returns up to 100 entries sorted by time descending.
 */
export const fetchSubmissionDenials = async (): Promise<DenialEntry[]> => {
  const [richSnapshot, opsSnapshot] = await Promise.all([
    get(query(ref(database, 'diagnostics/runtime_moderation'), limitToLast(300))).catch(() => null),
    get(query(ref(database, 'ops/errors'), limitToLast(300))).catch(() => null),
  ]);

  const seen = new Set<string>();
  const results: DenialEntry[] = [];

  // Primary source: diagnostics/runtime_moderation (richer data)
  const richRaw = richSnapshot?.val();
  if (richRaw && typeof richRaw === 'object') {
    for (const [id, value] of Object.entries(richRaw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const entry = normalizeEntry(id, value as Record<string, unknown>);
      if (entry) {
        results.push(entry);
        seen.add(id);
      }
    }
  }

  // Secondary source: ops/errors (catches entries not in runtime_moderation)
  const opsRaw = opsSnapshot?.val();
  if (opsRaw && typeof opsRaw === 'object') {
    for (const [id, value] of Object.entries(opsRaw as Record<string, unknown>)) {
      if (seen.has(id) || !value || typeof value !== 'object') continue;
      const entry = normalizeEntry(id, value as Record<string, unknown>);
      if (entry) results.push(entry);
    }
  }

  // Sort by time descending, limit to 100
  return results.sort((a, b) => b.at - a.at).slice(0, 100);
};

// ─── computeDenialAggregates ────────────────────────────────────────────────

/** Compute aggregate counts: total in last 24h and breakdown by category. */
export const computeDenialAggregates = (entries: DenialEntry[]): DenialAggregates => {
  const since24h = Date.now() - 24 * 60 * 60 * 1000;

  const byCategory = Object.fromEntries(
    ALL_CATEGORIES.map((cat) => [cat, 0]),
  ) as Record<DenialCategory, number>;

  let total24h = 0;

  for (const entry of entries) {
    if (entry.at >= since24h) {
      total24h += 1;
      byCategory[entry.category] += 1;
    }
  }

  return { total24h, byCategory };
};

// ─── detectRisks ────────────────────────────────────────────────────────────

/** Analyze entries and return an array of human-readable risk strings. */
export const detectRisks = (entries: DenialEntry[]): string[] => {
  const risks: string[] = [];

  const hasAnonymousSession = entries.some(
    (e) => e.category === 'write_session_anonymous',
  );
  if (hasAnonymousSession) {
    risks.push('Є користувачі з Redux userId, але anonymous Firebase session');
  }

  const hasMissingUserId = entries.some(
    (e) => e.rawMessage.toLowerCase().includes('uid') && !e.rawMessage.toLowerCase().includes('userid'),
  );
  if (hasMissingUserId) {
    risks.push('Є записи з payload без userId');
  }

  const hasPermDeniedWithScreen = entries.some(
    (e) => e.category === 'permission_denied' && e.screen !== '',
  );
  if (hasPermDeniedWithScreen) {
    risks.push('Є permission_denied після реєстрації');
  }

  // Detect spike: >5 entries from same screen within any 1-hour window
  const byScreen = new Map<string, number[]>();
  for (const entry of entries) {
    if (!entry.screen) continue;
    const times = byScreen.get(entry.screen) ?? [];
    times.push(entry.at);
    byScreen.set(entry.screen, times);
  }

  const ONE_HOUR = 60 * 60 * 1000;
  for (const [screen, times] of byScreen.entries()) {
    if (times.length <= 5) continue;
    // Sort ascending to check sliding window
    const sorted = [...times].sort((a, b) => a - b);
    for (let i = 0; i <= sorted.length - 6; i++) {
      if (sorted[i + 5] - sorted[i] <= ONE_HOUR) {
        risks.push(`Сплеск відмов на екрані: ${screen}`);
        break;
      }
    }
  }

  return risks;
};

// ─── auditPublishRules ──────────────────────────────────────────────────────

/** Collections to audit for proper publish-time security rules. */
const AUDIT_COLLECTIONS: string[] = [
  'requests',
  'contacts_listings',
  'buy_sell_listings',
  'job_listings',
  'lost_found',
  'local_business',
  'biznes_chaika_listings',
  'community_photos',
  'community_photos_public',
  'food_top_listings',
  'app_suggestions',
  'osbb_news',
];

/**
 * Parse firebase.rules.json and audit each publish collection for
 * required security checks (auth, anonymous block, userId match, etc.).
 */
export const auditPublishRules = (): RulesAuditResult[] => {
  const rules = (firebaseRules as { rules: Record<string, unknown> }).rules;

  return AUDIT_COLLECTIONS.map((collection) => {
    const collectionRules = rules[collection] as Record<string, unknown> | undefined;
    const warnings: string[] = [];

    if (!collectionRules) {
      warnings.push(`Collection "${collection}" not found in firebase.rules.json`);
      return {
        collection,
        readRule: '',
        writeRule: '',
        checks: {
          authRequired: false,
          anonymousBlocked: false,
          userIdMatch: false,
          yellowListGuard: false,
          adminBypass: false,
          statusProtection: false,
        },
        warnings,
      };
    }

    // Read rule is at collection level
    const readRule = getString(collectionRules['.read']);

    // Write rule: look at the wildcard child ($...Id) level
    let writeRule = '';
    const wildcardKey = Object.keys(collectionRules).find((k) => k.startsWith('$'));
    if (wildcardKey) {
      const wildcardRules = collectionRules[wildcardKey] as Record<string, unknown> | undefined;
      writeRule = getString(wildcardRules?.['.write']);
    }

    // If no wildcard write rule, check collection-level .write
    if (!writeRule) {
      writeRule = getString(collectionRules['.write']);
    }

    const writeLower = writeRule.toLowerCase();

    // Check: auth != null
    const authRequired = writeLower.includes('auth != null') || writeLower.includes('auth!= null') || writeLower.includes('auth !=null');
    if (!authRequired) {
      warnings.push(`"${collection}": write rule does not require auth != null`);
    }

    // Check: anonymous sign-in provider blocked
    const anonymousBlocked =
      writeLower.includes("sign_in_provider") && writeLower.includes("anonymous");
    if (!anonymousBlocked) {
      warnings.push(`"${collection}": write rule does not block anonymous users`);
    }

    // Check: userId === auth.uid match
    const userIdMatch =
      writeLower.includes('userid') && writeLower.includes('auth.uid');
    if (!userIdMatch) {
      warnings.push(`"${collection}": write rule does not verify userId === auth.uid`);
    }

    // Check: yellow_list guard
    const yellowListGuard = writeLower.includes('yellow_list');
    if (!yellowListGuard) {
      warnings.push(`"${collection}": write rule does not check yellow_list`);
    }

    // Check: admin or moderator bypass
    const adminBypass =
      writeLower.includes("'admin'") || writeLower.includes('"admin"');
    if (!adminBypass) {
      warnings.push(`"${collection}": write rule does not have admin/moderator bypass`);
    }

    // Check: approved/rejected protection (prevents user from setting status to approved/rejected)
    const statusProtection =
      (writeLower.includes("'approved'") || writeLower.includes('"approved"')) &&
      (writeLower.includes("'rejected'") || writeLower.includes('"rejected"'));
    if (!statusProtection) {
      warnings.push(`"${collection}": write rule does not protect approved/rejected status`);
    }

    return {
      collection,
      readRule,
      writeRule,
      checks: {
        authRequired,
        anonymousBlocked,
        userIdMatch,
        yellowListGuard,
        adminBypass,
        statusProtection,
      },
      warnings,
    };
  });
};

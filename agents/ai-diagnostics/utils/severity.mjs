export const SEVERITY = { CRITICAL: 'CRITICAL', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', INFO: 'INFO' };

// Base penalty per finding severity (used in exponential formula)
const SEVERITY_PENALTY = { CRITICAL: 30, HIGH: 8, MEDIUM: 2, LOW: 0.5, INFO: 0 };

// File weight multiplier: higher-weight files penalize score more
const FILE_WEIGHT_MAP = [
  // Test/spec files — do not affect score, not production code
  { pattern: /__tests__|__mocks__|\.test\.[tj]sx?$|\.spec\.[tj]sx?$/i, weight: 0.0 },
  // Critical infrastructure
  { pattern: /firebase-core|firebase-config/i, weight: 2.0 },
  // Core business logic
  { pattern: /src\/services\//i, weight: 1.5 },
  { pattern: /functions\//i, weight: 1.5 },
  // User-facing screens and components
  { pattern: /src\/screens\//i, weight: 1.0 },
  { pattern: /src\/components\//i, weight: 1.0 },
  // Admin tools — not seen by end users
  { pattern: /admin-panel\//i, weight: 0.5 },
  { pattern: /agents\//i, weight: 0.3 },
  { pattern: /scripts\//i, weight: 0.2 },
];

function getFileWeight(filePath) {
  for (const { pattern, weight } of FILE_WEIGHT_MAP) {
    if (pattern.test(filePath)) return weight;
  }
  return 1.0;
}

// File context: where in the project is this file?
export function getFileContext(filePath) {
  if (/__tests__|__mocks__|\.test\.[tj]sx?$|\.spec\.[tj]sx?$/i.test(filePath)) return 'test';
  if (/agents\/|scripts\//i.test(filePath)) return 'tooling';
  if (/admin-panel\//i.test(filePath)) return 'admin';
  return 'production';
}

// Rules confirmed to have very low false-positive rate (structurally verified)
const VERIFIED_RULES = new Set([
  'empty-catch',        // observability: catch block with zero statements — structurally certain
  'leaked-listener',    // firebase: onValue in useEffect without off()/unsubscribe — structurally certain
  'silent-failure',     // observability: catch returns null/undefined without any logging — structurally certain
  'unsafe-retry-loop',  // firebase: while loop with Firebase write, no break/maxRetries — structurally certain
  // 'missing-catch-firebase' excluded: service-layer methods intentionally propagate errors to callers;
  //   cannot be structurally verified without caller analysis — generates too many false positives.
]);

export function createFinding({ severity, file, line, rule, scanner, why, risk, uxImpact, perfImpact, memoryImpact, suggestion }) {
  const context = getFileContext(file || '');
  return {
    severity: severity || SEVERITY.MEDIUM,
    file: file || '',
    line: line || 0,
    rule: rule || '',
    scanner: scanner || '',
    why: why || '',
    risk: risk || '',
    uxImpact: uxImpact || 'none',
    perfImpact: perfImpact || 'none',
    memoryImpact: memoryImpact || 'none',
    suggestion: suggestion || '',
    // VERIFIED = structurally confirmed, low false-positive rate
    // test/tooling files are always HEURISTIC — they are not production concerns
    verified: VERIFIED_RULES.has(rule || '') && context === 'production',
    context,   // 'production' | 'test' | 'tooling' | 'admin'
    timestamp: Date.now(),
  };
}

export function countSeverities(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    const key = f.severity.toLowerCase();
    if (key in counts) counts[key]++;
  }
  return counts;
}

export function countVerifiedSeverities(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings.filter(f => f.verified)) {
    const key = f.severity.toLowerCase();
    if (key in counts) counts[key]++;
  }
  return counts;
}

export function calculateHealthScore(findings) {
  // Exponential penalty formula with file weight:
  //   score = 100 * exp(-totalPenalty / DIVISOR)
  // Divisor 1500 means: ~50 production HIGH → score ~55, ~200 production HIGH → score ~35
  // Test/tooling files have weight 0 and do not contribute to penalty.
  const DIVISOR = 1500;
  let totalPenalty = 0;
  for (const f of findings) {
    const basePenalty = SEVERITY_PENALTY[f.severity] ?? 0;
    const weight = getFileWeight(f.file);
    totalPenalty += basePenalty * weight;
  }
  return Math.max(0, Math.round(100 * Math.exp(-totalPenalty / DIVISOR)));
}

export function calculateVerifiedScore(findings) {
  // Score based only on verified production findings (structurally-certain, low false-positive).
  // Smaller divisor (500) because verified findings are fewer and more trustworthy —
  // each one carries real weight.
  const DIVISOR = 500;
  const verified = findings.filter(f => f.verified);
  let totalPenalty = 0;
  for (const f of verified) {
    const basePenalty = SEVERITY_PENALTY[f.severity] ?? 0;
    const weight = getFileWeight(f.file);
    totalPenalty += basePenalty * weight;
  }
  return Math.max(0, Math.round(100 * Math.exp(-totalPenalty / DIVISOR)));
}

export function calculateCategoryScores(findings) {
  const categories = {};
  for (const f of findings) {
    if (!categories[f.scanner]) categories[f.scanner] = [];
    categories[f.scanner].push(f);
  }
  const scores = {};
  for (const [cat, items] of Object.entries(categories)) {
    scores[cat] = calculateHealthScore(items);
  }
  return scores;
}

export function sortByPriority(findings) {
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  return [...findings].sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5));
}

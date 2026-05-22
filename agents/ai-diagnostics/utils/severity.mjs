export const SEVERITY = { CRITICAL: 'CRITICAL', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', INFO: 'INFO' };

const SEVERITY_WEIGHT = { CRITICAL: 25, HIGH: 10, MEDIUM: 4, LOW: 1, INFO: 0 };

export function createFinding({ severity, file, line, rule, scanner, why, risk, uxImpact, perfImpact, memoryImpact, suggestion }) {
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

export function calculateHealthScore(findings) {
  // Diminishing returns: each finding adds less weight as count grows
  // This keeps score meaningful even with many heuristic findings
  const counts = countSeverities(findings);
  const weighted =
    Math.min(counts.critical * 8, 25) +
    Math.min(counts.high * 0.08, 25) +
    Math.min(counts.medium * 0.02, 15) +
    Math.min(counts.low * 0.01, 5) +
    0; // info doesn't affect score
  const score = Math.max(0, Math.round(100 - weighted));
  return score;
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

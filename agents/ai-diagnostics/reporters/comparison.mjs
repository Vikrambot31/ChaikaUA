import fs from 'fs';
import path from 'path';

export function loadAuditIndex(rootDir) {
  const indexPath = path.join(rootDir, 'diagnostics-reports', 'index.json');
  try { return JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { return []; }
}

export function compareAudits(current, previous) {
  if (!current || !previous) return null;

  const healthDelta = current.healthScore - previous.healthScore;
  const direction = healthDelta > 0 ? 'improved' : healthDelta < 0 ? 'degraded' : 'unchanged';

  const severityDelta = {};
  for (const key of ['critical', 'high', 'medium', 'low', 'info']) {
    const cur = current.severityCounts?.[key] || 0;
    const prev = previous.severityCounts?.[key] || 0;
    severityDelta[key] = { current: cur, previous: prev, delta: cur - prev };
  }

  const categoryDelta = {};
  const allCats = new Set([
    ...Object.keys(current.categoryScores || {}),
    ...Object.keys(previous.categoryScores || {}),
  ]);
  for (const cat of allCats) {
    const cur = current.categoryScores?.[cat] ?? 100;
    const prev = previous.categoryScores?.[cat] ?? 100;
    categoryDelta[cat] = { current: cur, previous: prev, delta: cur - prev };
  }

  return {
    currentId: current.id,
    previousId: previous.id,
    healthScore: { current: current.healthScore, previous: previous.healthScore, delta: healthDelta },
    direction,
    severityDelta,
    categoryDelta,
    findingsCount: {
      current: current.findingsCount,
      previous: previous.findingsCount,
      delta: current.findingsCount - previous.findingsCount,
    },
  };
}

export function formatComparisonMarkdown(comparison) {
  if (!comparison) return '# No comparison data available\n';

  const arrow = (delta) => delta > 0 ? `↑+${delta}` : delta < 0 ? `↓${delta}` : '→0';
  const color = (delta, inverse = false) => {
    const bad = inverse ? delta < 0 : delta > 0;
    return bad ? '🔴' : delta === 0 ? '⚪' : '🟢';
  };

  let md = `# Audit Comparison\n\n`;
  md += `**Current:** ${comparison.currentId} | **Previous:** ${comparison.previousId}\n\n`;
  md += `## Health Score\n\n`;
  md += `${color(comparison.healthScore.delta, true)} **${comparison.healthScore.previous}** → **${comparison.healthScore.current}** (${arrow(comparison.healthScore.delta)})\n\n`;
  md += `**Direction:** ${comparison.direction}\n\n`;

  md += `## Severity Changes\n\n| Severity | Previous | Current | Delta |\n|----------|----------|---------|-------|\n`;
  for (const [key, val] of Object.entries(comparison.severityDelta)) {
    md += `| ${key.toUpperCase()} | ${val.previous} | ${val.current} | ${color(val.delta)} ${arrow(val.delta)} |\n`;
  }

  md += `\n## Category Score Changes\n\n| Category | Previous | Current | Delta |\n|----------|----------|---------|-------|\n`;
  for (const [key, val] of Object.entries(comparison.categoryDelta)) {
    md += `| ${key} | ${val.previous} | ${val.current} | ${color(val.delta, true)} ${arrow(val.delta)} |\n`;
  }

  md += `\n## Findings Count\n\n`;
  md += `${color(comparison.findingsCount.delta)} **${comparison.findingsCount.previous}** → **${comparison.findingsCount.current}** (${arrow(comparison.findingsCount.delta)})\n`;

  return md;
}

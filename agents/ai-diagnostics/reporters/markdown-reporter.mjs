import fs from 'fs';
import path from 'path';
import { countSeverities, calculateHealthScore, calculateCategoryScores, sortByPriority, SEVERITY } from '../utils/severity.mjs';

const SCANNER_NAMES = {
  'upload-photo': 'Upload / Photo System',
  'firebase': 'Firebase',
  'runtime': 'Runtime System',
  'observability': 'Observability & Diagnostics',
  'performance': 'Performance',
  'crash-safety': 'Crash Safety',
};

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function severityEmoji(sev) {
  if (sev === 'CRITICAL') return '🔴';
  if (sev === 'HIGH') return '🟠';
  if (sev === 'MEDIUM') return '🟡';
  if (sev === 'LOW') return '🔵';
  return '⚪';
}

function renderFinding(f, index) {
  return `### ${index + 1}. ${severityEmoji(f.severity)} [${f.severity}] ${f.rule}

- **File:** \`${f.file}\`${f.line ? `:${f.line}` : ''}
- **Scanner:** ${SCANNER_NAMES[f.scanner] || f.scanner}
- **Why:** ${f.why}
- **Risk:** ${f.risk}
- **UX Impact:** ${f.uxImpact} | **Perf Impact:** ${f.perfImpact} | **Memory Impact:** ${f.memoryImpact}
- **Suggestion:** ${f.suggestion}
`;
}

export function generateFullReport(findings, aiSummary = null) {
  const sorted = sortByPriority(findings);
  const counts = countSeverities(findings);
  const healthScore = calculateHealthScore(findings);
  const categoryScores = calculateCategoryScores(findings);
  const now = new Date().toLocaleString('ru-RU');

  let md = `# Chaika Life — AI Diagnostics Full Audit Report

**Date:** ${now}
**Total Findings:** ${findings.length}
**Health Score:** ${healthScore}/100

## Severity Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | ${counts.critical} |
| 🟠 HIGH | ${counts.high} |
| 🟡 MEDIUM | ${counts.medium} |
| 🔵 LOW | ${counts.low} |
| ⚪ INFO | ${counts.info} |

## Category Scores

| Category | Score |
|----------|-------|
${Object.entries(categoryScores).map(([k, v]) => `| ${SCANNER_NAMES[k] || k} | ${v}/100 |`).join('\n')}

`;

  if (aiSummary && aiSummary.success) {
    md += `## AI Summary (DeepSeek)\n\n${aiSummary.text}\n\n`;
  } else if (aiSummary) {
    md += `## AI Summary\n\n_${aiSummary.text || aiSummary.error || 'AI analysis unavailable'}_\n\n`;
  }

  md += `---\n\n## All Findings\n\n`;
  sorted.forEach((f, i) => { md += renderFinding(f, i); });

  return md;
}

export function generateCategoryReport(findings, category, categoryLabel) {
  const filtered = findings.filter(f => f.scanner === category);
  const sorted = sortByPriority(filtered);
  const counts = countSeverities(filtered);
  const score = calculateHealthScore(filtered);

  let md = `# ${categoryLabel} — Audit Report\n\n`;
  md += `**Score:** ${score}/100 | **Findings:** ${filtered.length}\n`;
  md += `**CRITICAL:** ${counts.critical} | **HIGH:** ${counts.high} | **MEDIUM:** ${counts.medium} | **LOW:** ${counts.low}\n\n`;
  md += `---\n\n`;
  sorted.forEach((f, i) => { md += renderFinding(f, i); });

  return md;
}

export function writeReports(rootDir, findings, aiSummary = null) {
  const reportsDir = path.join(rootDir, 'diagnostics-reports');
  const latestDir = path.join(reportsDir, 'latest');
  const historyDir = path.join(reportsDir, 'history');
  const stamp = timestamp();
  const auditDir = path.join(historyDir, `audit-${stamp}`);

  fs.mkdirSync(latestDir, { recursive: true });
  fs.mkdirSync(auditDir, { recursive: true });

  const reports = {
    'full-audit.md': generateFullReport(findings, aiSummary),
    'critical-errors.md': generateCategoryReport(findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH'), 'all', 'Critical & High Severity Errors'),
    'firebase-risks.md': generateCategoryReport(findings, 'firebase', 'Firebase Risks'),
    'performance-report.md': generateCategoryReport(findings, 'performance', 'Performance Report'),
    'upload-system-report.md': generateCategoryReport(findings, 'upload-photo', 'Upload / Photo System Report'),
    'diagnostics-blindspots.md': generateCategoryReport(findings, 'observability', 'Diagnostics & Observability Blindspots'),
  };

  // For critical-errors.md, include all scanners but only critical+high
  const criticalFindings = findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH');
  reports['critical-errors.md'] = generateCriticalReport(criticalFindings);

  for (const [name, content] of Object.entries(reports)) {
    fs.writeFileSync(path.join(latestDir, name), content, 'utf8');
    fs.writeFileSync(path.join(auditDir, name), content, 'utf8');
  }

  // Write index.json for history tracking
  const counts = countSeverities(findings);
  const healthScore = calculateHealthScore(findings);
  const categoryScores = calculateCategoryScores(findings);
  const indexPath = path.join(reportsDir, 'index.json');
  let index = [];
  try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { /* first run */ }
  index.unshift({
    id: stamp,
    completedAt: Date.now(),
    healthScore,
    severityCounts: counts,
    categoryScores,
    findingsCount: findings.length,
    path: `history/audit-${stamp}`,
  });
  // Keep last 50 audits
  if (index.length > 50) index.length = 50;
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');

  return { stamp, latestDir, auditDir, healthScore, counts, categoryScores };
}

function generateCriticalReport(findings) {
  const sorted = sortByPriority(findings);
  let md = `# Critical & High Severity Errors\n\n`;
  md += `**Total:** ${findings.length}\n\n---\n\n`;
  sorted.forEach((f, i) => { md += renderFinding(f, i); });
  return md;
}

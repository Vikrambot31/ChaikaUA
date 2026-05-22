#!/usr/bin/env node
/**
 * Chaika Life — AI Diagnostics Agent
 * Main audit runner. Scans project source files through 6 analyzers,
 * optionally generates AI summary via DeepSeek, writes reports to disk.
 *
 * Usage: node agents/ai-diagnostics/agent.mjs --root /path/to/project [--json-output]
 *
 * When --json-output is set, outputs JSON lines to stdout for daemon communication:
 *   { type: "progress", scanner, stepNum, totalSteps, percent, message }
 *   { type: "finding", severity, file, line, rule, scanner, why }
 *   { type: "log", message, severity, scanner }
 *   { type: "complete", healthScore, severityCounts, findingsCount, duration, summary }
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { scanFiles } from './utils/file-scanner.mjs';
import { countSeverities, calculateHealthScore, calculateCategoryScores, sortByPriority } from './utils/severity.mjs';
import { writeReports } from './reporters/markdown-reporter.mjs';
import { generateAISummary } from './ai/deepseek-client.mjs';

// Analyzers (priority order)
import { analyze as analyzeUpload } from './analyzers/upload-photo.mjs';
import { analyze as analyzeFirebase } from './analyzers/firebase.mjs';
import { analyze as analyzeRuntime } from './analyzers/runtime.mjs';
import { analyze as analyzeObservability } from './analyzers/observability.mjs';
import { analyze as analyzePerformance } from './analyzers/performance.mjs';
import { analyze as analyzeCrashSafety } from './analyzers/crash-safety.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse args
const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 && args[rootIdx + 1] ? path.resolve(args[rootIdx + 1]) : path.resolve(__dirname, '../..');
const JSON_OUTPUT = args.includes('--json-output');

const SCANNERS = [
  { id: 'upload-photo', name: 'Upload / Photo System', fn: analyzeUpload },
  { id: 'firebase', name: 'Firebase', fn: analyzeFirebase },
  { id: 'runtime', name: 'Runtime System', fn: analyzeRuntime },
  { id: 'observability', name: 'Observability', fn: analyzeObservability },
  { id: 'performance', name: 'Performance', fn: analyzePerformance },
  { id: 'crash-safety', name: 'Crash Safety', fn: analyzeCrashSafety },
];

function emit(obj) {
  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify(obj) + '\n');
  }
}

function logConsole(msg) {
  if (!JSON_OUTPUT) {
    process.stdout.write(msg + '\n');
  }
}

async function main() {
  const startTime = Date.now();

  emit({ type: 'log', message: `Scanning project at ${ROOT}`, severity: 'info', scanner: 'agent' });
  logConsole(`\n=== Chaika Life AI Diagnostics Agent ===`);
  logConsole(`Project: ${ROOT}`);
  logConsole(`Started: ${new Date().toLocaleString('ru-RU')}\n`);

  // Step 1: Scan files
  emit({ type: 'progress', scanner: 'file-scanner', stepNum: 0, totalSteps: SCANNERS.length + 2, percent: 0, message: 'Scanning project files...' });
  logConsole('Scanning project files...');

  const files = scanFiles(ROOT);
  const fileCount = files.length;

  emit({ type: 'log', message: `Found ${fileCount} source files`, severity: 'info', scanner: 'file-scanner' });
  logConsole(`Found ${fileCount} source files\n`);

  // Step 2: Run analyzers
  const allFindings = [];

  for (let i = 0; i < SCANNERS.length; i++) {
    const scanner = SCANNERS[i];
    const stepNum = i + 1;
    const percent = Math.round(((stepNum) / (SCANNERS.length + 2)) * 100);

    emit({
      type: 'progress',
      scanner: scanner.id,
      stepNum,
      totalSteps: SCANNERS.length + 2,
      percent,
      message: `Analyzing: ${scanner.name}...`,
    });
    logConsole(`[${stepNum}/${SCANNERS.length}] ${scanner.name}...`);

    try {
      const findings = scanner.fn(files);
      allFindings.push(...findings);

      // Emit individual high-severity findings for live log
      const critical = findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH');
      for (const f of critical.slice(0, 10)) {
        emit({
          type: 'finding',
          severity: f.severity,
          file: f.file,
          line: f.line,
          rule: f.rule,
          scanner: f.scanner,
          why: f.why,
        });
      }

      emit({
        type: 'log',
        message: `${scanner.name}: ${findings.length} findings (${critical.length} critical/high)`,
        severity: critical.length > 0 ? 'warn' : 'info',
        scanner: scanner.id,
      });
      logConsole(`  → ${findings.length} findings (${critical.length} critical/high)`);
    } catch (err) {
      emit({ type: 'log', message: `${scanner.name} error: ${err.message}`, severity: 'error', scanner: scanner.id });
      logConsole(`  → ERROR: ${err.message}`);
    }
  }

  // Step 3: AI Summary
  const aiStepNum = SCANNERS.length + 1;
  const aiPercent = Math.round((aiStepNum / (SCANNERS.length + 2)) * 100);
  emit({ type: 'progress', scanner: 'ai-summary', stepNum: aiStepNum, totalSteps: SCANNERS.length + 2, percent: aiPercent, message: 'Generating AI summary (DeepSeek)...' });
  logConsole('\nGenerating AI summary...');

  const healthScore = calculateHealthScore(allFindings);
  const categoryScores = calculateCategoryScores(allFindings);
  const severityCounts = countSeverities(allFindings);

  let aiSummary = null;
  try {
    aiSummary = await generateAISummary(allFindings, categoryScores, healthScore);
    if (aiSummary.success) {
      emit({ type: 'log', message: 'AI summary generated successfully', severity: 'info', scanner: 'ai-summary' });
      logConsole('  → AI summary generated');
    } else {
      emit({ type: 'log', message: `AI summary skipped: ${aiSummary.error || aiSummary.text}`, severity: 'warn', scanner: 'ai-summary' });
      logConsole(`  → AI summary skipped: ${aiSummary.error || aiSummary.text}`);
    }
  } catch (err) {
    emit({ type: 'log', message: `AI summary error: ${err.message}`, severity: 'warn', scanner: 'ai-summary' });
    logConsole(`  → AI summary error: ${err.message}`);
    aiSummary = { success: false, text: `AI analysis error: ${err.message}` };
  }

  // Step 4: Write reports
  const reportStepNum = SCANNERS.length + 2;
  emit({ type: 'progress', scanner: 'generating-reports', stepNum: reportStepNum, totalSteps: SCANNERS.length + 2, percent: 95, message: 'Writing reports...' });
  logConsole('\nWriting reports...');

  let reportResult;
  try {
    reportResult = writeReports(ROOT, allFindings, aiSummary);
    emit({ type: 'log', message: `Reports saved to diagnostics-reports/latest/ and history/audit-${reportResult.stamp}`, severity: 'info', scanner: 'reporter' });
    logConsole(`  → Reports saved: diagnostics-reports/latest/`);
    logConsole(`  → History: diagnostics-reports/history/audit-${reportResult.stamp}/`);
  } catch (err) {
    emit({ type: 'log', message: `Report write error: ${err.message}`, severity: 'error', scanner: 'reporter' });
    logConsole(`  → Report error: ${err.message}`);
  }

  // Step 5: Complete
  const duration = Date.now() - startTime;

  emit({
    type: 'complete',
    healthScore,
    severityCounts,
    categoryScores,
    findingsCount: allFindings.length,
    duration,
    summary: aiSummary?.success ? aiSummary.text : (aiSummary?.text || 'AI summary unavailable'),
    totalSteps: SCANNERS.length + 2,
  });

  logConsole(`\n${'='.repeat(50)}`);
  logConsole(`AUDIT COMPLETE`);
  logConsole(`Health Score: ${healthScore}/100`);
  logConsole(`Total Findings: ${allFindings.length}`);
  logConsole(`  CRITICAL: ${severityCounts.critical}`);
  logConsole(`  HIGH:     ${severityCounts.high}`);
  logConsole(`  MEDIUM:   ${severityCounts.medium}`);
  logConsole(`  LOW:      ${severityCounts.low}`);
  logConsole(`  INFO:     ${severityCounts.info}`);
  logConsole(`Duration: ${Math.round(duration / 1000)}s`);
  logConsole(`${'='.repeat(50)}\n`);
}

main().catch((err) => {
  emit({ type: 'log', message: `Fatal error: ${err.message}`, severity: 'error', scanner: 'agent' });
  logConsole(`\nFATAL ERROR: ${err.message}`);
  process.exit(1);
});

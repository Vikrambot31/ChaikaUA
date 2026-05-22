#!/usr/bin/env node
/**
 * Chaika Life — AI Diagnostics Daemon
 * Watches RTDB for audit triggers, runs diagnostics agent, reports progress.
 *
 * Usage: node agents/ai-diagnostics/daemon.mjs
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

// Firebase Admin init
const serviceAccountPath = path.join(ROOT, 'serviceAccountKey.json');
let firebaseApp;
if (fs.existsSync(serviceAccountPath)) {
  firebaseApp = initializeApp({ credential: cert(serviceAccountPath), databaseURL: 'https://chaikaua-3cd9d-default-rtdb.europe-west1.firebasedatabase.app' });
} else {
  // fallback: use GOOGLE_APPLICATION_CREDENTIALS or ADC
  firebaseApp = initializeApp({ credential: applicationDefault(), databaseURL: 'https://chaikaua-3cd9d-default-rtdb.europe-west1.firebasedatabase.app' });
}
const db = getDatabase(firebaseApp);

const BASE = 'diagnostics/runtime_moderation';
const TRIGGER_REF = db.ref(`${BASE}/_audit_trigger`);
const STATUS_REF = db.ref(`${BASE}/_audit_status`);
const LOGS_REF = db.ref(`${BASE}/_audit_logs`);
const HISTORY_REF = db.ref(`${BASE}/_audit_history`);

const AUDIT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max

let agentProcess = null;
let auditTimeout = null;

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m',
};

function log(msg, color = C.reset) {
  const time = new Date().toLocaleTimeString('ru-RU');
  process.stdout.write(`${C.gray}[${time}]${C.reset} ${color}${msg}${C.reset}\n`);
}

async function updateStatus(data) {
  try { await STATUS_REF.update(data); } catch (err) { log(`RTDB status error: ${err.message}`, C.red); }
}

async function pushLog(entry) {
  try { await LOGS_REF.push(entry); } catch (err) { log(`RTDB log error: ${err.message}`, C.red); }
}

async function clearLogs() {
  try { await LOGS_REF.remove(); } catch { /* ok if empty */ }
}

async function addHistoryEntry(entry) {
  const id = `audit-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  try { await HISTORY_REF.child(id).set(entry); } catch (err) { log(`RTDB history error: ${err.message}`, C.red); }
}

async function runAudit(requestedBy) {
  if (agentProcess) {
    log('Audit already running, ignoring trigger', C.yellow);
    return;
  }

  log(`Starting audit requested by ${requestedBy}`, C.cyan);
  const startedAt = Date.now();

  await clearLogs();
  await updateStatus({
    status: 'running',
    startedAt,
    completedAt: null,
    duration: null,
    progress: { currentStep: 'initializing', stepNum: 0, totalSteps: 6, percent: 0, message: 'Initializing audit...' },
    healthScore: null,
    severityCounts: null,
    summary: null,
    findingsCount: null,
  });

  await pushLog({ message: `Audit started by ${requestedBy}`, severity: 'info', scanner: 'daemon', at: Date.now() });

  const agentScript = path.join(__dirname, 'agent.mjs');
  agentProcess = spawn('node', [agentScript, '--root', ROOT, '--json-output'], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  let stdoutBuffer = '';

  agentProcess.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        handleAgentMessage(msg);
      } catch {
        log(`Agent stdout: ${line}`, C.gray);
      }
    }
  });

  agentProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text) {
      log(`Agent stderr: ${text}`, C.yellow);
      pushLog({ message: text, severity: 'warn', scanner: 'agent', at: Date.now() });
    }
  });

  agentProcess.on('close', async (code) => {
    clearTimeout(auditTimeout);
    const duration = Date.now() - startedAt;

    if (code === 0) {
      log(`Audit completed successfully in ${Math.round(duration / 1000)}s`, C.green);
      await pushLog({ message: `Audit completed in ${Math.round(duration / 1000)}s`, severity: 'info', scanner: 'daemon', at: Date.now() });
    } else {
      log(`Audit failed with code ${code}`, C.red);
      await updateStatus({ status: 'failed', completedAt: Date.now(), duration });
      await pushLog({ message: `Audit failed with exit code ${code}`, severity: 'error', scanner: 'daemon', at: Date.now() });
    }

    agentProcess = null;
  });

  agentProcess.on('error', async (err) => {
    log(`Agent process error: ${err.message}`, C.red);
    await updateStatus({ status: 'failed', completedAt: Date.now(), duration: Date.now() - startedAt });
    await pushLog({ message: `Agent error: ${err.message}`, severity: 'error', scanner: 'daemon', at: Date.now() });
    agentProcess = null;
  });

  // Timeout protection
  auditTimeout = setTimeout(async () => {
    if (agentProcess) {
      log('Audit timeout reached, killing process', C.red);
      agentProcess.kill('SIGTERM');
      await updateStatus({ status: 'failed', completedAt: Date.now(), duration: AUDIT_TIMEOUT_MS });
      await pushLog({ message: 'Audit killed: timeout exceeded (10 min)', severity: 'error', scanner: 'daemon', at: Date.now() });
      agentProcess = null;
    }
  }, AUDIT_TIMEOUT_MS);
}

async function handleAgentMessage(msg) {
  switch (msg.type) {
    case 'progress':
      await updateStatus({
        progress: {
          currentStep: msg.scanner || msg.step,
          stepNum: msg.stepNum || 0,
          totalSteps: msg.totalSteps || 6,
          percent: msg.percent || 0,
          message: msg.message || '',
        },
      });
      await pushLog({ message: msg.message || `Scanning ${msg.scanner}...`, severity: 'info', scanner: msg.scanner || '', at: Date.now() });
      break;

    case 'finding':
      await pushLog({
        message: `[${msg.severity}] ${msg.file}:${msg.line} — ${msg.rule}: ${msg.why}`,
        severity: msg.severity === 'CRITICAL' || msg.severity === 'HIGH' ? 'error' : msg.severity === 'MEDIUM' ? 'warn' : 'info',
        scanner: msg.scanner || '',
        at: Date.now(),
      });
      break;

    case 'complete':
      await updateStatus({
        status: 'completed',
        completedAt: Date.now(),
        duration: msg.duration || 0,
        healthScore: msg.healthScore || 0,
        severityCounts: msg.severityCounts || {},
        summary: msg.summary || '',
        findingsCount: msg.findingsCount || 0,
        progress: { currentStep: 'done', stepNum: msg.totalSteps || 6, totalSteps: msg.totalSteps || 6, percent: 100, message: 'Audit complete' },
      });
      await addHistoryEntry({
        completedAt: Date.now(),
        healthScore: msg.healthScore || 0,
        severityCounts: msg.severityCounts || {},
        duration: msg.duration || 0,
      });
      break;

    case 'log':
      await pushLog({ message: msg.message, severity: msg.severity || 'info', scanner: msg.scanner || '', at: Date.now() });
      break;

    default:
      break;
  }
}

async function cancelCurrentAudit() {
  if (!agentProcess) {
    log('No audit to cancel', C.yellow);
    return;
  }
  log('Cancelling audit...', C.yellow);
  agentProcess.kill('SIGTERM');
  clearTimeout(auditTimeout);
  await updateStatus({ status: 'cancelled', completedAt: Date.now() });
  await pushLog({ message: 'Audit cancelled by user', severity: 'warn', scanner: 'daemon', at: Date.now() });
  agentProcess = null;
}

// Watch for triggers
log('AI Diagnostics Daemon started', C.cyan);
log(`Watching ${BASE}/_audit_trigger for commands...`, C.gray);

TRIGGER_REF.on('value', async (snapshot) => {
  const trigger = snapshot.val();
  if (!trigger || typeof trigger !== 'object') return;

  if (trigger.action === 'start') {
    await runAudit(trigger.requestedBy || 'unknown');
  } else if (trigger.action === 'cancel') {
    await cancelCurrentAudit();
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  log('Daemon shutting down...', C.yellow);
  if (agentProcess) agentProcess.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Daemon terminated', C.yellow);
  if (agentProcess) agentProcess.kill('SIGTERM');
  process.exit(0);
});

// Keep alive
setInterval(() => {}, 60_000);

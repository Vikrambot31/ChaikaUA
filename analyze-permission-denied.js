#!/usr/bin/env node

/**
 * Analyze permission_denied errors from Firebase
 * Usage: node analyze-permission-denied.js
 */

const { initializeApp } = require('firebase/app');
const { getDatabase, ref, query, limitToLast, get } = require('firebase/database');

const firebaseConfig = {
  apiKey: 'AIzaSyDcohmy5PiUiEDQ5mholkY59HpOmeeoG6E',
  authDomain: 'chaikaua-3cd9d.firebaseapp.com',
  databaseURL: 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com',
  projectId: 'chaikaua-3cd9d',
  storageBucket: 'chaikaua-3cd9d.firebasestorage.app',
  messagingSenderId: '558624873305',
  appId: '1:558624873305:web:1dcb2dbbef98f8a79f26cb',
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const getNum = (v) => (Number.isFinite(v) ? Number(v) : 0);
const getString = (v) => (typeof v === 'string' ? v : '');

const isPermissionDeniedText = (text) =>
  text.includes('permission_denied') || text.includes('permission-denied') || text.includes('permission denied');

const normalizeRichEntry = (id, raw) => {
  const entryRaw = raw.entry && typeof raw.entry === 'object' ? raw.entry : raw;
  const at = getNum(raw.submittedAt) || getNum(entryRaw.at) || getNum(raw.at);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  if (at < since) return null;

  const allText = [
    getString(entryRaw.rawMessage),
    getString(entryRaw.humanMessage),
    getString(entryRaw.code),
    getString(entryRaw.firebaseCode),
    getString(entryRaw.message),
    getString(entryRaw.type),
  ]
    .join(' ')
    .toLowerCase();

  if (!isPermissionDeniedText(allText)) return null;

  const reporter = raw.reporter && typeof raw.reporter === 'object' ? raw.reporter : {};
  const breadcrumbsRaw = Array.isArray(entryRaw.breadcrumbs) ? entryRaw.breadcrumbs : [];
  const breadcrumbs = breadcrumbsRaw
    .filter((b) => Boolean(b && typeof b === 'object'))
    .map((b) => ({
      at: getNum(b.at),
      category: getString(b.category) || 'runtime',
      message: getString(b.message),
      screen: typeof b.screen === 'string' ? b.screen : undefined,
    }));

  return {
    id,
    at,
    screen: getString(entryRaw.screen) || getString(entryRaw.functionName) || '-',
    action: getString(entryRaw.action) || '-',
    firebasePath: getString(entryRaw.firebasePath) || '-',
    feature: getString(entryRaw.feature) || '-',
    stage: getString(entryRaw.stage) || '-',
    code: getString(entryRaw.code) || getString(entryRaw.type) || '-',
    firebaseCode: getString(entryRaw.firebaseCode) || '-',
    uid: getString(raw.uid) || getString(reporter.userId) || getString(entryRaw.uid) || '-',
    sessionId: getString(entryRaw.sessionId) || getString(raw.sessionId) || '-',
    appVersion: getString(entryRaw.appVersion) || getString(raw.appVersion) || '-',
    networkState: getString(entryRaw.networkState) || '-',
    deviceInfo: getString(entryRaw.deviceInfo) || '-',
    androidVersion: getString(entryRaw.androidVersion) || '-',
    appMode: getString(entryRaw.appMode) || '-',
    severity:
      entryRaw.severity === 'critical' || entryRaw.severity === 'warning'
        ? entryRaw.severity
        : 'info',
    humanMessage: getString(entryRaw.humanMessage) || getString(entryRaw.message) || '-',
    rawMessage: getString(entryRaw.rawMessage) || getString(entryRaw.message) || '-',
    source: getString(entryRaw.source) || getString(raw.source) || 'client',
    repeatCount: getNum(entryRaw.repeatCount) || 1,
    slowOp: entryRaw.slowOp === true,
    durationMs: typeof entryRaw.durationMs === 'number' ? entryRaw.durationMs : undefined,
    breadcrumbs,
  };
};

async function fetchPermissionDeniedDetails() {
  try {
    console.log('⏳ Fetching permission_denied errors for last 24 hours...\n');

    const [richSnapshot, opsSnapshot] = await Promise.all([
      get(query(ref(database, 'diagnostics/runtime_moderation'), limitToLast(300))).catch(() => null),
      get(query(ref(database, 'ops/errors'), limitToLast(300))).catch(() => null),
    ]);

    const seen = new Set();
    const results = [];

    // Primary: diagnostics/runtime_moderation (rich data with uid, breadcrumbs, etc.)
    const richRaw = richSnapshot?.val();
    if (richRaw && typeof richRaw === 'object') {
      for (const [id, value] of Object.entries(richRaw)) {
        if (!value || typeof value !== 'object') continue;
        const entry = normalizeRichEntry(id, value);
        if (entry) {
          results.push(entry);
          seen.add(id);
        }
      }
    }

    // Fallback: ops/errors
    const opsRaw = opsSnapshot?.val();
    if (opsRaw && typeof opsRaw === 'object') {
      for (const [id, value] of Object.entries(opsRaw)) {
        if (seen.has(id) || !value || typeof value !== 'object') continue;
        const entry = normalizeRichEntry(id, value);
        if (entry) results.push(entry);
      }
    }

    const sorted = results.sort((a, b) => b.at - a.at);

    // Summary
    console.log(`📊 SUMMARY: Found ${sorted.length} permission_denied errors\n`);

    // Group by screen
    const byScreen = {};
    sorted.forEach((entry) => {
      byScreen[entry.screen] = (byScreen[entry.screen] || 0) + 1;
    });

    // Group by severity
    const bySeverity = {};
    sorted.forEach((entry) => {
      bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
    });

    // Group by firebase path
    const byPath = {};
    sorted.forEach((entry) => {
      byPath[entry.firebasePath] = (byPath[entry.firebasePath] || 0) + 1;
    });

    // Group by network state
    const byNetwork = {};
    sorted.forEach((entry) => {
      byNetwork[entry.networkState] = (byNetwork[entry.networkState] || 0) + 1;
    });

    console.log('🔴 BY SEVERITY:');
    Object.entries(bySeverity).forEach(([severity, count]) => {
      console.log(`  ${severity}: ${count}`);
    });

    console.log('\n📱 BY SCREEN:');
    Object.entries(byScreen)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([screen, count]) => {
        console.log(`  ${screen}: ${count}`);
      });

    console.log('\n🔐 BY FIREBASE PATH:');
    Object.entries(byPath)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([path, count]) => {
        console.log(`  ${path}: ${count}`);
      });

    console.log('\n📡 BY NETWORK STATE:');
    Object.entries(byNetwork).forEach(([network, count]) => {
      console.log(`  ${network}: ${count}`);
    });

    // Top unique users
    const byUser = {};
    sorted.forEach((entry) => {
      if (entry.uid !== '-') {
        byUser[entry.uid] = (byUser[entry.uid] || 0) + 1;
      }
    });

    console.log('\n👥 TOP USERS AFFECTED:');
    Object.entries(byUser)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([uid, count]) => {
        console.log(`  ${uid}: ${count} errors`);
      });

    // Top app versions
    const byVersion = {};
    sorted.forEach((entry) => {
      if (entry.appVersion !== '-') {
        byVersion[entry.appVersion] = (byVersion[entry.appVersion] || 0) + 1;
      }
    });

    console.log('\n📦 BY APP VERSION:');
    Object.entries(byVersion)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([version, count]) => {
        console.log(`  ${version}: ${count}`);
      });

    // Time distribution
    console.log('\n⏱️ RECENT ERRORS (last 10):');
    sorted.slice(0, 10).forEach((entry, i) => {
      const time = new Date(entry.at).toLocaleString('uk-UA');
      console.log(`\n${i + 1}. [${entry.severity.toUpperCase()}] ${time}`);
      console.log(`   Screen: ${entry.screen}`);
      console.log(`   Path: ${entry.firebasePath}`);
      console.log(`   UID: ${entry.uid}`);
      console.log(`   Network: ${entry.networkState}`);
      console.log(`   App: ${entry.appVersion}`);
      if (entry.breadcrumbs.length > 0) {
        console.log(`   Breadcrumbs (${entry.breadcrumbs.length}):`);
        entry.breadcrumbs.slice(-3).forEach((b) => {
          console.log(`     • ${b.screen || b.category}: ${b.message}`);
        });
      }
    });

    // Detailed table
    console.log('\n\n📋 DETAILED TABLE:');
    console.log('─'.repeat(180));
    console.log(
      'Time'.padEnd(20) +
        ' | ' +
        'Severity'.padEnd(10) +
        ' | ' +
        'Screen'.padEnd(25) +
        ' | ' +
        'Path'.padEnd(40) +
        ' | ' +
        'UID'.padEnd(30) +
        ' | ' +
        'Network'
    );
    console.log('─'.repeat(180));
    sorted.forEach((entry) => {
      const time = new Date(entry.at).toLocaleString('uk-UA').slice(0, 19);
      const severity = entry.severity.padEnd(10);
      const screen = entry.screen.slice(0, 25).padEnd(25);
      const path = entry.firebasePath.slice(0, 40).padEnd(40);
      const uid = entry.uid.slice(0, 30).padEnd(30);
      const network = entry.networkState;
      console.log(`${time} | ${severity} | ${screen} | ${path} | ${uid} | ${network}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fetchPermissionDeniedDetails();

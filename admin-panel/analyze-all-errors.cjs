#!/usr/bin/env node

/**
 * Analyze ALL errors from Firebase (not just permission_denied)
 * Usage: node analyze-all-errors.cjs
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

const normalizeEntry = (id, raw) => {
  const entryRaw = raw.entry && typeof raw.entry === 'object' ? raw.entry : raw;
  const at = getNum(raw.submittedAt) || getNum(entryRaw.at) || getNum(raw.at);
  const since = Date.now() - 24 * 60 * 60 * 1000;
  if (at < since) return null;

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

async function fetchAllErrors() {
  try {
    console.log('⏳ Fetching ALL errors for last 24 hours...\n');

    const [richSnapshot, opsSnapshot] = await Promise.all([
      get(query(ref(database, 'diagnostics/runtime_moderation'), limitToLast(300))).catch(() => null),
      get(query(ref(database, 'ops/errors'), limitToLast(300))).catch(() => null),
    ]);

    const seen = new Set();
    const results = [];

    // Primary: diagnostics/runtime_moderation
    const richRaw = richSnapshot?.val();
    if (richRaw && typeof richRaw === 'object') {
      for (const [id, value] of Object.entries(richRaw)) {
        if (!value || typeof value !== 'object') continue;
        const entry = normalizeEntry(id, value);
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
        const entry = normalizeEntry(id, value);
        if (entry) results.push(entry);
      }
    }

    const sorted = results.sort((a, b) => b.at - a.at);

    console.log(`📊 SUMMARY: Found ${sorted.length} total errors\n`);

    if (sorted.length === 0) {
      console.log('✅ No errors in the last 24 hours! System is healthy.');
      process.exit(0);
    }

    // Group by error type/code
    const byCode = {};
    sorted.forEach((entry) => {
      const key = `${entry.code} (${entry.firebaseCode})`.trim();
      byCode[key] = (byCode[key] || 0) + 1;
    });

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
    Object.entries(bySeverity)
      .sort((a, b) => b[1] - a[1])
      .forEach(([severity, count]) => {
        console.log(`  ${severity}: ${count}`);
      });

    console.log('\n❌ BY ERROR CODE:');
    Object.entries(byCode)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([code, count]) => {
        console.log(`  ${code}: ${count}`);
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

    // Critical/Warning errors only
    const critical = sorted.filter((e) => e.severity === 'critical' || e.severity === 'warning');
    console.log(`\n🚨 CRITICAL/WARNING ERRORS: ${critical.length}`);

    if (critical.length > 0) {
      console.log('\nRecent critical/warning errors:');
      critical.slice(0, 5).forEach((entry, i) => {
        const time = new Date(entry.at).toLocaleString('uk-UA');
        console.log(`\n${i + 1}. [${entry.severity.toUpperCase()}] ${time}`);
        console.log(`   Screen: ${entry.screen}`);
        console.log(`   Code: ${entry.code} (Firebase: ${entry.firebaseCode})`);
        console.log(`   Message: ${entry.humanMessage}`);
        console.log(`   Path: ${entry.firebasePath}`);
        console.log(`   UID: ${entry.uid}`);
        console.log(`   Network: ${entry.networkState}`);
        console.log(`   App: ${entry.appVersion}`);
      });
    }

    // Time distribution (hourly)
    console.log('\n⏱️ TIME DISTRIBUTION (last 24h):');
    const byHour = {};
    sorted.forEach((entry) => {
      const hour = new Date(entry.at).toLocaleString('uk-UA', { hour: '2-digit', minute: '2-digit' });
      byHour[hour] = (byHour[hour] || 0) + 1;
    });
    Object.entries(byHour)
      .sort()
      .slice(-12)
      .forEach(([hour, count]) => {
        const bar = '█'.repeat(Math.min(count, 20));
        console.log(`  ${hour}: ${bar} ${count}`);
      });

    // Detailed table
    console.log('\n\n📋 DETAILED TABLE (top 50):');
    console.log('─'.repeat(200));
    console.log(
      'Time'.padEnd(20) +
        ' | ' +
        'Sev'.padEnd(5) +
        ' | ' +
        'Code'.padEnd(20) +
        ' | ' +
        'Screen'.padEnd(20) +
        ' | ' +
        'Path'.padEnd(30) +
        ' | ' +
        'UID'.padEnd(20) +
        ' | ' +
        'Network'
    );
    console.log('─'.repeat(200));
    sorted.slice(0, 50).forEach((entry) => {
      const time = new Date(entry.at).toLocaleString('uk-UA').slice(0, 19);
      const sev = entry.severity.slice(0, 5).padEnd(5);
      const code = `${entry.code}`.slice(0, 20).padEnd(20);
      const screen = entry.screen.slice(0, 20).padEnd(20);
      const path = entry.firebasePath.slice(0, 30).padEnd(30);
      const uid = entry.uid.slice(0, 20).padEnd(20);
      const network = entry.networkState;
      console.log(`${time} | ${sev} | ${code} | ${screen} | ${path} | ${uid} | ${network}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fetchAllErrors();

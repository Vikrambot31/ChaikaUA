/**
 * register-release.cjs
 * Registers a release in Firebase RTDB after a successful APK build.
 * Usage: node register-release.cjs <path-to-build-report.json>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load .env from project root
const root = path.resolve(__dirname, '..');
try {
  require('dotenv').config({ path: path.join(root, '.env') });
} catch { /* dotenv optional */ }

const reportPath = process.argv[2];

if (!reportPath) {
  console.error('[REGISTER] Usage: node register-release.cjs <build-report.json>');
  process.exit(1);
}

if (!fs.existsSync(reportPath)) {
  console.warn(`[REGISTER] build-report.json not found at: ${reportPath}`);
  process.exit(0);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch (err) {
  console.warn(`[REGISTER] Failed to parse build-report.json: ${err.message}`);
  process.exit(0);
}

// Get git commit messages for a specific file
function getFileCommits(filePath) {
  try {
    const output = execSync(
      `git log --pretty=format:"%s" HEAD~1..HEAD -- "${filePath}"`,
      { cwd: root, encoding: 'utf8', timeout: 10000 }
    );
    const lines = output.trim().split('\n').filter(Boolean);
    return lines.length > 0 ? lines : [];
  } catch {
    return [];
  }
}

// Format version key: "1.1.153" → "v1_1_153"
const versionKey = 'v' + String(report.appVersion || '0_0_0').replace(/\./g, '_');

// Build files object with commit messages
const changedFiles = report.changedFiles || [];
const files = {};
for (const filePath of changedFiles) {
  if (!filePath || filePath === 'git-unavailable') continue;
  const commits = getFileCommits(filePath);
  files[filePath] = { commits };
}

const releaseData = {
  version: String(report.appVersion || ''),
  versionCode: Number(report.versionCode) || 0,
  buildStamp: String(report.buildStamp || ''),
  commitHash: String(report.commitHash || ''),
  buildMode: String(report.buildMode || ''),
  otaMode: String(report.otaMode || ''),
  timestamp: String(report.timestamp || new Date().toISOString()),
  machineId: String(report.machineId || 'unknown'),
  apkSha256: String(report.apk?.sha256 || 'unknown'),
  apkSizeMB: Number(report.apk?.sizeMB) || 0,
  bundleFingerprint: String(report.bundle?.fingerprint || 'not-verified'),
  files,
  summary: '',
  createdAt: Date.now(),
};

async function registerRelease() {
  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    console.warn('[REGISTER] firebase-admin not available, skipping Firebase registration');
    return;
  }

  const databaseURL = process.env.FIREBASE_DATABASE_URL || 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com';

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL,
      });
    }

    const db = admin.database();
    await db.ref(`app_releases/${versionKey}`).set(releaseData);

    const fileCount = Object.keys(files).length;
    console.log(`[REGISTER] Release registered: v${report.appVersion}`);
    console.log(`[REGISTER]   Files changed: ${fileCount}`);
    console.log(`[REGISTER]   Version key: ${versionKey}`);
    console.log(`[REGISTER]   Path: app_releases/${versionKey}`);

    // Write app_version_registry/current so the mobile app and admin panel
    // always know the latest published APK URL without hard-coding it.
    const safeName = 'ChaikaLife-v' +
      String(report.appVersion || '').replace(/[\s:/\\]/g, '-') + '-' +
      String(report.buildStamp || '').replace(/[\s:/\\]/g, '-');
    const apkUrl = `https://chaika-life.netlify.app/release/${safeName}.apk`;

    await db.ref('app_version_registry/current').set({
      version: String(report.appVersion || ''),
      buildStamp: String(report.buildStamp || ''),
      apkUrl,
      publishedAt: Date.now(),
    });
    console.log(`[REGISTER] Version registry updated: app_version_registry/current`);
    console.log(`[REGISTER]   APK URL: ${apkUrl}`);
  } catch (err) {
    console.warn(`[REGISTER] Firebase registration failed (warning, build continues): ${err.message}`);
    console.warn('[REGISTER] To enable: set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON file');
  }
}

registerRelease().catch((err) => {
  console.warn(`[REGISTER] Unexpected error (warning): ${err.message}`);
});

/**
 * generate-build-report.cjs
 *
 * Produces:
 *   release/build-report.json  — machine-readable report
 *   release/BUILD_RESULT.txt   — human-readable one-pager
 *
 * Usage:
 *   node generate-build-report.cjs <builtApk> <versionedApk> <appVersion>
 *        <versionCode> <buildStamp> <commitHash> <buildMode> <otaMode>
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const [
  builtApkPath,
  versionedApkPath,
  appVersion,
  versionCodeStr,
  buildStamp,
  commitHash,
  buildMode,
  otaMode,
] = process.argv.slice(2);

if (!builtApkPath || !appVersion) {
  console.error('Usage: node generate-build-report.cjs <builtApk> <versionedApk> <appVersion> <versionCode> <buildStamp> <commitHash> <buildMode> <otaMode>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'build-manifest.json');

// Read manifest if it exists (has fingerprint data from verify step)
let manifest = {};
if (fs.existsSync(manifestPath)) {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

// Compute APK sha256 if not already in manifest
function sha256File(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

const apkSha256 = manifest.apkSha256 || (fs.existsSync(builtApkPath) ? sha256File(builtApkPath) : 'unknown');
const apkSize = fs.existsSync(builtApkPath) ? fs.statSync(builtApkPath).size : 0;

// Get changed files from git
let changedFiles = [];
try {
  const output = execSync('git diff --name-only HEAD~1 HEAD', { cwd: root, encoding: 'utf8', timeout: 10000 });
  changedFiles = output.trim().split('\n').filter(Boolean);
} catch {
  try {
    const output = execSync('git status --short', { cwd: root, encoding: 'utf8', timeout: 10000 });
    changedFiles = output.trim().split('\n').filter(Boolean).map((l) => l.trim().replace(/^[A-Z?!]+\s+/, ''));
  } catch {
    changedFiles = ['git-unavailable'];
  }
}

// Build report
const report = {
  result: 'OK',
  timestamp: new Date().toISOString(),
  buildMode,
  otaMode,
  appVersion,
  versionCode: parseInt(versionCodeStr, 10) || 0,
  buildStamp,
  commitHash,
  machineId: `${process.env.COMPUTERNAME || 'unknown'}/${process.env.USERNAME || 'unknown'}`,
  apk: {
    builtPath: builtApkPath,
    versionedPath: versionedApkPath,
    sha256: apkSha256,
    sizeBytes: apkSize,
    sizeMB: Math.round((apkSize / (1024 * 1024)) * 100) / 100,
  },
  bundle: {
    fingerprint: manifest.bundleFingerprint || 'not-verified',
    sizeKB: manifest.bundleSizeKB || 0,
  },
  changedFiles: changedFiles.slice(0, 100),
  steps: {
    versionBump: true,
    cacheClear: true,
    gradleClean: true,
    gradleBuild: true,
    freshnessCheck: true,
    bundleFingerprint: !!manifest.bundleFingerprint,
    firebaseDeploy: buildMode !== 'LOCAL_APK_ONLY',
    easOtaUpdate: buildMode === 'FULL_RELEASE_WITH_OTA',
  },
};

// Write JSON report
if (!fs.existsSync(releaseDir)) fs.mkdirSync(releaseDir, { recursive: true });
const jsonPath = path.join(releaseDir, 'build-report.json');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`Report: ${jsonPath}`);

// Write human-readable BUILD_RESULT.txt
const sizeMB = report.apk.sizeMB;
const lines = [
  `BUILD RESULT: ${report.result}`,
  `═══════════════════════════════════════════`,
  `Version:    v${appVersion} (code ${report.versionCode})`,
  `Stamp:      ${buildStamp}`,
  `Commit:     ${commitHash}`,
  `Mode:       ${buildMode}`,
  `OTA:        ${otaMode}`,
  `Machine:    ${report.machineId}`,
  `Timestamp:  ${report.timestamp}`,
  ``,
  `APK:        ${versionedApkPath}`,
  `Size:       ${sizeMB} MB`,
  `SHA256:     ${apkSha256}`,
  ``,
  `Bundle SHA256: ${report.bundle.fingerprint}`,
  `Bundle size:   ${report.bundle.sizeKB} KB`,
  ``,
  `Firebase deploy: ${report.steps.firebaseDeploy ? 'YES' : 'SKIPPED'}`,
  `EAS OTA update:  ${report.steps.easOtaUpdate ? 'YES' : 'SKIPPED'}`,
  ``,
  `Changed files (${changedFiles.length}):`,
  ...changedFiles.slice(0, 50).map((f) => `  ${f}`),
  changedFiles.length > 50 ? `  ... and ${changedFiles.length - 50} more` : '',
].filter((l) => l !== undefined);

const txtPath = path.join(releaseDir, 'BUILD_RESULT.txt');
fs.writeFileSync(txtPath, lines.join('\n') + '\n', 'utf8');
console.log(`Result: ${txtPath}`);

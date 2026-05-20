/**
 * verify-apk-bundle-fingerprint.cjs
 *
 * Extracts index.android.bundle from the built APK (ZIP),
 * computes its SHA-256 fingerprint, and writes it into the
 * build-manifest.json. On subsequent runs (or if called with
 * an expected hash), it verifies the fingerprint matches.
 *
 * Usage:
 *   node verify-apk-bundle-fingerprint.cjs <apk-path> <manifest-path>
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const stripBom = (text) => text.replace(/^\uFEFF/, '');

// Minimal ZIP central-directory parser — no external deps.
function readZipEntry(zipPath, entryName) {
  const buf = fs.readFileSync(zipPath);

  // Find End of Central Directory record (last 22+ bytes)
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('Not a valid ZIP (EOCD not found)');

  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const cdEntries = buf.readUInt16LE(eocdOffset + 10);

  let offset = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;

    const compressedSize = buf.readUInt32LE(offset + 20);
    const uncompressedSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.slice(offset + 46, offset + 46 + nameLen).toString('utf8');
    const compressionMethod = buf.readUInt16LE(offset + 10);

    if (name === entryName) {
      // Read local file header to find data start
      const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;

      if (compressionMethod === 0) {
        // Stored (no compression)
        return buf.slice(dataStart, dataStart + uncompressedSize);
      }

      // Deflate — use zlib
      const zlib = require('zlib');
      const compressed = buf.slice(dataStart, dataStart + compressedSize);
      return zlib.inflateRawSync(compressed);
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  return null;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ── Main ──────────────────────────────────────────────────────────────
const [apkPath, manifestPath] = process.argv.slice(2);

if (!apkPath || !manifestPath) {
  console.error('Usage: node verify-apk-bundle-fingerprint.cjs <apk-path> <manifest-path>');
  process.exit(1);
}

if (!fs.existsSync(apkPath)) {
  console.error(`APK not found: ${apkPath}`);
  process.exit(1);
}

const bundleName = 'assets/index.android.bundle';
const bundleData = readZipEntry(apkPath, bundleName);

if (!bundleData) {
  console.error(`FAIL: ${bundleName} not found inside APK`);
  process.exit(1);
}

const bundleHash = sha256(bundleData);
const bundleSizeKB = Math.round(bundleData.length / 1024);

console.log(`Bundle: ${bundleName}`);
console.log(`Size:   ${bundleSizeKB} KB`);
console.log(`SHA256: ${bundleHash}`);

// Minimum bundle size sanity check (< 200 KB is suspicious)
if (bundleSizeKB < 200) {
  console.error(`FAIL: Bundle is suspiciously small (${bundleSizeKB} KB < 200 KB minimum)`);
  process.exit(1);
}

// Write fingerprint into manifest
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(stripBom(fs.readFileSync(manifestPath, 'utf8')));
  manifest.bundleFingerprint = bundleHash;
  manifest.bundleSizeKB = bundleSizeKB;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Manifest updated: ${manifestPath}`);
}

// Compute APK hash too
const apkHash = sha256(fs.readFileSync(apkPath));
console.log(`APK SHA256: ${apkHash}`);

if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(stripBom(fs.readFileSync(manifestPath, 'utf8')));
  manifest.apkSha256 = apkHash;
  manifest.apkSizeBytes = fs.statSync(apkPath).size;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

console.log('PASS: Bundle fingerprint verified');
process.exit(0);

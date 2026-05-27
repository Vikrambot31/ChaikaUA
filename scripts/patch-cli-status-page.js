/**
 * patch-cli-status-page.js
 * Fixes @react-native-community/cli-server-api ERR_INVALID_CHAR on Windows:
 * "Invalid character in header content [X-React-Native-Project-Root]"
 *
 * Root cause: process.cwd() on Windows returns a path with backslashes that
 * Node.js 18+ HTTP module rejects as an invalid header value in strict mode.
 * Wrapping with encodeURI() makes it safe ASCII-only.
 *
 * Run automatically via package.json postinstall.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '../node_modules/@react-native-community/cli-server-api/build/statusPageMiddleware.js',
);

if (!fs.existsSync(filePath)) {
  console.log('[patch-cli-status-page] File not found, skipping.');
  process.exit(0);
}

const original = fs.readFileSync(filePath, 'utf8');

// Already patched — nothing to do.
if (original.includes('encodeURI(process.cwd())')) {
  console.log('[patch-cli-status-page] ✓ Already patched, skipping.');
  process.exit(0);
}

// Original upstream line (cli-server-api ≤ 12.3.x):
const BROKEN = `res.setHeader('X-React-Native-Project-Root', process.cwd());`;
const FIXED   = `// Keep the header ASCII-only to avoid Node.js ERR_INVALID_CHAR on Windows.\n  res.setHeader('X-React-Native-Project-Root', encodeURI(process.cwd()));`;

if (original.includes(BROKEN)) {
  fs.writeFileSync(filePath, original.replace(BROKEN, FIXED), 'utf8');
  console.log('[patch-cli-status-page] ✓ Patch applied — X-React-Native-Project-Root header is now ASCII-safe.');
} else {
  console.log('[patch-cli-status-page] WARNING: Pattern not found — may be fixed upstream or the file changed. Review manually.');
}

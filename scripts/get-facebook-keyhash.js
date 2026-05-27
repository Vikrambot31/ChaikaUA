/**
 * get-facebook-keyhash.js
 * Generates Facebook Android Key Hash without requiring OpenSSL in PATH.
 * Uses Node.js built-in crypto module.
 *
 * Usage: node scripts/get-facebook-keyhash.js
 * Or:    npm run facebook:keyhash:debug
 */
const crypto = require('crypto');
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

const keystore = path.join(os.homedir(), '.android', 'debug.keystore');

console.log(`Keystore path: ${keystore}\n`);

try {
  const cert = execSync(
    `keytool -exportcert -alias androiddebugkey -keystore "${keystore}" -storepass android -keypass android`,
    { encoding: 'binary', stdio: ['pipe', 'pipe', 'pipe'] }
  );

  const hash = crypto.createHash('sha1').update(cert, 'binary').digest('base64');

  console.log('========================================');
  console.log('Facebook Debug Key Hash:');
  console.log(hash);
  console.log('========================================');
  console.log('\nAdd this to:');
  console.log('Facebook Developer Console → Your App → Settings → Basic → Android → Key Hashes');
} catch (e) {
  console.error('Error:', e.message);
  console.log('\nTroubleshooting:');
  console.log('1. Make sure Java SDK is installed (keytool must be in PATH)');
  console.log(`2. Make sure debug.keystore exists at: ${keystore}`);
  console.log('   (Run "expo run:android" once to auto-generate it)');
}

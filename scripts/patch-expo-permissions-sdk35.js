/**
 * patch-expo-permissions-sdk35.js
 * Fixes expo-modules-core PermissionsService.kt compilation with compileSdkVersion 35.
 *
 * Root cause: Android SDK 35 adds explicit @Nullable annotation to
 * PackageInfo.requestedPermissions, changing it from a platform type to
 * an explicitly nullable type. Calling .contains() on nullable Array
 * fails Kotlin strict null-safety check.
 *
 * Error: "Only safe (?.) or non-null asserted (!!.) calls are allowed
 *         on a nullable receiver of type Array<(out) String!>?"
 *
 * expo-modules-core@1.11.14 (npm) ships:
 *   return requestedPermissions.contains(permission)
 *
 * Fix replaces with null-safe chain:
 *   return requestedPermissions?.toList()?.contains(permission) ?: false
 *
 * Run automatically via package.json postinstall.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '../node_modules/expo-modules-core/android/src/main/java/expo/modules/adapters/react/permissions/PermissionsService.kt'
);

if (!fs.existsSync(filePath)) {
  console.log('[patch-expo-permissions-sdk35] File not found, skipping.');
  process.exit(0);
}

const original = fs.readFileSync(filePath, 'utf8');

const FIXED = `return requestedPermissions?.toList()?.contains(permission) ?: false`;

// All known variants in npm releases of expo-modules-core@1.11.x
const BROKEN_VARIANTS = [
  `return requestedPermissions.contains(permission)`,           // npm 1.11.14 actual
  `return requestedPermissions?.contains(permission) == true`,  // with ?. and == true
  `return requestedPermissions.contains(permission) == true`,   // without ?. but with == true
];

if (original.includes(FIXED)) {
  console.log('[patch-expo-permissions-sdk35] \u2713 Already patched, skipping.');
  process.exit(0);
}

let patched = false;
for (const broken of BROKEN_VARIANTS) {
  if (original.includes(broken)) {
    fs.writeFileSync(filePath, original.replace(broken, FIXED), 'utf8');
    console.log(`[patch-expo-permissions-sdk35] \u2713 Patched PermissionsService.kt`);
    console.log(`  replaced: ${broken}`);
    console.log(`  with:     ${FIXED}`);
    patched = true;
    break;
  }
}

if (!patched) {
  const lines = original.split('\n');
  const around160 = lines.slice(160, 172).join('\n');
  console.log('[patch-expo-permissions-sdk35] ERROR: No known pattern found!');
  console.log('Lines 161-172 of actual file:');
  console.log(around160);
  process.exit(1);
}

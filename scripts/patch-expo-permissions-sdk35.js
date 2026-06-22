/**
 * patch-expo-permissions-sdk35.js
 * Fixes expo-modules-core PermissionsService.kt compilation with compileSdkVersion 35.
 *
 * Root cause: Android SDK 35 adds explicit @Nullable annotation to
 * PackageInfo.requestedPermissions, changing it from a platform type
 * (Array<String!>!) to an explicitly nullable type (Array<String!>?).
 * Calling .contains() on a nullable Array fails Kotlin null-safety check.
 *
 * Error: "Only safe (?.) or non-null asserted (!!.) calls are allowed
 *         on a nullable receiver of type Array<(out) String!>?"
 *
 * The npm package (expo-modules-core@1.11.14) uses .contains() without ?.
 * Fix: replace with ?.toList()?.contains() which handles nullable safely.
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

const FIXED = `return requestedPermissions?.toList()?.contains(permission) == true`;

// Handle both variants: with and without ?. before .contains()
const BROKEN_NO_SAFE = `return requestedPermissions.contains(permission) == true`;
const BROKEN_WITH_SAFE = `return requestedPermissions?.contains(permission) == true`;

if (original.includes(FIXED)) {
  console.log('[patch-expo-permissions-sdk35] \u2713 Already patched, skipping.');
} else if (original.includes(BROKEN_NO_SAFE)) {
  fs.writeFileSync(filePath, original.replace(BROKEN_NO_SAFE, FIXED), 'utf8');
  console.log('[patch-expo-permissions-sdk35] \u2713 Patched PermissionsService.kt (variant: .contains without ?.)');
} else if (original.includes(BROKEN_WITH_SAFE)) {
  fs.writeFileSync(filePath, original.replace(BROKEN_WITH_SAFE, FIXED), 'utf8');
  console.log('[patch-expo-permissions-sdk35] \u2713 Patched PermissionsService.kt (variant: ?.contains)');
} else {
  // Print actual content around line 166 for debugging
  const lines = original.split('\n');
  const around = lines.slice(163, 170).join('\n');
  console.log('[patch-expo-permissions-sdk35] WARNING: Pattern not found. Lines 164-170:\n' + around);
}

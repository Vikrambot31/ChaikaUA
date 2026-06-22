/**
 * patch-expo-permissions-sdk35.js
 * Fixes expo-modules-core PermissionsService.kt compilation with compileSdkVersion 35.
 *
 * Root cause: Android SDK 35 adds explicit @Nullable annotation to
 * PackageInfo.requestedPermissions, changing it from a platform type
 * (Array<String!>!) to an explicitly nullable type (Array<String!>?).
 * The .contains() extension function cannot be called directly on a
 * nullable Array receiver — must use ?.toList()?.contains() instead.
 *
 * Error: "Only safe (?.) or non-null asserted (!!.) calls are allowed
 *         on a nullable receiver of type Array<(out) String!>?"
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

const BROKEN = `return requestedPermissions?.contains(permission) == true`;
const FIXED = `return requestedPermissions?.toList()?.contains(permission) == true`;

if (original.includes(BROKEN)) {
  fs.writeFileSync(filePath, original.replace(BROKEN, FIXED), 'utf8');
  console.log('[patch-expo-permissions-sdk35] \u2713 Patched PermissionsService.kt for compileSdk 35.');
} else if (original.includes(FIXED)) {
  console.log('[patch-expo-permissions-sdk35] \u2713 Already patched, skipping.');
} else {
  console.log('[patch-expo-permissions-sdk35] WARNING: Pattern not found — may be fixed upstream.');
}

/**
 * patch-expo-modules-agp8.js
 * Fixes expo-modules-core AGP 8.x compatibility:
 * "Could not get unknown property 'release' for SoftwareComponent container"
 *
 * Root cause: singleVariant("release") must be declared BEFORE afterEvaluate
 * so that components.release is available when afterEvaluate runs.
 *
 * Run automatically via package.json postinstall.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  '../node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle'
);

if (!fs.existsSync(filePath)) {
  console.log('[patch-expo-modules-agp8] File not found, skipping.');
  process.exit(0);
}

const original = fs.readFileSync(filePath, 'utf8');

const BROKEN = `  afterEvaluate {
    publishing {
      publications {
        release(MavenPublication) {
          from components.release
        }
      }
      repositories {
        maven {
          url = mavenLocal().url
        }
      }
    }
  }

  android {
    publishing {
      singleVariant("release") {
        withSourcesJar()
      }
    }
  }`;

const FIXED = `  // singleVariant must be declared BEFORE afterEvaluate so components.release is available (AGP 8.x fix)
  android {
    publishing {
      singleVariant("release") {
        withSourcesJar()
      }
    }
  }

  afterEvaluate {
    publishing {
      publications {
        release(MavenPublication) {
          from components.release
        }
      }
      repositories {
        maven {
          url = mavenLocal().url
        }
      }
    }
  }`;

if (original.includes(BROKEN)) {
  fs.writeFileSync(filePath, original.replace(BROKEN, FIXED), 'utf8');
  console.log('[patch-expo-modules-agp8] ✓ Patch applied — AGP 8.x compatible now.');
} else if (original.includes('singleVariant must be declared BEFORE')) {
  console.log('[patch-expo-modules-agp8] ✓ Already patched, skipping.');
} else {
  console.log('[patch-expo-modules-agp8] WARNING: Pattern not found — may already be fixed upstream or changed.');
}

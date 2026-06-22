// Dynamic Expo config: reads production values from .env via dotenv.
// Keeps Firebase keys out of the static app.json file.
require('dotenv').config({ quiet: true });

// Fix FCM manifest merger conflict: react-native-firebase_messaging and expo-notifications
// both define com.google.firebase.messaging.default_notification_color.
// Adding tools:replace resolves the duplicate attribute error.
const withFcmManifestFix = (config) => {
  const { withAndroidManifest } = require('@expo/config-plugins');
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults;
    const application = manifest.manifest.application?.[0];
    if (!application) return androidConfig;
    application.$ = application.$ || {};
    application.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const metaDataArray = application['meta-data'] || [];
    for (const item of metaDataArray) {
      if (item.$?.['android:name'] === 'com.google.firebase.messaging.default_notification_color') {
        item.$['tools:replace'] = 'android:resource';
        break;
      }
    }
    application['meta-data'] = metaDataArray;
    return androidConfig;
  });
};

const CANONICAL_FIREBASE_DATABASE_URL = 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com';
const CANONICAL_FIREBASE_STORAGE_BUCKET = 'chaikaua-3cd9d.firebasestorage.app';

const envOrConfig = (envKey, configExtra, extraKey) => {
  const value = process.env[envKey] || configExtra?.[extraKey] || '';
  return typeof value === 'string' ? value.trim() : value;
};

module.exports = ({ config }) => {
  const currentExtra = config.extra || {};

  const facebookAppId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || currentExtra.facebookAppId || '';
  const facebookClientToken = process.env.EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN || currentExtra.facebookClientToken || '';

  const facebookPlugin = facebookAppId && facebookClientToken
    ? [
        'react-native-fbsdk-next',
        {
          appID: facebookAppId,
          clientToken: facebookClientToken,
          displayName: config.name || 'Chaika Life',
          scheme: `fb${facebookAppId}`,
          advertiserIDCollectionEnabled: false,
          autoLogAppEventsEnabled: false,
          isAutoInitEnabled: true,
        },
      ]
    : null;

  const baseConfig = {
    ...config,
    plugins: [
      ...(config.plugins || []),
      'expo-secure-store',
      'expo-apple-authentication',
      ...(facebookPlugin ? [facebookPlugin] : []),
    ],
    extra: {
      ...currentExtra,
      facebookAppId,
      facebookClientToken,
      firebaseApiKey: envOrConfig('FIREBASE_API_KEY', currentExtra, 'firebaseApiKey'),
      firebaseAuthDomain: envOrConfig('FIREBASE_AUTH_DOMAIN', currentExtra, 'firebaseAuthDomain'),
      firebaseDatabaseURL: CANONICAL_FIREBASE_DATABASE_URL,
      firebaseProjectId: envOrConfig('FIREBASE_PROJECT_ID', currentExtra, 'firebaseProjectId'),
      firebaseStorageBucket: CANONICAL_FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: envOrConfig('FIREBASE_MESSAGING_SENDER_ID', currentExtra, 'firebaseMessagingSenderId'),
      firebaseAppId: envOrConfig('FIREBASE_APP_ID', currentExtra, 'firebaseAppId'),
      firebaseMeasurementId: envOrConfig('FIREBASE_MEASUREMENT_ID', currentExtra, 'firebaseMeasurementId'),
      googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || currentExtra.googleWebClientId,
      // Explicit dev/prod split — falls back to the single key if not set
      googleWebClientIdDev:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID_DEV ||
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
        currentExtra.googleWebClientIdDev ||
        currentExtra.googleWebClientId,
      googleWebClientIdProd:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID_PROD ||
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
        currentExtra.googleWebClientIdProd ||
        currentExtra.googleWebClientId,
      adminServiceEmail: process.env.EXPO_PUBLIC_ADMIN_SERVICE_EMAIL || currentExtra.adminServiceEmail || 'vikramsave@ukr.net',
      versionConfigUrl: process.env.VERSION_CONFIG_URL || currentExtra.versionConfigUrl || 'https://chaika-life.netlify.app/app-version.json',
      serviceModerationPin: process.env.SERVICE_MODERATION_PIN || '',
    },
  };
  return withFcmManifestFix(baseConfig);
};

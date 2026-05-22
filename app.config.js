// Dynamic Expo config: reads production values from .env via dotenv.
// Keeps Firebase keys out of the static app.json file.
require('dotenv').config({ quiet: true });

module.exports = ({ config }) => {
  return {
    ...config,
    plugins: [...(config.plugins || []), 'expo-secure-store', 'expo-apple-authentication'],
    extra: {
      firebaseApiKey: process.env.FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN,
      firebaseDatabaseURL: process.env.FIREBASE_DATABASE_URL,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.FIREBASE_APP_ID,
      firebaseMeasurementId: process.env.FIREBASE_MEASUREMENT_ID,
      googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      // Explicit dev/prod split — falls back to the single key if not set
      googleWebClientIdDev:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID_DEV ||
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      googleWebClientIdProd:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID_PROD ||
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      adminServiceEmail: process.env.EXPO_PUBLIC_ADMIN_SERVICE_EMAIL || 'vikramsave@ukr.net',
      versionConfigUrl: process.env.VERSION_CONFIG_URL || 'https://chaika-life.netlify.app/app-version.json',
      serviceModerationPin: process.env.SERVICE_MODERATION_PIN || '',
    },
  };
};

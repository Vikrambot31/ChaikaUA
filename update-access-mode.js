#!/usr/bin/env node
/**
 * Update Firebase access control mode to reflect actual app state.
 * Currently: app has NO restrictions, all authenticated users get full access.
 * So Firebase flag should show: enabled=false, mode='disabled'
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com/',
});

const db = admin.database();

async function updateAccessMode() {
  try {
    const path = 'feature_flags/invite_access/current';
    const newConfig = {
      enabled: false,
      mode: 'disabled',
      updatedAt: Date.now(),
      updatedBy: 'system-update',
      version: 1,
    };

    console.log(`📝 Updating Firebase: ${path}`);
    console.log('New config:', JSON.stringify(newConfig, null, 2));

    await db.ref(path).set(newConfig);

    console.log('✅ Updated successfully!');
    console.log('\n📋 Current value in Firebase:');
    const snapshot = await db.ref(path).get();
    console.log(JSON.stringify(snapshot.val(), null, 2));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateAccessMode();

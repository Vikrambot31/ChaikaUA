#!/usr/bin/env node

/**
 * Check CURRENT warnings/issues on Dashboard
 * Shows exactly what warnings are active RIGHT NOW
 */

const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get } = require('firebase/database');

const firebaseConfig = {
  apiKey: 'AIzaSyDcohmy5PiUiEDQ5mholkY59HpOmeeoG6E',
  authDomain: 'chaikaua-3cd9d.firebaseapp.com',
  databaseURL: 'https://chaikaua-3cd9d-default-rtdb.firebaseio.com',
  projectId: 'chaikaua-3cd9d',
  storageBucket: 'chaikaua-3cd9d.firebasestorage.app',
  messagingSenderId: '558624873305',
  appId: '1:558624873305:web:1dcb2dbbef98f8a79f26cb',
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const MODERATION_PATHS = {
  requests: 'help_requests/queue',
  appSuggestions: 'app_suggestions/queue',
  communityPhotos: 'community_photos/queue',
  buySell: 'buy_sell_listings/queue',
  contactsListings: 'contacts_listings/queue',
  biznesChaikaListings: 'biznes_chaika_listings/queue',
  localBusiness: 'local_business/queue',
  jobs: 'job_listings/queue',
  lostFound: 'lost_found/queue',
  osbbNews: 'osbb_news/queue',
  osbbVotes: 'osbb_votes/queue',
  osbbHouseTopics: 'osbb_house_topics/queue',
  osbbCollections: 'osbb_collections/queue',
};

const getNum = (v) => (Number.isFinite(v) ? Number(v) : 0);

async function checkCurrentWarnings() {
  try {
    console.log('⏳ Checking current system state...\n');

    // 1. Check app control config
    const configSnapshot = await get(ref(database, 'security_config/app_control/current')).catch(() => null);
    const config = configSnapshot?.val() || {};

    // 2. Check authorized devices
    const devicesSnapshot = await get(ref(database, 'authorized_devices')).catch(() => null);
    const devicesRaw = devicesSnapshot?.val() || {};

    // 3. Check moderation queues
    const moderationPaths = Object.values(MODERATION_PATHS);
    const moderationSnapshots = await Promise.all(
      moderationPaths.map((path) => get(ref(database, path)).catch(() => null))
    );

    // Parse moderation data
    const countModerationTree = (raw) => {
      const counter = { total: 0, pending: 0, approved: 0, rejected: 0, expired: 0 };
      if (!raw || typeof raw !== 'object') return counter;

      Object.values(raw).forEach((value) => {
        if (!value || typeof value !== 'object') return;
        const status = value.moderationStatus || value.status || 'pending';
        counter.total += 1;
        if (status === 'pending' || status === undefined) counter.pending += 1;
        else if (status === 'approved' || status === 'active') counter.approved += 1;
        else if (status === 'rejected') counter.rejected += 1;
        else if (status === 'expired') counter.expired += 1;
      });

      return counter;
    };

    const moderationCounts = moderationSnapshots.map((snap) => countModerationTree(snap?.val()));
    const totalModeration = moderationCounts.reduce(
      (acc, item) => ({
        total: acc.total + item.total,
        pending: acc.pending + item.pending,
        approved: acc.approved + item.approved,
        rejected: acc.rejected + item.rejected,
        expired: acc.expired + item.expired,
      }),
      { total: 0, pending: 0, approved: 0, rejected: 0, expired: 0 }
    );

    // Parse device data
    const flattenDevices = (raw) => {
      if (!raw || typeof raw !== 'object') return [];
      return Object.entries(raw).flatMap(([uid, devices]) =>
        Object.entries(devices || {}).map(([id, value]) => ({ uid, id, value }))
      );
    };

    const devices = flattenDevices(devicesRaw);
    const blockedDevices = devices.filter((d) => d.value.is_blocked === true);
    const deniedDevices = devices.filter((d) => d.value.is_allowed === false && d.value.is_blocked !== true);
    const flaggedDevices = devices.filter((d) => Array.isArray(d.value.security_flags) && d.value.security_flags.length > 0);

    // Build issues list
    const issues = [];

    if (config.maintenance_mode === true) {
      issues.push({
        id: 'maintenance',
        severity: 'critical',
        title: '🔧 MAINTENANCE MODE ACTIVE',
        detail: 'Application is in maintenance mode - users cannot access the app',
        firebase_path: 'security_config/app_control/current.maintenance_mode',
        action: 'Disable maintenance mode',
      });
    }

    if (config.app_enabled === false) {
      issues.push({
        id: 'app_disabled',
        severity: 'critical',
        title: '🚫 APP DISABLED',
        detail: 'Application access is completely disabled',
        firebase_path: 'security_config/app_control/current.app_enabled',
        action: 'Enable the application',
      });
    }

    if (totalModeration.pending > 50) {
      issues.push({
        id: 'pending_overflow',
        severity: 'warning',
        title: `⚠️ PENDING MODERATION OVERFLOW (${totalModeration.pending})`,
        detail: `${totalModeration.pending} items waiting for moderation (threshold: 50)`,
        firebase_path: '13 moderation queue paths',
        action: `Review and approve/reject items to get below 50 (currently ${totalModeration.pending})`,
      });
    }

    if (deniedDevices.length > 0) {
      issues.push({
        id: 'denied_devices',
        severity: 'info',
        title: `⏳ PENDING DEVICE AUTHORIZATION (${deniedDevices.length})`,
        detail: `${deniedDevices.length} devices waiting for approval (is_allowed=false)`,
        firebase_path: 'authorized_devices',
        action: `Review and approve/block devices (currently ${deniedDevices.length})`,
        devices: deniedDevices.slice(0, 3).map((d) => `${d.uid.slice(0, 20)}.../${d.id.slice(0, 15)}...`),
      });
    }

    if (blockedDevices.length > 0) {
      issues.push({
        id: 'blocked_devices',
        severity: 'warning',
        title: `🔒 BLOCKED DEVICES (${blockedDevices.length})`,
        detail: `${blockedDevices.length} devices are blocked (is_blocked=true)`,
        firebase_path: 'authorized_devices',
        action: `Unblock devices if they should be trusted (currently ${blockedDevices.length})`,
        devices: blockedDevices.slice(0, 3).map((d) => `${d.uid.slice(0, 20)}.../${d.id.slice(0, 15)}...`),
      });
    }

    if (flaggedDevices.length > 0) {
      issues.push({
        id: 'device_flags',
        severity: 'info',
        title: `🚩 DEVICES WITH SECURITY FLAGS (${flaggedDevices.length})`,
        detail: `${flaggedDevices.length} devices have security flags set`,
        firebase_path: 'authorized_devices[uid][device_id].security_flags',
        action: `Review and clear security flags (currently ${flaggedDevices.length})`,
        devices: flaggedDevices.slice(0, 3).map((d) => ({
          device: `${d.uid.slice(0, 20)}.../${d.id.slice(0, 15)}...`,
          flags: d.value.security_flags,
        })),
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // OUTPUT REPORT
    // ═══════════════════════════════════════════════════════════════

    console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    CURRENT DASHBOARD WARNINGS REPORT                          ║');
    console.log('║                        Status as of: ' + new Date().toLocaleString('uk-UA') + '                 ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════════╝\n');

    if (issues.length === 0) {
      console.log('✅ STATUS: SYSTEM HEALTHY - NO ACTIVE WARNINGS\n');
    } else {
      console.log(`⚠️  STATUS: ${issues.length} ACTIVE WARNING(S)\n`);
      console.log('═'.repeat(88) + '\n');

      issues.forEach((issue, idx) => {
        console.log(`${idx + 1}. ${issue.title}`);
        console.log(`   Severity: ${issue.severity}`);
        console.log(`   Status: ${issue.detail}`);
        console.log(`   Firebase: ${issue.firebase_path}`);
        console.log(`   Action: ${issue.action}`);
        if (issue.devices) {
          console.log(`   Affected items:`);
          if (Array.isArray(issue.devices[0])) {
            issue.devices.forEach((d) => console.log(`     • ${d.device} → flags: ${d.flags.join(', ')}`));
          } else {
            issue.devices.forEach((d) => console.log(`     • ${d}`));
          }
        }
        console.log('');
      });
    }

    // System Health Summary
    console.log('\n' + '═'.repeat(88));
    console.log('📊 SYSTEM HEALTH SUMMARY\n');

    console.log('Configuration Status:');
    console.log(`  Maintenance Mode: ${config.maintenance_mode === true ? '🔴 ON' : '🟢 OFF'}`);
    console.log(`  App Enabled: ${config.app_enabled === false ? '🔴 DISABLED' : '🟢 ENABLED'}`);
    console.log(`  Invite Access: ${config.invite_access_enabled === true ? '🟢 ON' : '🔴 OFF'}`);
    console.log(`  Min App Version: ${config.min_app_version || '(not set)'}`);
    console.log(`  Latest Version: ${config.latest_version || '(not set)'}\n`);

    console.log('Device Status:');
    console.log(`  Total Devices: ${devices.length}`);
    console.log(`  Online (last 15min): ${devices.filter((d) => {
      const lastSeen = getNum(d.value.last_seen_at);
      const now = Date.now();
      return lastSeen >= now - 15 * 60 * 1000 && d.value.is_blocked !== true;
    }).length}`);
    console.log(`  Blocked: ${blockedDevices.length} 🔒`);
    console.log(`  Pending Approval: ${deniedDevices.length} ⏳`);
    console.log(`  With Security Flags: ${flaggedDevices.length} 🚩\n`);

    console.log('Moderation Queue:');
    console.log(`  Total Items: ${totalModeration.total}`);
    console.log(`  Pending: ${totalModeration.pending} ${totalModeration.pending > 50 ? '⚠️ OVERFLOW' : '✅'}`);
    console.log(`  Approved: ${totalModeration.approved}`);
    console.log(`  Rejected: ${totalModeration.rejected}`);
    console.log(`  Expired: ${totalModeration.expired}\n`);

    // Recommendations
    console.log('═'.repeat(88));
    console.log('💡 RECOMMENDATIONS\n');

    if (issues.length === 0) {
      console.log('✅ System is in good shape! No critical actions needed.');
      console.log('   Continue monitoring for any new issues.\n');
    } else {
      const critical = issues.filter((i) => i.severity === 'critical');
      const warnings = issues.filter((i) => i.severity === 'warning');
      const info = issues.filter((i) => i.severity === 'info');

      if (critical.length > 0) {
        console.log('🔴 CRITICAL - ACT NOW:');
        critical.forEach((issue) => console.log(`   • ${issue.title.replace(/[^a-zA-Z0-9\s]/g, '').trim()}`));
        console.log('');
      }

      if (warnings.length > 0) {
        console.log('🟡 WARNINGS - SHOULD FIX:');
        warnings.forEach((issue) => console.log(`   • ${issue.title.replace(/[^a-zA-Z0-9\s]/g, '').trim()}`));
        console.log('');
      }

      if (info.length > 0) {
        console.log('ℹ️ INFO - CAN IGNORE OR REVIEW:');
        info.forEach((issue) => console.log(`   • ${issue.title.replace(/[^a-zA-Z0-9\s]/g, '').trim()}`));
        console.log('');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkCurrentWarnings();

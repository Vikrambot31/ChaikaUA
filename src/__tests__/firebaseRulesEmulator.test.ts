import fs from 'fs';
import path from 'path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const shouldRun = process.env.RUN_FIREBASE_EMULATOR_TESTS === '1';

const maybeDescribe = shouldRun ? describe : describe.skip;

maybeDescribe('Realtime Database emulator security rules', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'chaika-rules-test',
      database: {
        host: '127.0.0.1',
        port: 9000,
        rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firebase.rules.json'), 'utf8'),
      },
    });

    await testEnv.withSecurityRulesDisabled(async () => undefined);
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('security_config/app_control/current').set({
        app_enabled: true,
        maintenance_mode: false,
        maintenance_message: '',
        minimum_required_version: '0.0.0',
        force_update_required: false,
        allow_new_devices: true,
        beta_mode_enabled: false,
        config_version: 1,
        updated_at: Date.now(),
      });
      await context.database().ref('user_roles/moderatorUser').set({
        role: 'moderator',
      });
      await context.database().ref('osbb_votes/b1/v1').set({
        title: 'Lobby repair',
        question: 'Approve repair?',
        status: 'active',
        options: [
          { id: 'yes', labelKey: 'yes', votes: 0 },
          { id: 'no', labelKey: 'no', votes: 0 },
        ],
        voterIds: {},
        deadline: '2099-01-01T00:00:00.000Z',
        createdAt: '2026-04-30T00:00:00.000Z',
        createdBy: 'creatorUser',
        moderationStatus: 'approved',
      });
    });
  });

  const authedDb = (uid: string) =>
    testEnv.authenticatedContext(uid, {
        email: `${uid}@example.com`,
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      }).database();

  const deviceRecord = (deviceId = 'device-a', allowNewDevices = true) => ({
    device_id: deviceId,
    device_name: 'Pixel Test',
    platform: 'android',
    app_version: '1.0.0',
    created_at: 1760000000000,
    last_seen_at: 1760000000000,
    is_allowed: allowNewDevices,
    is_blocked: false,
    security_flags: ['secure_store_backed'],
  });

  it('allows client-side OSBB vote total changes for authenticated users', async () => {
    const db = authedDb('userA');

    await assertSucceeds(db.ref('osbb_votes/b1/v1').update({
      options: [
        { id: 'yes', labelKey: 'yes', votes: 1 },
        { id: 'no', labelKey: 'no', votes: 0 },
      ],
      voterIds: { userA: 'yes' },
    }));
  });

  it('allows non-zero client-created OSBB topic counters', async () => {
    const db = authedDb('userA');

    await assertSucceeds(db.ref('osbb_house_topics/b1/t1').set({
      title: 'Roof',
      votes: 7,
      createdAt: '2026-04-30T00:00:00.000Z',
      createdBy: 'userA',
      moderationStatus: 'pending',
    }));
  });

  it('allows self first-write when is_allowed follows allow_new_devices', async () => {
    const db = authedDb('userA');

    await assertSucceeds(db.ref('authorized_devices/userA/device-a').set(deviceRecord()));
  });

  it('keeps new devices pending when allow_new_devices is false', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('security_config/app_control/current/allow_new_devices').set(false);
    });

    const db = authedDb('userA');

    await assertSucceeds(db.ref('authorized_devices/userA/device-a').set(deviceRecord('device-a', false)));
    await assertFails(db.ref('authorized_devices/userA/device-b').set(deviceRecord('device-b', true)));
  });

  it('blocks self escalation of authorized device status', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('authorized_devices/userA/device-a').set(deviceRecord('device-a', false));
    });

    const db = authedDb('userA');

    await assertSucceeds(db.ref('authorized_devices/userA/device-a').update({
      last_seen_at: 1760000005000,
      app_version: '1.0.1',
      device_name: 'Pixel Test 2',
      security_flags: ['secure_store_backed'],
    }));
    await assertFails(db.ref('authorized_devices/userA/device-a').update({
      is_allowed: true,
    }));
    await assertFails(db.ref('authorized_devices/userA/device-a').update({
      is_blocked: false,
      platform: 'ios',
    }));
  });

  it('prevents unrelated users from reading authorized devices', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('authorized_devices/userA/device-a').set(deviceRecord());
    });

    await assertFails(authedDb('userB').ref('authorized_devices/userA/device-a').get());
    await assertSucceeds(authedDb('userA').ref('authorized_devices/userA/device-a').get());
    await assertSucceeds(authedDb('moderatorUser').ref('authorized_devices/userA/device-a').get());
  });

  it('allows moderator to change authorized device status', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('authorized_devices/userA/device-a').set(deviceRecord('device-a', false));
    });

    await assertSucceeds(authedDb('moderatorUser').ref('authorized_devices/userA/device-a').update({
      is_allowed: true,
      is_blocked: false,
    }));
  });

  it('rejects malformed authorized device security flags', async () => {
    const db = authedDb('userA');

    await assertFails(db.ref('authorized_devices/userA/device-a').set({
      ...deviceRecord(),
      security_flags: ['secure_store_backed', ...Array.from({ length: 20 }, (_, index) => `flag_${index}`)],
    }));
    await assertFails(db.ref('authorized_devices/userA/device-b').set({
      ...deviceRecord('device-b'),
      security_flags: ['x'.repeat(65)],
    }));
  });
});

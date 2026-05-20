const pushMock = jest.fn();
const refMock = jest.fn((_db: unknown, path: string) => ({ path }));

jest.mock('firebase/database', () => ({
  ref: (db: unknown, path: string) => refMock(db, path),
  push: (...args: unknown[]) => pushMock(...args),
}));

jest.mock('../firebase-core', () => ({
  database: {},
  auth: { currentUser: null },
}));

import { clearLocalErrors, getLocalErrors, logClientError } from '../utils/errorLogger';
import { clearRuntimeMonitorEntries, getRuntimeMonitorEntries } from '../services/runtimeMonitorService';
import {
  beginStartupSync,
  forceFinishStartupSync,
  resetStartupSyncForTests,
} from '../services/startupSync';

describe('errorLogger PII redaction', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    resetStartupSyncForTests();
    forceFinishStartupSync();
    clearLocalErrors();
    await clearRuntimeMonitorEntries();
    pushMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetStartupSyncForTests();
  });

  it('redacts email and phone in message and extra payload', async () => {
    await logClientError(
      'test_screen',
      new Error('failed for user mail test.user@example.com phone +380501112233'),
      {
        note: 'contact me at a@b.com',
        rawPhone: '+380 (50) 999-88-77',
      },
    );

    const [entry] = getLocalErrors();
    expect(entry.message).toContain('[redacted-email]');
    expect(entry.message).toContain('[redacted-phone]');
    expect(entry.message).not.toContain('test.user@example.com');
    expect(entry.message).not.toContain('+380501112233');
    expect(entry.note).toBe('contact me at [redacted-email]');
    expect(entry.rawPhone).toBe('[redacted-phone]');

    const [runtimeEntry] = getRuntimeMonitorEntries();
    expect(runtimeEntry.rawMessage).toContain('[redacted-email]');
    expect(runtimeEntry.rawMessage).toContain('[redacted-phone]');
    expect(runtimeEntry.rawMessage).not.toContain('test.user@example.com');
  });

  it('deduplicates repeated errors into one entry with repeat counter', async () => {
    await logClientError('deviceAuth.syncAuthorizedDeviceForUser', new Error('Invalid key provided to SecureStore'));
    await logClientError('deviceAuth.syncAuthorizedDeviceForUser', new Error('Invalid key provided to SecureStore'));

    const entries = getRuntimeMonitorEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].repeatCount).toBe(2);
  });

  it('suppresses transient startup sync errors from runtime monitor and remote ops log', async () => {
    beginStartupSync();

    await logClientError('deviceAuth.syncAuthorizedDeviceForUser', new Error('PERMISSION_DENIED: Permission denied'));

    expect(getRuntimeMonitorEntries()).toHaveLength(0);
    expect(pushMock).not.toHaveBeenCalled();
  });
});

const getMock = jest.fn();
const queryMock = jest.fn((value: unknown) => value);
const refMock = jest.fn((_db: unknown, path: string) => ({ path }));
const removeMock = jest.fn();
const setMock = jest.fn();
const getCurrentUserMock = jest.fn();

jest.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  query: (value: unknown) => queryMock(value),
  ref: (db: unknown, path: string) => refMock(db, path),
  remove: (...args: unknown[]) => removeMock(...args),
  set: (...args: unknown[]) => setMock(...args),
}));

jest.mock('../firebase-core', () => ({
  database: {},
}));

jest.mock('../firebase-auth-session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

import {
  blockCommunityUser,
  deleteCommunityUser,
  getUserAccessControlStatus,
  loadBlockedUsers,
  unblockCommunityUser,
} from '../services/serviceModeration';

const snapshot = (exists: boolean, value: unknown = null) => ({
  exists: () => exists,
  val: () => value,
});

describe('service moderation user controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUserMock.mockReturnValue({ uid: 'owner-1' });
    setMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
  });

  it('returns blocked/deleted access status with sanitized reason', async () => {
    getMock
      .mockResolvedValueOnce(snapshot(true, { reason: ' spam report ' }))
      .mockResolvedValueOnce(snapshot(true));

    await expect(getUserAccessControlStatus('user-1')).resolves.toEqual({
      isBlocked: true,
      isDeleted: true,
      reason: 'spam report',
    });

    expect(refMock).toHaveBeenCalledWith({}, 'service_moderation/blocked_users/user-1');
    expect(refMock).toHaveBeenCalledWith({}, 'service_moderation/deleted_users/user-1');
  });

  it('does not query Firebase when uid is empty', async () => {
    await expect(getUserAccessControlStatus('')).resolves.toEqual({
      isBlocked: false,
      isDeleted: false,
    });

    expect(getMock).not.toHaveBeenCalled();
  });

  it('blocks and unblocks users for any authenticated caller', async () => {
    await blockCommunityUser(
      {
        id: 'user-2',
        name: '  Ivan  Chaika  ',
        email: ' ivan@example.com ',
        phone: ' +380001112233 ',
      },
      ' manual review ',
    );

    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(
      { path: 'service_moderation/blocked_users/user-2' },
      expect.objectContaining({
        uid: 'user-2',
        name: 'Ivan Chaika',
        email: 'ivan@example.com',
        phone: '+380001112233',
        reason: 'manual review',
        blockedBy: 'owner-1',
      }),
    );

    await unblockCommunityUser('user-2');

    expect(getCurrentUserMock).toHaveBeenCalledTimes(2);
    expect(removeMock).toHaveBeenCalledWith({ path: 'service_moderation/blocked_users/user-2' });
  });

  it('loads blocked users sorted by newest first', async () => {
    getMock.mockResolvedValueOnce(
      snapshot(true, {
        older: {
          name: 'Older',
          blockedAt: '2026-01-01T00:00:00.000Z',
          blockedBy: 'owner-1',
        },
        newer: {
          name: 'Newer',
          reason: ' duplicate ',
          blockedAt: '2026-02-01T00:00:00.000Z',
          blockedBy: 'owner-2',
        },
      }),
    );

    await expect(loadBlockedUsers()).resolves.toMatchObject([
      { uid: 'newer', name: 'Newer', reason: 'duplicate' },
      { uid: 'older', name: 'Older' },
    ]);
  });

  it('marks deleted users, blocks them, and removes app profile data', async () => {
    await deleteCommunityUser({
      id: 'user-3',
      name: 'Deleted User',
      email: 'deleted@example.com',
      phone: '+380009998877',
    });

    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(
      { path: 'service_moderation/deleted_users/user-3' },
      expect.objectContaining({
        uid: 'user-3',
        deletedBy: 'owner-1',
      }),
    );
    expect(setMock).toHaveBeenCalledWith(
      { path: 'service_moderation/blocked_users/user-3' },
      expect.objectContaining({
        uid: 'user-3',
        reason: 'Deleted in service moderation',
        blockedBy: 'owner-1',
      }),
    );
    expect(removeMock).toHaveBeenCalledWith({ path: 'users/user-3' });
    expect(removeMock).toHaveBeenCalledWith({ path: 'user_roles/user-3' });
  });
});

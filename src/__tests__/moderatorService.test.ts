const getMock = jest.fn();
const setMock = jest.fn();
const removeMock = jest.fn();
const pushMock = jest.fn();
const refMock = jest.fn((_db: unknown, path: string) => ({ path }));
const getCurrentUserMock = jest.fn();
const onValueMock = jest.fn();
const offMock = jest.fn();

jest.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  set: (...args: unknown[]) => setMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
  push: (...args: unknown[]) => pushMock(...args),
  ref: (db: unknown, path: string) => refMock(db, path),
  onValue: (...args: unknown[]) => onValueMock(...args),
  off: (...args: unknown[]) => offMock(...args),
}));

jest.mock('../firebase-core', () => ({
  database: {},
}));

jest.mock('../firebase-auth-session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

jest.mock('../utils/errorLogger', () => ({
  logClientError: jest.fn(),
  logClientEvent: jest.fn(),
}));

import { assignRole, revokeRole, getUserRole } from '../services/moderatorService';

const snapshot = (value: unknown) => ({
  val: () => value,
});

describe('moderatorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
    pushMock.mockResolvedValue(undefined);
  });

  describe('getUserRole', () => {
    it('returns admin role from database', async () => {
      getMock.mockResolvedValueOnce(snapshot('admin'));
      const role = await getUserRole('user-1');
      expect(role).toBe('admin');
    });

    it('returns moderator role from database', async () => {
      getMock.mockResolvedValueOnce(snapshot('moderator'));
      const role = await getUserRole('user-1');
      expect(role).toBe('moderator');
    });

    it('returns user for unknown role values', async () => {
      getMock.mockResolvedValueOnce(snapshot('superadmin'));
      const role = await getUserRole('user-1');
      expect(role).toBe('user');
    });

    it('returns user for null', async () => {
      getMock.mockResolvedValueOnce(snapshot(null));
      const role = await getUserRole('user-1');
      expect(role).toBe('user');
    });
  });

  describe('assignRole', () => {
    it('requires authentication', async () => {
      getCurrentUserMock.mockReturnValue(null);
      const result = await assignRole('target-1', 'moderator');
      expect(result).toEqual({ success: false, error: 'auth_required' });
      expect(setMock).not.toHaveBeenCalled();
    });

    it('requires admin role for the caller', async () => {
      getCurrentUserMock.mockReturnValue({ uid: 'actor-1' });
      // getUserRole returns 'moderator' for actor
      getMock.mockResolvedValueOnce(snapshot('moderator'));

      const result = await assignRole('target-1', 'admin');
      expect(result).toEqual({ success: false, error: 'admin_required' });
      expect(setMock).not.toHaveBeenCalled();
    });

    it('succeeds when caller is admin', async () => {
      getCurrentUserMock.mockReturnValue({ uid: 'admin-1' });
      // getUserRole returns 'admin' for actor
      getMock.mockResolvedValueOnce(snapshot('admin'));

      const result = await assignRole('target-1', 'moderator', 'test@example.com');
      expect(result).toEqual({ success: true });
      expect(setMock).toHaveBeenCalledWith(
        { path: 'user_roles/target-1' },
        expect.objectContaining({
          role: 'moderator',
          assignedBy: 'admin-1',
          email: 'test@example.com',
        }),
      );
    });
  });

  describe('revokeRole', () => {
    it('requires authentication', async () => {
      getCurrentUserMock.mockReturnValue(null);
      const result = await revokeRole('target-1');
      expect(result).toEqual({ success: false, error: 'auth_required' });
    });

    it('requires admin role for the caller', async () => {
      getCurrentUserMock.mockReturnValue({ uid: 'mod-1' });
      getMock.mockResolvedValueOnce(snapshot('moderator'));

      const result = await revokeRole('target-1');
      expect(result).toEqual({ success: false, error: 'admin_required' });
      expect(removeMock).not.toHaveBeenCalled();
    });

    it('succeeds when caller is admin', async () => {
      getCurrentUserMock.mockReturnValue({ uid: 'admin-1' });
      getMock.mockResolvedValueOnce(snapshot('admin'));

      const result = await revokeRole('target-1');
      expect(result).toEqual({ success: true });
      expect(removeMock).toHaveBeenCalledWith({ path: 'user_roles/target-1/role' });
    });
  });
});

const runTransactionMock = jest.fn();
const refMock = jest.fn((_db: unknown, path: string) => ({ path }));

jest.mock('firebase/database', () => ({
  getDatabase: jest.fn(() => ({})),
  ref: (db: unknown, path: string) => refMock(db, path),
  push: jest.fn(),
  onValue: jest.fn(),
  off: jest.fn(),
  query: jest.fn(),
  orderByChild: jest.fn(),
  limitToLast: jest.fn(),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
}));

jest.mock('../firebase-core', () => ({
  database: {},
  auth: {},
}));

jest.mock('../firebase-auth-session', () => ({
  getCurrentUser: jest.fn(() => ({ uid: 'test-user' })),
  hasPrimaryServiceAccess: jest.fn(() => false),
}));

jest.mock('../services/deviceAuth', () => ({
  getOrCreateDeviceId: jest.fn(() => Promise.resolve('test-device')),
}));

import { updateOsbbNews } from '../services/osbbNews';

describe('osbbNews update flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates an existing news item without creating a duplicate or changing id/date', async () => {
    let writtenValue: unknown;
    runTransactionMock.mockImplementationOnce((_ref, updater: (current: unknown) => unknown) => {
      writtenValue = updater({
        priority: 'info',
        title: 'Old title',
        body: 'Old body',
        date: '01.04.2026',
      });
      return Promise.resolve({ committed: true });
    });

    await updateOsbbNews('building-1', 'news-1', {
      priority: 'urgent',
      title: 'New title',
      body: 'New body',
    });

    expect(refMock).toHaveBeenCalledWith({}, 'osbb_news/building-1/news-1');
    expect(writtenValue).toMatchObject({
      priority: 'urgent',
      title: 'New title',
      body: 'New body',
      date: '01.04.2026',
      moderationStatus: 'pending',
    });
    expect(writtenValue).not.toHaveProperty('id');
    expect(runTransactionMock).toHaveBeenCalledTimes(1);
  });
});

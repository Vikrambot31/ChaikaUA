jest.mock('../firebase-core', () => ({
  database: {},
  auth: {},
}));

jest.mock('../firebase-auth-session', () => ({
  getCurrentUser: jest.fn(() => ({ uid: 'test-user' })),
}));

jest.mock('firebase/database', () => ({
  ref: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  push: jest.fn(),
  onValue: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  query: jest.fn(),
  orderByChild: jest.fn(),
  equalTo: jest.fn(),
}));

import { calculateOsbbCollectionTotals } from '../services/osbbCollections';

describe('OSBB finance calculations', () => {
  it('calculates total target, collected amount, and remaining amount', () => {
    expect(
      calculateOsbbCollectionTotals([
        { targetAmount: 1000, collectedAmount: 250 },
        { targetAmount: 500, collectedAmount: 600 },
      ])
    ).toEqual({
      totalTarget: 1500,
      totalCollected: 850,
      remaining: 650,
    });
  });

  it('returns zero totals for an empty Firebase result', () => {
    expect(calculateOsbbCollectionTotals([])).toEqual({
      totalTarget: 0,
      totalCollected: 0,
      remaining: 0,
    });
  });

  it('never returns a negative remaining amount', () => {
    expect(
      calculateOsbbCollectionTotals([
        { targetAmount: 100, collectedAmount: 250 },
      ]).remaining
    ).toBe(0);
  });
});

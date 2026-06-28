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

jest.mock('firebase/database', () => ({
  ref: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  onValue: jest.fn(),
  update: jest.fn(),
}));

import {
  getOsbbVoteBlockReason,
  normalizeOsbbVote,
} from '../services/osbbVotingService';

describe('osbbVotingService helpers', () => {
  const futureDeadline = new Date(Date.now() + 86_400_000).toISOString();
  const pastDeadline = new Date(Date.now() - 86_400_000).toISOString();

  it('normalizes Firebase vote data and marks the current user choice', () => {
    const vote = normalizeOsbbVote(
      'vote-1',
      {
        title: '  Repair door  ',
        question: '  Should we repair it?  ',
        deadline: futureDeadline,
        options: [
          { id: 'yes', labelKey: 'yes', votes: 3 },
          { id: 'no', labelKey: 'no', votes: 1 },
        ],
        voterIds: { userA: 'yes' },
        totalApartments: 20,
        createdAt: '2026-04-01T00:00:00.000Z',
        createdBy: 'manager-1',
      },
      'userA'
    );

    expect(vote.status).toBe('active');
    expect(vote.title).toBe('Repair door');
    expect(vote.question).toBe('Should we repair it?');
    expect(vote.hasVoted).toBe(true);
    expect(vote.selectedOptionId).toBe('yes');
    expect(vote.options).toEqual([
      { id: 'yes', labelKey: 'yes', votes: 3 },
      { id: 'no', labelKey: 'no', votes: 1 },
    ]);
  });

  it('closes active votes when deadline has passed', () => {
    const vote = normalizeOsbbVote(
      'vote-closed',
      {
        status: 'active',
        title: 'Old vote',
        deadline: pastDeadline,
        options: [{ id: 'yes', labelKey: 'yes', votes: 1 }],
      },
      'userA'
    );

    expect(vote.status).toBe('closed');
  });

  it('detects repeat voting before a transaction writes changes', () => {
    expect(
      getOsbbVoteBlockReason(
        {
          deadline: futureDeadline,
          voterIds: { userA: 'no' },
          options: [{ id: 'yes', labelKey: 'yes', votes: 0 }],
        },
        'userA',
        'yes'
      )
    ).toBe('already-voted');
  });

  it('allows a valid active first vote', () => {
    expect(
      getOsbbVoteBlockReason(
        {
          deadline: futureDeadline,
          voterIds: {},
          options: [{ id: 'yes', labelKey: 'yes', votes: 0 }],
        },
        'userA',
        'yes'
      )
    ).toBeNull();
  });
});

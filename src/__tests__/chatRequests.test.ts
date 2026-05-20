import {
  filterChatRequests,
  getChatRequestTimestamp,
  normalizeChatRequests,
} from '../utils/chatRequests';

describe('chatRequests helpers', () => {
  const now = Date.now();
  const requests = [
    {
      id: 'old',
      name: 'Petro',
      text: 'Need repair help',
      category: 'repair',
      timestamp: now - 10_000,
    },
    {
      id: 'new',
      name: 'Anna',
      text: 'Need medical support',
      category: 'medical',
      timestamp: now - 1_000,
    },
    {
      id: 'expired',
      name: 'Oleh',
      text: 'Old request',
      category: 'other',
      timestamp: now - 50_000,
      expires_at: now - 100,
    },
  ];

  it('returns timestamp from timestamp field first', () => {
    expect(getChatRequestTimestamp(requests[0])).toBe(now - 10_000);
  });

  it('normalizes requests by removing expired ones and sorting newest first', () => {
    const result = normalizeChatRequests(requests);

    expect(result.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('filters requests by category and search text', () => {
    const normalized = normalizeChatRequests(requests);

    expect(filterChatRequests(normalized, '', 'repair').map((item) => item.id)).toEqual(['old']);
    expect(filterChatRequests(normalized, 'medical', null).map((item) => item.id)).toEqual(['new']);
    expect(filterChatRequests(normalized, 'anna', null).map((item) => item.id)).toEqual(['new']);
  });
});

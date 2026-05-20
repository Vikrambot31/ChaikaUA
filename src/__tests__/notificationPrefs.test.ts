import { DEFAULT_NOTIFICATION_PREFS, resolveNotificationCategory } from '../utils/notificationPrefs';

describe('notification preferences helpers', () => {
  it('keeps all categories enabled by default', () => {
    expect(DEFAULT_NOTIFICATION_PREFS).toEqual({
      requests: true,
      chat: true,
      osbb: true,
      electricity: true,
      general: true,
    });
  });

  it('maps request-like payloads to requests category', () => {
    expect(resolveNotificationCategory({ data: { category: 'help_request' } })).toBe('requests');
  });

  it('maps osbb payloads to osbb category', () => {
    expect(resolveNotificationCategory({ data: { type: 'osbb_news' } })).toBe('osbb');
  });

  it('falls back to general category', () => {
    expect(resolveNotificationCategory({ data: { category: 'unknown' } })).toBe('general');
  });
});

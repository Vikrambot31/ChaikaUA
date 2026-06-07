import fs from 'fs';
import path from 'path';

const readProjectFile = (fileName: string) =>
  fs.readFileSync(path.join(__dirname, '..', '..', fileName), 'utf8');

const tryParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

describe('Firebase rules explicit child-read policy', () => {
  it('keeps Realtime Database rules valid JSON', () => {
    expect(tryParseJson(readProjectFile('firebase.rules.json'))).not.toBeNull();
  });

  it('denies reads and writes at root level', () => {
    const parsed = tryParseJson(readProjectFile('firebase.rules.json')) as Record<string, any>;
    expect(parsed.rules['.read']).toBe(false);
    expect(parsed.rules['.write']).toBe(false);
  });

  it('removes hardcoded owner email and role-gated rule fragments', () => {
    const rules = readProjectFile('firebase.rules.json');

    expect(rules).not.toContain('vikramsave@ukr.net');
    expect(rules).not.toContain('email_verified');
    expect(rules).not.toContain("role').val() == 'admin'");
    expect(rules).not.toContain("role').val() == 'moderator'");
  });

  it('gates moderation collections behind auth (no public read)', () => {
    const parsed = tryParseJson(readProjectFile('firebase.rules.json')) as Record<string, any>;

    // Collections with personal data (phone numbers, contacts) — auth required.
    expect(parsed.rules.contacts_listings['.read']).toBe('auth != null');

    // community_photos contains unmoderated (pending/rejected) photos — auth required.
    // community_photos_public contains only approved photos — intentionally public.
    expect(parsed.rules.community_photos['.read']).toBe('auth != null');
    expect(parsed.rules.community_photos_public['.read']).toBe(true);

    // Public feed collections — intentionally open so guests see app activity.
    expect(parsed.rules.requests['.read']).toBe(true);
    expect(parsed.rules.buy_sell_listings['.read']).toBe(true);
    expect(parsed.rules.food_top_listings['.read']).toBe(true);
    expect(parsed.rules.job_listings['.read']).toBe(true);
    expect(parsed.rules.lost_found['.read']).toBe(true);
    expect(parsed.rules.biznes_chaika_listings['.read']).toBe(true);
    expect(parsed.rules.local_business['.read']).toBe(true);
    expect(parsed.rules.sports_listings['.read']).toBe(true);

    // Write rules must require real authenticated users (not anonymous).
    expect(parsed.rules.requests.$requestId['.write']).toContain("sign_in_provider !== 'anonymous'");
    expect(parsed.rules.community_photos.$photoId['.write']).toContain("sign_in_provider !== 'anonymous'");
    expect(parsed.rules.contacts_listings.$listingId['.write']).toContain("sign_in_provider !== 'anonymous'");
    expect(parsed.rules.lost_found.$itemId['.write']).toContain("sign_in_provider !== 'anonymous'");
    expect(parsed.rules.buy_sell_listings.$itemId['.write']).toContain("sign_in_provider !== 'anonymous'");
  });

  it('allows full users list reads for all authenticated users', () => {
    const parsed = tryParseJson(readProjectFile('firebase.rules.json')) as Record<string, any>;
    const usersReadRule = parsed.rules.users['.read'];

    expect(usersReadRule).toBe('auth != null');
    expect(parsed.rules.users.$uid['.read']).toBe('auth != null');
  });

  it('uses auth-only storage access', () => {
    const rules = readProjectFile('storage.rules');

    expect(rules).toContain('function signedIn()');
    expect(rules).toContain('allow get, list: if signedIn();');
    expect(rules).toContain('function isAdmin()');
    expect(rules).toContain('function isOwner(userId)');
  });
});

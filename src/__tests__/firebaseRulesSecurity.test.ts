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

  it('keeps moderation collections readable/writable for authenticated users', () => {
    const parsed = tryParseJson(readProjectFile('firebase.rules.json')) as Record<string, any>;

    expect(parsed.rules.requests['.read']).toBe('auth != null');
    expect(parsed.rules.community_photos['.read']).toBe('auth != null');
    expect(parsed.rules.community_photos_public['.read']).toBe('auth != null');

    expect(parsed.rules.requests.$requestId['.write']).toContain('auth != null');
    expect(parsed.rules.community_photos.$photoId['.write']).toContain('auth != null');
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

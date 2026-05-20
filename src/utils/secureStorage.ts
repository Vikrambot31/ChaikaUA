/**
 * secureStorage.ts — hardware-backed secure storage via expo-secure-store.
 *
 * Primary storage: expo-secure-store (Android Keystore / iOS Keychain).
 * Silent fallback: XOR encryption over AsyncStorage for environments where
 * SecureStore is unavailable (web, Expo Go without native modules, etc.).
 *
 * Migration: on first `secureGet` for a key that is missing from SecureStore,
 * the module checks AsyncStorage for a legacy XOR-encrypted value, decrypts it,
 * writes it into SecureStore, and removes it from AsyncStorage — completing a
 * one-time, per-key migration without any user interaction.
 *
 * The XOR key record in AsyncStorage (@chaika:enc_key_v1) is intentionally
 * preserved so that migration reads of existing users' data keep working.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;

    out += BASE64_ALPHABET[(triple >> 18) & 63];
    out += BASE64_ALPHABET[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : '=';
  }
  return out;
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[\r\n\s]/g, '');
  if (clean.length % 4 !== 0) {
    throw new Error('Invalid base64 length');
  }

  let byteCount = (clean.length / 4) * 3;
  if (clean.endsWith('==')) byteCount -= 2;
  else if (clean.endsWith('=')) byteCount -= 1;

  const out = new Uint8Array(byteCount);
  let offset = 0;

  for (let i = 0; i < clean.length; i += 4) {
    const c1 = clean[i];
    const c2 = clean[i + 1];
    const c3 = clean[i + 2];
    const c4 = clean[i + 3];

    const n1 = BASE64_ALPHABET.indexOf(c1);
    const n2 = BASE64_ALPHABET.indexOf(c2);
    const n3 = c3 === '=' ? 0 : BASE64_ALPHABET.indexOf(c3);
    const n4 = c4 === '=' ? 0 : BASE64_ALPHABET.indexOf(c4);

    if (n1 < 0 || n2 < 0 || (c3 !== '=' && n3 < 0) || (c4 !== '=' && n4 < 0)) {
      throw new Error('Invalid base64 character');
    }

    const triple = (n1 << 18) | (n2 << 12) | (n3 << 6) | n4;
    out[offset++] = (triple >> 16) & 0xff;
    if (c3 !== '=') out[offset++] = (triple >> 8) & 0xff;
    if (c4 !== '=') out[offset++] = triple & 0xff;
  }

  return out;
}

// ---------------------------------------------------------------------------
// XOR encryption helpers (kept for fallback writes and migration reads)
// ---------------------------------------------------------------------------

/** AsyncStorage key that stores the base-64 XOR encryption key. */
const KEY_STORAGE = '@chaika:enc_key_v1';

/** In-memory cache of the XOR key so we only read AsyncStorage once. */
let _encKeyCache: Uint8Array | null = null;

/**
 * Retrieves (or lazily generates) the 32-byte XOR encryption key.
 * The key is persisted in AsyncStorage under KEY_STORAGE and is NEVER deleted
 * so that migration reads for existing users continue to work.
 */
async function getEncKey(): Promise<Uint8Array> {
  if (_encKeyCache) return _encKeyCache;

  const stored = await AsyncStorage.getItem(KEY_STORAGE);
  if (stored) {
    _encKeyCache = base64ToBytes(stored);
    return _encKeyCache;
  }

  // First ever run — generate and persist a new key.
  const key = Crypto.getRandomBytes(32);
  const keyB64 = bytesToBase64(key);
  await AsyncStorage.setItem(KEY_STORAGE, keyB64);
  _encKeyCache = key;
  return key;
}

/** XOR each byte of `data` against the repeating `key`. */
function xorBuffer(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

/**
 * XOR-encrypts `plain` and returns a base-64 ciphertext string.
 * Exported so callers (e.g. migration utilities) can use it directly.
 */
export async function encryptValue(plain: string): Promise<string> {
  const key = await getEncKey();
  const encoded =
    typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(plain)
      : Uint8Array.from(Array.from(plain).map((char) => char.charCodeAt(0) & 0xff));
  const cipher = xorBuffer(encoded, key);
  return bytesToBase64(cipher);
}

/**
 * XOR-decrypts a base-64 ciphertext string and returns the plaintext.
 * Exported so callers (e.g. migration utilities) can use it directly.
 */
export async function decryptValue(cipher: string): Promise<string> {
  const key = await getEncKey();
  const cipherBytes = base64ToBytes(cipher);
  const plain = xorBuffer(cipherBytes, key);
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(plain);
  }
  return String.fromCharCode(...Array.from(plain));
}

// ---------------------------------------------------------------------------
// SecureStore key sanitisation
// ---------------------------------------------------------------------------

/**
 * Converts an arbitrary storage key into a form accepted by expo-secure-store.
 * SecureStore forbids characters such as `@` and `:`.
 *
 * Rules (mirrors toSecureStoreCompatibleKey in deviceAuth.ts):
 *   1. Replace every character outside [A-Za-z0-9._-] with `_`.
 *   2. Collapse consecutive underscores into one.
 *   3. Strip leading and trailing underscores.
 *   4. Fall back to 'chaika_secure_key' if the result is empty.
 *
 * Examples:
 *   '@auth_token'        → 'auth_token'
 *   '@chaika:enc_key_v1' → 'chaika_enc_key_v1'
 */
function toSecureStoreCompatibleKey(key: string): string {
  return (
    key
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'chaika_secure_key'
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persists `value` under `storageKey` using hardware-backed SecureStore.
 * Falls back to XOR+AsyncStorage if SecureStore throws (e.g. web / Expo Go).
 */
export async function secureSet(storageKey: string, value: string): Promise<void> {
  const safeKey = toSecureStoreCompatibleKey(storageKey);
  try {
    await SecureStore.setItemAsync(safeKey, value);
  } catch {
    // SecureStore unavailable — write XOR-encrypted value to AsyncStorage.
    const encrypted = await encryptValue(value);
    await AsyncStorage.setItem(storageKey, encrypted);
  }
}

/**
 * Retrieves the value stored under `storageKey`.
 *
 * Resolution order:
 *   1. SecureStore (hardware-backed, preferred).
 *   2. Legacy AsyncStorage XOR-encrypted entry — if found the value is
 *      migrated into SecureStore and removed from AsyncStorage.
 *   3. `null` if neither location has the key.
 *
 * Falls back to AsyncStorage XOR decryption if SecureStore itself throws.
 */
export async function secureGet(storageKey: string): Promise<string | null> {
  const safeKey = toSecureStoreCompatibleKey(storageKey);

  // --- Primary path: SecureStore ---
  try {
    const secureValue = await SecureStore.getItemAsync(safeKey);

    if (secureValue !== null) {
      // Fast path — value already lives in SecureStore.
      return secureValue;
    }

    // SecureStore had nothing; check AsyncStorage for a legacy value to migrate.
    const legacy = await AsyncStorage.getItem(storageKey);
    if (legacy === null) {
      return null;
    }

    // Attempt XOR decryption; fall back to the raw string if it fails
    // (handles plaintext values written before encryption was introduced).
    let plaintext: string;
    try {
      plaintext = await decryptValue(legacy);
    } catch {
      plaintext = legacy;
    }

    // Migrate: write into SecureStore, delete the AsyncStorage copy.
    try {
      await SecureStore.setItemAsync(safeKey, plaintext);
      await AsyncStorage.removeItem(storageKey);
    } catch {
      // Migration write failed — leave AsyncStorage intact and return value.
    }

    return plaintext;
  } catch {
    // SecureStore itself is unavailable — fall back to AsyncStorage XOR path.
    const raw = await AsyncStorage.getItem(storageKey);
    if (raw === null) return null;
    try {
      return await decryptValue(raw);
    } catch {
      // Legacy plaintext value — return as-is.
      return raw;
    }
  }
}

/**
 * Removes `storageKey` from both SecureStore and legacy AsyncStorage.
 * Silently ignores individual failures so both stores are always attempted.
 */
export async function secureRemove(storageKey: string): Promise<void> {
  const safeKey = toSecureStoreCompatibleKey(storageKey);

  // Remove from SecureStore — ignore errors (may be unavailable or key absent).
  try {
    await SecureStore.deleteItemAsync(safeKey);
  } catch {
    // Intentionally ignored.
  }

  // Always clean up the legacy AsyncStorage entry as well.
  try {
    await AsyncStorage.removeItem(storageKey);
  } catch {
    // Intentionally ignored.
  }
}

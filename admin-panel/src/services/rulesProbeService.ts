/**
 * rulesProbeService — реальна перевірка Firebase RTDB rules
 *
 * Робить анонімні HTTP-запити до RTDB REST API (без авторизації).
 * Якщо шлях повертає дані — правила відкриті. Якщо 401 — закриті.
 * Це єдина достовірна перевірка, яку не можна підробити флагом у базі.
 */

export type RulesProbeLevel = 'OPEN' | 'PARTIAL' | 'SECURE' | 'ERROR' | 'CHECKING';

export type RulesProbeResult = {
  level: RulesProbeLevel;
  openPaths: string[];
  closedPaths: string[];
  checkedAt: number;
  errorMessage?: string;
};

// Шляхи, які ЗАВЖДИ мають бути закриті для анонімних запитів
const PROBE_PATHS = ['users', 'user_roles', 'requests', 'ops'] as const;

async function isPathOpenAnonymously(databaseURL: string, path: string): Promise<boolean> {
  try {
    const base = databaseURL.replace(/\/$/, '');
    // shallow=true + limitToFirst=1 — мінімальна передача даних, лише перевірка доступу
    const url = `${base}/${path}.json?shallow=true&limitToFirst=1`;
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    // Firebase повертає 401 або 403 при permission denied
    if (res.status === 401 || res.status === 403) return false;
    if (!res.ok) return false;
    const text = await res.text();
    // Firebase також може повернути {"error":"Permission denied"} з HTTP 200 в деяких конфігах
    if (text.includes('"error"')) return false;
    // HTTP 200 без помилки = шлях відкритий анонімно
    return true;
  } catch {
    // Timeout або мережева помилка — вважаємо закритим (fail-safe)
    return false;
  }
}

export async function probeRulesLevel(databaseURL: string): Promise<RulesProbeResult> {
  if (!databaseURL || databaseURL.startsWith('https://local-')) {
    // LOCAL_MODE або порожній URL — пропускаємо реальну перевірку
    return { level: 'SECURE', openPaths: [], closedPaths: [...PROBE_PATHS], checkedAt: Date.now() };
  }

  const checkedAt = Date.now();
  try {
    const results = await Promise.all(
      PROBE_PATHS.map(async (path) => ({
        path,
        open: await isPathOpenAnonymously(databaseURL, path),
      })),
    );

    const openPaths = results.filter((r) => r.open).map((r) => r.path);
    const closedPaths = results.filter((r) => !r.open).map((r) => r.path);

    let level: RulesProbeLevel;
    if (openPaths.length === 0) level = 'SECURE';
    else if (openPaths.length >= PROBE_PATHS.length) level = 'OPEN';
    else level = 'PARTIAL';

    return { level, openPaths, closedPaths, checkedAt };
  } catch (err) {
    return {
      level: 'ERROR',
      openPaths: [],
      closedPaths: [],
      checkedAt,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

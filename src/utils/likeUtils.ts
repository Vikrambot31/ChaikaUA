/**
 * Utilities for normalising feed_likes entries.
 *
 * Legacy format:  feed_likes/{section}/{itemId}/{userId} = true
 * New format:     feed_likes/{section}/{itemId}/{userId} = { t: <timestamp_ms> }
 */

export type LikeEntry = { liked: boolean; t: number };

/**
 * Parse a single RTDB like value into a normalised LikeEntry.
 * Handles both legacy `true` and new `{ t: number }` formats.
 */
export function parseLikeEntry(val: unknown): LikeEntry {
  if (val === true) return { liked: true, t: 0 };
  if (val && typeof val === 'object' && 't' in val) {
    const t = (val as { t: unknown }).t;
    return { liked: true, t: typeof t === 'number' ? t : 0 };
  }
  return { liked: false, t: 0 };
}

/**
 * Given a RTDB snapshot value (object of userId→likeValue),
 * return a record of userId→true for backward-compatible counting,
 * plus a map of userId→timestamp.
 */
export function normaliseLikesSnapshot(
  raw: unknown,
): { likeFlags: Record<string, true>; timestamps: Record<string, number> } {
  const likeFlags: Record<string, true> = {};
  const timestamps: Record<string, number> = {};

  if (!raw || typeof raw !== 'object') return { likeFlags, timestamps };

  for (const [uid, val] of Object.entries(raw as Record<string, unknown>)) {
    const entry = parseLikeEntry(val);
    if (entry.liked) {
      likeFlags[uid] = true;
      if (entry.t > 0) timestamps[uid] = entry.t;
    }
  }

  return { likeFlags, timestamps };
}

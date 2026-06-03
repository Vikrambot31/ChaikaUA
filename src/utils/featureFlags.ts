// Controls which upload namespaces use the native FileSystem (REST v0) upload engine.
// Intentionally EMPTY: every screen now uses the same proven blob-upload path
// (uploadViaBlobFetch) that "Куплю-продам" (buy_sell) has always used reliably.
// The native engine stays available in code but is disabled for all namespaces so
// photo upload behaves identically on every screen. Re-add a namespace here only
// to opt it back into native upload during a controlled test.
export const NATIVE_UPLOAD_NAMESPACES = new Set<string>([]);

// Enable only after separate iOS background upload testing.
export const USE_IOS_BACKGROUND_UPLOAD = false;

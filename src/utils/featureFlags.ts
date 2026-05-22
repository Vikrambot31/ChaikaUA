// Controls which upload namespaces use the native FileSystem upload engine.
// Keep empty by default; add one namespace at a time during rollout.
export const NATIVE_UPLOAD_NAMESPACES = new Set<string>([
  'user_photos',
  'community_photos',
  // 'buy_sell',
  // 'contacts',
  // 'lost_found',
  // 'requests',
  // 'local_business',
]);

// Enable only after separate iOS background upload testing.
export const USE_IOS_BACKGROUND_UPLOAD = false;

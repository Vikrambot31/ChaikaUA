/**
 * TZ_3.6 — Unified security_config service.
 *
 * Single entry point for all security_config/app_control/current reads on mobile.
 * Consolidates the two separate readers that existed before (remoteConfig.ts and
 * securityAdminService.ts subscribeSecurityAppControl) into one shared subscription.
 *
 * Rules:
 *  - One get() per session, result cached in CacheLayer (5 min TTL).
 *  - One onValue listener shared across all callers via subscribeRemoteConfigSnapshot.
 *  - Non-critical fields (maintenance_message, minimum_required_version) served from cache.
 *  - Admin panel writes → mobile reacts within the onValue tick (≤ 5 s per TZ).
 *
 * Usage:
 *   import { loadSecurityConfig, subscribeSecurityConfig } from './securityConfigService';
 */

export {
  loadRemoteConfigSnapshot as loadSecurityConfig,
  getCachedRemoteConfigSnapshot as getCachedSecurityConfig,
  subscribeRemoteConfigSnapshot as subscribeSecurityConfig,
  createDefaultRemoteConfigSnapshot as createDefaultSecurityConfig,
  type RemoteConfigSnapshot as SecurityConfigSnapshot,
} from './remoteConfig';

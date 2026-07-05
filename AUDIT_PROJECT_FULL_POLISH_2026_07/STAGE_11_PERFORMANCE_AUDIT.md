# Stage 11 - Performance Audit

Date: 2026-07-05
Status: static performance audit only; no optimization fixes performed.

## Scope

Reviewed performance risks in:

- mobile Firebase reads/subscriptions,
- admin-panel Firebase reads/subscriptions,
- Cloud Functions scheduled jobs,
- moderation and dashboard flows.

## Findings

### PERF-P1-001 - Full-node reads remain in moderation and user-directory paths

Confirmed examples:

- `src/firebase-config.ts:1536-1542` `communityUsersAPI.getUsersOnce` reads the entire `users` branch.
- `src/screens/Spisok-Zayavok.tsx:211` reads all `community_photos`.
- `src/screens/Spisok-Zayavok.tsx:251` reads all `lost_found`.
- `src/screens/Spisok-Zayavok.tsx:298` reads all `buy_sell_listings`.
- `src/screens/Spisok-Zayavok.tsx:346` reads all `contacts_listings`.
- `src/screens/Spisok-Zayavok.tsx:388` reads all `local_business`.
- `src/screens/Spisok-Zayavok.tsx:435` reads all `biznes_chaika_listings`.

Risk:

- Moderation screens can become slow or memory-heavy as public content grows.
- Reading entire user/listing branches increases data transfer and makes permission-denied/network failures more expensive.

Recommended remediation:

- Replace full-node reads with indexed status queries and `limitToFirst`/`limitToLast`.
- Maintain moderation queue counters and per-section pending indexes.
- Avoid loading full `users` for user search; query by indexed normalized fields or page through bounded results.

### PERF-P1-002 - Admin dashboards subscribe to global nodes without pagination

Confirmed examples from static search:

- `admin-panel/src/services/bonusAdminService.ts` subscribes to `user_bonuses`, `promo_credits`, and `bonus_promotions`.
- `admin-panel/src/services/businessPlusAdminService.ts` subscribes to `business_plus_claims`, `business_plus_cards`, and `user_subscription`.
- `admin-panel/src/services/premiumAdminService.ts` subscribes to `user_subscription`.
- `admin-panel/src/services/yellowListService.ts` subscribes to `yellow_list`.
- `admin-panel/src/services/photoApprovalService.ts` reads `community_photos` and `user_photos`.

Risk:

- Admin panel initial load and live updates can degrade sharply with production data volume.
- Long-lived global subscriptions increase bandwidth and browser memory pressure.

Recommended remediation:

- Convert admin tables to paginated queries with explicit filters.
- Use aggregate counters for dashboard cards.
- Keep full reads only behind deliberate export/diagnostic actions.

### PERF-P2-001 - Scheduled functions process unbounded global collections

This overlaps Stage 8 but is performance-specific:

- Subscription expiration and reminder jobs scan all `user_subscription` records.
- Promo subscription scheduled jobs scan `promo_subscriptions`.
- Invite access expiration jobs query broad status sets without hard batch caps.

Risk:

- Scheduled maintenance can time out as data grows, creating silent operational drift.

Recommended remediation:

- Store due records by date bucket or `expiresAt` index.
- Process bounded batches and record continuation state.
- Add metrics for scanned, updated, skipped, and failed counts.

### PERF-P2-002 - Public feed screens are mostly bounded, but own/private overlays can still grow

Public feed services for business, contacts, buy/sell, lost/found, jobs, and similar listing surfaces now commonly use `moderationStatus` queries with limits for approved public records. However, own-listing overlays often query by `userId` without a visible per-user cap.

Risk:

- A heavy poster can make their own feed overlay expensive even when public approved reads are bounded.

Recommended remediation:

- Add per-user list caps or pagination for own listings.
- Consider per-user indexes such as `user_listing_index/{uid}/{collection}` for private/own views.

## Verification

Static performance review only. No code fix was made in this stage.
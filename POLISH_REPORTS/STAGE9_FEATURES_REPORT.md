# STAGE 9 — SPECIFIC FEATURES: REPORT
## Date: 2026-06-27

---

## FIXES APPLIED (6 code changes across 4 files)

### FIX-1: Karta-Chayki.web.tsx — missing filters — MEDIUM
**File:** `src/screens/Karta-Chayki.web.tsx:92-101`
**Was:** Web map had 8 filters; native had 10. Missing: `kindergarten`, `service`
**Now:** All 10 filter types match native version (ua/ru/en labels + FILTERS array)

### FIX-2: monthlyRating.ts — previousValue=0 inflates vote count — MEDIUM
**File:** `src/utils/monthlyRating.ts:41`
**Was:** `!previousValue` treats 0 as falsy → adds new vote instead of replacing
**Now:** `previousValue == null` — only null/undefined trigger add-new-vote path; 0 falls through to replace (but is still rejected by `< 1` check)

### FIX-3: BonusWalletScreen.tsx — timeAgo() hardcoded UA — MEDIUM
**File:** `src/screens/BonusWalletScreen.tsx:85-96`
**Was:** `'тільки що'`, `'хв тому'`, `'год тому'`, `'дн тому'` — always Ukrainian
**Now:** `TIME_AGO_TEXT` with ua/ru/en; `timeAgo(timestamp, language)` uses user's locale

### FIX-4: BonusWalletScreen.tsx — currency empty string — LOW
**File:** `src/screens/BonusWalletScreen.tsx:329`
**Was:** `{item.currency}` renders empty string when server doesn't write currency
**Now:** `{item.currency || 'pts'}` — fallback label

### FIX-5: bonusFunctions.js — weekly limit bypass for premium — MEDIUM (SECURITY)
**File:** `functions/bonusFunctions.js:271`
**Was:** `checkWeeklyLimit(d, category, points, ...)` — checks base points (e.g. 5)
**Then:** `multipliedPoints` (e.g. 10 for business_plus) is awarded → premium users exceed weekly limits
**Now:** `checkWeeklyLimit(d, category, multipliedPoints, ...)` — limit checked against actual awarded amount

### FIX-6: bonusFunctions.js — assertAdminOrPrimaryOwner null check — MEDIUM
**File:** `functions/bonusFunctions.js:504`
**Was:** `context.auth.uid` accessed without null check → TypeError if called without auth
**Now:** `if (!context.auth?.uid) throw HttpsError('unauthenticated')` before accessing uid

---

## AUDIT RESULTS (no changes needed)

| Component | Status | Notes |
|---|---|---|
| Karta-Chayki.native.tsx | OK | Full-featured, 10 filters, search |
| PlaceMarker.tsx | PASS | Simple presentational component |
| mapFocusParams.ts | PASS | Correct type + helper |
| googleMapsLink.ts | PASS | URL construction correct |
| chaykaLevels (in bonusService.ts) | PASS | Level algorithm correct |
| Reyting-Domov.tsx | PASS | Auth checks, rating guards |
| FeatureRatingBanner.tsx | PASS | Visit tracking, monthly reset |
| bonusService.ts | PASS | Proper null-safety, subscription management |
| bonusQueue.ts | PASS | Idempotency, TTL, retry limits, owner protection |
| QR-Kod.tsx | OK | Static QR generation (share-app feature) |

## KNOWN ISSUES (not fixed — require architectural decisions)

| # | Issue | File | Severity |
|---|---|---|---|
| 1 | No marker clustering on native map | Karta-Chayki.native.tsx | MEDIUM (perf) |
| 2 | `getItemLayout` ignores ListHeaderComponent | Karta-Chayki.native.tsx:666 | LOW |
| 3 | `referrals` vs `trust_tree` dual-source disconnect | Registration + Poruchitel | HIGH (architectural) |
| 4 | buildingRatingService transaction error via closure | buildingRatingService.ts:154 | MEDIUM |
| 5 | `canReplacePrevious` only checks cleaning category | buildingRatingService.ts:165 | LOW |
| 6 | Poruchitel.tsx stale closures in realtime subscriptions | Poruchitel.tsx:224 | MEDIUM |
| 7 | QR generated via external API (no offline support) | QR-Kod.tsx | MEDIUM |
| 8 | No QR scanning/invite flow | QR-Kod.tsx | LOW (feature gap) |
| 9 | ISO week number non-standard | bonusFunctions.js:67 | LOW |

---

## VERIFICATION

- TypeScript compilation: PASS (0 errors)
- Rule R-1: PASS (no Firebase RTDB rules changed)
- Rule R-2: PASS (photo architecture untouched)
- Rule R-3: PASS (verified imports and service dependencies)
- Rule R-4: PASS (no Redux schema changes)

---

*Stage 9 completed: 2026-06-27*

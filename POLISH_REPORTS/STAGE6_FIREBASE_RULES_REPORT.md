# STAGE 6 — FIREBASE RULES + MODERATION BYPASS: REPORT
## Date: 2026-06-27

---

## FIXES APPLIED (7 code changes)

### FIX-1: osbb_collection_payments — CRITICAL
**File:** `firebase.rules.json` (line 401)
**Was:** Any authenticated non-anonymous user could write payment to ANY building
**Now:** Write restricted to:
- Admin/moderator OR
- Approved OSBB member of that building (`osbb_members/$buildingId/$uid/status === 'approved'`)
**+ Added `.validate`:** Payment must include `uid === auth.uid` (audit trail)

### FIX-2: bonus_triggers/close_request — CRITICAL
**File:** `firebase.rules.json` (line 621)
**Was:** Any auth user could trigger bonus on ANY request (only `!data.exists()` check)
**Now:** Added validation:
- `newData.child('uid').val() === auth.uid` — trigger must match authenticated user
- `root.child('requests').child($requestId).child('userId').val() === auth.uid` — request must belong to user

### FIX-3: security_config/app_control/current — HIGH
**File:** `firebase.rules.json` (line 258)
**Was:** `.read: true` — app config exposed publicly without auth
**Now:** `.read: "auth != null"` — requires authentication

### FIX-4: profile_photos — HIGH (defense-in-depth)
**File:** `firebase.rules.json` (line 336)
**Was:** No `.validate` — user could write `moderationStatus: 'approved'` directly
**Now:** Added `$photoId/.validate` — users cannot set `moderationStatus` to `approved` or `rejected` (only admin/moderator can)

### FIX-5: ProfileSetupScreen photo auto-approve — CRITICAL
**File:** `src/screens/ProfileSetupScreen.tsx:259`
**Was:** `uploadProfilePhoto(customAvatarUri, { moderationStatus: 'approved' })` — bypassed moderation
**Now:** `moderationStatus: 'pending'` — photo goes through moderation pipeline

### FIX-6: useFullRegistration photo auto-approve — CRITICAL
**File:** `src/hooks/useFullRegistration.ts:162`
**Was:** `uploadProfilePhoto(tempProfile.customAvatarUri, { moderationStatus: 'approved' })` — same bypass
**Now:** `moderationStatus: 'pending'`

### FIX-7: osbbCollections.ts — payment audit trail — MEDIUM
**File:** `src/services/osbbCollections.ts:188-192`
**Was:** Payment record had no `uid` field — no audit trail
**Now:** Added `uid: auth.currentUser?.uid ?? ''` to payment push
**Required by:** FIX-1's new `.validate` rule

---

## VERIFICATION

- TypeScript compilation: PASS (0 errors)
- Rule R-1 compliance: PASS (all changes are corrections to existing rules, no new paths)
- Rule R-2 compliance: PASS (photo upload architecture unchanged)
- Rule R-3 compliance: PASS (checked all callers of modified services)
- Rule R-4 compliance: PASS (no Redux schema changes)

---

## REMAINING FROM AUDIT (not fixed — require architectural decisions)

| # | Issue | File | Severity |
|---|---|---|---|
| 1 | Hardcoded admin email fallback | firebase-auth-session.ts:6 | HIGH |
| 2 | ADMIN_BACKUP_UID in client code | firebase-auth-session.ts:23 | MEDIUM |
| 3 | Emergency access client-side time check | emergencyAccess.ts:44 | MEDIUM |
| 4 | Device auth timeout → `status: 'unknown'` | AppAccessGuard.tsx:296 | MEDIUM |
| 5 | SoftInviteAccessGate `isTrusted: true` for all | SoftInviteAccessGate.tsx:18 | MEDIUM |
| 6 | InviteAccessScreen client-only validation | InviteAccessScreen.tsx:318 | MEDIUM |
| 7 | Role cache TTL without invalidation | securityRoles.ts:44 | LOW |

---

*Stage 6 completed: 2026-06-27*

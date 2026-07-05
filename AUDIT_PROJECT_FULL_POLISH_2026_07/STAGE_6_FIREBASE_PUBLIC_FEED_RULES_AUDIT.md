# Stage 6 - Firebase Public Feed Rules Audit

Date: 2026-07-04
Status: static rules pass only; no protected auth/rules edits performed.

## Scope

Reviewed public/private listing read boundaries after the Stage 5 client fixes:

- `firebase.rules.json`
- `src/__tests__/firebaseRulesSecurity.test.ts`
- `src/__tests__/firebaseRulesEmulator.test.ts`
- listing paths used by `Bizznes-Chaika`, `Kontakt-XXX`, `Kuplu-Prodam`, `Kto-Poteryal`, and `Poisk-Raboty`

Guardrails respected:

- `firebase.rules.json` was not changed.
- `admin-panel/src/services/authService.ts` was not changed.
- `admin-panel/src/firebase/firebase.ts` was not changed.
- `user_roles`, `security_config`, and `authorized_devices` logic was not changed.

## Findings

### RULES-P1-002 - Raw hidden/private contact fields remain readable from broad listing nodes

Client code now avoids using hidden phone values in search/detail/contact paths where a privacy flag or private-contact flow exists. The rules still allow broad reads of the raw listing nodes:

- `biznes_chaika_listings`: `.read: true`
- `buy_sell_listings`: `.read: true`
- `lost_found`: `.read: true`
- `job_listings`: `.read: true`
- `contacts_listings`: `.read: auth != null`

If private fields such as `phone` remain on those nodes, a modified client can read them directly regardless of the mobile UI filters.

Recommended remediation requires explicit approval to edit protected rules/data shape:

- Add public projection nodes that contain only approved public fields.
- Keep full records under owner/admin/moderator branches.
- Add emulator tests proving hidden phone fields are absent from public reads.

### RULES-P1-003 - Approved-only visibility is enforced by client queries, not by rules

The mobile services query `moderationStatus === approved` for public feeds and separately merge own records. The rules, however, grant collection-level reads on multiple listing branches. That means modified clients can read the raw branch rather than the approved-only query shape.

Existing static tests currently assert broad reads for several public branches, so a rules fix will also require updating test expectations and adding emulator coverage for:

- anonymous public projection reads,
- authenticated public projection reads,
- owner reads of own pending/rejected records,
- admin/moderator reads of full records,
- denial of non-owner reads for pending/rejected/private records.

## Verification

Static rules/code review only. No code or rules fix was made in this stage, so the mandatory post-code-fix test trio was not triggered by Stage 6 itself.

Latest post-code-fix verification from Stage 5 / MOB-P1-011:

```powershell
npm run type-check
npm run check:encoding
npm test -- --runInBand
```

Result: all PASS; Jest reported 20 suites passed, 1 skipped, 153 tests passed, 14 skipped.
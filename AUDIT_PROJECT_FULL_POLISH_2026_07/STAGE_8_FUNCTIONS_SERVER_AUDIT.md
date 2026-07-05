# Stage 8 - Cloud Functions And Server-Side Logic Audit

Date: 2026-07-05
Status: static server-side audit only; no code fixes performed.

## Scope

Reviewed server-side Firebase entry points and generated function surface:

- `functions/index.js`
- `functions/bonusFunctions.js`
- `functions/promotionFunctions.js`
- `functions/inviteAccess.js`
- `functions/package.json`
- local generated `functions/functions.yaml`

Guardrails respected:

- No protected admin auth files were changed.
- `firebase.rules.json` was not changed.
- `user_roles`, `security_config`, and `authorized_devices` logic was not changed.

## Findings

### FUNC-P1-001 - User-write callable functions accept anonymous Firebase auth

Several callable functions use Admin SDK writes after checking only `context.auth` or `context.auth.uid`. That proves a Firebase token exists, but it does not prove the caller is a registered/non-anonymous app user.

Confirmed examples:

- `functions/index.js:2584` `createRequest` checks only `context.auth`, then writes `requests/{newId}` through Admin SDK.
- `functions/index.js:2707` `offerHelp` checks only `context.auth.uid`, then writes `help_responses/{requestId}/{helperUid}` and awards bonus state.
- `functions/bonusFunctions.js:513`, `:583`, `:664`, `:702`, `:744`, `:777`, `:804` user-facing bonus callables check only `context.auth.uid`.
- `functions/promotionFunctions.js:114`, `:428`, `:524` promotion/subscription callables check only `context.auth.uid`.

Risk:

- Realtime Database rules may reject anonymous direct writes, but these functions use Admin SDK and bypass rules.
- A modified client with an anonymous Firebase session may be able to create requests, help responses, promotions/subscriptions, or bonus records outside the intended app-user boundary.

Recommended remediation:

- Add a shared real-user assertion for user-write callables, similar in intent to `assertRealAuthenticatedUser`.
- Reject tokens where `context.auth.token.firebase.sign_in_provider === 'anonymous'`.
- Add callable tests for anonymous, registered, owner, moderator, and admin callers.

### FUNC-P2-001 - Functions lint does not syntax-check modular function files

`functions/package.json:12` runs:

```powershell
node --check index.js && node --check scripts/seed-chayka-news.js
```

It does not check `bonusFunctions.js`, `promotionFunctions.js`, or `inviteAccess.js`, even though those files export callable/scheduled logic used by `index.js`.

Risk:

- A syntax error in a modular function file can pass the local functions lint command and fail later during deploy/runtime loading.

Recommended remediation:

- Extend the functions lint command to include every loaded `.js` module under `functions/`, excluding `node_modules`.
- Add this check to the release gate.

### FUNC-P2-002 - AI auto-moderation can starve nested comments

`functions/index.js:3678-3692` handles nested comment sections by reading only the first 20 parent threads and then selecting up to 10 pending comments from those parents.

Risk:

- If early parent threads contain no actionable pending comments, pending comments under later parent keys may never be reached.
- This can leave moderation queues stuck even though the scheduled function keeps running.

Recommended remediation:

- Maintain an explicit pending comments queue/index, or query a flattened moderation queue.
- Track cursor progress between scheduled runs if parent scanning is retained.

### FUNC-P2-003 - Subscription and invite scheduled jobs scan growing global nodes

Confirmed examples:

- `functions/index.js:5434-5465` reads all `user_subscription` records to expire subscriptions.
- `functions/index.js:5467-5524` reads all `user_subscription` records and then reads `users/{uid}/fcmToken` per candidate.
- `functions/promotionFunctions.js` scheduled subscription jobs scan `promo_subscriptions`.
- `functions/inviteAccess.js` scheduled expiration jobs query by status without a hard batch limit.

Risk:

- As the user base grows, scheduled jobs can hit timeout, memory, or quota limits.
- Daily reminder/expiration behavior may become unreliable before the app shows obvious client-side errors.

Recommended remediation:

- Add indexed due-date buckets or status+expiresAt queues.
- Process in bounded batches with cursors and repeat scheduling.
- Record processed/skipped counts in diagnostics.

## Notes

`sendChaykaTelegramTest` is an HTTP test endpoint protected by `TELEGRAM_TEST_SECRET`. It is not an immediate unauthenticated admin write, but query-string secrets can leak through logs/history if operators use `?secret=...`. Prefer header-only secret transport or admin-only callable access before release hardening.

## Verification

Static code review only. No code fix was made in this stage, so the mandatory post-code-fix test trio was not triggered by Stage 8 itself.
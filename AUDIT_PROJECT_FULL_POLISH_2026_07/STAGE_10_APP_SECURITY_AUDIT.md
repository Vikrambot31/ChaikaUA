# Stage 10 - Application Security Audit

Date: 2026-07-05
Status: static security audit only; no protected auth/rules edits performed.

## Scope

Reviewed high-risk application security surfaces:

- Cloud Function callable authorization boundaries.
- Admin SDK scripts and local secret dependency surface.
- Public/private data separation already identified in Stage 5 and Stage 6.
- Basic secret tracking status from `git ls-files`.

Guardrails respected:

- `admin-panel/src/services/authService.ts` was not changed.
- `admin-panel/src/firebase/firebase.ts` was not changed.
- `firebase.rules.json` was not changed.
- `user_roles`, `security_config`, and `authorized_devices` logic was not changed.

## Findings

### SEC-P1-001 - Server-side callable auth boundary is weaker than client/app-user boundary

Stage 5 fixed several mobile screens so guest UI paths do not create anonymous private actions. Stage 10 found that server-side callable functions still accept any Firebase-authenticated caller in multiple user-write paths.

Primary evidence:

- `functions/index.js:2584-2665` `createRequest`
- `functions/index.js:2707-2739` `offerHelp`
- `functions/bonusFunctions.js` user-facing bonus callables
- `functions/promotionFunctions.js` promotion/subscription callables

Risk:

- A modified client can bypass mobile UI guards and call functions directly with an anonymous Firebase token.
- Because functions use Admin SDK, rules protections do not apply to the write.

Recommended remediation:

- Treat this as the server-side counterpart to MOB-P1-009.
- Implement shared callable auth helpers for real app users, admin/moderator users, and owner-only flows.
- Test all callable categories against anonymous Firebase auth.

### SEC-P1-002 - Admin SDK operational scripts are a broad production bypass surface

Many scripts reference a root service-account filename and write directly to production-like paths. `scripts/ship.mjs:96` contains a shipping guard for `.env`, `serviceAccountKey.json`, and `firebase-adminsdk*.json`, which is good. The remaining risk is operational: local scripts can bypass rules and app-level validation.

Risk:

- Accidental script execution can create, update, or delete production data outside normal validation.
- A compromised local service account key would bypass client and rules controls.

Recommended remediation:

- Centralize Admin SDK initialization in a guarded helper requiring explicit environment selection.
- Add production confirmation prompts or `--apply --project <id>` gates for mutating scripts.
- Keep the ship guard, and add CI/static checks that fail if service-account JSON is tracked.

### SEC-P2-001 - HTTP test endpoints should avoid query-string secrets

`sendChaykaTelegramTest` is protected by `TELEGRAM_TEST_SECRET`, but it accepts the secret from header or query. Query-string secrets are easier to leak through shell history, browser history, proxy logs, and copied links.

Risk:

- If the shared secret leaks, the endpoint can be abused for Telegram test sends.

Recommended remediation:

- Accept the secret only from a header.
- Prefer an admin-only callable if this remains a production-deployed endpoint.

## Verification

Static review only. No code or protected security file was changed in this stage.
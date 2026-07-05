# Stage 5 - Profile, Contact, and Public Feed Privacy Audit

Date: 2026-07-04
Status: static pass continued after MOB-P1-007; no protected auth/rules edits performed.

## Scope

Reviewed the next requested surfaces:

- `src/screens/ItemDetailScreen.tsx`
- `src/screens/Detal-Zayavki.tsx`
- `src/screens/Zapros-Pomoshi.tsx`
- `src/hooks/useContactRequest.ts`
- public feed screens/services for `Bizznes-Chaika`, `Kontakt-XXX`, `Kuplu-Prodam`, `Kto-Poteryal`, and `Poisk-Raboty`

Guardrails respected:

- `admin-panel/src/services/authService.ts` not changed.
- `admin-panel/src/firebase/firebase.ts` not changed.
- `firebase.rules.json` not changed.
- `user_roles`, `security_config`, and `authorized_devices` logic not changed.

## Confirmed Fixes

### MOB-P1-008 - ItemDetail direct route hardening

`ItemDetailScreen` now validates `route.params.item` before mounting the detail content. Invalid or missing params render a fallback instead of crashing or reaching phone/comment/detail UI.

### MOB-P1-009 - Contact/help private actions before auth

`useContactRequest` now requires the Redux app user and rejects anonymous Firebase users before opening or sending contact requests. `RequestDetail` now subscribes to helper responses/confirmations only for the request owner.

### MOB-P1-010 - Hidden phone search/contact paths

`Bizznes-Chaika`, `Kontakt-XXX`, and `Kuplu-Prodam` no longer use hidden `phone` values in public contact search unless the listing belongs to the current user. `Kuplu-Prodam` also honors legacy `showPhone === false` in detail mapping and direct-call actions.

## Static Observations

- `HelpRequestScreen` already keeps submit/photo upload behind app-user checks through `validateSubmissionRequirements`, `canSubmit`, and `PhotoUploadField` rendering. No extra code change was needed there in this pass.
- `Bizznes-Chaika`, `Kontakt-XXX`, `Kuplu-Prodam`, `Kto-Poteryal`, and `Poisk-Raboty` pass `user?.id` into own/private listing subscriptions where those services support own pending items.
- Public approved feed reads still depend on Firebase rules for final enforcement. This pass did not edit rules per guardrails.

## Verification

After each code-fix batch, the requested checks were run:

```powershell
npm run type-check
npm run check:encoding
npm test -- --runInBand
```

Final run status:

- `npm run type-check` PASS.
- `npm run check:encoding` PASS.
- `npm test -- --runInBand` PASS: 20 suites passed, 1 skipped; 153 tests passed, 14 skipped.

## Remaining Follow-up

- Server-side/rules review is still needed for whether public approved listing nodes should store hidden phone values readable to modified clients. No rules change was made because `firebase.rules.json` is protected by the repository guardrails.
- Manual device smoke is still useful for ItemDetail fallback, guest contact button behavior, and hidden-phone search behavior.
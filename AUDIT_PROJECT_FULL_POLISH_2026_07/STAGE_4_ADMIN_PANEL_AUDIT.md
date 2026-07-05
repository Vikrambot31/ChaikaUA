# Stage 4 - Admin Panel Static Audit

Date: 2026-07-03
Status: static pass started; no protected auth/rules edits performed.

## Scope

Reviewed admin panel navigation and high-impact pages:

- `admin-panel/src/App.tsx`
- `admin-panel/src/components/AppShell.tsx`
- `admin-panel/src/hooks/useAuthAccess.ts`
- `admin-panel/src/pages/SecurityPage.tsx`
- `admin-panel/src/pages/AiControlCenterPage.tsx`
- selected role-aware pages such as `AccessControlPage`, `InviteAccessPage`, `GuarantorTreePage`, `AIDiagnosticsPage`, `AppRulesPage`

Protected auth/rules files were not changed.

## Access Model Observed

- `useAuthAccess` is the entry gate for signed-in admin-panel users.
- The app shell receives `role`, but `navItems` is a static list and renders all admin pages for every allowed role.
- `App.renderPage` passes `role` only to some pages.
- Sensitive pages `SecurityPage` and `AiControlCenterPage` receive `user`, not `role`.

## P1 Risks

### ADMIN-P1-001 - Admin panel role boundaries are not centralized

Evidence:

- `admin-panel/src/components/AppShell.tsx` has a static `navItems` array and maps every item for the active role.
- `admin-panel/src/App.tsx` allows hash routes for all page keys in `VALID_PAGES`.
- Several page branches render without role-specific props or local role checks.

Risk:

Moderators who pass the general admin-panel access gate can navigate to pages that look admin-sensitive, including security controls, AI control, release/admin operations, bonus credits, and user blocks.

Status:

Confirmed static risk. Remediation is deferred because changing admin/moderator role checks requires explicit owner approval.

### ADMIN-P1-002 - SecurityPage exposes app/device control without page-level role

Evidence:

- `admin-panel/src/App.tsx` renders `SecurityPage user={access.user}`.
- `admin-panel/src/pages/SecurityPage.tsx` does not accept `role`.
- The page can call `updateSecurityAppControl`, `updateManagedDeviceStatus`, and `getModeratorRoles`.

Risk:

If a moderator reaches `#security`, client UI exposes controls for app enablement, maintenance mode, forced update, new-device policy, and device block/unblock flows. Server-side rules may still reject some writes, but the client role boundary is not explicit.

Status:

Confirmed static risk. No protected role/auth logic changed.

### ADMIN-P1-003 - AiControlCenterPage exposes AI config operations without page-level role

Evidence:

- `admin-panel/src/App.tsx` renders `AiControlCenterPage user={access.user}`.
- `admin-panel/src/pages/AiControlCenterPage.tsx` does not accept `role`.
- The page can subscribe to AI config/escalations and call `saveAiConfig`, `testAiConnection`, and escalation resolution helpers.

Risk:

If a moderator reaches `#ai_control`, client UI exposes AI provider/model/API-key configuration, autonomous mode toggles, budget settings, logs/stats, and escalation handling.

Status:

Confirmed static risk. No protected role/auth logic changed.

## Remediation Direction Requiring Approval

Do not implement without explicit approval because this touches admin-role behavior:

- Define an explicit page-to-minimum-role map, for example `adminOnly` vs `adminOrModerator`.
- Filter `AppShell` navigation by that map.
- Guard direct hash navigation in `App.renderPage`.
- Pass `role` to sensitive pages and render an access-denied state before subscribing or mutating.
- Keep `VITE_ADMIN_SERVICE_EMAIL` and `isPrimaryServiceEmail` owner path untouched.

## Verification

No code behavior was changed in this stage. NPM checks were not rerun for this documentation-only audit note.

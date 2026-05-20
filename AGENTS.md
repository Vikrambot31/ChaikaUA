# Repository Guardrails For AI Agents

## Critical: Admin Access Must Stay Stable

- Do not remove or weaken the primary owner access path used by the admin panel.
- Preserve `VITE_ADMIN_SERVICE_EMAIL` behavior in `admin-panel/src/services/authService.ts`.
- Keep primary owner email recognition (`isPrimaryServiceEmail`) working and mapped to admin access.
- Do not silently change admin-role checks (`admin`/`moderator`) without explicit user approval.

## Before Changing Security/Auth Paths

- Ask for explicit approval before editing:
  - `admin-panel/src/services/authService.ts`
  - `admin-panel/src/firebase/firebase.ts`
  - `firebase.rules.json`
  - Any `user_roles`, `security_config`, `authorized_devices` related logic
- If user asks for unrelated UI/content work, avoid touching the files above.

## Local Owner Requirement

- The owner must always be able to sign in to admin panel from their own PC with the configured `VITE_ADMIN_SERVICE_EMAIL`.
- If any change can impact this behavior, stop and confirm with the user first.

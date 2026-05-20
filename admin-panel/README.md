# Chaika Admin Panel Beta

Separate beta web admin panel for the existing Chaika Life Firebase project.

## Scope

- React + Vite + TypeScript
- Firebase Auth
- Firebase Realtime Database
- Firebase Storage
- Reuses existing moderation, security and device paths
- Does not change the mobile app, Firebase Rules or database structure

## Local Run

```bash
npm install
npm run dev
```

The dev server uses port `5174` by default.

## Build

```bash
npm run build
npm run preview
```

## Environment

The panel reads Firebase config from `.env.local` using `VITE_FIREBASE_*` keys.
Use `.env.example` as the template for deploy environments.

## Owner Access Guard (Important)

- Keep `VITE_ADMIN_SERVICE_EMAIL` set to the owner account email.
- The owner email is treated as primary and receives admin access in `src/services/authService.ts`.
- Do not remove this behavior during refactors, security cleanup, or role-system changes.
- Run `npm run check:admin-guard` after auth/security edits.

## Current Beta MVP

- Firebase Auth login for existing admin/moderator accounts
- Role check through `user_roles/{uid}/role`
- Dashboard counters from existing Firebase paths
- Security controls through `security_config/app_control/current`
- Device block/unblock through `authorized_devices/{uid}/{deviceId}`
- Moderation approve/reject/delete for existing moderation paths
- Media preview via Firebase Storage download URLs when available

## Deploy

Netlify:

```bash
npm run build
```

Use `dist` as the publish directory, or use the included `netlify.toml`.

Vercel:

Use the included `vercel.json` and set all `VITE_FIREBASE_*` environment variables in the project settings.

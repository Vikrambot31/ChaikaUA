# Журнал findings полного аудита

Дата создания: 2026-07-01  
Статусы: `New`, `Confirmed`, `Fixing`, `Fixed`, `Verified`, `Deferred`, `Won't fix`.

## Правило ведения

Каждый P0/P1 finding должен иметь:

- шаги воспроизведения или точное основание;
- ожидаемый и фактический результат;
- список затронутых файлов/модулей;
- проверку после исправления;
- отметку, влияет ли исправление на охраняемые auth/rules файлы.

## Findings из этапа 1

### INV-RISK-001 - Owner admin access

Приоритет: P0  
Статус: New  
Зона: admin auth  
Основание: guardrails проекта требуют сохранить вход владельца через `VITE_ADMIN_SERVICE_EMAIL` и `isPrimaryServiceEmail`.  
Риск: владелец может потерять доступ в админ-панель.  
Затронутые зоны: `admin-panel/src/services/authService.ts`, `admin-panel/src/hooks/useAuthAccess.ts`, `admin-panel/src/firebase/firebase.ts`, `user_roles`.  
Нужна ли правка охраняемых файлов: неизвестно; любые изменения только после отдельного подтверждения.  
Следующая проверка: `npm run check:admin-guard --prefix admin-panel`, ручная проверка owner login path.

### INV-RISK-002 - Roles and client guards mismatch

Приоритет: P0  
Статус: New  
Зона: roles/security  
Основание: в мобильной навигации есть client-side guards `auth`, `complete`, `moderator`, `admin`; они должны совпадать с Firebase rules и server-side checks.  
Риск: privilege escalation или ложный отказ доступа.  
Затронутые зоны: `src/navigation/RootNavigator.tsx`, `src/services/securityRoles.ts`, Firebase rules, Cloud Functions admin callables.  
Нужна ли правка охраняемых файлов: возможно; сначала аудит и тесты.

### INV-RISK-003 - Service account style files in repository root

Приоритет: P0  
Статус: New  
Зона: secrets/security  
Основание: в корне видны JSON-файлы с названиями service account/admin SDK.  
Риск: утечка приватных ключей или production credentials, если файлы настоящие и попали в git/бэкапы.  
Затронутые зоны: root JSON files, `.gitignore`, deploy scripts, Firebase Admin scripts.  
Нужна ли правка охраняемых файлов: нет на первом проходе; remediation отдельно после проверки.
Следующая проверка: stage 2 secret exposure audit без вывода секретов в отчет.

### INV-RISK-004 - Media privacy and Storage rules

Приоритет: P0  
Статус: New  
Зона: media/storage  
Основание: проект содержит публичные/приватные фото, moderation pipeline, media access functions и Storage rules.  
Риск: приватные фото могут стать публичными или approved status можно обойти.  
Затронутые зоны: `storage.rules`, `src/services/mediaAccess.ts`, `src/services/photoUploadService.ts`, `src/services/unifiedPhotoUpload.ts`, `functions` media functions.  
Нужна ли правка охраняемых файлов: возможно для rules, только после подтверждения.

### INV-RISK-005 - Mojibake/text corruption risk

Приоритет: P1  
Статус: New  
Зона: encoding/i18n  
Основание: терминальный вывод показал mojibake для русско/украинских строк. Это может быть только проблема консоли, но требует проверки.  
Риск: пользователь видит битый текст в приложении или админке.  
Затронутые зоны: `App.tsx`, `admin-panel/src/App.tsx`, `src/i18n`, markdown docs, package metadata.  
Нужна ли правка охраняемых файлов: нет.
Следующая проверка: `npm run check:encoding`, выборочная проверка файлов в UTF-8 aware editor/tool.

### INV-RISK-006 - Callable admin functions authorization

Приоритет: P1  
Статус: New  
Зона: Cloud Functions  
Основание: functions inventory содержит много admin callable endpoints: role changes, invite access, premium/business plus, AI control, content moderation.  
Риск: функция может доверять клиенту или UI-роли без server-side проверки.  
Затронутые зоны: `functions/*.js`, admin services, mobile services.  
Нужна ли правка охраняемых файлов: обычно нет, но может затронуть role logic.

### INV-RISK-007 - Scheduled cleanup/purge data loss

Приоритет: P1  
Статус: New  
Зона: scheduled functions  
Основание: есть purge/cleanup/expiration jobs.  
Риск: ошибочная чистка данных, отсутствие dry-run/logging/idempotency.  
Затронутые зоны: `functions`, database paths, logs.  
Нужна ли правка охраняемых файлов: нет на первом проходе.

### INV-RISK-008 - Timezone consistency

Приоритет: P1  
Статус: New  
Зона: schedules/time  
Основание: `functions/functions.yaml` содержит `Europe/Kiev` и `Europe/Kyiv`.  
Риск: расписания могут запускаться не так, как ожидается, или быть сложнее сопровождать.  
Затронутые зоны: scheduled Cloud Functions.  
Нужна ли правка охраняемых файлов: нет.

### INV-RISK-009 - Missing obvious admin/functions/storage automated coverage

Приоритет: P1  
Статус: New  
Зона: tests  
Основание: inventory показывает мобильные/rules tests и Maestro flows, но admin UI, Cloud Functions и Storage rules coverage не очевидны.  
Риск: регрессии в критичных зонах не ловятся автоматически.  
Затронутые зоны: `admin-panel`, `functions`, `storage.rules`, tests.  
Нужна ли правка охраняемых файлов: нет.

### INV-RISK-010 - Mutating scripts classification

Приоритет: P2  
Статус: New  
Зона: scripts/operations  
Основание: в `scripts` много seed/migration/test scripts, часть может писать в Firebase.  
Риск: случайный запуск изменит production/staging данные.  
Затронутые зоны: `scripts`, package scripts, docs.  
Нужна ли правка охраняемых файлов: нет.



## Stage 3 P1 fixes - 2026-07-02

### MOB-P1-001 - ContactCardChatScreen direct route/auth/params risk

Priority: P1  
Status: Verified  
Area: mobile navigation / contact card chat  
Files: `src/screens/ContactCardChatScreen.tsx`, `src/navigation/RootNavigator.tsx`  
Actual before fix: direct route/deep link could open without valid route params and the chat subscription was built from route data before verifying current user participation.  
Fix: added navigation-level `auth` guard, direct-link auth redirect, local route param validation, participant check for `requesterId` or `targetUserId`, no subscription/send path unless validation passes, and a non-crashing fallback state.  
Protected auth/rules files changed: no.  
Verification after fix: `npm run type-check` PASS; `npm run check:encoding` PASS; `npm test -- --runInBand` PASS.

### MOB-P1-002 - CrashDiagnosticsScreen public diagnostics risk

Priority: P1  
Status: Verified  
Area: mobile diagnostics  
Files: `src/navigation/RootNavigator.tsx`  
Actual before fix: public deep link `screen/crash-diagnostics` could expose local crash stack and console diagnostics UI.  
Fix: wrapped `CrashDiagnosticsScreen` in `admin` guard and added the route to guarded deep-link auth handling so anonymous users are redirected before opening diagnostics.  
Protected auth/rules files changed: no.  
Verification after fix: `npm run type-check` PASS; `npm run check:encoding` PASS; `npm test -- --runInBand` PASS.


### MOB-P1-003 - OSBB finance/admin client visibility

Priority: P1  
Status: Verified  
Area: mobile OSBB finance/admin  
Files: `src/screens/OSBB-Finansy.tsx`, `src/screens/OSBB-AdminPanel.tsx`, `src/navigation/RootNavigator.tsx`  
Actual before fix: `screen/osbb/finance` was public at navigation level; finance collections/payment subscriptions could start for any authenticated user with a building id; OSBB admin panel could show manager UI to a regular authenticated user and subscribed to `user_roles` moderator list before proving system-admin access.  
Fix: added auth/deep-link guard for `OsbbFinansyScreen`; finance screen now renders an access-denied state and does not subscribe to collections/payments unless local OSBB membership is approved; OSBB admin panel now requires approved OSBB manager or system admin before loading panel data; moderator list and security action are only loaded/shown for system admin.  
Protected auth/rules files changed: no.  
Verification after fix: `npm run type-check` PASS; `npm run check:encoding` PASS; `npm test -- --runInBand` PASS.

### RULES-P1-001 - OSBB finance/payment rules broader than client policy

Priority: P1  
Status: Deferred  
Area: Firebase Realtime Database rules / OSBB privacy  
Files: `firebase.rules.json`  
Finding: `osbb_collections` and `osbb_collection_payments` currently use broad `.read`: `auth != null`. The mobile client now restricts finance/payment visibility to approved OSBB membership or system admin paths, but modified clients can still rely on broader server rules.  
Risk: authenticated users may read OSBB finance/payment entries outside the intended approved-building-member policy if they bypass the client.  
Needed fix: tighten RTDB rules to match the approved member/admin/moderator policy and add emulator tests.  
Protected auth/rules files changed: no; rule change requires explicit owner approval per guardrails.  
Verification: static rules review only; no rules edit performed.


## Stage 4 admin panel audit - 2026-07-03

### ADMIN-P1-001 - Admin panel role boundaries are not centralized

Priority: P1  
Status: Deferred  
Area: admin panel role access  
Files: `admin-panel/src/App.tsx`, `admin-panel/src/components/AppShell.tsx`  
Finding: `AppShell` renders a static `navItems` list for every allowed role, while `App.renderPage` accepts all `VALID_PAGES` hash routes. Several pages render without a page-level role prop or local role gate.  
Risk: a moderator who passes the general admin-panel access gate can navigate to pages that appear admin-sensitive, including security controls, AI control, release/admin operations, bonus credits, and user blocks.  
Needed fix: define an explicit page-to-minimum-role map, filter navigation, and guard direct hash navigation.  
Protected auth/rules files changed: no; admin-role behavior changes require explicit owner approval.

### ADMIN-P1-002 - SecurityPage exposes app/device control without page-level role

Priority: P1  
Status: Deferred  
Area: admin panel security controls  
Files: `admin-panel/src/App.tsx`, `admin-panel/src/pages/SecurityPage.tsx`  
Finding: `App.tsx` renders `SecurityPage user={access.user}` and `SecurityPage` does not accept `role`. The page can call `updateSecurityAppControl`, `updateManagedDeviceStatus`, and `getModeratorRoles`.  
Risk: if a moderator reaches `#security`, the client UI exposes app enablement, maintenance mode, forced update, new-device policy, and device block/unblock flows. Server-side rules may still reject some writes, but the client role boundary is not explicit.  
Needed fix: pass role into the page and render an access-denied state before subscriptions or mutations unless the role is explicitly allowed.  
Protected auth/rules files changed: no; admin-role behavior changes require explicit owner approval.

### ADMIN-P1-003 - AiControlCenterPage exposes AI config operations without page-level role

Priority: P1  
Status: Deferred  
Area: admin panel AI control  
Files: `admin-panel/src/App.tsx`, `admin-panel/src/pages/AiControlCenterPage.tsx`  
Finding: `App.tsx` renders `AiControlCenterPage user={access.user}` and `AiControlCenterPage` does not accept `role`. The page can subscribe to AI config/escalations and call `saveAiConfig`, `testAiConnection`, and escalation resolution helpers.  
Risk: if a moderator reaches `#ai_control`, the client UI exposes AI provider/model/API-key configuration, autonomous mode toggles, budget settings, logs/stats, and escalation handling.  
Needed fix: pass role into the page and block non-approved roles before loading or mutating AI control state.  
Protected auth/rules files changed: no; admin-role behavior changes require explicit owner approval.

### MOB-P1-004 - Private photo/favorites/inbox routes missing navigation auth guard

Priority: P1  
Status: Verified  
Area: mobile navigation / private user data  
Files: `src/navigation/RootNavigator.tsx`  
Actual before fix: `PhotoUploadScreen`, `MyPhotosScreen`, `MyApprovedPhotosScreen`, `FavoritesScreen`, and `InboxScreen` were stack routes without navigation-level `withGuard`. Some of these routes also had deep links (`screen/photo-upload`, `screen/my-photos`, `screen/inbox`) and could be opened directly before the screen-level logic decided whether to load private data.  
Fix: added these screens to the auth-only deep-link route set and wrapped the stack screens with `withGuard(..., 'auth')`.  
Protected auth/rules files changed: no.  
Verification after fix: `npm run type-check` PASS; `npm run check:encoding` PASS; `npm test -- --runInBand` PASS.
### MOB-P1-005 - ProfileRequestsScreen stack route missing navigation auth guard

Priority: P1  
Status: Verified  
Area: mobile navigation / contact request privacy  
Files: `src/navigation/RootNavigator.tsx`  
Actual before fix: `ProfileRequestsScreen` relied on internal current-user checks, but the stack route itself was not wrapped with navigation-level `withGuard`. The screen manages incoming/outgoing contact requests and can read/update request history for the current user.  
Fix: wrapped `ProfileRequestsScreen` with `withGuard(..., 'auth')` so unauthenticated direct navigation is redirected before the screen mounts.  
Protected auth/rules files changed: no.  
Verification after fix: `npm run type-check` PASS; `npm run check:encoding` PASS; `npm test -- --runInBand` PASS.
### MOB-P1-006 - SupportScreen anonymous support-ticket subscription risk

Priority: P1  
Status: Verified  
Area: mobile support / user ticket privacy  
Files: `src/screens/SupportScreen.tsx`  
Actual before fix: `SupportScreen` could call `ensureFirebaseAuth()` on mount even without an app user, which may create/use an anonymous Firebase session and then subscribe to `user_support_ticket_ref/{anonymousUid}`. The UI already required an app user to send, but ticket subscription startup was not tied to that same user boundary.  
Fix: if there is no app user, the screen now keeps the guest notice behavior but clears ticket/message state and does not start Firebase support session/subscriptions. If Firebase auth resolves to an anonymous user, the support user id remains null.  
Protected auth/rules files changed: no.  
Verification after fix: `npm run type-check` PASS; `npm run check:encoding` PASS; `npm test -- --runInBand` PASS.
### MOB-P1-007 - ViewUserProfile stack route missing navigation auth guard

Priority: P1  
Status: Verified  
Area: mobile navigation / profile privacy  
Files: `src/navigation/RootNavigator.tsx`  
Actual before fix: `ViewUserProfile` had internal auth checks, but the stack route itself was not wrapped with navigation-level `withGuard`. The screen loads user profile data by route `userId`, so the route boundary should match the private profile/contact flow.  
Fix: wrapped `ViewUserProfile` with `withGuard(..., 'auth')` so unauthenticated direct navigation is redirected before the profile screen mounts.  
Protected auth/rules files changed: no.  
Verification after fix: `npm run type-check` PASS; `npm run check:encoding` PASS; `npm test -- --runInBand` PASS.
## Stage 5 profile/contact/privacy audit - 2026-07-04

### MOB-P1-008 - ItemDetailScreen direct route params and contact-phone privacy risk

Priority: P1  
Status: Verified  
Area: mobile item detail / contact privacy  
Files: `src/screens/ItemDetailScreen.tsx`  
Actual before fix: `ItemDetailScreen` dereferenced `route.params.item` directly. A corrupted/direct stack navigation without params could crash before the existing auth gate, and malformed params could reach contact/comment/detail rendering paths.  
Fix: added runtime `DetailItemData` validation and a non-crashing fallback state before mounting the detail content. Valid detail content still requires the existing app-user auth gate before showing phone/profile/comments.  
Protected auth/rules files changed: no.  
Verification after fix: `npm run type-check` PASS; `npm run check:encoding` PASS; `npm test -- --runInBand` PASS.

### MOB-P1-009 - Contact request and help-response private actions before app auth

Priority: P1  
Status: Verified  
Area: mobile contact requests / help request details  
Files: `src/hooks/useContactRequest.ts`, `src/screens/Detal-Zayavki.tsx`  
Actual before fix: `useContactRequest` could call `ensureFirebaseAuth()` and use an anonymous Firebase uid as the requester when a guest triggered a contact request path. `RequestDetail` also subscribed to help responses/confirmations for a request before proving the current app user was the request author.  
Fix: `useContactRequest` now requires an app-authenticated user and rejects anonymous Firebase users before opening/sending contact requests. `RequestDetail` now clears and skips help-response/help-confirmation subscriptions unless `currentUser.id` matches `request.userId`; guest contact-request buttons are disabled by requiring `currentUser.id`.  
Protected auth/rules files changed: no.  
Verification after fix: `npm run type-check` PASS; `npm run check:encoding` PASS; `npm test -- --runInBand` PASS.

### MOB-P1-010 - Hidden phone values could influence public feed search/contact paths

Priority: P1  
Status: Verified  
Area: mobile public feeds / hidden phone privacy  
Files: `src/screens/Bizznes-Chaika.tsx`, `src/screens/Kontakt-XXX.tsx`, `src/screens/Kuplu-Prodam.tsx`  
Actual before fix: public feed filters could match `phone` even when a listing had `showPhone === false`, allowing hidden numbers to influence search results. `Kuplu-Prodam` also passed phone into detail/contact paths without checking legacy `showPhone === false`.  
Fix: contact search uses phone only when `showPhone !== false` or the listing belongs to the current user. Buy/sell detail mapping and direct phone contact now also honor `showPhone !== false`.  
Protected auth/rules files changed: no.  
Verification after fix: `npm run type-check` PASS; `npm run check:encoding` PASS; `npm test -- --runInBand` PASS.
### MOB-P1-011 - Job listing phone could leak through search/detail despite private contact flow

Priority: P1  
Status: Verified  
Area: mobile public feeds / job contact privacy  
Files: `src/screens/Poisk-Raboty.tsx`  
Actual before fix: registered-user job listings used the private contact-request action in cards, but `phone` still participated in advanced contact search and was passed into `ItemDetailScreen`. A hidden/private contact flow could therefore still disclose or reveal matches for the stored phone.  
Fix: job contact search now includes phone only for own listings or legacy listings without `userId`. Detail mapping also omits phone for other users' registered job listings, keeping contact through the private request flow.  
Protected auth/rules files changed: no.  
Verification after fix: `npm run type-check` PASS; `npm run check:encoding` PASS; `npm test -- --runInBand` PASS.

## Stage 6 Firebase public feed rules audit - 2026-07-04

### RULES-P1-002 - Public listing rules expose raw hidden phone/source fields to modified clients

Priority: P1  
Status: Deferred  
Area: Firebase Realtime Database rules / public feed privacy  
Files: `firebase.rules.json`, `src/__tests__/firebaseRulesSecurity.test.ts`, `src/__tests__/firebaseRulesEmulator.test.ts`  
Finding: client screens now hide `showPhone === false` values from search/detail/contact paths, but the underlying listing nodes are still readable broadly by rules. `biznes_chaika_listings`, `buy_sell_listings`, `lost_found`, and `job_listings` use collection-level `.read: true`; `contacts_listings` uses `.read: auth != null`. A modified client can read raw `phone` and related source/contact fields directly from the database when those fields are stored on the public node.  
Risk: client-side privacy controls can be bypassed for hidden-phone listings or private-contact flows.  
Needed fix: introduce public projection nodes that omit hidden/private fields, or tighten rules/data shape so public reads expose only approved public fields while owner/admin/moderator paths retain full records. Add emulator tests for hidden phone/public projection behavior.  
Protected auth/rules files changed: no; `firebase.rules.json` is protected and requires explicit owner approval.  
Verification: static rules review only; no rules edit performed.

### RULES-P1-003 - Public listing rules allow collection reads outside approved-only client queries

Priority: P1  
Status: Deferred  
Area: Firebase Realtime Database rules / moderation privacy  
Files: `firebase.rules.json`, `src/__tests__/firebaseRulesSecurity.test.ts`, `src/__tests__/firebaseRulesEmulator.test.ts`  
Finding: the client services query approved public records and merge own pending/private records where needed, but rules for several listing branches grant collection-level reads (`.read: true` or `auth != null`). Rules therefore do not enforce approved-only visibility for modified clients reading the raw node. Existing static tests currently assert these broad reads as expected behavior, so tightening rules will require test updates.  
Risk: pending/rejected/expired or owner-only listing records may be readable outside the intended client workflow if present under the same public branches.  
Needed fix: move public approved records into projection branches or replace collection-level reads with rules that match the intended approved/owner/admin visibility model, then add emulator coverage for anonymous/authenticated/owner/admin read cases.  
Protected auth/rules files changed: no; `firebase.rules.json` is protected and requires explicit owner approval.  
Verification: static rules review only; no rules edit performed.
## Stage 8 Cloud Functions and server-side logic audit - 2026-07-05

### FUNC-P1-001 - Cloud Functions user-write callables accept anonymous Firebase auth

Priority: P1  
Status: Confirmed  
Area: Cloud Functions / server-side authorization  
Files: `functions/index.js`, `functions/bonusFunctions.js`, `functions/promotionFunctions.js`  
Finding: user-write callable functions such as `createRequest`, `offerHelp`, bonus award callables, and promotion/subscription callables check only `context.auth` or `context.auth.uid` before writing through Admin SDK. They do not consistently reject anonymous Firebase auth.  
Risk: mobile UI guards and Realtime Database rules can be bypassed by calling functions directly with an anonymous Firebase token, because Admin SDK writes bypass rules.  
Needed fix: add shared real-user callable auth assertions, reject `sign_in_provider === 'anonymous'`, and add callable tests for anonymous vs registered users.  
Protected auth/rules files changed: no.

### FUNC-P2-001 - Functions lint misses modular function files

Priority: P2
Status: Verified  
Area: Cloud Functions / release validation  
Files: `functions/package.json`, `functions/bonusFunctions.js`, `functions/promotionFunctions.js`, `functions/inviteAccess.js`  
Finding: `functions/package.json` lint checks only `index.js` and `scripts/seed-chayka-news.js`, but deployed logic is also loaded from modular files.  
Risk: syntax errors in modular function files can pass local lint and fail during deploy/runtime loading.  
Needed fix: extend functions lint to syntax-check all loaded function modules, excluding `node_modules`.

### FUNC-P2-002 - AI auto-moderation can starve nested comments

Priority: P2
Status: Verified
Area: Cloud Functions / moderation reliability
Files: `functions/index.js`
Finding: nested comment auto-moderation scans only the first 20 parent threads and then up to 10 pending comments from those parents. Pending comments under later parent keys may not be reached.
Fix: replaced static `limitToFirst(20)` with cursor-based rotation stored in `ai_config/auto_mod_cursors`. Each 5-minute cycle reads 20 parent keys starting after the last cursor, wraps around when it reaches the end, and still limits to 10 pending comments per cycle. All parent threads are now reachable across cycles.
Protected auth/rules files changed: no.
Verification: `functions lint` PASS; `type-check` PASS; `npm test` PASS.

## Stage 9 data, migrations, compatibility audit - 2026-07-05

### DATA-P1-001 - Mutating Firebase scripts lack a consistent dry-run/apply gate

Priority: P1  
Status: Confirmed  
Area: scripts / production data safety  
Files: `scripts/backfill-community-photos-public.mjs`, `scripts/create-elena-requests.mjs`, `scripts/elena-do-all.mjs`, `scripts/seed-bot-users.mjs`, related test/step scripts  
Finding: some migrations are dry-run by default, but other scripts write to Firebase by default or are seed/test utilities with Admin SDK production write capability.  
Risk: an inspection or test script can accidentally mutate production-like data, bypassing app/rules validation.  
Needed fix: standardize mutating scripts around dry-run default plus explicit `--apply`/`--write` and environment confirmation.

### DATA-P2-001 - Generated function manifest is local, untracked, and not authoritative

Priority: P2  
Status: Confirmed  
Area: release/audit artifacts  
Files: `functions/functions.yaml`, `functions/functions.yaml.bak`  
Finding: generated function manifest files were present locally but not tracked by git. They are useful for inventory, but should not be treated as source of truth unless regenerated by the release process.  
Risk: stale generated output can mislead audits of endpoints and schedules.  
Needed fix: treat source files as authoritative or regenerate timestamped manifests as release artifacts.

## Stage 10 application security audit - 2026-07-05

### SEC-P1-001 - Server callable auth boundary is weaker than app-user boundary

Priority: P1  
Status: Confirmed  
Area: application security / Cloud Functions  
Files: `functions/index.js`, `functions/bonusFunctions.js`, `functions/promotionFunctions.js`  
Finding: Stage 5 fixed client guest/private-action paths, but server callables still accept any Firebase-authenticated caller in several user-write flows.  
Risk: direct callable invocation can bypass the app-user checks added in mobile screens.  
Needed fix: centralize callable auth helpers and test anonymous Firebase tokens across all user-write functions.

### SEC-P1-002 - Admin SDK operational scripts are a broad production bypass surface

Priority: P1  
Status: Confirmed  
Area: scripts / secrets / production operations  
Files: `scripts/*.mjs`, `scripts/*.js`, `scripts/ship.mjs`  
Finding: many scripts reference a root service-account filename and write directly with Admin SDK. `scripts/ship.mjs` has a secret shipping guard, but local operational execution remains broad.  
Risk: accidental execution or service-account compromise bypasses rules and app-level validation.  
Needed fix: centralize guarded Admin SDK initialization, require explicit environment/apply flags, and keep CI checks for service-account JSON.

### SEC-P2-001 - HTTP test endpoint accepts query-string secret

Priority: P2
Status: Verified  
Area: Cloud Functions / operational security  
Files: `functions/index.js`  
Finding: `sendChaykaTelegramTest` is protected by `TELEGRAM_TEST_SECRET`, but accepting secrets from query strings makes accidental leakage easier.  
Risk: leaked URL/history/log entries can expose the shared endpoint secret.  
Needed fix: require header-only secret transport or move the action behind admin-only callable access.

## Stage 11 performance audit - 2026-07-05

### PERF-P1-001 - Full-node reads remain in moderation and user-directory paths

Priority: P1  
Status: Confirmed  
Area: mobile performance / Firebase reads  
Files: `src/firebase-config.ts`, `src/screens/Spisok-Zayavok.tsx`  
Finding: `communityUsersAPI.getUsersOnce` reads all `users`, and `Spisok-Zayavok` reads full content branches such as `community_photos`, `lost_found`, `buy_sell_listings`, `contacts_listings`, `local_business`, and `biznes_chaika_listings`.  
Risk: moderation and user-directory flows can become slow, memory-heavy, or expensive as production data grows.  
Needed fix: use indexed pending/status queries, bounded pagination, and moderation queue indexes.

### PERF-P1-002 - Admin dashboards subscribe to global nodes without pagination

Priority: P1  
Status: Confirmed  
Area: admin-panel performance / Firebase subscriptions  
Files: `admin-panel/src/services/bonusAdminService.ts`, `admin-panel/src/services/businessPlusAdminService.ts`, `admin-panel/src/services/premiumAdminService.ts`, `admin-panel/src/services/photoApprovalService.ts`, `admin-panel/src/services/yellowListService.ts`  
Finding: several admin services subscribe to or read broad global nodes such as `user_bonuses`, `promo_credits`, `business_plus_claims`, `business_plus_cards`, `user_subscription`, `community_photos`, and `user_photos`.  
Risk: admin panel initial load and live updates can degrade sharply with production data volume.  
Needed fix: paginate admin tables, use aggregate counters for dashboard summaries, and keep full reads behind deliberate export/diagnostic actions.

### PERF-P2-001 - Scheduled functions process unbounded global collections

Priority: P2  
Status: Confirmed  
Area: Cloud Functions performance / scheduled jobs  
Files: `functions/index.js`, `functions/promotionFunctions.js`, `functions/inviteAccess.js`  
Finding: subscription, promo subscription, and invite expiration jobs scan broad/global collections without hard batch cursors.  
Risk: scheduled maintenance can time out or silently skip work as data grows.  
Needed fix: add due-date buckets, bounded batches, continuation state, and diagnostics counters.
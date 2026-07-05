# Этап 1 - Инвентаризация проекта

Дата: 2026-07-01  
Статус: выполнен первичный проход по структуре репозитория.  
Цель этапа: собрать карту проекта, определить зоны аудита и выделить первые красные флаги для следующих этапов.

## 1. Краткий вывод

Проект состоит из нескольких крупных поверхностей:

- мобильное приложение Expo/React Native;
- web/admin panel на React/Vite;
- Firebase Realtime Database rules;
- Firebase Storage rules;
- Cloud Functions;
- local-server;
- scripts для миграций, диагностики, релиза и тестовых данных;
- Jest/unit/rules tests;
- Maestro E2E flows;
- большая база предыдущих отчетов, планов и миграционных документов.

Первичный охват большой: найдено около 104 файлов экранов в `src/screens`, 23 страницы админ-панели в `admin-panel/src/pages`, 68 мобильных service-файлов, 41 service-файл админки, 5 JS/MJS файлов в `functions`, 26 Maestro flow-файлов и 22 тестовых файла в `src/__tests__`/`__tests__`.

## 2. Главные guardrails

Во время аудита нельзя без отдельного подтверждения владельца менять:

- `admin-panel/src/services/authService.ts`;
- `admin-panel/src/firebase/firebase.ts`;
- `firebase.rules.json`;
- логику `user_roles`, `security_config`, `authorized_devices`.

Критичный бизнес-инвариант: владелец должен сохранять доступ в админку через `VITE_ADMIN_SERVICE_EMAIL`, а распознавание primary service email не должно быть ослаблено или удалено.

## 3. Технологическая карта

### Mobile app

- Entry: `App.tsx`.
- Navigation: `src/navigation/RootNavigator.tsx`.
- State: `src/redux/store.ts`, slices в `src/redux/slices`.
- Firebase config/core: `src/firebase-config.ts`, `src/firebase-core.ts`, `src/firebase-auth-session.ts`.
- Screens: `src/screens`.
- Components: `src/components`.
- Services: `src/services`.
- Hooks: `src/hooks`.
- I18n: `src/i18n`.
- Photo module: `src/photo-module`.
- Tests: `src/__tests__`.

### Admin panel

- Entry: `admin-panel/src/main.tsx`.
- App/router by hash: `admin-panel/src/App.tsx`.
- Shell/navigation: `admin-panel/src/components/AppShell.tsx`.
- Pages: `admin-panel/src/pages`.
- Services: `admin-panel/src/services`.
- Hooks: `admin-panel/src/hooks`.
- Firebase config: `admin-panel/src/firebase/firebase.ts`.
- Auth access hook/service: `admin-panel/src/hooks/useAuthAccess.ts`, `admin-panel/src/services/authService.ts`.

### Server/Firebase

- Realtime Database rules: `firebase.rules.json`.
- Storage rules: `storage.rules`.
- Firebase deploy config: `firebase.json`, `.firebaserc`.
- Cloud Functions: `functions`.
- Local server: `local-server`.
- Release/build config: `app.config.js`, `app.json`, `eas.json`, `android`, `google-services.json`.

## 4. Mobile app route inventory

Main tab routes:

- `HomeTab` -> `Glavny-Ekran.tsx`.
- `MapTab` -> `Karta-Chayki.tsx`.
- `HelpTab` -> `Vibor-Temy-Zayavki.tsx`.
- `ServicesTab` -> `servicesHub.tsx`.
- `ProfileTab` -> `Profil-Polzovatelya.tsx`.

Key stack route groups from `RootNavigator.tsx`:

- Auth/profile: `Vkhod`, `Registraciya-Polnaya`, `ProfileSetupScreen`, `EditProfileScreen`, `ViewUserProfileScreen`, `StartAvatarPickerScreen`.
- Requests/help: `Vibor-Temy-Zayavki`, `Forma-Zayavki`, `Spisok-Zayavok`, `Detal-Zayavki`, `Pomoch-Sosedyam`, `Zapros-Pomoshi`, `Moi-Zayavki`, `Istoriya-Zaprosov`.
- Places/services: `Mesta-Chayki`, `Spisok-Mest`, `Panel-Detaley-Mesta`, `Luchshiye-Mesta`, `Interesnye-Mesta`, `Top-Kafe`, `Top-Magaziny`, `servicesHub`.
- Community/social: `Lyudi-Chayki`, `Kontakt-XXX`, `ContactCardChatScreen`, `Onlayn-Chat`, `InboxScreen`, `ProfileRequestsScreen`.
- OSBB: `OSBB-Hub`, `OSBB-Sbor`, `OSBB-Golosovanie`, `OSBB-Finansy`, `OSBB-Novosti`, `OSBB-Setup`, `OSBB-AddNews`, `OSBB-AdminPanel`.
- Media/photo: `Foto-Dlya-Dushi`, `Foto-Rayona`, `Zagruzka-Foto`, `photo-module/MyPhotosScreen`, `MyApprovedPhotosScreen`, `Moderaciya-Foto`.
- Commerce/content: `Kuplu-Prodam`, `CreateBuySellScreen`, `Poisk-Raboty`, `Kto-Poteryal`, `Obyavleniya`, `Vazhnye-Novosti-Chayki`.
- Business/subscriptions/bonuses: `Bizznes-Chaika`, `BusinessClaimScreen`, `BusinessPlusSubscriptionScreen`, `BusinessMenuEditorScreen`, `BusinessPromoEditorScreen`, `Podpiska-Premium`, `BonusWalletScreen`, `PromoCreditsTopupScreen`, `PromoCreditsAdminScreen`, `BonusPromotionPurchaseScreen`.
- Categories: kids, beauty, sport, food: `Vse-Dlya-Detey`, `Salony-Krasoty`, `Sport-Na-Chayke`, `Eda-Na-Chayke`, detail screens.
- Diagnostics/admin mobile: `AdminRuntimeMonitorScreen`, `AdminUserErrorsScreen`, `UserErrorMonitorScreen`, `ServiceModerationScreen`, `ServiceModerationIssuesScreen`, `ServerStatusScreen`, `AuthDiagnosticScreen`, `CrashDiagnosticsScreen`, `SecurityControlScreen`, `AppMonitorScreen`, `AppVersionInfoScreen`.
- Support/settings: `SupportScreen`, `Nalashtuvannya-Spovishchen`, `Spravka`, `Pro-Prilozhenie`, `QR-Kod`, `Ekran-Koda-Zagruzki`.

Access guards observed in navigation:

- `auth`: help history, my requests, edit profile, notification settings, app monitor, bonus wallet, promo topup, bonus promotion, edit contact listing, business claim/subscription/editor flows.
- `complete`: request form, create buy/sell.
- `moderator`: photo moderation, service moderation, user error moderation, service moderation issues.
- `admin`: admin runtime monitor, admin user errors, server status, security control, promo credits admin.

Audit implication: stage 3 must verify that UI guards match Firebase rules and server-side checks. Client guard alone is not sufficient.

## 5. Admin panel inventory

Admin pages from `admin-panel/src/App.tsx`:

- `dashboard` -> `DashboardPage`.
- `moderation` -> `ModerationPage`.
- `archive` -> `ArchivePage`.
- `invite_access` -> `InviteAccessPage`.
- `guarantor_tree` -> `GuarantorTreePage`.
- `access_control` -> `AccessControlPage`.
- `security` -> `SecurityPage`.
- `errors` -> `ErrorMonitorPage`.
- `photo_approval` -> `PhotoApprovalPage`.
- `releases` -> `ReleasesPage`.
- `ai_diagnostics` -> `AIDiagnosticsPage`.
- `ai_control` -> `AiControlCenterPage`.
- `app_rules` -> `AppRulesPage`.
- `support` -> `SupportPage`.
- `bonus_credits` -> `BonusCreditsPage`.
- `ad_chat` -> `AdChatPage`.
- `premium` -> `PremiumPage`.
- `business_plus` -> `BusinessPlusModerationPage`.
- `feature_ratings` -> `FeatureRatingsPage`.
- `top_listings` -> `TopListingsModerationPage`.
- `reports` -> `ReportsModerationPage`.
- `user_blocks` -> `UserBlocksPage`.

Admin access flow:

- `useAuthAccess` decides loading/signedOut/denied/allowed status.
- `LoginPage` is shown for signed out and denied states.
- `AppShell` receives `user`, `role`, active page and pending photo count.
- Each page is wrapped in `PageErrorBoundary`.

High-risk admin areas:

- access control and invite access;
- security page;
- app rules page;
- moderation/photo approval;
- releases;
- AI control/diagnostics;
- bonus/premium/business plus;
- user blocks and reports.

## 6. Cloud Functions inventory

Functions are declared in `functions/functions.yaml`. Observed groups:

- invite/guest access: `initializeGuestAccessOnUserCreate`, `submitInviteRequest`, sponsor confirmations, invite access admin functions;
- access/security roles: `setUserRole`, `onRoleChanged`, `syncRoleToAuthCustomClaim`, `shadowLogUserRoleWrite`, emergency debug unlock;
- bonuses and promo credits: award functions, admin adjustments, promotion purchase/moderation, subscriptions;
- requests/content: `createRequest`, `offerHelp`, cleanup, moderation notifications, auto moderation;
- media: `getMediaAccessUrl`, `getMediaDataUrl`, `getMediaDataUrlHttp`, metadata stripping, voice processing;
- OSBB: vote creation/casting/expiration;
- premium/business plus subscriptions;
- AI moderation/support/report triage;
- diagnostics/log retention: runtime alert, purge logs, stale data purge;
- Telegram publication/test functions.

Notable audit points:

- project mixes GCF v1 and v2 functions;
- schedules use both `Europe/Kiev` and `Europe/Kyiv`;
- several callable admin functions must prove auth and role enforcement server-side;
- media access functions are critical for privacy;
- scheduled cleanup/purge jobs require data-loss review.

## 7. Rules and storage inventory

Rules files:

- `firebase.rules.json` - Realtime Database rules.
- `storage.rules` - Storage rules.

Existing related scripts/tests:

- `npm run rules:check`;
- `npm run rules:check:storage`;
- `npm run test:rules:emulator`;
- `src/__tests__/firebaseRulesSecurity.test.ts`;
- `src/__tests__/firebaseRulesEmulator.test.ts`;
- `scripts/run-rules-emulator-tests.mjs`;
- `scripts/smoke-root-read-false-prod.mjs`.

Protected paths that need special audit handling:

- `user_roles`;
- `security_config`;
- `authorized_devices`;
- owner/admin/moderator checks;
- owner service email path.

## 8. Existing tests and E2E coverage

Unit/rules tests observed:

- auth/session;
- access control;
- app version;
- validation;
- service moderation;
- moderator service;
- Firebase rules security/emulator;
- OSBB collections/news/voting;
- notification preferences;
- monthly rating;
- chat requests;
- subscription slice.

Maestro flows observed:

- app launch, home screen, restart;
- auth screen;
- tab/back navigation and full user journey;
- map and places;
- help neighbors;
- online chat;
- OSBB hub;
- sports;
- profile;
- electricity status;
- announcements;
- buy/sell and job search;
- important news;
- rating;
- lost/found;
- notification settings;
- app info;
- photo gallery;
- scroll performance.

Coverage gaps to verify later:

- admin-panel automated UI coverage is not obvious from inventory;
- Cloud Functions tests are not obvious from inventory;
- Storage rules tests are not obvious from inventory;
- APK install/update flow seems script-based, needs manual or automated proof.

## 9. Scripts and operations inventory

Important script groups:

- build/release: `ship.mjs`, `generate-build-report.cjs`, `bump-release-version.cjs`, `register-release.cjs`, `check-apk.ps1`, `verify-apk-bundle-fingerprint.cjs`;
- Firebase preflight/rules: `firebase-preflight.mjs`, `run-rules-emulator-tests.mjs`;
- migrations: `migrate-media-download-urls.mjs`, `migrate-places-names.mjs`, `backfill-*`;
- media/photo audit: `audit-community-photos.mjs`, `audit-my-photos.mjs`, `upload-test-photo.mjs`, `test-help-neighbors-photo-client.mjs`;
- test data/bots: `seed-bot-users.mjs`, `create-*`, `test-*`;
- encoding/mojibake: `check-encoding.js`, `check-broken-strings.mjs`, `fix-mojibake-runtime.ps1`, `postfix-mojibake.js`;
- Expo/native patches: `patch-expo-*`, `patch-android-native-crash-fixes.js`, `patch-cli-status-page.js`.

Audit implication: stage 2 must run safe local checks first. Migration/deploy scripts must not be run unless specifically intended.

## 10. Existing documents to reuse

Relevant prior documents at root:

- `BUG_REPORT.md`;
- `GLOBAL_POLISH_SPEC.md`;
- `SECURITY_REPORT_2026-06-06.md`;
- `PERFORMANCE-AUDIT.md`;
- `ADMIN_PANEL_PERFORMANCE_AUDIT.md`;
- `TZ-PERMISSION-DENIED-FULL-FIX.md`;
- `PHOTO_SYSTEM_MIGRATION_GUIDE.md`;
- `FIREBASE_PHOTO_RUNBOOK.md`;
- `BONUS_SYSTEM_AUDIT.md`;
- `AI_MODERATION_SPEC.md`;
- `AI_MODERATION_HANDOFF.md`;
- `AUDIT_TRANSLATIONS.md`;
- `audit-report-zones-12-20.md`;
- `FOOD-SEED-DATA-AUDIT.md`;
- `AUDIT_PORUCHITEL_REPORT.md`;
- `DEPLOY_ADMIN_PANEL.md`;
- `LEGAL_AGREEMENT_BETA_UA.md`.

Also relevant directories:

- `POLISH_REPORTS`;
- `diagnostics-reports`;
- `build-logs`;
- `docs`;
- `specs`;
- `Google Play - CONSOLE`;
- `release`;
- `dist-apk`.

## 11. Critical user journeys for the full audit

P0/P1 journeys:

- owner signs into admin panel from owner PC with `VITE_ADMIN_SERVICE_EMAIL`;
- ordinary user cannot access admin/moderator data;
- moderator can approve/reject only allowed content;
- admin can perform admin actions, with destructive actions confirmed;
- new user registration and profile completion;
- blocked/pending/restricted users see correct state;
- help request creation with and without photos;
- photo upload, approval, public/private visibility;
- request moderation and owner notification;
- contact/chat flow;
- OSBB voting/news flow;
- bonus/premium/business plus flow;
- APK update/version gate;
- offline/slow Firebase startup;
- permission-denied errors mapped to clear UI;
- crash/diagnostic logging captures P0/P1 failures.

## 12. Initial risk register

These are not confirmed bugs yet; they are priority audit targets.

| ID | Priority | Area | Risk |
| --- | --- | --- | --- |
| INV-RISK-001 | P0 | Admin auth | Owner access can be broken if `VITE_ADMIN_SERVICE_EMAIL` or primary service email logic changes. |
| INV-RISK-002 | P0 | Firebase roles | `user_roles`, custom claims and client guards must agree; otherwise privilege escalation or false denial is possible. |
| INV-RISK-003 | P0 | Secrets | Root contains service account style JSON files; stage 2 must verify whether secrets are exposed/tracked and define remediation carefully. |
| INV-RISK-004 | P0 | Media privacy | Media access functions plus Storage rules must prevent private photo leakage. |
| INV-RISK-005 | P1 | Mojibake/text | Console displayed mojibake for UI strings; stage 2/13 must distinguish console encoding from real file corruption. |
| INV-RISK-006 | P1 | Cloud Functions | Many callable admin functions need server-side auth/role validation, not only admin UI gating. |
| INV-RISK-007 | P1 | Data cleanup | Scheduled purge/cleanup jobs need safeguards against accidental data loss. |
| INV-RISK-008 | P1 | Timezones | Functions YAML uses both `Europe/Kiev` and `Europe/Kyiv`; check schedule behavior and consistency. |
| INV-RISK-009 | P1 | Tests | Admin UI, Cloud Functions, and Storage rules coverage is not obvious from inventory. |
| INV-RISK-010 | P2 | Script safety | Many scripts mutate Firebase data; audit must classify safe check scripts vs write/deploy/migration scripts. |

## 13. Stage 1 artifacts

Created:

- `AUDIT_PROJECT_FULL_POLISH_2026_07/PROJECT_AUDIT_PLAN.md`;
- `AUDIT_PROJECT_FULL_POLISH_2026_07/STAGE_1_INVENTORY.md`.

Recommended next files:

- `AUDIT_FINDINGS.md`;
- `SCREEN_CHECKLIST.md`;
- `ADMIN_PANEL_CHECKLIST.md`;
- `SERVER_FUNCTIONS_REVIEW.md`;
- `FIREBASE_RULES_REVIEW.md`.

## 14. Recommended next step: Stage 2

Run safe baseline checks:

```powershell
npm run type-check
npm test -- --runInBand
npm run rules:check
npm run rules:check:storage
npm run check:encoding
npm run build --prefix admin-panel
npm run type-check --prefix admin-panel
npm run check:admin-guard --prefix admin-panel
npm run lint --prefix functions
```

Do not run deploy/migration/write scripts during baseline unless explicitly requested.


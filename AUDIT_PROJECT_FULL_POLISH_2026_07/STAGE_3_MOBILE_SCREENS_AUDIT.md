# Этап 3 - Аудит мобильных экранов

Дата: 2026-07-01  
Статус: выполнен первичный статический проход по маршрутам и создана матрица проверки экранов.

## 1. Созданный артефакт

Основной чек-лист:

- `AUDIT_PROJECT_FULL_POLISH_2026_07/SCREEN_CHECKLIST.md`

В чек-лист внесены:

- P0/P1 smoke journeys;
- summary по navigation-level guards;
- deep link маршруты;
- screen matrix по группам;
- высокорисковые экраны без `withGuard` на уровне навигации.

## 2. Источники проверки

Использованы:

- `src/navigation/RootNavigator.tsx`;
- route/file map в `RootNavigator.tsx`;
- `src/screens`;
- `src/photo-module`;
- точечный поиск auth/currentUser/guest checks в экранах с приватными данными.

## 3. Что подтверждено статически

В навигации есть централизованный guard helper:

- `auth`;
- `complete`;
- `moderator`;
- `admin`.

Navigation-level guards применяются к ключевым зонам:

- request creation после complete profile;
- user-owned request/history/edit profile;
- moderator screens;
- admin mobile diagnostics/security screens;
- bonus/promo/business editor auth flows.

Это хороший фундамент, но сам guard в навигации не заменяет Firebase rules и Cloud Functions authorization.

## 4. Первичные high-priority зоны для ручной проверки

Экраны без `withGuard`, где нужно проверить внутреннюю защиту и direct route/deep link:

| Route | File | Почему важно |
| --- | --- | --- |
| `ProfileRequestsScreen` | `ProfileRequestsScreen.tsx` | Есть internal auth gate; нужно убедиться, что приватные reads не стартуют до auth/session |
| `ContactCardChatScreen` | `ContactCardChatScreen.tsx` | Чат по контактной карточке, route требует params и текущего пользователя |
| `MyPhotosScreen` | `photo-module/MyPhotosScreen.tsx` | Личные фото пользователя |
| `MyApprovedPhotosScreen` | `MyApprovedPhotosScreen.tsx` | Фото пользователя/approved media |
| `PhotoUploadScreen` | `Zagruzka-Foto.tsx` | Есть deep link `screen/photo-upload`, upload должен быть защищен |
| `FavoritesScreen` | `FavoritesScreen.tsx` | Может содержать приватные пользовательские избранные |
| `InboxScreen` | `InboxScreen.tsx` | Уведомления/личные события |
| `CrashDiagnosticsScreen` | `CrashDiagnosticsScreen.tsx` | Public route по linking config; проверить отсутствие чувствительных логов |
| `OsbbFinansyScreen` | `OSBB-Finansy.tsx` | Финансовые данные ОСББ, проверить роли/членство |
| `OsbbAdminScreen` | `OSBB-AdminPanel.tsx` | Сейчас route guard `auth`, нужно проверить внутренние admin/member checks |

Статус: не доказанные баги, а priority audit targets.

## 5. Deep link risk

`RootNavigator.tsx` содержит linking config для многих экранов. Guarded linking отдельно обрабатывает только часть маршрутов:

- `OsbbAdminScreen` как auth-only;
- `RequestFormScreen`, `HelpHistoryScreen`, `MyRequestsScreen`, `EditProfileScreen` как complete/auth routes.

Необходимо проверить direct opening для:

- `screen/photo-upload`;
- `screen/my-photos`;
- `screen/inbox`;
- `screen/contact-card-chat`;
- `screen/crash-diagnostics`;
- `screen/osbb/finance`;
- `screen/admin/promo-credits`.

Важно: даже если stack screen wrapped in `withGuard`, deep link handling и params должны корректно приводить пользователя к login/guard fallback.

## 6. Уже известный issue из этапа 2, влияющий на mobile screens

`npm run check:encoding` падает на:

- `src/screens/Moderaciya-Foto.tsx:138`;
- `src/screens/ServiceModerationScreen.tsx:116`.

Это затрагивает moderator screens, поэтому при ручном проходе этих экранов нужно проверить отображение legacy title `Фото`.

## 7. Рекомендуемый порядок ручного прохода

Сначала пройти P0/P1:

1. First launch -> language/onboarding -> home.
2. Guest -> protected action -> login redirect.
3. Registration/login -> profile setup -> main tabs.
4. Request form with valid/invalid data.
5. Request with photo upload.
6. Photo upload direct deep link as guest.
7. My photos/direct route as guest and as user.
8. Inbox/direct route as guest and as user.
9. Profile requests/contact card chat as guest and as user.
10. Moderator screens as ordinary user/moderator.
11. Admin screens as ordinary user/admin.
12. OSBB finance/admin as ordinary user/member/admin.
13. Crash diagnostics as guest: verify no sensitive information.
14. Offline/slow startup and permission-denied UI.

## 8. Next action options

Option A - continue static audit:

- inspect high-priority screens one by one;
- record confirmed guard/data-read bugs;
- no emulator required.

Option B - run app/manual smoke:

- start Expo dev server;
- use Android/emulator/device;
- run Maestro flows where possible;
- record screenshots/failures.

Option C - fix known baseline issue first:

- repair two mojibake literals in moderator screens;
- rerun `npm run check:encoding`.

Recommended next step: Option C first, because it is a confirmed non-auth bug and will make baseline green before deeper manual testing.


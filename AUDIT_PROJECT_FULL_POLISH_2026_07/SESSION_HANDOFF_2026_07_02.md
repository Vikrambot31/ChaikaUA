# Handoff отчёт аудита ChaikaUA

Дата: 2026-07-02  
Папка аудита: `AUDIT_PROJECT_FULL_POLISH_2026_07`

## Что уже сделано

### Этап 1 - Инвентаризация

Создан файл:

- `STAGE_1_INVENTORY.md`

Проверено:

- структура мобильного приложения;
- `src/screens`, `src/services`, `src/components`, `src/hooks`, `src/redux`;
- навигация `src/navigation/RootNavigator.tsx`;
- админ-панель `admin-panel/src`;
- Cloud Functions `functions`;
- Firebase rules и Storage rules;
- scripts, tests, Maestro flows;
- старые отчёты и документы.

Зафиксировано:

- около 104 screen-файлов;
- 23 страницы админ-панели;
- 68 mobile service-файлов;
- 41 admin service-файл;
- 26 Maestro flows;
- 22 тестовых файла;
- список первых рисков в `AUDIT_FINDINGS.md`.

### Этап 2 - Baseline проверки

Создан файл:

- `STAGE_2_BASELINE_CHECKS.md`

Запущены команды:

```powershell
npm run rules:check
npm run rules:check:storage
npm run check:admin-guard --prefix admin-panel
npm run lint --prefix functions
npm run type-check
npm run type-check --prefix admin-panel
npm run build --prefix admin-panel
npm test -- --runInBand
```

Результаты:

- Firebase rules JSON: PASS.
- Storage rules smoke-check: PASS.
- Admin guard: PASS.
- Functions syntax lint: PASS.
- Mobile TypeScript: PASS.
- Admin TypeScript: PASS.
- Admin build: PASS with warnings.
- Jest: PASS, 20 suites passed, 1 skipped; 153 tests passed, 14 skipped.

Найдено:

- `npm run check:encoding` сначала падал на двух строках:
  - `src/screens/Moderaciya-Foto.tsx`;
  - `src/screens/ServiceModerationScreen.tsx`.

Исправлено:

- legacy fallback `Р¤РѕС‚Рѕ` заменён на ASCII-safe `\u0424\u043e\u0442\u043e`;
- после исправления:
  - `npm run check:encoding` PASS;
  - `npm run type-check` PASS;
  - `npm test -- --runInBand` PASS.

Важно:

- `firebase:preflight` не запускался, потому что он пишет в RTDB и Storage.
- Охраняемые auth/rules файлы не менялись.

### Этап 3 - Mobile screens audit

Созданы файлы:

- `SCREEN_CHECKLIST.md`;
- `STAGE_3_MOBILE_SCREENS_AUDIT.md`.

Проверено:

- route -> file map из `RootNavigator.tsx`;
- navigation guards: `auth`, `complete`, `moderator`, `admin`;
- deep links;
- основные группы экранов;
- high-risk экраны без navigation-level `withGuard`.

Первичный статический review high-risk экранов:

- `PhotoUploadScreen` - submit проверяет `user?.id`, без user запись не выполняется.
- `MyPhotosScreen` - RTDB listener не стартует без `uid`.
- `MyApprovedPhotosScreen` - listener не стартует без `user?.id`.
- `InboxScreen` - hook очищает state и не подписывается без `userId`.
- `ContactCardChatScreen` - найден риск: direct route без params/auth может crash или подписаться с пустым uid.
- `CrashDiagnosticsScreen` - найден риск: public route показывает локальные crash/console diagnostics.
- `OSBB-Finansy` - требуется проверка rules/business policy: кто имеет право видеть финансы и платежи.
- `OSBB-AdminPanel` - route `auth`, не `admin`; часть панели видна любому authenticated user, роль admin ограничивает только assign/revoke moderator.

## Подтверждённые проблемы сейчас

### P1 - ContactCardChatScreen direct route risk

Файл:

- `src/screens/ContactCardChatScreen.tsx`

Причина:

- экран делает `const { request } = route.params`;
- route есть в deep links как `screen/contact-card-chat`;
- нет `withGuard`;
- без params возможен crash;
- подписка использует `currentUser?.id || ''`.

Рекомендация:

- добавить `withGuard(ContactCardChatScreen, 'auth')`;
- добавить local param validation fallback;
- проверить, что current user является `requesterId` или `targetUserId`.

### P1 - CrashDiagnosticsScreen public diagnostics

Файл:

- `src/screens/CrashDiagnosticsScreen.tsx`

Причина:

- route есть как `screen/crash-diagnostics`;
- нет `withGuard`;
- экран читает crash/console logs и позволяет копировать данные.

Рекомендация:

- минимум `withGuard(CrashDiagnosticsScreen, 'auth')`;
- лучше `admin`/`moderator` или сильно sanitized view.

### P1 - OSBB Finance/Admin visibility needs rules verification

Файлы:

- `src/screens/OSBB-Finansy.tsx`;
- `src/screens/OSBB-AdminPanel.tsx`;
- `src/services/osbbCollections.ts`;
- `src/hooks/useOsbbMembership.ts`.

Вопросы:

- кто должен видеть финансы ОСББ;
- кто должен видеть payment entries;
- кто должен видеть OSBB admin panel;
- enforced ли это в Firebase rules.

## Файлы, которые были изменены кодом

Только:

- `src/screens/Moderaciya-Foto.tsx`;
- `src/screens/ServiceModerationScreen.tsx`;
- файлы отчётов в `AUDIT_PROJECT_FULL_POLISH_2026_07`.

Охраняемые файлы не менялись:

- `admin-panel/src/services/authService.ts` - не трогался;
- `admin-panel/src/firebase/firebase.ts` - не трогался;
- `firebase.rules.json` - не трогался;
- `user_roles`, `security_config`, `authorized_devices` logic - не менялась.

## Важное техническое замечание

Во время исправления encoding была неудачная попытка через PowerShell `Set-Content`, которая временно испортила кодировку двух файлов. Это было полностью восстановлено из `HEAD`, после чего сделана безопасная byte-level замена только нужных двух фрагментов.

Итоговая проверка:

- `git diff` по двум source-файлам показывает только две нужные строки.
- `check:encoding` зелёный.
- `type-check` зелёный.
- Jest зелёный.

## Что делать в новой сессии

Начать с этого:

1. Открыть `AUDIT_PROJECT_FULL_POLISH_2026_07/SESSION_HANDOFF_2026_07_02.md`.
2. Проверить `git diff`.
3. Продолжить с исправления `ContactCardChatScreen`.
4. Затем ограничить или санитизировать `CrashDiagnosticsScreen`.
5. После этого перейти к rules audit для OSBB finance/admin visibility.
6. Потом продолжить план с этапа админ-панели.

## Готовый текст для новой сессии

```text
Продолжай аудит ChaikaUA из папки AUDIT_PROJECT_FULL_POLISH_2026_07.
Сначала прочитай SESSION_HANDOFF_2026_07_02.md, PROJECT_AUDIT_PLAN.md, STAGE_1_INVENTORY.md, STAGE_2_BASELINE_CHECKS.md, SCREEN_CHECKLIST.md и STAGE_3_MOBILE_SCREENS_AUDIT.md.
Не трогай охраняемые auth/rules файлы без моего явного подтверждения.
Продолжи с P1: исправь ContactCardChatScreen direct route/auth/params risk, затем CrashDiagnosticsScreen public diagnostics risk. После каждого исправления запускай npm run type-check, npm run check:encoding и npm test -- --runInBand.
```


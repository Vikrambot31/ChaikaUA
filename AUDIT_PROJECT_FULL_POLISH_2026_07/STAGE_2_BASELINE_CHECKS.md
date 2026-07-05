# Этап 2 - Базовые технические проверки

Дата: 2026-07-01  
Статус: выполнен безопасный baseline без deploy/migration/write scripts.

## 1. Итог

Большая часть базовых проверок зеленая:

- TypeScript мобильного приложения проходит.
- Jest проходит.
- Firebase rules JSON валиден.
- Storage rules smoke-check проходит.
- Admin access guard проходит.
- Admin panel TypeScript проходит.
- Admin panel production build проходит.
- Cloud Functions syntax lint проходит.

Найдены проблемы/риски:

- `npm run check:encoding` падает на двух подтвержденных mojibake-фрагментах.
- Admin build показывает предупреждения по большому chunk и неэффективному dynamic import Firebase/database.
- `firebase:preflight` не запускался, потому что скрипт пишет в RTDB и Storage; это не безопасная read-only проверка.

## 2. Команды и результаты

| Команда | Результат | Примечание |
| --- | --- | --- |
| `npm run rules:check` | PASS | `firebase.rules.json ok` |
| `npm run rules:check:storage` | PASS | `storage.rules ok` |
| `npm run check:encoding` | FAIL | 2 suspicious fragments |
| `npm run check:admin-guard --prefix admin-panel` | PASS | `Admin access guard check passed.` |
| `npm run lint --prefix functions` | PASS | `node --check index.js` и seed script без syntax errors |
| `npm run type-check` | PASS | `tsc --noEmit` |
| `npm run type-check --prefix admin-panel` | PASS | `tsc -b` |
| `npm run build --prefix admin-panel` | PASS with warnings | Vite build successful, chunk warnings |
| `npm test -- --runInBand` | PASS | 20 suites passed, 1 skipped; 153 tests passed, 14 skipped |

## 3. Encoding failure

Команда:

```powershell
npm run check:encoding
```

Результат:

```text
Encoding check failed. Suspicious text fragments found:
src\screens\Moderaciya-Foto.tsx:138: const isLegacyPersonalDefault = title === 'Photo' || title === 'Р¤РѕС‚Рѕ';
src\screens\ServiceModerationScreen.tsx:116: const isLegacyPersonalDefault = title === 'Photo' || title === 'Р¤РѕС‚Рѕ';
```

Вывод:

- это подтвержденный P1/P2 дефект кодировки в source-файлах;
- он не относится к охраняемым auth/rules файлам;
- вероятное ожидаемое значение: строка `Фото`;
- перед исправлением нужно проверить контекст, чтобы не сломать legacy fallback.

## 4. Admin build warnings

Команда:

```powershell
npm run build --prefix admin-panel
```

Результат:

- build successful;
- CSS bundle: около 72.70 kB;
- `AppRulesPage` chunk: около 422.02 kB;
- main JS chunk: около 1,015.36 kB, gzip около 279.15 kB.

Warnings:

- `firebase/database` динамически импортируется, но также статически импортируется многими файлами, поэтому Rollup не выносит его в отдельный chunk;
- `admin-panel/src/firebase/firebase.ts` аналогично импортируется и динамически, и статически;
- Vite предупреждает, что некоторые chunks больше 500 kB после minification.

Вывод:

- не блокирует релиз;
- относится к performance/maintainability;
- стоит проверить на этапе админ-панели и performance-аудита.

## 5. Jest baseline

Команда:

```powershell
npm test -- --runInBand
```

Результат:

```text
Test Suites: 1 skipped, 20 passed, 20 of 21 total
Tests:       14 skipped, 153 passed, 167 total
Snapshots:   0 total
```

Прошли зоны:

- subscription slice;
- OSBB voting/news/collections;
- auth slice;
- service moderation;
- error logger;
- validation messages;
- Firebase rules security tests;
- monthly rating;
- moderator service;
- access control;
- constants;
- security config validator;
- validators;
- notification preferences;
- app version;
- chat requests;
- categories.

Вопрос для дальнейшего аудита:

- какая именно suite skipped и почему;
- покрывают ли skipped tests критичные сценарии.

## 6. Firebase preflight skipped

Команда из `package.json`:

```powershell
npm run firebase:preflight
```

Статус: не запускалась.

Причина:

- `scripts/firebase-preflight.mjs` пишет в RTDB path `_health/firebase_preflight`;
- загружает файл в Storage path `_health/firebase_preflight/preflight.txt`;
- потом пытается удалить эти записи.

Вывод:

- это полезная интеграционная проверка, но не read-only baseline;
- запускать только с явным пониманием окружения и разрешением на запись в Firebase/Storage.

## 7. Secret exposure spot-check

Проверка без чтения содержимого секретных файлов:

```powershell
git ls-files *.json **/*.json | Select-String -Pattern "serviceAccount|firebase-adminsdk|google-services|chaikaua-.*firebase|adminsdk"
```

Результат:

- tracked match: `google-services.json`.

Наблюдения:

- `.gitignore` содержит правила для `*firebase-adminsdk*.json`, `chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json`, `serviceAccountKey.json`;
- service account style файлы есть локально в корне, но по этой проверке не tracked;
- содержимое ключей не читалось и не выводилось.

Вывод:

- immediate tracked secret leak по admin SDK JSON не подтвержден;
- локальное наличие service account файлов остается operational risk;
- на security этапе нужно проверить ротацию/хранение/доступ, не раскрывая содержимое.

## 8. Git working tree note

После запуска admin build `git status --short` показывает существующие изменения вне папки аудита:

- `.firebase/hosting.YWRtaW4tcGFuZWxcZGlzdA.cache` modified;
- несколько файлов в `Google Play - CONSOLE`/`POLISH_REPORTS` уже modified/untracked;
- новая папка `AUDIT_PROJECT_FULL_POLISH_2026_07`.

Важно:

- я не откатывал чужие изменения;
- admin build мог обновить `.firebase` hosting cache;
- исходные auth/rules файлы не изменялись.

## 9. Stage 2 verdict

Baseline состояние проекта: технически собирается и тесты проходят, но есть подтвержденная проблема кодировки и performance warnings админки.

P0 блокеров baseline не найдено.

P1/P2 к дальнейшей работе:

- исправить/проверить mojibake в `Moderaciya-Foto.tsx` и `ServiceModerationScreen.tsx`;
- выяснить skipped Jest suite;
- классифицировать admin build chunk warnings;
- запуск `firebase:preflight` вынести в отдельный интеграционный шаг с разрешением на запись;
- продолжить security review service account handling без раскрытия секретов.

## 10. Следующий рекомендуемый этап

Этап 3: полная проверка мобильных экранов.

Перед ручным проходом экранов стоит создать:

- `SCREEN_CHECKLIST.md`;
- список route -> file -> access guard -> service dependencies;
- отдельные smoke-сценарии P0/P1: auth, profile setup, request with photo, moderation, owner/admin routes, permission denied.


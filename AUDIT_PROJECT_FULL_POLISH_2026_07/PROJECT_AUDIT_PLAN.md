# Проект полного аудита и полировки ChaikaUA

Дата старта: 2026-07-01  
Цель: найти и закрыть слабые зоны, баги, UX-разрывы, проблемы правил, админ-панели, Firebase/server-side логики, сборки и релиза так, чтобы приложение работало стабильно, безопасно и предсказуемо.

## 0. Главные правила аудита

- Не менять охраняемые auth/security файлы без отдельного явного подтверждения владельца:
  - `admin-panel/src/services/authService.ts`
  - `admin-panel/src/firebase/firebase.ts`
  - `firebase.rules.json`
  - логику `user_roles`, `security_config`, `authorized_devices`
- Не ломать путь владельца в админку через `VITE_ADMIN_SERVICE_EMAIL`.
- Любая правка, влияющая на вход владельца, роли `admin`/`moderator`, Firebase rules или устройства, сначала проходит отдельное согласование.
- Все найденные проблемы фиксируются в журнале аудита с приоритетом, шагами воспроизведения, ожидаемым поведением и предложением исправления.

## 1. Структура проекта аудита

Папка: `AUDIT_PROJECT_FULL_POLISH_2026_07`

Рекомендуемые рабочие файлы внутри папки:

- `PROJECT_AUDIT_PLAN.md` - этот главный план.
- `AUDIT_FINDINGS.md` - список найденных проблем.
- `SCREEN_CHECKLIST.md` - матрица всех экранов мобильного приложения.
- `ADMIN_PANEL_CHECKLIST.md` - матрица админ-панели.
- `FIREBASE_RULES_REVIEW.md` - результаты проверки правил без несанкционированных изменений.
- `SERVER_FUNCTIONS_REVIEW.md` - аудит Cloud Functions, local-server, scripts.
- `RELEASE_READINESS.md` - чек-лист перед APK/production релизом.
- `REGRESSION_TEST_RUNS.md` - история прогонов тестов.

## 2. Шкала приоритетов

- P0: блокирует вход, безопасность, потеря данных, падение приложения, нарушение доступа владельца.
- P1: ломает ключевой сценарий пользователя или администратора.
- P2: заметный UX-баг, некорректная валидация, нестабильность, плохая диагностика.
- P3: косметика, текст, мелкое улучшение, технический долг без немедленного риска.

## 3. Этап 1 - Инвентаризация проекта

Цель: понять полную карту приложения перед исправлениями.

Проверить:

- `src` - мобильные экраны, сервисы, utils, Redux/state, навигация.
- `admin-panel/src` - панели, модалки, таблицы, диагностика, авторизация, сборка.
- `functions` - Cloud Functions, invite/bonus/promotion функции.
- `local-server` - локальные серверные сценарии, если используются.
- `firebase.rules.json` и `storage.rules` - только аудит, изменения отдельно согласовывать.
- `scripts` - миграции, preflight, deploy, moderation, release.
- `__tests__` и `src/__tests__` - покрытие и пробелы.
- `android`, `app.config.js`, `eas.json`, `google-services.json` - конфигурация сборки.
- существующие отчеты: `BUG_REPORT.md`, `GLOBAL_POLISH_SPEC.md`, `POLISH_REPORTS`, `diagnostics-reports`.

Артефакт:

- список модулей и экранов;
- список критичных сценариев;
- карта зависимостей: мобильное приложение -> Firebase -> Functions -> админка.

## 4. Этап 2 - Базовая техническая проверка

Команды-кандидаты:

```powershell
npm run type-check
npm test -- --runInBand
npm run rules:check
npm run rules:check:storage
npm run firebase:preflight
npm run check:encoding
npm run build --prefix admin-panel
npm run type-check --prefix admin-panel
npm run check:admin-guard --prefix admin-panel
npm run lint --prefix functions
```

Проверить:

- TypeScript ошибки.
- Jest падения.
- Firebase rules JSON валидность.
- Storage rules базовую валидность.
- Сборку админки.
- Кодировку русских/украинских текстов.
- Наличие секретов в репозитории и случайных service account файлов.
- Версии Node/Expo/React Native/Firebase.
- Ошибки postinstall patches.

Критерий готовности:

- все базовые проверки либо зеленые, либо имеют заведенные finding-и с приоритетом.

## 5. Этап 3 - Полная проверка мобильных экранов

Создать `SCREEN_CHECKLIST.md` и пройти каждый экран.

Для каждого экрана фиксировать:

- путь файла;
- название экрана в навигации;
- кто может открыть экран: гость, авторизованный, модератор, админ;
- пустое состояние;
- загрузка;
- ошибка сети;
- offline/slow network;
- валидация форм;
- права доступа;
- фото/медиа;
- push/deep link, если применимо;
- Android back behavior;
- маленький экран;
- крупный шрифт;
- темная/светлая тема, если есть;
- украинский/русский текст;
- безопасность данных.

Группы экранов:

- Auth/onboarding/session.
- Главная/навигация/профиль.
- Соседские заявки и помощь.
- Новости, объявления, ОСМД/голосования.
- Чаты, контакты, карточки контактов.
- Фото, галерея, загрузка, модерация медиа.
- Еда, красота, спорт, детские, места, услуги.
- Рейтинги, бонусы, подписки, Business Plus.
- Поиск, избранное, жалобы, блокировки.
- Настройки, уведомления, диагностика.
- Обновление APK/version flow.

Критичные сценарии:

- новый пользователь регистрируется и попадает в правильный state;
- пользователь без прав не видит закрытые данные;
- пользователь с правами видит разрешенные функции;
- пользователь отправляет заявку с фото;
- модерация отклоняет/одобряет контент;
- пользователь получает понятную ошибку при permission-denied;
- приложение не зависает при медленном Firebase;
- навигация назад не уводит в битое состояние.

## 6. Этап 4 - UX/UI полировка мобильного приложения

Проверить:

- единообразие кнопок, отступов, цветов, типографики.
- отсутствие наложения текста.
- длинные имена, телефоны, адреса, email, статусы.
- пустые состояния без тупиков.
- ошибки на понятном языке.
- все формы имеют clear success/error feedback.
- опасные действия имеют подтверждение.
- повторная отправка формы защищена от double tap.
- индикаторы загрузки не вечные.
- скелетоны/спиннеры не ломают layout.
- фотографии имеют fallback и не растягиваются некрасиво.
- все списки имеют pull-to-refresh или понятный способ обновления.

Минимальные устройства:

- Android small: 360x640.
- Android medium: 390x844.
- Android large: 412x915.
- Tablet-ish: если поддерживается.

## 7. Этап 5 - Админ-панель

Важно: проверка auth/access выполняется с учетом guardrails. Исправления в охраняемых файлах только после отдельного согласования.

Проверить:

- вход владельца через `VITE_ADMIN_SERVICE_EMAIL`;
- распознавание primary service email;
- роли `admin` и `moderator`;
- logout/session expiration;
- защита роутов;
- видимость опасных действий;
- таблицы пользователей/заявок/ролей;
- модалки редактирования и отклонения;
- live diagnostics;
- local server control;
- notification feed;
- error boundaries;
- mobile/tablet админки, если требуется;
- сборка Vite;
- отсутствие прямых секретов в клиентском bundle.

Особое внимание:

- нельзя случайно закрыть владельцу доступ;
- нельзя дать обычному пользователю admin UI;
- нельзя скрыть ошибку permission-denied без объяснения;
- нельзя делать destructive action без подтверждения.

## 8. Этап 6 - Firebase Realtime Database rules

Без правок на первом проходе. Только аудит и тесты.

Проверить:

- root read/write.
- `user_roles`.
- `security_config`.
- `authorized_devices`.
- профили пользователей.
- заявки, комментарии, чаты, контакты.
- фото/медиа/public/private поля.
- жалобы, блокировки, модерация.
- бонусы/подписки/платные признаки.
- ОСМД/голосования/новости.
- admin-only ветки.
- moderator-only ветки.
- user-owned ветки.
- валидация типов и обязательных полей.
- защита от mass assignment.
- защита от записи чужого `uid`, роли, статуса, server timestamps.

Тесты:

```powershell
npm run test:rules:emulator
npx jest firebaseRulesSecurity --runInBand
```

Добавить недостающие тест-кейсы:

- anonymous denied.
- user can read only allowed public data.
- user cannot escalate role.
- moderator cannot become admin.
- admin allowed only where expected.
- owner service email path remains valid.
- invalid payload rejected.
- delete rules tested separately.

## 9. Этап 7 - Storage rules и медиа

Проверить:

- public/private пути.
- аватары.
- фото заявок.
- галерея.
- moderation pending/approved/rejected.
- размер файла.
- MIME type.
- право удаления.
- download URL migration.
- orphan files.
- компрессия и EXIF.
- повторная загрузка при ошибке сети.

Риски:

- пользователь читает чужие приватные фото;
- пользователь подменяет approved path;
- админка видит не все pending uploads;
- файл загружен, но запись в DB не создана;
- запись создана, но файл не загружен.

## 10. Этап 8 - Cloud Functions и server-side логика

Проверить:

- `functions/index.js`, `bonusFunctions.js`, `inviteAccess.js`, `promotionFunctions.js`.
- runtime Node 22.
- idempotency.
- retries.
- логирование.
- ошибки Firebase Admin.
- CORS/HTTP callable безопасность.
- rate limits.
- валидация входных данных.
- права вызывающего пользователя.
- timezone/date bugs.
- функции бонусов и промо.
- seed scripts.

Команды:

```powershell
npm run lint --prefix functions
npm run serve --prefix functions
npm run logs --prefix functions
```

Сценарии:

- function получает мусорный payload;
- function вызывается без auth;
- function вызывается пользователем без роли;
- повторный вызов не создает дубликаты;
- частичный сбой не оставляет битые данные.

## 11. Этап 9 - Данные, миграции, совместимость

Проверить:

- `scripts/migrate-*`.
- `verify:*`.
- seed data.
- старые поля после обновлений.
- null/undefined в старых профилях.
- обратная совместимость для пользователей со старым APK.
- версии `app-version.json`.
- forced update flow.

Сценарии:

- новая версия читает старые данные;
- старая версия не ломает новые данные;
- миграция повторно безопасна;
- миграция логирует статистику;
- после миграции rules не начинают массово отказывать.

## 12. Этап 10 - Безопасность приложения

Проверить:

- секреты в `.env`, JSON service accounts, logs.
- Firebase API keys usage.
- SecureStore/AsyncStorage.
- device auth.
- session lifecycle.
- crash logs без персональных данных.
- блокировки/жалобы.
- rate limiter.
- password breach check.
- moderation bypass.
- client-side only checks, которые должны быть server/rules enforced.
- direct database writes from modified client.

Отдельный security checklist:

- нельзя повысить себе роль с клиента;
- нельзя читать приватные ветки;
- нельзя писать в чужие пользовательские данные;
- нельзя обойти модерацию медиа;
- нельзя отправить HTML/script payload в админку;
- нельзя спамить заявки без ограничений;
- нельзя получить admin diagnostics обычному пользователю.

## 13. Этап 11 - Производительность

Мобильное приложение:

- cold start.
- startup sync.
- heavy screens.
- списки без пагинации.
- изображения.
- memory leaks.
- бесконечные listeners.
- лишние Firebase subscriptions.
- freeze watchdog signals.
- navigation jank.

Админка:

- большие таблицы.
- фильтры.
- live diagnostics.
- повторные запросы.
- bundle size.
- error boundary coverage.

Firebase:

- индексы.
- глубокие queries.
- fan-out writes.
- дорогие reads.
- rules complexity.

## 14. Этап 12 - Ошибки, диагностика, наблюдаемость

Проверить:

- Crashlytics init.
- errorLogger.
- runtimeMonitorService.
- crashDiagnosticsService.
- liveDiagnosticsService.
- user-facing errors.
- системные ошибки в админке.
- build/version metadata.
- logs без секретов.

Критерий:

- каждая P0/P1 ошибка должна оставлять диагностический след;
- пользователь получает понятное сообщение;
- админ видит достаточно данных для решения, но без лишних персональных данных.

## 15. Этап 13 - Локализация, тексты, кодировка

Проверить:

- битую кодировку в package description и документах.
- единый язык UI.
- украинский/русский fallback.
- длинные строки.
- системные сообщения.
- ошибки permission-denied.
- тексты модерации.
- юридические тексты и согласия.

Команда:

```powershell
npm run check:encoding
```

## 16. Этап 14 - Тестовое покрытие

Существующие зоны:

- `src/__tests__`.
- `__tests__`.
- Firebase rules tests.
- admin guard script.

Добавить/усилить:

- auth/session tests.
- permission-denied mapping.
- all validators.
- screen smoke tests where feasible.
- service tests for high-risk modules.
- Cloud Functions input validation tests.
- admin panel role visibility tests.
- storage/media workflow tests.
- regression tests for every P0/P1 fix.

Правило:

- P0/P1 баг не закрывается без теста или явного объяснения, почему тест невозможен.

## 17. Этап 15 - Релизный аудит APK/production

Проверить:

- `app.config.js`.
- `app.json`.
- `eas.json`.
- versionCode/versionName.
- package id.
- icons/splash.
- permissions.
- Google services config.
- release keystore.
- build profiles.
- OTA/update policy, если используется.
- Play Console files.
- testers.csv.
- APK install/update flow.

Команды-кандидаты:

```powershell
npm run build:apk
npm run build:production
npm run deploy:prod:checked
```

Перед production:

- все P0/P1 закрыты;
- P2 имеют решение или принятое исключение;
- база/rules/functions/admin/mobile проверены одной связанной регрессией;
- владелец входит в админку с собственного ПК.

## 18. Этап 16 - Полная end-to-end регрессия

Пройти сценарии:

1. Первый запуск приложения.
2. Регистрация/вход.
3. Заполнение профиля.
4. Просмотр главных разделов.
5. Создание заявки.
6. Загрузка фото.
7. Модерация заявки в админке.
8. Комментарий/чат/контакт.
9. Жалоба/блокировка.
10. Бонус/рейтинг/подписка.
11. Push/уведомление, если доступно.
12. Ошибка сети.
13. Permission denied.
14. Logout/login.
15. Обновление приложения.
16. Админская диагностика.

## 19. Этап 17 - Журнал исправлений

Для каждого finding:

```text
ID:
Дата:
Приоритет:
Зона:
Файл/экран:
Шаги воспроизведения:
Фактический результат:
Ожидаемый результат:
Риск:
Предложение исправления:
Нужна ли правка охраняемых auth/rules файлов:
Статус:
Тест/проверка:
```

Статусы:

- New.
- Confirmed.
- Fixing.
- Fixed.
- Verified.
- Deferred.
- Won't fix.

## 20. Этап 18 - Definition of Done для полировки до идеала

Приложение считается отполированным, когда:

- нет P0/P1.
- все основные экраны пройдены по чек-листу.
- все формы имеют валидацию и понятные ошибки.
- админка собирается и не теряет owner access.
- Firebase/Storage rules покрыты критичными тестами.
- Cloud Functions проходят lint/ручные сценарии.
- APK устанавливается и обновляется.
- ошибки логируются, но секреты не протекают.
- тексты не ломают layout.
- slow/offline сценарии не приводят к зависанию.
- релизный чек-лист закрыт.

## 21. Первый рабочий спринт аудита

Рекомендуемый порядок на ближайший проход:

1. Создать рабочие файлы `AUDIT_FINDINGS.md`, `SCREEN_CHECKLIST.md`, `ADMIN_PANEL_CHECKLIST.md`.
2. Запустить базовые команды из этапа 2.
3. Составить полный список экранов из `src`.
4. Составить список страниц/модалок админки из `admin-panel/src`.
5. Пройти P0/P1 сценарии: auth, owner admin access, rules denied/allowed, фото, заявки, moderation.
6. Зафиксировать все падения и permission-denied.
7. Исправлять только неохраняемые зоны сразу; охраняемые security/auth/rules изменения выносить на отдельное подтверждение.
8. После исправлений повторить type-check, tests, admin build, rules checks.

## 22. Быстрые красные флаги для проверки в первую очередь

- Владелец не может войти в админку.
- Обычный пользователь может увидеть admin/moderator данные.
- Роли можно записать с клиента.
- Фото видны не тем пользователям.
- Permission denied скрывается как "что-то пошло не так".
- Повторная отправка создает дубликаты.
- Старые данные ломают новые экраны.
- Списки без лимитов грузят слишком много.
- Cloud Function доверяет данным клиента.
- Админка делает опасное действие без подтверждения.
- APK собран с неправильной версией или конфигом.

## 23. Итоговые артефакты аудита

После завершения полного цикла должны быть:

- полный список экранов и их статус;
- полный список admin views и их статус;
- список всех bugs/findings;
- список закрытых P0/P1;
- список отложенных P2/P3;
- отчет Firebase rules;
- отчет Storage rules;
- отчет Functions/server;
- отчет производительности;
- отчет безопасности;
- release readiness verdict.


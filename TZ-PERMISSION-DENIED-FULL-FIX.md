# ТЗ: полное устранение пользовательских `PERMISSION_DENIED` для зарегистрированных пользователей

## 1. Цель

Полностью убрать ситуацию, когда зарегистрированный пользователь в штатном сценарии приложения видит или получает необъяснимый `PERMISSION_DENIED`, `permission-denied`, `permission_denied` или `Permission denied`.

Под "штатным сценарием" понимаются все действия, доступные пользователю через мобильное приложение:

- создание заявок;
- отправка фото;
- публикация объявлений;
- публикация "Кто потерял";
- публикация "Куплю/Продам";
- публикация контактов/услуг/работы/бизнеса;
- создание обращений в поддержку;
- чтение своих данных;
- редактирование своего профиля;
- закрытие/удаление собственных записей, если UI это позволяет;
- работа с уведомлениями, избранным, лайками, заявками на просмотр профиля;
- все клиентские операции, которые интерфейс показывает как доступные зарегистрированному пользователю.

Итоговый результат: если пользователь зарегистрирован и действие доступно в UI, операция либо успешно проходит, либо заранее блокируется понятной прикладной причиной до Firebase-запроса. Голый Firebase `PERMISSION_DENIED` в пользовательском пути недопустим.

## 2. Важное ограничение безопасности

Нельзя буквально "удалить все deny" из правил Firebase. Это сломает безопасность, админку, модерацию, приватность профилей и защиту от записи чужих данных.

Правильная цель:

- запретить `PERMISSION_DENIED` для разрешенных действий зарегистрированных пользователей;
- сохранить запреты для чужих приватных данных, админских операций, модерации, системных веток и заблокированных сценариев;
- заменить неожиданный серверный отказ на предварительную проверку и понятную ошибку клиента;
- покрыть все разрешенные сценарии тестами Firebase Emulator.

## 3. Guardrails

Перед фактическим редактированием `firebase.rules.json`, `security_config`, `user_roles`, `authorized_devices`, `admin-panel/src/firebase/firebase.ts` или `admin-panel/src/services/authService.ts` нужно отдельное явное подтверждение владельца.

Обязательные условия:

- не ломать вход владельца в админ-панель;
- сохранить `VITE_ADMIN_SERVICE_EMAIL`;
- сохранить `isPrimaryServiceEmail`;
- не ослаблять роли `admin`/`moderator` без явного подтверждения;
- не переводить админские и security-ветки в общий пользовательский доступ.

## 4. Текущая проблема, подтвержденная анализом

Пример со скрина `Kto-Poteryal`:

- `validate success` означает, что локальная проверка формы прошла;
- `photo_check success` означает, что фото не является причиной;
- `api_call fail PERMISSION_DENIED` означает, что отказ пришел из Firebase RTDB при записи;
- `screen_unmount cancel` является следствием ухода со страницы после ошибки, не причиной.

Найденная асимметрия:

- экран проверяет `state.auth.user?.id`;
- запись в сервисе берет `auth.currentUser.uid`;
- правила Firebase проверяют `auth != null` и серверные условия;
- если Redux-профиль и Firebase Auth рассинхронизированы, клиент проходит validate, но RTDB отказывает.

Это нужно исправить системно во всех формах, а не только в `Kto-Poteryal`.

## 5. Область работ

### 5.1. Полный аудит Firebase RTDB правил

Нужно переписать `firebase.rules.json` как структурированную модель доступа.

Сделать таблицу всех веток:

- `users`;
- `requests`;
- `community_photos`;
- `community_photos_public`;
- `contacts_listings`;
- `lost_found`;
- `buy_sell_listings`;
- `job_listings`;
- `app_suggestions`;
- `osbb_news`;
- `osbb_votes`;
- `osbb_house_topics`;
- `osbb_collections`;
- `dating_profiles`;
- `dating_anketa_listings`;
- `coffee_requests`;
- `local_business`;
- `sports_listings`;
- `sports`;
- `stats`;
- `diagnostics`;
- `security_config`;
- `security_logs`;
- `_security`;
- `chaika_news`;
- `app_releases`;
- `app_version`;
- `authorized_devices`;
- `notification_prefs`;
- `fcm_tokens`;
- `profile_view_requests`;
- `support_tickets`;
- `support_messages`;
- остальные ветки из текущего `firebase.rules.json`.

Для каждой ветки определить:

- кто может читать;
- кто может создавать;
- кто может редактировать;
- кто может удалять;
- какие поля обязательны при создании;
- какие поля пользователь может менять;
- какие поля может менять только админ/модератор;
- допускается ли anonymous auth;
- нужна ли полная регистрация;
- нужна ли роль `admin`/`moderator`;
- какие индексы обязательны.

### 5.2. Новая модель правил

В правилах должны быть единые логические блоки:

- `signedIn`: `auth != null`;
- `isOwner(uid)`: текущий пользователь владелец записи;
- `isAdmin`;
- `isModerator`;
- `isStaff`: admin или moderator;
- `isNotYellowListed`;
- `isFullUser`, если приложение требует не anonymous и не неполный профиль;
- `canCreatePublicListing`;
- `canEditOwnPending`;
- `canCloseOwnItem`;
- `canModerate`;
- `canReadOwnOrStaff`.

Realtime Database rules не поддерживают функции так же удобно, как Firestore, поэтому допускается использовать повторяемые выражения. Но они должны быть приведены к одному шаблону и покрыты тестами.

### 5.3. Разделение create/update/delete

Сейчас многие `.write` объединяют создание, изменение и админское действие в одну длинную строку. Нужно разделить логику по смыслу:

- создание новой записи пользователем;
- редактирование своей записи;
- закрытие своей записи;
- удаление своей записи;
- модерация;
- системное обновление статуса.

Если RTDB не позволяет выразить это красиво на одном уровне, использовать дочерние правила и `.validate`, либо изменить клиентский формат записи так, чтобы правила можно было проверить надежно.

### 5.4. Пользовательские публикации

Для всех пользовательских публикаций зарегистрированный пользователь должен иметь возможность создать запись без `PERMISSION_DENIED`, если UI разрешает отправку:

- `requests`;
- `lost_found`;
- `buy_sell_listings`;
- `contacts_listings`;
- `job_listings`;
- `local_business`;
- `app_suggestions`;
- `community_photos`;
- `community_photos_public`;
- OSBB пользовательские ветки, где UI разрешает создание.

Требования к create:

- `auth != null`;
- `newData.child('userId').val() === auth.uid`, если запись содержит `userId`;
- статус модерации при создании только `pending` или безопасный стартовый статус;
- пользователь не может создать сразу `approved`, `rejected`, `expired`, если это не предусмотрено конкретным сценарием;
- yellow-list проверяется единообразно;
- если пользователь заблокирован, UI должен показать причину до записи.

### 5.5. Собственные записи пользователя

Если UI показывает кнопку закрытия/удаления/редактирования собственной записи, правила обязаны это разрешать.

Для каждой операции нужно либо:

- разрешить действие владельцу;
- либо убрать кнопку из UI;
- либо заранее показать понятную причину, почему действие невозможно.

Недопустимо: показывать кнопку, отправлять Firebase-запрос и получать `PERMISSION_DENIED`.

Особое внимание:

- `lostFoundService.remove`;
- `lostFoundService.close`;
- `buySellService.remove`;
- `contactsService.remove`;
- `jobService.remove`;
- любые `attachPhotoStoragePath`;
- любые optimistic update после публикации.

### 5.6. Auth consistency layer

Добавить единый слой проверки перед всеми submit/write операциями.

Создать утилиту, например:

```ts
requireWriteSession({
  reduxUserId,
  requireRealUser,
  operation,
  screen,
})
```

Утилита должна:

- дождаться `bootstrapAuth`;
- вызвать `ensureFirebaseAuth`;
- убедиться, что `auth.currentUser` существует;
- убедиться, что пользователь не anonymous, если сценарий требует зарегистрированного пользователя;
- сверить `auth.currentUser.uid` и `state.auth.user?.id`;
- при рассинхроне не выполнять Firebase write;
- логировать безопасную диагностику;
- возвращать понятную ошибку для UI: "Сессия обновляется, войдите снова" или "Профиль не синхронизирован".

Все формы должны использовать эту утилиту до `api_call start`.

### 5.7. Убрать ложное прохождение validate

`validateSubmissionRequirements` сейчас пропускает пользователя по `userId` из Redux. Нужно изменить контракт:

- проверять Firebase Auth session;
- проверять Redux user только как отображаемый профиль;
- не считать Redux user достаточным для записи;
- возвращать структурированный результат, а не только boolean.

Новый результат:

```ts
type SubmissionRequirementResult =
  | { ok: true; uid: string }
  | { ok: false; reason: 'no_auth' | 'anonymous' | 'auth_mismatch' | 'profile_missing' | 'yellow_list' | 'auth_bootstrap_timeout' };
```

### 5.8. Диагностика вместо голого `PERMISSION_DENIED`

Во всех местах, где возможна запись в Firebase, добавить безопасные details:

- экран;
- операция;
- Firebase path;
- есть ли `auth.currentUser`;
- `authUid`;
- `reduxUserId`;
- `isAnonymous`;
- provider;
- стадия: `preflight`, `write`, `rules_denied`, `retry_after_auth_refresh`;
- без телефона, email, имени и личного текста.

При `PERMISSION_DENIED` клиент должен:

1. один раз обновить ID token;
2. перепроверить auth consistency;
3. если причина найдена, показать прикладное сообщение;
4. если причина не найдена, записать расширенный diagnostic event;
5. не показывать пользователю слово `PERMISSION_DENIED`.

### 5.9. Error mapping

В `userFacingErrors` и связанных местах заменить голую Firebase-ошибку на нормальные сообщения.

Нельзя показывать:

- `PERMISSION_DENIED`;
- `permission-denied`;
- `permission_denied`;
- `Permission denied`.

Пользовательские варианты:

- "Сессия устарела. Войдите снова.";
- "Профиль еще синхронизируется. Повторите через несколько секунд.";
- "Публикации временно ограничены.";
- "Это действие доступно только владельцу записи.";
- "Нужно завершить регистрацию.";
- "Действие временно недоступно. Отчет отправлен администратору."

### 5.10. Yellow list

Yellow-list не должен превращаться в неожиданный `PERMISSION_DENIED`.

Требования:

- клиент до записи проверяет `yellow_list/{uid}`;
- правила тоже сохраняют серверную защиту;
- при активном ограничении UI показывает дату и причину;
- все submit-формы используют одинаковую проверку;
- если клиент не смог прочитать yellow-list, он не должен молча идти в write без диагностики.

### 5.11. Storage rules

Проверить `storage.rules` отдельно:

- зарегистрированный пользователь может загружать фото в разрешенные namespace;
- чтение фото, которые нужны лентам, доступно авторизованным пользователям;
- запрещены чужие приватные пути;
- пути `lost_found`, `buy_sell`, `contacts`, `requests`, `community_photos`, `profile` соответствуют клиентскому `storagePath`;
- `photoStoragePath` из RTDB всегда совпадает с разрешенным Storage path.

Для Storage также недопустим голый `storage/unauthorized` в штатной отправке формы.

## 6. Тестирование

### 6.1. Firebase Emulator tests

Расширить `src/__tests__/firebaseRulesEmulator.test.ts`.

Обязательные сценарии `assertSucceeds` для обычного зарегистрированного пользователя:

- create `/lost_found`;
- close own `/lost_found`;
- remove own `/lost_found`, если UI поддерживает;
- create `/buy_sell_listings`;
- remove own `/buy_sell_listings`, если UI поддерживает;
- create `/contacts_listings`;
- remove own `/contacts_listings`, если UI поддерживает;
- create `/job_listings`;
- create `/requests`;
- create `/community_photos`;
- create `/community_photos_public`;
- create `/support_tickets`;
- create `/support_messages` in own ticket;
- update own `/users/{uid}` allowed profile fields;
- update own notification prefs;
- update own FCM token;
- create own profile view request;
- write own authorized device allowed fields.

Обязательные сценарии `assertFails`, которые должны остаться:

- пользователь меняет чужую запись;
- пользователь создает запись с `userId` другого uid;
- пользователь создает `moderationStatus: approved`;
- пользователь модерирует без роли;
- пользователь пишет в `security_config`;
- пользователь пишет в `user_roles`;
- пользователь пишет в `_security`;
- anonymous пишет в ветки, где нужна регистрация;
- yellow-listed user создает публикацию;
- пользователь читает чужие приватные ветки.

### 6.2. Unit tests для auth preflight

Покрыть:

- no auth;
- anonymous auth;
- redux user есть, Firebase auth нет;
- Firebase auth есть, redux user нет;
- uid mismatch;
- token refresh success;
- token refresh fail;
- нормальный registered user.

### 6.3. Integration smoke scripts

Обновить или добавить smoke scripts:

- `scripts/step-kto-poteryal.mjs`;
- `scripts/test-kuplu-prodam.mjs`;
- `scripts/test-zhk-business-listing.mjs`;
- `scripts/test-pomoch-sosedyam.mjs`;
- общий `scripts/smoke-registered-user-writes.mjs`.

Скрипт должен прогонять все пользовательские write-операции и печатать:

- path;
- expected;
- actual;
- auth uid;
- result.

Ни один сценарий registered user create не должен завершаться `PERMISSION_DENIED`.

## 7. Приемочные критерии

Работа считается завершенной только если:

- `firebase.rules.json` переписан по единой матрице доступа;
- все пользовательские submit/write операции используют auth preflight;
- `validateSubmissionRequirements` больше не пропускает write только по Redux user id;
- все штатные registered-user create сценарии проходят в emulator tests;
- все запрещенные сценарии остаются запрещенными;
- пользовательский UI нигде не показывает `PERMISSION_DENIED`;
- runtime diagnostics показывают точную причину отказа;
- `npm run type-check` проходит;
- Firebase rules emulator tests проходят;
- админский owner access не сломан;
- `VITE_ADMIN_SERVICE_EMAIL` и `isPrimaryServiceEmail` сохранены;
- роли `admin`/`moderator` не ослаблены без отдельного подтверждения.

## 8. План выполнения

### Этап 1. Инвентаризация

- Составить таблицу всех RTDB веток.
- Сопоставить каждую ветку с сервисом и экраном.
- Найти все `push`, `set`, `update`, `remove`, `transaction`.
- Найти все места, где UI показывает действие, но правила могут запретить.
- Найти все ручные `throw new Error('permission-denied')`.

### Этап 2. Auth preflight

- Создать общую утилиту write-session.
- Подключить ее к основным формам.
- Добавить structured result.
- Добавить diagnostics.

### Этап 3. Правила RTDB

- Переписать правила create/update/delete.
- Убрать неоднозначные длинные `.write`, где возможно.
- Добавить `.validate` для критичных пользовательских веток.
- Сохранить admin/moderator доступ.
- Сохранить приватность.

### Этап 4. Storage

- Сверить namespace и реальные `storagePath`.
- Исправить mismatch между upload и rules.
- Добавить тестовые проверки Storage, если доступен emulator.

### Этап 5. Error UX

- Убрать показ raw Firebase error.
- Добавить понятные сообщения.
- Добавить retry/token refresh только один раз.

### Этап 6. Тесты

- Расширить emulator tests.
- Добавить auth preflight unit tests.
- Добавить smoke scripts.
- Прогнать type-check.

### Этап 7. Релизный контроль

- Перед деплоем сравнить локальные rules и deployed rules.
- Проверить, что Firebase deploy применил именно нужный файл.
- После деплоя выполнить smoke-тесты на production project с тестовым registered user.
- Проверить dashboard diagnostics за последние 30 минут.

## 9. Что запрещено делать

- Просто заменить текст ошибки и оставить серверный отказ.
- Открыть все ветки на `.write: auth != null`.
- Разрешить пользователю менять чужой `userId`.
- Разрешить пользователю ставить себе `admin` или `moderator`.
- Разрешить пользователю создавать `approved` контент без модерации.
- Убрать yellow-list с серверных правил без отдельного решения.
- Ломать owner/admin доступ.
- Убирать диагностику ради "чистого" UI.

## 10. Главный принцип

Для зарегистрированного пользователя штатная операция должна быть разрешена правилами и подтверждена тестом. Если операция не должна быть разрешена, UI обязан заранее объяснить почему и не отправлять Firebase write.

Firebase `PERMISSION_DENIED` должен остаться только внутренним защитным механизмом для реально запрещенных действий, а не ошибкой, которая ломает нормальное использование приложения.

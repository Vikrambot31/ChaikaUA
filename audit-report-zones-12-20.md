# Аудит-звіт: Зони 12–20

Дата: 2026-06-26
Режим: read-only audit (усі файли перевірено без змін)

---

## Зона 12: OSBB Module

### 12.1 (КРИТИЧНА) — `osbb_members` write rules без валідації

**Файл:** `firebase.rules.json:389`
**Проблема:** Правило `.write: "auth != null && auth.token.firebase.sign_in_provider !== 'anonymous'"` дозволяє **будь-якому автентифікованому користувачу** записати себе в будь-який OSBB будинок з будь-якою роллю (`manager`, `resident`) і будь-яким статусом (`approved`, `pending`). Відсутні:
- `$userId` wildcard з `auth.uid === $userId`
- `$buildingId` wildcard
- Валідація структури даних (role, status)
- Захист від перезапису чужих записів

Користувач може на клієнті виконати:
```js
set(ref(database, 'osbb_members/building123/theirUid'), {
  role: 'manager', status: 'approved'
})
```
— і отримати повний доступ до управління OSBB без модерації.

**Рекомендація:** Додати `$buildingId/$userId` з `.write: "auth.uid === $userId"` і валідацію полів (role, status). Або використовувати Cloud Function для створення membership.

---

### 12.2 (СЕРЕДНЯ) — `OsbbAdminScreen` без гарду навігації

**Файл:** `src/screens/OSBB-AdminPanel.tsx:168`
**Проблема:** Екран доступний для навігації будь-якому користувачу (немає guard на рівні компонента). Перевірка `isAdmin` (рядок 211) ховає тільки UI управління модераторами (призначення/зняття ролей), але решта панелі (статистика, дії) видно всім, хто знає route name. Backend CF (`assertOsbbManagerAccess`) захищає операції, але UI leak.

**Рекомендація:** Додати перевірку `useOsbbMembership().role === 'manager'` на початку компонента з редіректом на `OsbbSetupScreen`.

---

### 12.3 (СЕРЕДНЯ) — `osbb_collection_payments` відсутній в rules

**Файл:** `firebase.rules.json` (весь файл)
**Проблема:** Шлях `osbb_collection_payments` не визначено в Firebase rules. Клієнтська функція `recordCollectionPayment` (`src/services/osbbCollections.ts:187`) робить `push(paymentsRef, ...)` напряму. Оскільки root rules мають `".write": false`, записи будуть відхилені — функція маркування оплат не працює (або падає в catch на рядку 217).

**Рекомендація:** Додати правило для `osbb_collection_payments` в `firebase.rules.json`, обмежене для admin/moderator/manager, або перенести запис у Cloud Function.

---

### 12.4 (НИЗЬКА) — Фінансові дані без immutable audit trail

**Файл:** `src/services/osbbCollections.ts:178-192`
**Проблема:** `collectedAmount` оновлюється клієнтським `runTransaction` (рядок 178), записи платежів додаються через `push` (рядок 188) без серверної валідації. Manager може завищити `collectedAmount` напряму через Realtime Database API.

**Рекомендація:** Додати Cloud Function для `recordCollectionPayment` з серверною валідацією та write-only доступом до payments з клієнта.

---

## Зона 13: Bonus & Promotion System

### 13.1 (СЕРЕДНЯ) — `processCloseBonusTrigger` дублює idempotency ключ

**Файл:** `functions/index.js:330` (`processCloseBonusTrigger`) та `functions/index.js:663` (`closeRequestWithBonus`)
**Проблема:** DB trigger `processCloseBonusTrigger` і onCall функція `closeRequestWithBonus` використовують **однаковий** idempotency ключ `request_closed_${requestId}`. Будь-який автентифікований користувач може записати в `bonus_triggers/close_request/{requestId}` (rules line 604 дозволяють `!data.exists()`), що запустить trigger. Якщо trigger і onCall спрацюють одночасно — одна з них отримає `already_awarded`. Trigger перевіряє `reqVal.userId !== uid` (рядок 349), але race condition може призвести до того, що жодна не виплатить бонус.

**Рекомендація:** Використовувати різні idempotency ключі (напр. `close_trigger_${requestId}` для trigger, `request_closed_${requestId}` для onCall).

---

### 13.2 (СЕРЕДНЯ) — Відсутнє rate limiting на bonus CF endpoints

**Файл:** `functions/bonusFunctions.js:512-577` (`awardHelpRespondBonus`, `confirmHelperForRequest`)
**Проблема:** Функції не мають per-user-per-time-window rate limiting. Idempotency запобігає replay на тому ж `requestId`, але ніщо не заважає викликати `awardHelpRespondBonus` на 1000 різних `requestId` за хвилину. Кожен виклик робить кілька DB reads + transaction.

**Рекомендація:** Додати перевірку частоти викликів через `rateLimitCounter/${uid}/${minuteKey}` або використати Firebase Rate Limiting.

---

### 13.3 (НИЗЬКА) — `BONUS_AUTHOR_CLOSED` створює incentive misalignment

**Файл:** `functions/bonusFunctions.js:29`
**Проблема:** Автор отримує +5 балів за закриття заявки (`BONUS_AUTHOR_CLOSED`). Це може мотивувати закривати заявки до того, як helpers заробили бонуси (`BONUS_HELP_CONFIRMED = 20`, `BONUS_GRATITUDE = 10`). Сума мала, але стимул присутній.

**Рекомендація:** Прибрати бонус за закриття або зробити його умовним (тільки якщо був хоча б один helper).

---

### 13.4 (ІНФО) — `purchaseBonusPromotion` — trust promotions без модерації

**Файл:** `functions/promotionFunctions.js:256`
**Проблема:** Просування за trust бонуси (`contacts_top`, `services_top`) отримують `moderationStatus: 'approved'` автоматично. Просування за promo credits (`business_top` та інші) отримують `pending` і проходять модерацію. Це дозволяє обійти модерацію для контенту, оплаченого trust бонусами.

**Рекомендація:** Якщо це свідоме дизайн-рішення — задокументувати.

---

## Зона 14: Invite Access & Trust Tree

### 14.1 (СЕРЕДНЯ) — Відсутня перевірка наявності `trust_tree` вузла при повторному запиті

**Файл:** `functions/inviteAccess.js:1187-1203`
**Проблема:** `submitInviteRequest` перевіряє `user_access/${uid}/status` (рядок 1037-1061), але **не перевіряє**, чи вже існує `trust_tree/${uid}`. Якщо адмін понизить статус користувача (напр. з `approved` на `guest`) — користувач може подати нову заявку з іншим спонсором, і `buildTrustNode` (рядок 1188) **перезапише** існуючий trust_tree вузол, змінивши його батьківство, `depthToRoot`, `rootPath`. Старий спонсор втрачає бонуси, новий отримує.

**Рекомендація:** Перед auto-approve перевіряти `!data.exists()` на `trust_tree/${uid}`. Якщо вузол існує — не створювати новий (або вимагати ручної модерації).

---

### 14.2 (НИЗЬКА) — Hardcoded `OWNER_UID`

**Файл:** `functions/inviteAccess.js:20`
**Проблема:** `OWNER_UID = 'LfqIMCAyEzLAb7TNc83lYGW9RiV2'` захардкоджено. Використовується в `isBypassUid` (рядок 376) та `buildManualRootNode` (рядок 557). Якщо цей Firebase Auth користувач буде видалено або скомпрометовано — весь trust tree та bypass-механізм зламається.

**Рекомендація:** Зберігати owner UID в Firebase Config (`functions.config()`), а не в коді.

---

### 14.3 (НИЗЬКА) — `adminModerateInviteRequest` перезаписує trust tree

**Файл:** `functions/inviteAccess.js:1606`
**Проблема:** При ручній модерації (approve) trust_node записується через `updates[trust_tree/${uid}] = trustNode` безумовно. Якщо користувач вже має trust_tree вузол (напр. через попереднє схвалення, яке потім було скасоване), він буде перезаписаний.

**Рекомендація:** Перевіряти `!data.exists()` або використовувати transaction для оновлення trust_tree.

---

### 14.4 (ІНФО) — Немає явної перевірки циклів у trust tree

**Файл:** `functions/inviteAccess.js:453-479`
**Проблема:** Хоча структура (кожен uid має одне місце) природно запобігає циклам, немає перевірки, що новий `uid` не знаходиться в `rootPath` спонсора. Якщо через баг або адмін-дію виникне неузгодженість, цикл може утворитися.

**Рекомендація:** Додати валідацію в `buildTrustNode`: якщо `sponsor.rootPath` вже містить `uid` — відхиляти операцію.

---

## Зона 15: User Content (Buy/Sell, Lost/Found, Jobs, Contacts)

### 15.1 (КРИТИЧНА) — `local_business` rules mismatch: approvedValue = `active` vs `approved`

**Файл:** `firebase.rules.json:198`
**Проблема:** Правило перевіряє:
```
newData.child('status').val() !== 'approved'
```
Але `local_business` використовує `status = 'active'` для схвалених оголошень (а не `'approved'`). Докази:
- `src/screens/Vibor-Temy-Zayavki.tsx:196`: `orderByChild('status'), equalTo('active')`
- `src/screens/ServiceModerationScreen.tsx:1057`: `const moderateBusiness = useCallback((id, status: 'active' | 'rejected', ...)`

**Impact:** Власник може редагувати оголошення **навіть після модерації**, бо `status = 'active'` проходить перевірку `!== 'approved'` (умова true → write дозволено).

**Рекомендація:** Змінити `'approved'` на `'active'`:
```
newData.child('status').val() !== 'active'
```

---

### 15.2 (НИЗЬКА) — `food_top_listings`, `beauty_top_listings`, `children_top_listings` — відсутні `status` checks

**Файл:** `firebase.rules.json:94-96, 102-104, 110-112`
**Проблема:** Ці три "top" шляхи не мають перевірок `status !== 'approved'` та `status !== 'rejected'`, які є в інших content paths. Вони перевіряють тільки `moderationStatus`.

**Рекомендація:** Додати для defense-in-depth:
```
&& newData.child('status').val() !== 'approved'
&& newData.child('status').val() !== 'rejected'
```

---

### 15.3 (НИЗЬКА) — `isRenderablePhotoUri()` — тільки URI scheme без file extension

**Файл:** `src/screens/Bizznes-Chaika.tsx:198-199`
**Проблема:** Функція `isRenderablePhotoUri()` валідує тільки URI scheme (`^(https?:|file:|content:)\/\/`), але не перевіряє file extension. Якщо зловмисник завантажить SVG з JavaScript в Firebase Storage, зображення може бути відрендерене через `AppPhotoImage`.

**Рекомендація:** Додати валідацію `/\.(png|jpg|jpeg|gif|webp)$/i` або налаштувати Storage rules на rejection non-image uploads.

---

### 15.4 (ІНФО) — XSS не знайдено

**Файли:** `src/screens/Kuplu-Prodam.tsx`, `src/screens/Kto-Poteryal.tsx`, `src/screens/Poisk-Raboty.tsx`, `src/screens/Bizznes-Chaika.tsx`
**Статус:** SAFE. Жоден з екранів не використовує `dangerouslySetInnerHTML`, `innerHTML`, або `RenderHtml`. Всі дані рендеряться через React Native `<Text>`.

---

## Зона 16: Support & Ad Chat

### 16.1 (КРИТИЧНА) — Spoofing `senderRole: 'admin'`

**Файл:** `firebase.rules.json:720-723` (`support_messages`) та `682-684` (`ad_messages`)
**Проблема:** Правило `.validate` дозволяє **будь-якому** авторизованому користувачу встановлювати `senderRole: 'admin'`:
```
.validate: "... && (newData.child('senderRole').val() === 'user'
  || newData.child('senderRole').val() === 'admin')"
```
Правило `.write` перевіряє тільки власника тикету (через `userId`). Зловмисник може через Firebase API напряму встановити `senderRole: 'admin'` і видавати себе за адміністратора.

**Рекомендація:** Додати перевірку ролі:
```
.validate: "... && (newData.child('senderRole').val() === 'user'
  || (auth.token.admin === true
    && newData.child('senderRole').val() === 'admin'))"
```

---

### 16.2 (ВИСОКА) — Відсутнє rate limiting на повідомлення

**Файл:** `firebase.rules.json:720, 682` + `src/services/supportService.ts:212-244`, `src/services/adService.ts:193-220`
**Проблема:** В Firebase Security Rules для `support_messages` і `ad_messages` немає rate limiting. Клієнтський код не обмежує частоту. Користувач може відправити тисячі повідомлень за секунду через Firebase API напряму.

**Рекомендація:** Додати в rules перевірку `data.child('timestamp').val() < now - 2000` (1 повідомлення за 2 секунди) або додати Cloud Function trigger для validation та anti-spam.

---

### 16.3 (СЕРЕДНЯ) — `ad_tickets.status` validate не включає `'paid'`

**Файл:** `firebase.rules.json:666`
**Проблема:** TypeScript тип `AdTicket` (`src/types/ad.ts:8`) включає статус `'paid'`, але Firebase Security Rules дозволяють тільки `'open'` або `'closed'`:
```
"status": {
  ".validate": "newData.val() === 'open' || newData.val() === 'closed'"
}
```
При спробі встановити статус `'paid'` запис буде відхилено правилами.

**Рекомендація:** Додати `'paid'` в validate:
```
".validate": "newData.val() === 'open' || newData.val() === 'closed'
  || newData.val() === 'paid'"
```

---

### 16.4 (СЕРЕДНЯ) — Невідповідність ліміту довжини тексту

**Файл:** `admin-panel/src/pages/SupportPage.tsx:296` та `admin-panel/src/pages/AdChatPage.tsx:280`
**Проблема:** В адмін-панелі `textarea` має `maxLength={2000}`, але Firebase Rules (рядок 721, 683) обмежують `text` до **500** символів. Адміністратор, який введе >500 символів, отримає помилку Firebase.

**Рекомендація:** Синхронізувати ліміти: змінити `maxLength` в адмінці на 500, або розширити ліміт в rules до 2000.

---

### 16.5 (НИЗЬКА) — Відсутня перевірка `senderId`

**Файл:** `firebase.rules.json:721`
**Проблема:** Правила `.validate` перевіряють `senderRole`, але не перевіряють, що `senderId` відповідає `auth.uid`, якщо роль `'user'`. Прямий запит до API може встановити довільний `senderId`.

**Рекомендація:** Додати:
```
&& (newData.child('senderRole').val() !== 'user'
  || newData.child('senderId').val() === auth.uid)
```

---

## Зона 17: Business+ & Premium

### 17.1 (КРИТИЧНА) — `business_plus_claims` rules — неправильний шлях до `ownerUid`

**Файл:** `firebase.rules.json:745, 746`
**Проблема:** Правила написані на рівні `$placeId` і перевіряють:
```
root.child('business_plus_claims').child($placeId).child('ownerUid').val() === auth.uid
```
Але фактична структура даних: `business_plus_claims/{placeId}/{uid}/ownerUid`. `ownerUid` знаходиться на рівень глибше (з вкладеним `$uid`). Через неправильний шлях `data.child('ownerUid')` завжди повертає `null` — умова для власника заявки **ніколи не спрацьовує**.

Аналогічна проблема в `.read` правилі (рядок 745).

**Рекомендація:** Додати вкладений `$uid` рівень та виправити шлях:
```
"business_plus_claims": {
  "$placeId": {
    "$uid": {
      ".write": "auth != null && (auth.token.admin === true
        || auth.token.moderator === true
        || (newData.child('ownerUid').val() === auth.uid
          && data.child('status').val() === 'pending'))"
    }
  }
}
```

---

### 17.2 (КРИТИЧНА) — `business_plus_cards` — та сама проблема з `ownerUid`

**Файл:** `firebase.rules.json:805`
**Проблема:** Перевірка:
```
root.child('business_plus_claims').child($placeId).child('ownerUid').val() === auth.uid
```
шукає `ownerUid` на рівні `business_plus_claims/{placeId}/ownerUid`, але в реальності він знаходиться на `business_plus_claims/{placeId}/{uid}/ownerUid`. Умова ніколи не виконується — тільки адміни/модератори можуть писати в `business_plus_cards`.

**Рекомендація:** Виправити шлях на `business_plus_claims/${placeId}/${auth.uid}/ownerUid`.

---

### 17.3 (СЕРЕДНЯ) — `activatePromoPremium` без обмеження доступу

**Файл:** `functions/index.js:2027`
**Проблема:** Функція викликає `assertRealAuthenticatedUser(context)` (рядок 2029) — перевіряє тільки `uid` і що провайдер не anonymous. **Будь-який автентифікований користувач** може активувати преміум-підписку (кожен виклик витрачає ліміт `FREE_PREMIUM_LIMIT`).

**Рекомендація:** Якщо функція тільки для адмінів — додати `assertAdminModerationAccess`. Якщо публічна — додати rate limiting та додаткову валідацію.

---

### 17.4 (СЕРЕДНЯ) — Subscription expiry — тільки на клієнті

**Файл:** `functions/index.js:2002-2025` (`normalizeSubscriptionRecord`) + `src/redux/slices/subscriptionSlice.ts:128-133` (`checkExpiry`)
**Проблема:** Немає серверного cron для проставлення `status: 'expired'` в `user_subscription`. Client-side `checkExpiry` (рядок 128) використовує локальний час — можна обійти зміною годинника пристрою. Серверна функція `normalizeSubscriptionRecord` (рядок 652-666) обчислює `isActive` динамічно, але викликається тільки в `getUserSubscription`.

**Рекомендація:** Додати scheduled function (напр. `firebase-schedule` кожні 6 годин), яка проставляє `status: 'expired'` для прострочених підписок.

---

### 17.5 (НИЗЬКА) — `selectIsPremium` використовує локальний час

**Файл:** `src/redux/slices/subscriptionSlice.ts:148-157`
**Проблема:** `selectIsPremium` і `selectIsBusinessPlus` використовують `new Date() < new Date(expiresAt)` — клієнтський час. Користувач може змінити годинник пристрою для обходу.

**Рекомендація:** Добавити серверну валідацію через `getUserSubscription` (callable CF з серверним `Date.now()`).

---

## Зона 18: Diagnostics & Error Monitoring

### 18.1 (ВИСОКА) — `SENSITIVE_KEY_RE` надто широкий

**Файл:** `src/services/liveDiagnosticsService.ts:64`
**Проблема:** Регулярний вираз містить ключі: `message`, `content`, `body`, `text`, `description`. Майже всі diagnostic payloads мають хоча б одне з цих полів → майже всі дані редяться, роблячи діагностику марною.

**Рекомендація:** Залишити в списку тільки: `password`, `token`, `secret`, `authorization`. Для `email`, `phone` — використовувати `redactString`.

---

### 18.2 (ВИСОКА) — `PHONE_RE` ловить timestamps та ID

**Файл:** `src/services/liveDiagnosticsService.ts:66`
**Проблема:** Регулярка `/\+?\d[\d\s().-]{7,}\d/g` матчить будь-яке число з 7+ цифр, включаючи Unix timestamps (напр. `1234567890`), ID записів, номери квартир.

**Рекомендація:** Звузити до українського формату `/\+?380\d{9}/g`.

---

### 18.3 (ВИСОКА) — `sanitizeValue` без захисту від циклічних посилань

**Файл:** `src/services/liveDiagnosticsService.ts:88`
**Проблема:** Рекурсивна функція `sanitizeValue` не має захисту від циклічних об'єктів (`obj.self = obj`). В разі циклічного payload — stack overflow, краш додатку.

**Рекомендація:** Додати параметр `WeakSet<object>` visited-set.

---

### 18.4 (ВИСОКА) — Будь-який registered user може писати в `diagnostics/runtime`

**Файл:** `src/services/liveDiagnosticsService.ts:174` + `src/services/runtimeMonitorService.ts:231`
**Проблема:** `canSendNow()` (рядок 174) перевіряє тільки `auth.currentUser` не null і не anonymous. Будь-який registered user може надсилати події в `diagnostics/runtime`. Якщо Firebase Rules дозволяють write — це DoS vector.

**Рекомендація:** Обмежити доступ в rules (admin-write only), або додати перевірку ролі перед відправкою.

---

### 18.5 (ВИСОКА) — `sanitizePayload` в CF без захисту від циклів

**Файл:** `functions/index.js:30`
**Проблема:** Аналогічно 18.3 — рекурсивна `sanitizePayload` без захисту від циклічних посилань. Cloud Function може впасти з stack overflow при отриманні циркулярного payload від клієнта чи іншої функції.

**Рекомендація:** Додати параметр `depth` (max 10) і `WeakSet<object>` visited-set.

---

### 18.6 (НИЗЬКА) — `EMAIL_RE` не підтримує Unicode

**Файл:** `functions/index.js:25` та `src/services/liveDiagnosticsService.ts:65`
**Проблема:** Регулярка `[A-Z0-9]` не матчить кириличні email (напр. `ім'я@пример.укр`). Такі адреси leak в plaintext.

**Рекомендація:** Додати Unicode-регулярку `[\p{L}0-9._%+-]+@` з флагом `u`.

---

### 18.7 (НИЗЬКА) — Невідповідність розміру черги

**Файл:** `src/services/liveDiagnosticsService.ts:60`
**Проблема:** `MAX_QUEUE_ITEMS = 250`, але `persistQueue` зберігає тільки останні 200 (`slice(-200)` на рядку 67). 50 елементів втрачаються при перезапуску.

**Рекомендація:** Використовувати однакову константу.

---

## Зона 19: Redux Store Persistence

### 19.1 (ВИСОКА) — `auth` slice персистить PII

**Файл:** `src/redux/store.ts:116`
**Проблема:** Список persisted полів: `['user', 'isAuthenticated']`. Об'єкт `user` типово містить: `email`, `displayName`, `phoneNumber`, `photoURL`. Всі ці дані зберігаються в AsyncStorage у відкритому вигляді. Будь-який додаток з доступом до storage або compromised device може їх прочитати.

**Рекомендація:** Персистити тільки `uid` та `isAuthenticated`. Завантажувати профіль з Firebase при кожному запуску.

---

### 19.2 (ВИСОКА) — `subscription` slice можна підробити локально

**Файл:** `src/redux/store.ts:163`
**Проблема:** Поля, що персистяться: `['plan', 'status', 'expiresAt', 'activatedAt', 'trialUsed', 'paymentMethod']`. На rooted/jailbroken пристрої користувач може змінити `plan` з `'free'` на `'premium_plus'`, встановити `expiresAt` в майбутнє — і обійти client-side premium gating.

**Рекомендація:** Ніколи не довіряти persisted стану для server-side операцій. Додати поле `serverVerifiedAt` для відстеження застарілості.

---

### 19.3 (НИЗЬКА) — `MAX_PERSISTED_ITEMS = 200` — silent data loss

**Файл:** `src/redux/store.ts:31`
**Проблема:** `RetentionTransform` обрізає `items`, `todayItems`, `approved` масиви до 200 записів. Старіші записи мовчки видаляються. Для активних користувачів з >200 items локальний кеш розходиться з сервером.

**Рекомендація:** Логувати warning при truncation. Розглянути збільшення ліміту до 500.

---

### 19.4 (НИЗЬКА) — Migration 3 валідує всі slices разом

**Файл:** `src/redux/store.ts:52-113`
**Проблема:** Єдиний об'єкт `persistMigrations` (migration 3, рядки 77-113) валідує поля для ВСІХ persisted slices в одній функції. Це крихко: якщо state якогось slice не містить очікуваних полів, міграція намагається "виправити" їх, потенційно корумпуючи дані. Напр., рядок 105 скидає `plan` на `'free'`, якщо не `'free'/'premium'/'premium_plus'` — але це поле є тільки в `subscription`.

**Рекомендація:** Створити окремі migration об'єкти для кожного slice.

---

### 19.5 (НИЗЬКА) — `helpRequestsSlice` персистить `phone` (PII)

**Файл:** `src/redux/slices/helpRequestsSlice.ts:82`
**Проблема:** При маппінгу з `Request` в `HelpRequest`, `item.phone` (номер телефону) копіюється і персиститься в AsyncStorage в складі `items`/`todayItems`.

**Рекомендація:** Видалити `phone` з persisted даних в RetentionTransform, або не включати його в mapped об'єкт.

---

## Зона 20: Cloud Functions (загальні)

### 20.1 (СЕРЕДНЯ) — `adminGrantPromoCredits` — race condition

**Файл:** `functions/bonusFunctions.js:840-885`
**Проблема:** Функція перевіряє `ticket.status === 'paid'` (рядки 854-858) для idempotency, але ця перевірка **не атомарна** з наступним викликом `grantPromoCredits` (рядок 863) та оновленням статусу (рядок 867). Два одночасних адмін-виклики можуть обидва пройти перевірку і обидва нарахувати кредити.

**Рекомендація:** Робити атомарну перевірку: записувати статус `'paid'` всередині транзакції `grantPromoCredits`, або використовувати ticket status як idempotency key.

---

### 20.2 (СЕРЕДНЯ) — `spendTrustBonuses` / `spendPromoCredits` без idempotency

**Файл:** `functions/bonusFunctions.js:442-488` та `391-437`
**Проблема:** Якщо клієнт retry після network timeout (списання пройшло, але відповідь не прийшла), бонуси/кредити можуть бути списані двічі, а створено тільки один promotion record.

**Рекомендація:** Додати idempotency keys до spend операцій, аналогічно `awardTrustBonus`.

---

### 20.3 (НИЗЬКА) — Бонус multiplier читає `user_subscription` плану

**Файл:** `functions/bonusFunctions.js:236-241` + `functions/bonusFunctions.js:564, 635, 686, 727, 761, 788, 824`
**Проблема:** Бонус multiplier використовує значення `plan` з `user_subscription/${uid}/plan`. Якщо rules дозволяють клієнтський write на `user_subscription/$uid`, користувач може встановити `plan: 'business_plus'` для 2x множника.

**Рекомендація:** Перевірити `firebase.rules.json` — `user_subscription/$uid` має бути `.write: false`.

---

### 20.4 (СЕРЕДНЯ) — `checkExpiringSubscriptions` та `autoRenewSubscriptions` без pagination

**Файл:** `functions/promotionFunctions.js:558, 623`
**Проблема:** Обидві scheduled functions читають ВСІ записи з `SUBSCRIPTIONS_PATH` в пам'ять (рядок 558, 623) з `.once('value')`. Для великої кількості користувачів це unbounded memory та timeout.

**Рекомендація:** Додати batch обробку через last-evaluated-at timestamp або pagination.

---

### 20.5 (НИЗЬКА) — `roleCache` TTL 5 хв — stale role

**Файл:** `functions/index.js:231`
**Проблема:** In-memory `Map` з 5-хвилинним TTL для кешування ролей. Якщо адмін змінює роль користувача, стара роль залишається в кеші до 5 хвилин. Протягом цього вікна нещодавно понижений модератор може продовжувати доступ до адмін-функцій.

**Рекомендація:** Документувати затримку. Для критичних операцій (напр. `setUserRole`) додати інвалідацію кеша через CF trigger.

---

### 20.6 (НИЗЬКА) — Різні константи `USER_BONUSES_PATH` в різних файлах

**Файл:** `functions/bonusFunctions.js:19` та `functions/inviteAccess.js:17`
**Проблема:** Константа `USER_BONUSES_PATH = 'user_bonuses'` визначена окремо в обох файлах. Якщо один з них оновити без іншого, бонуси будуть писатися в різні шляхи.

**Рекомендація:** Експортувати `USER_BONUSES_PATH` з єдиного джерела (напр. `inviteAccess.js`) та імпортувати в `bonusFunctions.js`.

---

## Зведена таблиця

| Зона | Знайдено | Критичні | Високі | Середні | Низькі |
|------|----------|----------|--------|---------|--------|
| 12 (OSBB) | 4 | 1 | 0 | 2 | 1 |
| 13 (Bonuses) | 4 | 0 | 0 | 2 | 1 (+1 інфо) |
| 14 (Invite) | 4 | 0 | 0 | 1 | 2 (+1 інфо) |
| 15 (Content) | 4 | 1 | 0 | 0 | 2 (+1 інфо) |
| 16 (Chat) | 5 | 1 | 1 | 2 | 1 |
| 17 (Business+) | 5 | 2 | 0 | 2 | 1 |
| 18 (Diagnostics) | 7 | 0 | 5 | 0 | 2 |
| 19 (Redux) | 5 | 0 | 2 | 0 | 3 |
| 20 (CF) | 6 | 0 | 0 | 3 | 3 |
| **Всього** | **44** | **5** | **8** | **12** | **15** (+4 інфо) |

---

## Топ-5 найкритичніших проблем

1. **12.1** `osbb_members` write rules — будь-хто може додати себе в OSBB як manager
2. **15.1** `local_business` status mismatch — власник може редагувати після модерації
3. **16.1** `senderRole: 'admin'` спуфінг — користувач може писати від імені адміна
4. **17.1** `business_plus_claims` rules — `ownerUid` перевірка ніколи не працює
5. **17.2** `business_plus_cards` rules — та сама проблема з `ownerUid`

---

*Звіт створено автоматично на основі аудиту код-бази*

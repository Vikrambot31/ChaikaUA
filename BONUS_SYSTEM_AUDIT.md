# 📋 Аудит бонусної системи (Trust Bonuses & Promo Credits)

**Дата:** 2026-06-11
**Файли:**
- `src/screens/BonusWalletScreen.tsx`
- `src/screens/BonusPromotionPurchaseScreen.tsx`
- `src/screens/PromoCreditsTopupScreen.tsx`
- `src/screens/Profil-Polzovatelya.tsx` (картка бонусів)
- `src/services/bonusService.ts`
- `src/services/adService.ts`
- `functions/inviteAccess.js` (awardInviteBonus)
- `functions/bonusFunctions.js`
- `firebase.rules.json`
- `PLAN-TRUST-BONUSES-CURRENCY.md`

---

## 1. Архітектура системи (огляд)

Система має **дві валюти**:

| Валюта | Сховище | Нарахування | Витрати |
|---|---|---|---|
| **Trust Bonuses** | `user_bonuses/${uid}` | Cloud Functions (автоматично за дії) | Просування профілю/послуг |
| **Promo Credits** | `promo_credits/${uid}` | Адмін вручну (після оплати) | Просування бізнесу/салонів/дітей |

### Екрани:

```
Профіль → BonusWalletScreen (головний гаманець)
        → BonusPromotionPurchaseScreen (купити просування)
        → PromoCreditsTopupScreen (чат з адміном для поповнення)
```

### Потоки даних (підписки):

```
subscribeMyBonuses          → user_bonuses/${uid}
subscribeMyPromoCredits     → promo_credits/${uid}
subscribeMyBonusTransactions → bonus_transactions/${uid} (limitToLast 30)
subscribeMyBonusPromotions  → bonus_promotions (query by uid)
```

---

## 2. Знайдені баги та проблеми

### 2.1. BonusWalletScreen (`src/screens/BonusWalletScreen.tsx`)

| # | Баг | Рядок | Важливість | Опис |
|---|---|---|---|---|
| 1 | **Ready-flag ніколи не спрацює, якщо підписка не поверне дані** | 139 | 🔴 | `loadedSources.size >= 4` вимагає, щоб **всі 4** підписки спрацювали хоча б раз. Якщо `subscribeMyBonusPromotions` ніколи не викличе callback (немає даних, але підписка активна), екран зависне на `!ready` |
| 2 | **`available` рахується неправильно** | 168 | 🟡 | `bonuses?.available ?? bonuses?.total ?? 0` — клієнтська формула `available = total - spent.total` не застосовується. Якщо сервер не записав `available`, показується `total` замість `total - spent` |
| 3 | **`weeklyLimit` fallback — магічне число** | 170 | 🟡 | `WEEKLY_FREE_LIMIT_FALLBACK = 250` — якщо сервер не записав `weeklyLimit`, використовується константа. Але вона може відрізнятися від реального ліміту на сервері |
| 4 | **Неможливо оновити дані (pull-to-refresh)** | — | 🟡 | Екран не має `onRefresh` або кнопки "Оновити". Дані оновлюються тільки через підписки (realtime). Якщо підписка "зависла", користувач не може примусово оновити |
| 5 | **Немає індикатора помилки для підписок** | 142-157 | 🟡 | Якщо `subscribeMyBonuses` викличе callback з `EMPTY_BONUSES` (помилка RTDB в `bonusService.ts:258`), користувач бачить `0` замість помилки |
| 6 | **`ActionButton` не має disabled-стану** | 288-291 | 🟢 | Кнопки "Просунути" активні навіть якщо баланс = 0. Користувач може натиснути, перейти на екран покупки, і побачити помилку "недостатньо коштів" |
| 7 | **`listItem` не захищений від `item.currency` undefined** | 312 | 🟢 | `item.currency` використовується без fallback у тексті |
| 8 | **`activePromotions` фільтрує `moderationStatus === 'pending'`** | 178 | 🟢 | Просування з `pending` модерацією показуються як "активні", хоча вони ще не схвалені |

### 2.2. Profil-Polzovatelya.tsx (картка бонусів)

| # | Баг | Рядок | Важливість | Опис |
|---|---|---|---|---|
| 1 | **Бонуси показують `0` до завантаження** | 648 | 🟡 | `bonuses?.total ?? 0` — при першому рендері `bonuses === null`, показується `0`. Через ~100-500мс підписка спрацьовує, і цифра оновлюється |
| 2 | **Немає стану помилки для картки бонусів** | 640-692 | 🟡 | Якщо `subscribeMyBonuses` викликає `setBonuses(null)` (помилка), картка ховається повністю (рядок 673 `{bonuses ? ... : null}`). Користувач не знає, що бонуси не завантажились |
| 3 | **Badge lookup — небезпечний доступ** | 681-687 | 🟢 | `({...})[bonuses.badge]` — якщо сервер додасть новий бейдж, якого немає в мапі, використовується fallback `text.bonusBadgeNewcomer`. Але якщо сервер видалить поле `badge` (undefined), fallback спрацює |
| 4 | **Прогрес-бар не враховує `spent`** | 652 | 🟢 | `bonuses.total` використовується для прогресу, але ПЛАН передбачає `available` як показник "прогресу" |

### 2.3. BonusPromotionPurchaseScreen (`src/screens/BonusPromotionPurchaseScreen.tsx`)

| # | Баг | Рядок | Важливість | Опис |
|---|---|---|---|---|
| 1 | **Пряме читання з RTDB без перевірки прав** | 207 | 🟡 | `get(query(ref(database, 'biznes_chaika_listings'), ...))` — читає всі listing-и користувача напряму. Якщо Firebase Rules не дозволяють, впаде з PERMISSION_DENIED |
| 2 | **Немає кешування списків listing-ів** | 206-221 | 🟡 | При кожній зміні `selectedPromoType` або при перемонтуванні компонента — новий RTDB запит |
| 3 | **"Success" не оновлює баланс бонусів** | 261 | 🟡 | Після успішної покупки `navigation.goBack()`, але `subscribeMyBonuses` в BonusWalletScreen оновить баланс через підписку — це працює, але з затримкою |
| 4 | **`normalizeBizTitle` — небезпечний `List<string>`** | 101-105 | 🟢 | Використовує `raw.itemName || raw.businessName || ...` — якщо жодне поле не існує, падає до `category` або `id` |
| 5 | **`canBuy` не перевіряє `selectedTargetId` належність** | 240 | 🟢 | Користувач може технічно вибрати ціль, яка йому не належить (серверна перевірка є в Cloud Function, але UX страждає) |
| 6 | **`targets` useMemo — зайві залежності** | 233-238 | 🟢 | `user?.name` і `t.bonus.*` в `deps` викликають перерахунок навіть якщо `promotionTargets` не змінились |

### 2.4. PromoCreditsTopupScreen (`src/screens/PromoCreditsTopupScreen.tsx`)

| # | Баг | Рядок | Важливість | Опис |
|---|---|---|---|---|
| 1 | **`ensureFirebaseAuth` — стан гонки** | 87-100 | 🟡 | `ensureFirebaseAuth()` може вирішити: (а) до монтування — `authUid` ніколи не встановиться, (б) після демонтування — `setAuthUid` викличеться на розмонтованому компоненті |
| 2 | **`selectedPackage` fallback — жорсткий індекс** | 82 | 🟡 | `PACKAGES.find(...) || PACKAGES[1]` — якщо `selectedPackageId` зміниться, але пакет буде видалено з масиву, fallback на `[1]` (500 credits) |
| 3 | **Немає підтвердження перед створенням тікету** | 135-154 | 🟢 | Користувач може випадково створити тікет, натиснувши кнопку. Немає `Alert.alert` з "Ви впевнені?" |
| 4 | **`creating` стан не враховує offline** | 256-258 | 🟢 | Кнопка "Create ticket" вимкнена коли `!isOnline`, але `isOnline` не в `deps` useCallback. Хоча `disabled` перевіряє це правильно |

### 2.5. bonusService.ts

| # | Баг | Рядок | Важливість | Опис |
|---|---|---|---|---|
| 1 | **`subscribeMyBonuses` — помилка RTDB повертає пусті дані** | 256-259 | 🟡 | При помилці RTDB викликається `onChanged(EMPTY_BONUSES)`. Клієнт не може відрізнити "реально 0" від "помилка" |
| 2 | **`subscribeMyPromoCredits` — аналогічно** | 270-275 | 🟡 | Та ж проблема: помилка → `EMPTY_PROMO_CREDITS` |
| 3 | **`subscribeMyBonusTransactions` — немає обробки порожньої RTDB** | 292-302 | 🟡 | Якщо `bonus_transactions/${uid}` не існує, `snapshot.forEach` просто нічого не робить, повертається `[]` — це OK, але якщо RTDB видасть помилку, повертається `[]` (рядок 301) |
| 4 | **`normalizeBonuses` не валідує `badge`** | 177 | 🟢 | `typeof data.badge === 'string' ? data.badge : 'newcomer'` — бейдж може бути будь-яким рядком, навіть не зі списку |
| 5 | **`getMyBonuses` — не використовує Cloud Function** | 233-238 | 🟢 | Читає RTDB напряму, без валідації на сервері. Але RTDB Rules дозволяють читання свого node, тому ризик мінімальний |

### 2.6. adService.ts

| # | Баг | Рядок | Важливість | Опис |
|---|---|---|---|---|
| 1 | **`createAdTicket` закриває старий тікет, але не перевіряє права** | 147-153 | 🟡 | Якщо у користувача є старий `open` тікет, він закривається. Але немає перевірки, чи цей тікет дійсно належить користувачу (хоча `getUserOpenAdTicket` читає `ad_ticket_ref/${userId}`, що безпечно) |
| 2 | **`snapshotToTicket` — небезпечний spread** | 27 | 🟢 | `{ ...data, ticketId: snap.key } as AdTicket` — якщо `data` має неочікувані поля (наприклад, `adminNote`), вони будуть включені в об'єкт |
| 3 | **`subscribeToAdMessages` — error callback нелогічний** | 94-99 | 🟢 | При помилці RTDB викликається `callback([])`, але також при порожніх даних `callback(snap.exists() ? ... : [])` — неможливо відрізнити "немає повідомлень" від "помилка" |

---

## 3. Відповідність специфікації (PLAN-TRUST-BONUSES-CURRENCY.md)

### 3.1. Що ВІДПОВІДАЄ плану

| Вимога | Статус | Де реалізовано |
|---|---|---|
| Дві окремі валюти (trust / promo) | ✅ | `bonusService.ts` — `UserBonuses` та `PromoCredits` |
| Бонуси за запрошення (+50) | ✅ | `inviteAccess.js:482` — `BONUS_INVITE_POINTS = 50` |
| Ліміти категорій | ✅ | `bonusService.ts:480-485` — `BONUS_CAPS` |
| Бейджі (newcomer → ambassador) | ✅ | `bonusService.ts:472-478` — `BONUS_BADGE_CONFIG` |
| Просування за бонуси (contacts_top) | ✅ | `BonusPromotionPurchaseScreen.tsx` — купівля |
| Просування за промо-кредити (business, beauty, kids) | ✅ | `BonusPromotionPurchaseScreen.tsx` — купівля |
| Чат з адміном для поповнення | ✅ | `PromoCreditsTopupScreen.tsx` + `adService.ts` |
| Історія транзакцій | ✅ | `bonus_transactions/${uid}` + `BonusWalletScreen.tsx` |
| Тижневий ліміт | ✅ | `BonusWalletScreen.tsx:170` — `weeklyLimit` |

### 3.2. Що ВІДСУТНЄ або НЕ ПОВНІСТЮ РЕАЛІЗОВАНО

| Вимога | Статус | Коментар |
|---|---|---|
| `gratitude` (подяки) категорія в коді | ⚠️ **Є в типі, немає в нарахуванні** | `bonusService.ts:18` — `gratitude` є в `UserBonuses`. `inviteAccess.js` не нараховує `gratitude`. Можливо, в `bonusFunctions.js` |
| `activity` (активність) категорія | ⚠️ **Є в типі, але не показана** | `bonusService.ts:19` — `activity` є. В `BonusWalletScreen.tsx` `breakdownGrid` не показує `activity` |
| `available = total - spent.total` | ❌ **Не реалізовано на клієнті** | `BonusWalletScreen.tsx:168` — `bonuses?.available ?? bonuses?.total ?? 0` |
| `weeklyByCategory` — не показано | ❌ **Відсутнє в UI** | Поле є в типі `earned.weeklyByCategory`, але не відображається |
| Кнопка "Обміняти бонуси" | ❌ **Відсутня** | ПЛАН передбачає кнопку для обміну бонусів на топ, але є тільки `ActionButton` для кожного типу |
| Індикатор "Ліміт вичерпано" | ❌ **Відсутній** | ПЛАН: "Ліміт бесплатных бонусов на этой неделе исчерпан" |
| Push-сповіщення про закінчення підписки | ❌ **Не знайдено** | ПЛАН передбачає сповіщення за 5-4-3-2-1 днів до закінчення |

### 3.3. Відхилення від плану

| Пункт плану | Як реалізовано | Відхилення |
|---|---|---|
| `weeklyLimit = 250` | `WEEKLY_FREE_LIMIT_FALLBACK = 250` | OK, але має бути з сервера |
| `inviteHistory` зріз 100 | `inviteHistory.slice(-100)` | Відповідає |
| Максимум 5 топ-профілів | Немає клієнтської перевірки | Має бути в `BonusPromotionPurchaseScreen` |
| `moderationStatus: pending` для нових промо | Є, але показується як "активне" | `activePromotions` фільтр включає `pending` |

---

## 4. Проблеми безпеки

| # | Проблема | Файл | Важливість |
|---|---|---|---|
| 1 | **Пряме читання RTDB з клієнта** | `BonusPromotionPurchaseScreen.tsx:207` | 🟡 — `database` імпортовано напряму, читання `biznes_chaika_listings` / `local_business` / `contacts_listings` без Cloud Function |
| 2 | **Клієнт пише в RTDB напряму (adService)** | `adService.ts:176-188` | 🟡 — `createAdTicket` пише в `ad_tickets` і `ad_messages` через `set()` на клієнті. Залежить від Firebase Rules. Rules (`firebase.rules.json:577-594`) дозволяють запис тільки `auth.uid === userId` |
| 3 | **Відсутність rate limiting на клієнтські запити** | `PromoCreditsTopupScreen.tsx:135` | 🟢 — користувач може створити багато тікетів (хоча `createAdTicket` закриває старий) |

---

## 5. Аналіз станів UI

### 5.1. BonusWalletScreen

| Стан | Статус | Коментар |
|---|---|---|
| Loading (перше завантаження) | ✅ `!ready → ActivityIndicator` | Але може зависнути (див. баг #1) |
| Empty — немає бонусів (0) | ✅ Показує `0` | Коректно |
| Empty — немає транзакцій | ✅ `emptyHistory` | Є |
| Empty — немає активних промо | ✅ `noActivePromotions` | Є |
| Empty — немає промо-кредитів | ✅ Показує `0` | Коректно |
| Помилка завантаження | ❌ **Відсутній** | Показує 0 замість помилки |
| Loading refresh (оновлення) | ❌ **Відсутній** | Немає pull-to-refresh |

### 5.2. Profil-Polzovatelya (бонусна картка)

| Стан | Статус | Коментар |
|---|---|---|
| Loading | ⚠️ Показує `0` | Flash of zero, потім оновлюється |
| Empty (не залогінений) | ✅ Сховано | `isLoggedIn &&` |
| Помилка | ⚠️ Ховає картку | `{bonuses ? ... : null}` |
| Успіх | ✅ Показує дані | |

### 5.3. BonusPromotionPurchaseScreen

| Стан | Статус | Коментар |
|---|---|---|
| Loading targets | ✅ `ActivityIndicator` | |
| Empty targets | ✅ `emptyCard` | "Немає даних" |
| Недостатньо коштів | ✅ Кнопка disabled + червоний баланс | |
| Покупка в процесі | ✅ `ActivityIndicator` в кнопці | |
| Помилка покупки | ✅ `Alert.alert` | Є детальний `getPromotionErrorMessage` |
| Успіх покупки | ✅ `Alert.alert` + `goBack()` | Але немає оновлення балансу на цьому екрані |

### 5.4. PromoCreditsTopupScreen

| Стан | Статус | Коментар |
|---|---|---|
| Loading auth | ✅ `ActivityIndicator` | |
| Loading ticket/messages | ✅ FlatList + `ListEmptyComponent` | |
| Немає тікету (потрібно створити) | ✅ Показує пакети | |
| Є тікет | ✅ Чат | |
| Офлайн | ✅ Warning banner + disabled | |
| Помилка створення тікету | ✅ `Alert.alert` | |

---

## 6. Продуктивність

| Проблема | Файл | Опис |
|---|---|---|
| **4 RTDB підписки одночасно** | `BonusWalletScreen.tsx` | 4 `onValue` слухачі одночасно. При старті екрану — 4 з'єднання |
| **`fetchOwnedTargets` без ліміту** | `BonusPromotionPurchaseScreen.tsx:115` | `orderByChild('userId').equalTo(uid)` без `limitToLast()` — якщо у користувача 1000 listing-ів, завантажаться всі |
| **Послідовні запити (sponsorChain)** | `sponsorService.ts` | `for` + `await` — не паралельні |
| **Немає debounce для messageText** | `PromoCreditsTopupScreen.tsx:156` | Кожне натискання на "Send" викликає `sendAdUserMessage` без debounce |

---

## 7. Рекомендації щодо виправлення

### 7.1. Критичні (🔴)

1. **Виправити ready-flag в BonusWalletScreen:**
   - Додати таймаут (напр. 5 сек) після якого `ready` стає `true` незалежно від кількості джерел
   - Або використати `Promise.all` для початкового `get()` замість підписок

```typescript
// Поточний баг: loadedSources.size >= 4 може ніколи не спрацювати
// Рішення: додати timeout
useEffect(() => {
  const timer = setTimeout(() => setReady(true), 5000);
  return () => clearTimeout(timer);
}, []);
```

### 7.2. Важливі (🟡)

2. **Додати `available` формулу:** `const trustAvailable = (bonuses?.available ?? (bonuses?.total ?? 0) - (bonuses?.spent.total ?? 0))`

3. **Додати pull-to-refresh** для всіх екранів з підписками

4. **Додати error boundary** для кожної підписки — показувати іконку помилки замість `0`

5. **Додати disabled-стан для `ActionButton`:** якщо `balance < minPrice`, показувати "Недостатньо коштів"

6. **Виправити `activePromotions` фільтр:** не включати `moderationStatus === 'pending'`

7. **Додати `activity` категорію в `breakdownGrid`** BonusWalletScreen

8. **Додати `weeklyByCategory` breakdown** в BonusWalletScreen

### 7.3. Косметичні (🟢)

9. **Додати підтвердження перед створенням ad-тікету**

10. **Кешувати результати `fetchOwnedTargets`** з AsyncStorage

11. **Додати `limitToLast(100)`** до запитів listing-ів

---

## 8. Підсумок

| Категорія | Кількість |
|---|---|
| 🔴 Критичні баги | 1 (ready-flag зависання) |
| 🟡 Важливі баги | 12 |
| 🟢 Незначні баги | 10 |
| **Всього** | **23** |
| ✅ Зауважень немає | 8 (з 34 перевірених вимог ПЛАНУ) |
| ❌ Відсутній функціонал | 5 (з 34) |

### Основні висновки:

1. **BonusWalletScreen** — технічно якісний екран, але критичний баг з `ready`-флагом може зробити його повністю непрацездатним
2. **BonusPromotionPurchaseScreen** — найкраще реалізований, з детальною обробкою помилок і станів
3. **Відповідність специфікації** — ~70% вимог з PLAN-TRUST-BONUSES-CURRENCY.md реалізовано. Відсутні `gratitude` нарахування, `weeklyByCategory` UI, push-сповіщення про закінчення
4. **Безпека** — пряме RTDB читання з клієнта (`BonusPromotionPurchaseScreen`) — основний ризик
5. **Архітектура** — всі 4 основні екрани використовують однаковий патерн підписок, що добре для консистентності

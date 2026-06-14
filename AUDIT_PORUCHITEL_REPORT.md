# 📋 Аудит системи "Дерево довіри" (Poruchitel)

**Дата:** 2026-06-11
**Файли:**
- `src/screens/Poruchitel.tsx`
- `src/services/sponsorService.ts`
- `src/services/bonusService.ts`
- `src/contexts/TrustedAccessContext.ts`
- `functions/inviteAccess.js`
- `functions/index.js`
- `firebase.rules.json`

---

## 1. Першопричина помилки "Не вдалося завантажити дані"

### Корінь проблеми

`Poruchitel.tsx:196-199` — `Promise.all` падає через **`getMyInvitedChildren()` (Callable Cloud Function)**:

```typescript
const [node, childrenResult, statusResult] = await Promise.all([
  getMyTrustNode(),
  getMyInvitedChildren(),               // ← немає .catch()
  getMyInviteRequestStatus().catch(() => null),  // ← є .catch()
]);
```

- `getMyInvitedChildren` (`functions/index.js:3599`) — `https.onCall` функція, яка **може бути не задеплоєна** або падати з помилкою
- `getMyTrustNode()` (читання `trust_tree/${uid}`) **НЕ падає** — RTDB Rules на `trust_tree/$uid` дозволяють `auth.uid === $uid`
- `getMyInviteRequestStatus()` має `.catch(() => null)` — безпечна

### Чому Promise.all не підходить

`Promise.all` fails fast — якщо **один** проміс відхиляється, результати решти втрачаються:

```
getMyTrustNode()          → ✅ успіх (null або node)
getMyInvitedChildren()    → ❌ помилка (функція не задеплоєна)
──────────────────────────────────────────────
Promise.all               → ❌ reject (всі дані втрачено!)
```

### Виправлення

Замінити `Promise.all` на послідовні запити з індивідуальним `.catch()`:

```typescript
const node = await getMyTrustNode().catch(() => null);
const childrenResult = await getMyInvitedChildren().catch(() => []);
const statusResult = await getMyInviteRequestStatus().catch(() => null);
```

---

## 2. Dual Source Disconnect — ВЕРДИКТ

### Початкове припущення (помилкове)

> Стара система читає з `referrals` (стара структура)
> Нова система пише в `trust_tree` з полями `depthToRoot`, `rootPath`

### Реальність

**Проблеми в коді немає.** Ніякого `referrals` у цьому кодобейсі не існує.

Використовується **виключно `trust_tree`**:

| Компонент | Що використовує | Шлях |
|---|---|---|
| Poruchitel.tsx | `getMyTrustNode()` | `trust_tree/${uid}` |
| Poruchitel.tsx | `getMyInvitedChildren()` | Cloud Function → `trust_tree` (query by `sponsorUid`) |
| Poruchitel.tsx | `getMyTrustChain()` | `users/${uid}/name` для кожного в `rootPath` |
| sponsorService.ts | `normalizeTrustNode()` | Поля: `depthToRoot`, `rootPath`, `sponsorUid`, `inviteCount` |
| inviteAccess.js (CF) | `buildTrustNode()` | Пише в `trust_tree/${uid}` |
| inviteAccess.js (CF) | `findSponsorNode()` | Спершу `trust_tree`, потім `trusted_sponsors` |

### Де реальний дисонанс

1. **`trusted_sponsors`** — admin-only шлях для старих/ручних спонсорів (тільки телефон, без UID)
2. Якщо спонсор існує **тільки** в `trusted_sponsors`, то `rootPath` буде порожнім, і ланцюжок довіри не побудується
3. Якщо користувача створено вручну через `adminCreateTrustedSponsor`, його вузол **не створюється** в `trust_tree`

### Потенційна проблема з RTDB Rules

```json
"trust_tree": {
  ".read": "auth != null && (auth.token.admin === true || auth.token.moderator === true)",
  "$uid": {
    ".read": "auth != null && auth.uid === $uid"
  }
}
```

Якщо `trust_tree/${uid}` **не існує** (нова людина без вузла), деякі старі версії Firebase SDK можуть викинути `PERMISSION_DENIED` при спробі читання неіснуючого шляху — залежить від того, чи перевіряє SDK батьківський `.read` до дочірнього.

---

## 3. Повний список багів

### 3.1. Poruchitel.tsx

| # | Баг | Рядок | Важливість | Опис |
|---|---|---|---|---|
| 1 | **Promise.all без per-promise catch** | 196-199 | 🔴 | `getMyInvitedChildren()` без `.catch()` — убиває весь `load()` |
| 2 | **Втрата даних при помилці** | 210 | 🔴 | Якщо `getMyInvitedChildren()` впав, `getMyTrustNode()` (успішний) теж втрачається |
| 3 | **Немає error callback в subscribeMyTrustNode** | 223-228 | 🟡 | `onValue` без обробника помилок — RTDB помилка мовчки ігнорується |
| 4 | **Немає loading state при refresh по підписці** | 222-237 | 🟡 | Підписки оновлюють дані без індикатора завантаження |
| 5 | **getMyTrustChain може викинути помилку** | 205 | 🟡 | Ланцюжок поза `Promise.all`, але всередині `try` — при помилці `loadError` перезаписує частково завантажені дані |
| 6 | **getMyTrustChain послідовний (for + await)** | 334-345 | 🟡 | Для chain з 10+ ланок — ~10 послідовних RTDB читань |
| 7 | **bonuses.total === 0 ховає весь блок** | 373 | 🟡 | Користувач не баче, чи завантажились бонуси взагалі |
| 8 | **inviteStatus === null ховає статус заявки** | 322 | 🟡 | Користувач не бачить різниці між "не подавав" і "помилка завантаження" |
| 9 | **subscribeMyTrustNode callback може кинути необроблену помилку** | 223-228 | 🟡 | `getMyTrustChain(node)` і `getMyInvitedChildren()` без try-catch усередині колбека |
| 10 | **Немає обробки помилок в subscribeMyConfirmations** | 264 | 🟡 | `onValue` без error callback |

### 3.2. sponsorService.ts

| # | Баг | Рядок | Важливість | Опис |
|---|---|---|---|---|
| 1 | **subscribeMyConfirmations немає error callback** | 356-361 | 🟡 | `onValue` без обробника помилок |
| 2 | **subscribeMyTrustNode немає error callback** | 363-374 | 🟡 | `onValue` без обробника помилок |
| 3 | **getMyTrustChain не кешує прочитані імена** | 334-345 | 🟢 | Кожен виклик робить `get(ref(database, ...))` для кожного UID |
| 4 | **getMyTrustChain не фільтрує дублікати в rootPath** | 334 | 🟢 | Можливі дублікати в ланцюжку |

### 3.3. Гонки (Race Conditions)

| Сценарій | Опис | Наслідок |
|---|---|---|
| `load()` vs `subscribeMyTrustNode` | Обидва тригеряться на mount | Якщо підписка спрацює швидше за `load()`, дані від підписки будуть перезаписані `load()`. Зворотній порядок безпечний |
| `load()` vs `subscribeMyBonuses` | Бонуси завантажуються незалежно | Якщо `load()` впаде і встановить `setLoading(false)`, бонуси можуть ще не завантажитись |

---

## 4. Аналіз UI/UX

### 4.1. Стани (States)

| Стан | Статус | Коментар |
|---|---|---|
| Loading spinner (перше завантаження) | ✅ Є | `ActivityIndicator` при `loading === true` |
| Loading при refresh (підписки) | ❌ **Відсутній** | Дані оновлюються без індикатора |
| Success message | ❌ Відсутній | Немає підтвердження успішного завантаження |
| Empty state (немає trustNode) | ✅ Є | "Ви поки не в дереві довіри" |
| Empty state (немає children) | ✅ Є | "Ви ще нікого не запросили" |
| Empty state (немає confirmations) | ✅ Є | "Нових підтверджень поки немає" |
| Empty state (помилка завантаження бонусів) | ❌ **Відсутній** | Просто ховає блок |
| Empty state (помилка завантаження статусу) | ❌ **Відсутній** | Просто ховає блок |
| Деталізована помилка | ❌ Відсутній | Завжди загальне "Не вдалося завантажити дані" |

### 4.2. Кнопки та інтерактивність

| Елемент | Статус | Коментар |
|---|---|---|
| "Спробувати ще раз" (retry) | ✅ Працює | Викликає `load()` |
| "Ви" ("Вы") | ❌ **НЕ КНОПКА** | Це просто chip у ланцюжку (`chainNodeYou`) з `MaterialCommunityIcons name="account-circle"` |
| Кнопка "Запросити" ("Пригласить") | ❌ **Відсутня** | Є тільки hint з номером телефону |
| Кнопка "Підтвердити" / "Не знаю" | ✅ Є | Для `confirmations` |
| Кнопка "Детальніше" для рівня дерева | ❌ Відсутня | Немає drill-down по кожному сусіду |
| Статус відповіді сусіда | ❌ Відсутній | Немає ✅/⏳/❌ індикаторів |

### 4.3. Повідомлення про помилки

| Тип помилки | Статус |
|---|---|
| Немає інтернету | ❌ Немає |
| Немає доступу (permission denied) | ❌ Немає |
| Дані пошкоджені | ❌ Немає |
| Дані успішно оновлено | ❌ Немає |
| Спливає термін підтвердження | ❌ Немає |

---

## 5. Що додати на екран (рекомендації)

### 5.1. Термінові виправлення (🔴)

1. **Ізолювати `Promise.all`** — обгорнути кожен проміс у `.catch()`:

```typescript
const node = await getMyTrustNode().catch(() => null);
const childrenResult = await getMyInvitedChildren().catch(() => []);
const statusResult = await getMyInviteRequestStatus().catch(() => null);
```

2. **Додати error callback** в `subscribeMyTrustNode` (рядок 363-374)

3. **Додати try-catch** в subscription callback (рядок 223-228)

4. **Додати loading state** при refresh по підписці

### 5.2. UI покращення

| Що додати | Опис |
|---|---|
| **Progress indicator** | Spinner при завантаженні підписок (refresh) |
| **Кнопка "Запросити"** | Share intent / referral link з номером телефону |
| **Trust score rating** | Загальний рейтинг довіри (на основі `riskScore`) |
| **Статус кожного сусіда** | ✅/⏳/❌ для кожного запрошеного |
| **Кнопка "Детальніше"** | Drill-down для кожного рівня ланцюжка |
| **Історія запрошень** | Хто, коли, статус |
| **Специфічні помилки** | Network vs Permission vs Server |
| **Бейдж користувача** | Показати бейдж (`bonuses.badge`) |
| **Breadcrumb / ієрархія дерева** | Показати повний шлях у дереві |
| **Total trust score** | Велика цифра в заголовку |

### 5.3. Схема "fill-in" даних

```
┌─────────────────────────────────────────────┐
│ Текущие данные:                              │
├─────────────────────────────────────────────┤
│ ✓ Уровень в дереве (depthToRoot)            │
│ ✓ Кол-во приглашённых (children.length)      │
│ ✓ Бонусы (bonuses.total)                    │
│ ✓ Статус заявки (inviteStatus.status)        │
│ ✓ Подтверждения (confirmations)              │
├─────────────────────────────────────────────┤
│ ✗ Trust score / рейтинг                     │
│ ✗ Статусы ответов соседей                   │
│ ✗ История приглашений                       │
│ ✗ Действия (пригласить, поделиться)         │
│ ✗ Breadcrumb / иерархия дерева              │
│ ✗ Badge / бейдж пользователя                │
└─────────────────────────────────────────────┘
```

---

## 6. Висновки

1. **Головна причина помилки**: `getMyInvitedChildren()` (Cloud Function) ймовірно не задеплоєна або падає — **виправити: додати `.catch(() => [])`** аналогічно `getMyInviteRequestStatus()`

2. **"Dual Source" проблеми НЕМАЄ** — `referrals` не існує в проєкті, тільки `trust_tree`. Але є розсинхрон між `trust_tree` і `trusted_sponsors` (шлях для ручних спонсорів без UID)

3. **З ~15 перевірених аспектів UI** тільки 5 мають коректну обробку; 10 відсутні або неповні

4. **Найкритичніший баг**: відсутність `.catch()` на `getMyInvitedChildren()` у `Promise.all`, що вбиває завантаження всього екрану при недоступності однієї функції

5. **Другорядний ризик**: потенційний `PERMISSION_DENIED` при читанні неіснуючого `trust_tree/${uid}` через неоднозначність RTDB Rules на батьківському шляху

# ЗВІТ ЗА ДЕНЬ 2: ГОЛОВНИЙ ЕКРАН, ЛЕНТА ЗАЯВОК, СТВОРЕННЯ ЗАЯВОК

## Дата: 2026-06-08
## Агент: DeepSeek v4
## Статус: Перевірено 4 з 10 задач (2.1-2.4)

---

## СТАТИСТИКА

- **Перевірено файлів:** ~9
- **Знайдено багів:** 7
  - **CRITICAL:** 0
  - **HIGH:** 0
  - **MEDIUM:** 6
  - **LOW:** 1

---

## ЗНАЙДЕНІ БАГИ

---

### BUG-2.1.1: Feed сортується за ID, а не за часом — неправильний порядок різнотипних елементів [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/Glavny-Ekran.tsx`
- **Строка:** 657
- **Функція:** `liveFeedItems` мемоізація
- **Проблема:** `items.sort((a, b) => b.id.localeCompare(a.id))` — сортування за рядковим ID, а не за timestamp. ID мають префікси (`help-`, `req-`, `elec-`), тому лексикографічно `hel-` < `req-` < `elec-`. Елементи з різних джерел не чергуються за реальним часом створення. Заявка створена 1 хв тому може опинитись нижче "допомоги" створеної 5 хв тому.
- **Код:**
```typescript
items.sort((a, b) => b.id.localeCompare(a.id));
return items.slice(0, MAX_FEED_ITEMS);
```
- **Очікувано:** Сортувати за `createdAt` / `timestamp` замість `id`.

---

### BUG-2.1.2: BottomNavigation — лейбли табів не відповідають навігації додатку [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/components/BottomNavigation.tsx`
- **Строка:** 21
- **Проблема:** `TAB_IDS = ['Map', 'List', 'Requests', 'Profile', 'Help']`, але навігація в `Glavny-Ekran.tsx` (рядки 668-673) використовує `'MapTab'`, `'ProfileTab'`. Якщо цей компонент десь використовується, `onTabChange('Profile')` викличе навігацію на неіснуючий шлях.
- **Код:**
```typescript
const TAB_IDS = ['Map', 'List', 'Requests', 'Profile', 'Help'];
// ...
onPress={() => onTabChange(id)}  // ← 'Profile', але в навігації 'ProfileTab'
```
- **Очікувано:** Узгодити ID табів з реальними шляхами навігації, або видалити невикористовуваний компонент.

---

### BUG-2.2.1: Client-side фільтр статусу несумісний з пагінацією — приховані дані [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/Spisok-Zayavok.tsx`
- **Строка:** 969-980
- **Функція:** `sortedRequests`
- **Проблема:** Фільтр `statusFilter` застосовується ТІЛЬКИ до вже завантажених (1 сторінка) заявок. Схвалені/відхилені заявки на сторінках 2+ не завантажуються взагалі через пагінацію за `createdAt`. Якщо користувач обирає фільтр "Схвалено", він бачить тільки схвалені з першої сторінки, не знаючи про існування інших.
- **Код:**
```typescript
return [...requests]
  .filter((item) => statusFilter === 'all' || resolveStatus(item) === statusFilter)
  .sort((a, b) => b.createdAt - a.createdAt);
```
- **Очікувано:** Пагінація має враховувати фільтр (серверна фільтрація або завантаження всіх даних перед фільтрацією).

---

### BUG-2.2.2: Різні поля `createdAt` в `loadPending*` — неправильне сортування при змішуванні [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/Spisok-Zayavok.tsx`
- **Строки:** 209-492
- **Функції:** `loadPendingPhotos`, `loadPendingLostFound`, `loadPendingBuySell`, `loadPendingContacts`, `loadPendingLocalBusiness`, `loadPendingBiznesChaika`
- **Проблема:** Кожна функція використовує різні поля для визначення часу:
  - `loadPendingPhotos`: `createdAt || uploadedAt`
  - `loadPendingLostFound`: `createdAt || submittedForModerationAt`
  - `loadPendingLocalBusiness`: `updatedAt || createdAt`
  - Інші: `createdAt || submittedForModerationAt`
- Коли всі ці типи міксуються в `feedRows` (рядок 1053) і сортуються за `sortKey`, об'єкти з різною логікою часу перемішуються некоректно (наприклад, `updatedAt` може бути значно пізніше за `createdAt`, елемент стрибає вгору списку).
- **Очікувано:** Використовувати єдине поле (`createdAt`) в усіх pending-функціях.

---

### BUG-2.3.1: `toSafeRtdbKey` може створити колізію ключів для лайків [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/Detal-Zayavki.tsx`
- **Строка:** 203, 393
- **Функція:** `toSafeRtdbKey()`
- **Проблема:** `toSafeRtdbKey` замінює заборонені символи `.#$[]/` на `_`. Якщо `request.id` прийде з іншого джерела (не Firebase push ID), два різні ID, що відрізняються лише цими символами, зведуться до одного шляху `feed_likes/requests/{id}`.
- **Код:**
```typescript
const RTDB_FORBIDDEN_KEY_CHARS = /[.#$[\]/]/g;
const toSafeRtdbKey = (value: string): string => (value ?? '').replace(RTDB_FORBIDDEN_KEY_CHARS, '_').trim();
```
- **Очікувано:** Для Firebase push ID колізія малоймовірна, але варто переконатись, що `request.id` завжди з Firebase push ID.

---

### BUG-2.4.1: `expiresAt` порівнюється рядково — не працює з числовими timestamp [MEDIUM]

- **Severity:** MEDIUM
- **Файл:** `src/screens/Vibor-Temy-Zayavki.tsx`
- **Строка:** 127
- **Функція:** `sosRequests` мемоізація
- **Проблема:** `expiresAt > new Date().toISOString()` — якщо `expiresAt` збережено в Firebase як число (Unix timestamp ms), порівняння `number > string` дає `NaN` → `false`. Усі SOS-запити з числовим `expiresAt` не показуються.
- **Код:**
```typescript
todayHelpRequests.filter((request) =>
  request.isBurning && request.expiresAt > new Date().toISOString()
)
```
- **Очікувано:** `new Date(request.expiresAt).getTime() > Date.now()` (перетворити на число перед порівнянням)

---

### BUG-2.4.2: `local_business` listener мовчки падає при помилці auth [LOW]

- **Severity:** LOW
- **Файл:** `src/screens/Vibor-Temy-Zayavki.tsx`
- **Строка:** 195, 214
- **Функція:** `useEffect` підписки
- **Проблема:** `ensureFirebaseAuth()` може викинути `AuthBootstrapTimeoutError`. `catch(() => {})` на рядку 214 ігнорує помилку. Користувач не бачить сьогоднішні пропозиції бізнесу, лічильник `todayOffersCount` залишається 0.
- **Очікувано:** Додати логування помилки або fallback-повідомлення.

---

## ПЕРЕВІРЕНІ ФАЙЛИ БЕЗ БАГІВ

| Файл | Задача | Примітка |
|------|--------|----------|
| `src/utils/communicationActions.ts` | 2.3 | OK (телефон, Viber, Telegram deep link) |
| `src/components/RequestItem.tsx` | 2.2 | OK (470 рядків, якісний код) |
| `src/redux/slices/requestsSlice.ts` | 2.2 | OK (thunks з retry, редьюсери, logout очищує) |

---

## НЕ ПЕРЕВІРЕНІ ЗАДАЧІ

| Задача | Файли |
|--------|-------|
| **2.5** Форма створення заявки | `Forma-Zayavki.tsx`, `submissionRequirements.ts`, `requestFormLimitGuard.ts`, `contentLanguageGuard.ts`, `censor.ts` |
| **2.6** Загрузка фото в заявку | `RequestPhotoUploadField.tsx`, `PhotoUploadField.tsx`, `photoUploadService.ts`, `imageSafety.ts`, `imageCompressor.ts` |
| **2.7** Голосове повідомлення | `VoiceRecorder.tsx`, `photoUploadService.ts`, `types/app.ts` |
| **2.8** Мої заявки | `Moi-Zayavki.tsx`, `ProfileRequestsScreen.tsx`, `Istoriya-Zaprosov.tsx` |
| **2.9** Помогти сусідам | `Pomoch-Sosedyam.tsx`, `helpRequestsSlice.ts`, `Zapros-Pomoshi.tsx` |
| **2.10** Redux і дані заявок | `requestsSlice.ts`, `helpRequestsSlice.ts`, `selectors.ts`, `api.ts` |

---

## РЕКОМЕНДАЦІЇ

1. **BUG-2.1.1** (MEDIUM) — Виправити сортування feed на `createdAt`.
2. **BUG-2.2.1** (MEDIUM) — Узгодити пагінацію з фільтром статусу.
3. **BUG-2.4.1** (MEDIUM) — Виправити порівняння `expiresAt` — найчастіше впливає на реальних користувачів.
4. **BUG-2.1.2** (MEDIUM) — Видалити або виправити `BottomNavigation`.

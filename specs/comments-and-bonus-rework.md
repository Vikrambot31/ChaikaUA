# ТЗ: Система коментарів до заявок + перероблена бонусна система

**Дата:** 2026-06-12
**Статус:** Draft
**Пріоритет:** High

---

## 1. Проблема

### 1.1 Поточний стан
- Екран "Деталі заявки" (`Detal-Zayavki.tsx`) НЕ має системи коментарів
- Єдина взаємодія — безтекстова кнопка "Я можу допомогти" + запит контакту
- **Кнопка "Закрити як вирішену +5"** нараховує +5 бонусів АВТОРУ заявки (сам собі)
- Це дозволяє накрутку: створив заявку → закрив → +5 очок. Ніякого підтвердження від третіх осіб немає.
- Баг: при натисканні "Закрити як вирішену" виникає "Необхідно авторизуватись" через race condition Firebase Auth

### 1.2 Цільовий стан
- Під заявкою — секція коментарів (чат-стиль) для обговорення та пропозицій допомоги
- Кожен коментар проходить AI-автомодерацію ПЕРЕД публікацією
- Переглянута бонусна система: автор +2 за закриття, коментатори +5 за допомогу

---

## 2. Система коментарів

### 2.1 Firebase RTDB — структура даних

```
request_comments/
  {requestId}/
    {commentId}/                  // push key
      uid: string                 // UID автора коментаря
      name: string                // Ім'я автора (snapshot на момент створення)
      text: string                // Текст коментаря (макс 500 символів)
      createdAt: number           // serverTimestamp
      status: "visible" | "hidden" | "pending"
      avatarKey?: string          // Ключ аватара автора
      aiModeration?: {
        verdict: "approve" | "review" | "suspicious"
        confidence: number
        flags: string[]           // ["spam", "profanity", ...]
        provider: string
        model: string
      }
```

### 2.2 Security Rules (RTDB)

```json
"request_comments": {
  "$requestId": {
    ".read": "auth != null",
    "$commentId": {
      ".write": "auth != null && !root.child('users/' + auth.uid + '/banned').exists()",
      ".validate": "newData.hasChildren(['uid', 'name', 'text', 'createdAt', 'status'])"
    }
  }
}
```

> **Примітка:** Запис дозволено тільки авторизованим, не забаненим юзерам. Видалення/зміна статусу — через cloud function (адмін або автор коментаря).

### 2.3 UI — секція коментарів на екрані `Detal-Zayavki.tsx`

**Розташування:** Під існуючим блоком "Helpers" / перед кнопками дій автора.

**Компоненти:**

```
┌──────────────────────────────────┐
│  💬 Коментарі (3)                │
├──────────────────────────────────┤
│  [Аватар] Ім'я           14:32  │
│  Привіт! Я можу допомогти з     │
│  ремонтом, є досвід.            │
├──────────────────────────────────┤
│  [Аватар] Ім'я           15:10  │
│  Я теж можу, живу поруч.        │
├──────────────────────────────────┤
│  ⏳ Ваш коментар перевіряється   │  ← pending (видно тільки автору)
├──────────────────────────────────┤
│  [Введіть коментар...    ] [➤]  │  ← input + send button
└──────────────────────────────────┘
```

**Поведінка:**
- Список коментарів — real-time subscription (`onValue` / `onChildAdded`)
- Показувати тільки `status: "visible"` (+ `"pending"` тільки автору коментаря)
- Ліміт: останні 50 коментарів (пагінація не потрібна для MVP)
- Коментар `"pending"` показується з індикатором "Перевіряється..." автору коментаря
- Порожній стан: "Поки ніхто не залишив коментар"
- Авторизація: Поле вводу недоступне для анонімних/неавторизованих (текст: "Авторизуйтесь щоб коментувати")

**Обмеження вводу:**
- Мінімум: 3 символи
- Максимум: 500 символів
- Лічильник символів при > 400
- Cooldown: 30 секунд між коментарями одного юзера
- Disabled input поки попередній коментар в статусі "pending"

### 2.4 Компонент `CommentSection`

Новий компонент: `/src/components/CommentSection.tsx`

**Props:**
```typescript
interface CommentSectionProps {
  requestId: string;
  requestAuthorUid: string;    // Щоб позначити автора заявки в коментарях
  isRequestClosed: boolean;    // Блокувати нові коментарі для закритих заявок
}
```

**State:**
- `comments: Comment[]` — підписка real-time
- `inputText: string`
- `sending: boolean`
- `cooldownActive: boolean`

---

## 3. AI-автомодерація коментарів

### 3.1 Cloud Function: `moderateComment`

**Тригер:** Callable function (викликається з клієнта після запису коментаря)

**Потік:**
```
Клієнт                          Cloud Function                    AI Provider
  │                                   │                               │
  │──── submitComment(text) ─────────>│                               │
  │                                   │── write to RTDB (pending) ──> │
  │                                   │── analyzeContent(text) ──────>│
  │                                   │<──── verdict ────────────────│
  │                                   │                               │
  │                                   │── if approve → status:visible │
  │                                   │── if review → status:pending  │
  │                                   │   + notify admins             │
  │                                   │── if suspicious → status:hidden│
  │<──── { status, commentId } ──────│                               │
```

**Альтернативний потік (AI недоступний / помилка):**
- Fallback: `status: "visible"` + флаг `aiModeration: null`
- Коментар публікується без перевірки (fail-open для UX)
- Лог в `moderation_failures/` для ручної перевірки

### 3.2 Інтеграція з існуючою AI-системою

Використовувати існуючу інфраструктуру з `functions/index.js`:
- Той самий `AI_PROVIDER` / `AI_MODEL` / `AI_API_KEY`
- Та сама rate-limiting та budget-tracking система
- Додати секцію `"requestComments"` до `SECTION_RULES` з правилами:
  - Модерувати: спам, образи, шахрайство, реклама, номери телефонів/посилання
  - Дозволяти: пропозиції допомоги, уточнення, запитання по заявці
  - Не блокувати: просту розмовну мову, суржик, сленг

### 3.3 Промпт для AI-модерації коментарів

Додати до `SECTION_RULES`:
```
requestComments: {
  label: "Коментарі до заявок",
  rules: `Це коментар до заявки про допомогу в спільноті.
    ДОЗВОЛЕНО: пропозиції допомоги, уточнюючі запитання, обговорення деталей.
    ЗАБОРОНЕНО: образи, спам, реклама, шахрайство, маніпуляції,
    персональні дані (номери телефонів, адреси), посилання на зовнішні ресурси.
    Контекст: люди допомагають одне одному, тон має бути доброзичливий.`,
  examples: [
    { text: "Привіт! Я можу допомогти, є досвід в електриці.", verdict: "approve" },
    { text: "Пиши мне 0501234567 я все решу", verdict: "review", flags: ["personal_data"] },
    { text: "Лох, сам разбирайся", verdict: "suspicious", flags: ["profanity", "harassment"] }
  ]
}
```

---

## 4. Перероблена бонусна система

### 4.1 Зміни констант (`bonusFunctions.js`)

```javascript
// Було:
const BONUS_AUTHOR_CLOSED = 5;

// Стало:
const BONUS_AUTHOR_CLOSED = 2;        // Автор закрив як вирішену
const BONUS_COMMENTER_HELPED = 5;     // Коментатори, які допомогли
```

### 4.2 Новий потік закриття заявки

**Крок 1: Автор натискає "Закрити як вирішену +2"**

Змінити текст кнопки з "+5" на "+2".

**Крок 2: Діалог вибору хелперів**

Після натискання — модальне вікно:
```
┌──────────────────────────────────┐
│  Хто допоміг вирішити?           │
├──────────────────────────────────┤
│  ☐ [Аватар] Олександр            │
│    "Я можу допомогти з ремон..." │
│  ☐ [Аватар] Марія               │
│    "Живу поруч, можу підвезт..." │
├──────────────────────────────────┤
│  [ Ніхто не допоміг ]            │  ← автор +2, ніхто +5
│  [    Підтвердити     ]          │  ← автор +2, обрані +5
└──────────────────────────────────┘
```

**Логіка:**
- Список = всі юзери, які залишили коментар зі `status: "visible"`
- Можна обрати 0..N хелперів
- "Ніхто не допоміг" → автор отримує +2, ніхто іншого
- "Підтвердити" з обраними → автор +2, кожен обраний +5
- Якщо коментарів 0 — модалку не показувати, просто закрити з +2

### 4.3 Cloud Function: `closeRequestWithBonus` (оновлена)

```javascript
// Вхідні дані:
// - requestId: string
// - helperUids: string[]     // ← НОВЕ: список UID хелперів

// Логіка:
// 1. Валідація: тільки автор може закрити
// 2. Перевірка: helperUids — тільки ті хто реально коментував
// 3. Закрити заявку (status: 'closed')
// 4. Нарахувати автору +2 (категорія 'help')
// 5. Нарахувати кожному helper +5 (категорія 'help')
// 6. Зберегти record в help_confirmations/
```

**Захист від накрутки:**
- `helperUids` не може містити `authorUid` (сам себе не обираєш)
- `helperUids` верифікуються через `request_comments/{requestId}` — тільки юзери з реальними visible коментарями
- Idempotency: повторне закриття ігнорується (existing check)
- Weekly limits застосовуються як для автора так і для хелперів

### 4.4 Нотифікації хелперам

При нарахуванні +5 хелперу — запис в `user_business_notifications/` (RTDB):
```json
user_business_notifications/
  {helperUid}/
    {notificationId}/
      type: "help_bonus"
      fromUid: "<authorUid>"
      requestId: "<requestId>"
      points: 5
      message: "Вам нараховано +5 за допомогу!"
      createdAt: <timestamp>
      read: false
```

**Примітка:** Система вже має інфраструктуру підписки `user_business_notifications/` (див. `useBusinessClaimSync.ts`). Розширити для `help_bonus` типу.

---

## 5. Фікс бага авторизації

### 5.1 Race condition `auth.currentUser`

**Файл:** `Detal-Zayavki.tsx`, функція `handleCloseSolved`

**Було:**
```typescript
if (!auth.currentUser || auth.currentUser.isAnonymous) {
  Alert.alert(text.ok, FUNCTION_ERROR_MESSAGES[language].auth_required);
  return;
}
```

**Стане:**
```typescript
// Використовувати userId з контексту/стейту замість прямого auth.currentUser
const user = auth.currentUser;
if (!user || user.isAnonymous) {
  // Спроба дочекатись auth state
  const freshUser = await new Promise<User | null>((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(u);
    });
    setTimeout(() => resolve(null), 3000); // 3s timeout
  });
  if (!freshUser || freshUser.isAnonymous) {
    Alert.alert(text.ok, FUNCTION_ERROR_MESSAGES[language].auth_required);
    return;
  }
}
```

---

## 6. Файли для створення / зміни

### Нові файли:
| Файл | Опис |
|------|------|
| `src/components/CommentSection.tsx` | UI компонент секції коментарів (list + input) |
| `src/components/HelperSelectionModal.tsx` | Модалка вибору хелперів при закритті |
| `src/services/commentService.ts` | CRUD + real-time підписка на коментарі |

### Файли для зміни:
| Файл | Зміни |
|------|-------|
| `src/screens/Detal-Zayavki.tsx` | Додати `<CommentSection/>`, модалка вибору хелперів, фікс auth race condition (п. 5.1) |
| `functions/bonusFunctions.js` | `BONUS_AUTHOR_CLOSED` 5→2, додати `BONUS_COMMENTER_HELPED=5`, оновити `closeRequestWithBonus(requestId, helperUids)` |
| `functions/index.js` | Cloud function `moderateComment(requestId, text)`, секція `requestComments` в `SECTION_RULES`, нотифікація в `user_business_notifications/` |
| `database.rules.json` | Додати правила для `request_comments/` |
| `src/types/app.ts` | Додати типи `Comment`, `CommentModeration`, `HelperSelection` |
| `src/i18n/translations.ts` | Додати переклади (ua/ru/en) для коментарів, модалки, кнопок |
| `src/hooks/useBusinessClaimSync.ts` | Розширити підписку для `help_bonus` нотифікацій (або окремий хук) |

---

## 7. Етапи реалізації

| # | Етап | Залежності | Пріоритет |
|---|------|-----------|-----------|
| 1 | Фікс auth race condition (5.1) | — | **Критичний** |
| 2 | RTDB структура + security rules для коментарів | — | High |
| 3 | Типи `Comment`, `CommentModeration` в `src/types/app.ts` | 2 | High |
| 4 | `commentService.ts` — CRUD + real-time підписка | 2, 3 | High |
| 5 | Переклади в `src/i18n/translations.ts` | — | High |
| 6 | `CommentSection.tsx` — UI компонент | 3, 4, 5 | High |
| 7 | Cloud function `moderateComment` + AI правила | 2 | High |
| 8 | Інтеграція `CommentSection` в `Detal-Zayavki.tsx` | 1, 6 | High |
| 9 | `HelperSelectionModal.tsx` — модалка вибору | 3, 5 | High |
| 10 | Оновлення `bonusFunctions.js` (4.1–4.3) | — | High |
| 11 | Інтеграція модалки + nova логіка закриття в `Detal-Zayavki.tsx` | 8, 9, 10 | High |
| 12 | Нотифікації хелперам + розширення `useBusinessClaimSync` | 10 | Medium |
| 13 | Тестування + QA | Всі | High |

---

## 8. Acceptance Criteria

1. [ ] Авторизований юзер бачить секцію коментарів під заявкою
2. [ ] Можна написати коментар (3–500 символів)
3. [ ] Коментар проходить AI-модерацію перед публікацією
4. [ ] `approve` → відразу visible; `review` → pending (видно тільки автору); `suspicious` → hidden
5. [ ] AI fallback: якщо AI недоступний — коментар публікується (fail-open)
6. [ ] Cooldown 30 секунд між коментарями
7. [ ] Закриті заявки — коментарі тільки для читання
8. [ ] Неавторизовані юзери бачать коментарі але не можуть писати
9. [ ] Автор заявки відмічений бейджом "Автор" в коментарях
10. [ ] Кнопка "Закрити як вирішену +2" (замість +5)
11. [ ] При закритті — модалка вибору хелперів (зі списку коментаторів)
12. [ ] "Ніхто не допоміг" → автор +2, ніхто +5
13. [ ] Обрані хелпери → кожен +5 (верифікація що реально коментували)
14. [ ] Автор не може обрати себе як хелпера
15. [ ] Хелпери отримують нотифікацію про +5
16. [ ] Weekly limits застосовуються до бонусів хелперів
17. [ ] Subscription multiplier застосовується до бонусів хелперів
18. [ ] Auth race condition пофікшено — "Необхідно авторизуватись" не виникає для авторизованих
19. [ ] Real-time оновлення коментарів (без перезавантаження)
20. [ ] Security rules: тільки auth && !banned можуть писати
21. [ ] Cloud function валідує helperUids через request_comments
22. [ ] Повторне закриття заявки ігнорується (idempotency)
23. [ ] Коментарі до неіснуючої/чужої заявки — error handling
24. [ ] Переклади UI (uk/ru/en) для всіх нових текстів
25. [ ] Адмін-панель: модеровані коментарі видно в секції requestComments
26. [ ] Лічильник символів при > 400
27. [ ] Pending коментар блокує input до результату модерації

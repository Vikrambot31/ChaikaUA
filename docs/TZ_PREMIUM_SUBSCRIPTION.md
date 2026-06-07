# ТЕХНІЧНЕ ЗАВДАННЯ: Premium Підписка "Чайка Life"

**Версія:** 1.0
**Дата:** 2026-06-07
**Продукт:** Chaika Life (React Native / Expo / Firebase)
**Тариф:** 39 грн/міс — **⭐ Premium Чайка Life**

---

## 1. ОПЛАТА — ВИБІР ПЛАТІЖНОЇ СИСТЕМИ

### Рекомендація: Google Play Billing + Apple In-App Purchase (IAP)

| Система | Комісія | Переваги для українського законодавства |
|---------|---------|----------------------------------------|
| **Google Play Billing + Apple IAP** | 15-30% | ✅ ФОП не потрібен для старту — Google/Apple є платіжним агентом (merchant of record). Вони самі звітують про ПДВ, емітують чеки. Ви отримуєте payout на рахунок уже "чистими" після їх комісії. |
| WayForPay | ~3-5% | Потрібен ФОП, договір з еквайрингом, щомісячне звітування |
| Fondy | ~3-5% | Аналогічно WayForPay |

**Чому IAP найпростіше:**
1. Google/Apple виступають **продавцем запису (merchant of record)** — вони відповідають за фіскалізацію, ПДВ, повернення. Для стартапу це знімає 90% юридичного навантаження.
2. Не потрібно реєструвати платіжний шлюз, проходити PCI-DSS, укладати договори з банками.
3. Підписка автоматично продовжується через магазин додатків — не потрібно власної інфраструктури для recurring-платежів.
4. Користувачі вже мають платіжний метод у Google/Apple — конверсія вища.

**Недолік:** 15-30% комісії. Але 39 грн × 0.70 = 27.3 грн/міс чистими — для покриття серверів це прийнятно на старті.

### Альтернатива (якщо ФОП вже є): WayForPay
- Підтримує підписки (recurring)
- Український платіжний шлюз
- Можна інтегрувати через власний бекенд + Firebase Extension
- Комісія 3-5%
- Потрібен ФОП + договір

### Архітектура оплати (обрано: Google Play Billing)

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│  Клієнт     │────▶│  Google Play │────▶│  Firebase │
│  (RN App)   │     │  Billing     │     │  Functions│
│             │◀────│  (IAP)       │◀────│  (Webhook)│
└─────────────┘     └──────────────┘     └───────────┘
                                               │
                                               ▼
                                        ┌───────────┐
                                        │  Firestore │
                                        │  RTDB      │
                                        └───────────┘
```

**Flow:**
1. Користувач натискає "Купити Premium" → RN відкриває Google Play Billing flow
2. Google Play проводить платіж, повертає `purchaseToken` + `productId`
3. Додаток надсилає `purchaseToken` у Firebase Cloud Function
4. Cloud Function верифікує токен через Google Play Developer API
5. Якщо валідно — записує підписку в Firebase RTDB, оновлює `user.subscription`
6. Клієнт отримує відповідь, `subscriptionSlice` оновлює state

---

## 2. ЩО ВХОДИТЬ В PREMIUM (39 грн/міс)

### 2.1. Доступ до екрану "Люди Чайки" (`Lyudi-Chayki.tsx`)

**Free:** Екран показується, але контактні дані приховані. Можна переглядати список, але не писати в чат і не бачити телефон.
**Premium:** Повний доступ — можна писати, бачити контакти, надсилати запити.

**Де перевіряти:**
- У `Lyudi-Chayki.tsx` перед показом кнопки "Написати" / "Зателефонувати"
- У `ContactReasonModal` при спробі відправити запит на контакт

### 2.2. Ліміти на заявки, оголошення, фото

| Дія | Free | Premium |
|-----|------|---------|
| **Куплю-Продам** (активні оголошення) | макс. 2 активних | макс. 5 |
| **Заявки** (допомога сусідам) | макс. 3 активних | макс. 6 |
| **Фото для душі** (завантаження/день) | макс. 3 фото/день | макс. 6 |
| **Фото району** (завантаження/день) | макс. 5 фото/день | макс. 10 |
| **Пошук роботи** (активні вакансії) | макс. 1 активна | макс. 3 |

**Де перевіряти ліміти:**
- `CreateBuySellScreen.tsx` — перед створенням оголошення
- `Forma-Zayavki.tsx` — перед створенням заявки
- `Zagruzka-Foto.tsx` — перед завантаженням фото
- `PhotoUploadScreen` — перед завантаженням

**Логіка перевірки:**
```
function checkLimit(userId, category, limit): boolean {
  if (selectIsPremium) return true // безліміт
  const count = countActiveItems(userId, category)
  return count < limit
}
```

### 2.3. Нарахування промо-кредитів та бонусів

**Free:** Стандартне нарахування (базовий множник x1)
**Premium:** Прискорене нарахування (множник x1.5)

**Де зміни:**
- `functions/bonusFunctions.js` — у логіці нарахування бонусів додати перевірку `isPremiumUser(uid)` і застосувати множник
- `functions/promotionFunctions.js` — знижка 10% на купівлю промо-позицій для Premium

**Додатково:**
- Premium-користувачі отримують **+10 промо-кредитів щомісяця** як бонус підписки

### 2.4. Пріоритетна підтримка

**Free:** Стандартна черга підтримки
**Premium:** Пріоритетна обробка заявок (тег `priority: premium` у заявці в Firebase)

**Де зміни:**
- При створенні заявки в `Forma-Zayavki.tsx` — якщо Premium, додавати поле `supportPriority: 'high'`
- У `functions/index.js` у функції `getRequestPriorityParts` — Premium-заявки отримують `priorityNumber: '00'` (найвищий)

### 2.5. Допомога в розміщенні бізнесу (Садики, Школи, Салони)

**Free:** Можна переглядати списки закладів
**Premium:** Пріоритетне розміщення / публікація бізнесу в категоріях:
- `Vse-Dlya-Detey.tsx` (дитячі садки, школи, гуртки)
- `Salony-Krasoty.tsx` (салони краси)
- `Sport-Na-Chayke.tsx` (спортивні секції)

**Free:** Подання заявки на додавання бізнесу — обробка протягом 7 днів
**Premium:** Подання заявки — обробка протягом 24 годин + безплатне розміщення в ТОП на 3 дні раз на місяць

---

## 3. ЗМІНИ В КОДІ (ПО-ФАЙЛОВО)

### 3.1. Новий хук: `usePremiumLimits`

**Файл:** `src/hooks/usePremiumLimits.ts`

Призначення: централізована перевірка лімітів для Free-користувачів.

```typescript
interface Limits {
  buySellMax: number;
  requestsMax: number;
  soulPhotosPerDay: number;
  districtPhotosPerDay: number;
  jobsMax: number;
}

export function usePremiumLimits() {
  const isPremium = useSelector(selectIsPremium);

  const limits: Limits = isPremium
    ? { buySellMax: 5, requestsMax: 6, soulPhotosPerDay: 6, districtPhotosPerDay: 10, jobsMax: 3 }
    : { buySellMax: 2, requestsMax: 3, soulPhotosPerDay: 3, districtPhotosPerDay: 5, jobsMax: 1 };

  const checkLimit = useCallback(async (category: keyof Limits, currentCount: number): Promise<boolean> => {
    const limit = limits[category];
    return currentCount < limit;
  }, [limits]);

  return { isPremium, limits, checkLimit };
}
```

### 3.2. Новий компонент: `PremiumGate`

**Файл:** `src/components/PremiumGate.tsx`

Призначення: компонент-обгортка, який показує контент або преміум-заглушку.

```typescript
interface PremiumGateProps {
  required: boolean;        // чи потрібен Premium
  children: React.ReactNode;
  fallback?: React.ReactNode; // що показати замість контенту
  messageKey?: string;      // ключ для тексту-заглушки
}
```

**Логіка:**
- Якщо `required = false` або `isPremium = true` → показує `children`
- Інакше → показує `fallback` або стандартний PremiumPrompt (кнопка "Оформити Premium")

### 3.3. Зміна `subscriptionSlice.ts`

**Файл:** `src/redux/slices/subscriptionSlice.ts`

Додати:
- Екшен `setPremiumLimits` (якщо ліміти змінюються)
- Селектори для перевірки конкретних лімітів

### 3.4. Зміна `Podpiska-Premium.tsx` (екран підписки)

**Файл:** `src/screens/Podpiska-Premium.tsx`

Переробити з placeholder-екрана на реальний:

- Список переваг Premium з іконками
- Кнопка "Оформити Premium — 39 грн/міс"
- Інтеграція з Google Play Billing (react-native-iap)
- Статус поточної підписки (активна / неактивна)
- Кнопка "Скасувати підписку" (керування через Google Play)

### 3.5. Зміни в екранах для лімітів

**`CreateBuySellScreen.tsx` (Куплю-Продам):**
```typescript
const { isPremium, limits } = usePremiumLimits();
const activeCount = await countActiveBuySell(userId);
if (!isPremium && activeCount >= limits.buySellMax) {
  showLimitReachedAlert(/* Купівля Premium */);
  return;
}
```

**`Forma-Zayavki.tsx` (Нова заявка):** — аналогічна логіка для requestsMax

**`Zagruzka-Foto.tsx` / `PhotoUploadScreen` (Фото для душі, Фото району):**
- Підрахунок фото, завантажених за сьогодні
- Якщо ліміт вичерпано — показувати Premium Prompt

### 3.6. Зміна `Lyudi-Chayki.tsx`

- Обернути блок з контактними даними (телефон, кнопка "Написати") в `<PremiumGate required>`
- Показувати розмитий текст або іконку замочка для Free

### 3.7. Cloud Functions: перевірка Premium на сервері

**`functions/index.js`:** Додати функції:
- `verifyPremiumSubscription(uid)` — перевіряє статус підписки в RTDB
- `getUserPremiumStatus` — callable функція для клієнта
- `applyPremiumBenefits` — нарахування щомісячних бонусів Premium

**`functions/promotionFunctions.js`:**
- У функціях `checkExpiringSubscriptions` / `autoRenewSubscriptions` — оновити логіку для роботи з реальними підписками (зараз працює з promo-підписками, треба адаптувати)

### 3.8. Firebase RTDB структура

```json
{
  "premium_subscriptions": {
    "<uid>": {
      "plan": "premium",
      "status": "active" | "expired" | "cancelled",
      "startedAt": "<ISO>",
      "expiresAt": "<ISO>",
      "autoRenew": true,
      "platform": "android" | "ios",
      "purchaseToken": "<token>",
      "productId": "premium_monthly",
      "originallyFromIAP": true
    }
  },
  "premium_benefits": {
    "<uid>": {
      "bonusCreditsGivenThisMonth": false,
      "freePromotionUsedThisMonth": false,
      "lastPayoutAt": "<ISO>"
    }
  }
}
```

### 3.9. Firebase Cloud Functions: нова функція верифікації IAP

**`functions/iapHandler.js`** (новий файл):

```javascript
// verifyIapPurchase — приймає purchaseToken від Google Play
// викликає Google Play Developer API для верифікації
// якщо валідно — записує підписку в premium_subscriptions
// повертає { ok: true, subscription: { plan, expiresAt } }
```

---

## 4. ПОСЛІДОВНІСТЬ РЕАЛІЗАЦІЇ (MVP — 2 тижні)

### Етап 1: Інфраструктура (День 1-3)
- [ ] Додати `react-native-iap` (бібліотека для In-App Purchase)
- [ ] Створити товар "premium_monthly" в Google Play Console
- [ ] Налаштувати Google Play Developer API + сервісний акаунт
- [ ] Створити `functions/iapHandler.js` з верифікацією покупки
- [ ] Додати RTDB правила для `premium_subscriptions`

### Етап 2: Екран підписки (День 4-6)
- [ ] Переписати `Podpiska-Premium.tsx` — дизайн зі списком переваг
- [ ] Інтегрувати Google Play Billing flow (покупка)
- [ ] Після успішної покупки → виклик Firebase Function verify → оновлення `subscriptionSlice`
- [ ] Додати перевірку статусу при запуску додатка (чи підписка не expired)

### Етап 3: Ліміти та гейти (День 7-10)
- [ ] Створити `usePremiumLimits.ts` хук
- [ ] Створити `PremiumGate.tsx` компонент
- [ ] Додати ліміти в `CreateBuySellScreen.tsx`
- [ ] Додати ліміти в `Forma-Zayavki.tsx`
- [ ] Додати ліміти в `Zagruzka-Foto.tsx`
- [ ] Додати Premium-гейт в `Lyudi-Chayki.tsx`

### Етап 4: Бонуси та підтримка (День 11-14)
- [ ] Оновити `bonusFunctions.js` — множник x1.5 для Premium
- [ ] Додати щомісячне нарахування +10 промо-кредитів для Premium (Cloud Function + Schedule)
- [ ] Додати `supportPriority: 'high'` для Premium у Forma-Zayavki
- [ ] Оновити `promotionFunctions.js` — знижка 10% на промо для Premium
- [ ] Додати безплатне ТОП-розміщення на 3 дні раз на місяць для Premium

---

## 5. СХЕМА ДАНИХ (КОРОТКО)

### Клієнтський State (Redux)

```typescript
interface SubscriptionState {
  plan: 'free' | 'premium' | 'premium_plus';
  expiresAt: string | null;
  activatedAt: string | null;
  loading: boolean;
  iapProducts: Product[];  // список товарів з Google Play
}
```

### Серверний State (Firebase RTDB)

```
/premium_subscriptions/{uid}
  plan: string
  status: string
  startedAt: string
  expiresAt: string
  autoRenew: boolean
  platform: string
  purchaseToken: string

/premium_benefits/{uid}
  bonusCreditsGivenThisMonth: boolean
  freePromotionUsedThisMonth: boolean
  lastPayoutAt: string
```

---

## 6. ЮРИДИЧНІ АСПЕКТИ (ДЛЯ УКРАЇНИ)

| Аспект | Як вирішується з Google Play IAP |
|--------|----------------------------------|
| **ПДВ** | Google сплачує ПДВ як імпортер послуг. Користувач бачить чек від Google |
| **ФОП** | Не обов'язково на старті (Google виступає посередником). Але для отримання коштів на рахунок ФОП краще мати |
| **Повернення коштів** | Через Google Play (користувач звертається в Google, вони вирішують) |
| **Звітність** | Google надає звіти про продажі. Доход відображається як "royalty" або "комісійна винагорода" |
| **Договір з користувачем** | Потрібна публічна оферта в додатку (екран підписки) |

---

## 7. РИЗИКИ ТА ПОМ'ЯКШЕННЯ

| Ризик | Ймовірність | Пом'якшення |
|-------|-------------|-------------|
| Google Play відхиляє додаток через IAP | низька | Використовувати Google Play Billing Library, дотримуватись політики |
| Користувачі скаржаться на ціну | середня | Додати пробний період 7 днів |
| Технічні проблеми з верифікацією покупки | низька | Детальне логування, fallback-перевірка через Firebase |
| Люди видають себе за Premium (підробка) | низька | Усі перевірки на сервері (Firebase Functions + RTDB) |

---

## 8. ПОКАЗНИКИ УСПІХУ (KPI)

- Конверсія Free → Premium: ціль >3% від активних користувачів
- Середній дохід на користувача (ARPU): ціль >5 грн/міс
- Churn rate (відтік Premium): ціль <10% на місяць
- Час до першої покупки після встановлення: ціль <30 днів

---

*Документ створено на основі аналізу коду Chaika Life (React Native + Firebase).*

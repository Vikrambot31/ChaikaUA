# Техническое задание: Аудит системы бонусов, подписок и Business Plus

> **Версия:** 2.0
> **Дата:** 2026-06-10
> **Методология:** Сценарный аудит — каждый пункт описывает конкретную ситуацию, ожидаемое поведение и что проверять в коде.

---

## 0. Матрица приоритетов

| Приоритет | Критерий | Примеры |
|-----------|----------|---------|
| **P0 — Critical** | Потеря денег, обход оплаты, накрутка бонусов, несанкционированный доступ | Клиент пишет `plan: 'business_plus'` напрямую в RTDB; двойное начисление бонусов |
| **P1 — High** | Функция не работает, данные не обновляются, подписка не истекает | `checkExpiry` не вызывается; триал активируется повторно |
| **P2 — Medium** | UX-проблемы, задержки, отсутствие индикаторов, рассинхрон состояния | Баланс не обновляется без перезагрузки; нет тоста об ошибке |
| **P3 — Low** | Косметика, локализация, мелкие улучшения | Hardcoded English строки; отсутствие анимаций |

---

## 1. Система бонусов

### Карта файлов

| Файл | Назначение |
|------|-----------|
| `src/services/bonusService.ts` (589 строк) | Все типы данных, Cloud Function callable, RTDB-подписки |
| `src/services/bonusQueue.ts` (264 строки) | Offline-очередь для бонусных действий при отсутствии auth |
| `src/screens/BonusWalletScreen.tsx` (681 строка) | Кошелёк: баланс, прогресс, история, промо-акции |
| `src/screens/BonusPromotionPurchaseScreen.tsx` (666 строк) | Покупка промо-размещения за бонусы/кредиты |
| `src/screens/PromoCreditsTopupScreen.tsx` (642 строки) | Покупка промо-кредитов (4 пакета: 100/500/1000/3000) |
| `src/screens/PromoCreditsAdminScreen.tsx` (546 строк) | Админ: управление топапами и модерация промо |

### RTDB-пути

| Путь | Данные |
|------|--------|
| `user_bonuses/{uid}` | total, available, earned.weeklyTotal, earned.weekKey, badge, spent, updatedAt |
| `promo_credits/{uid}` | balance, lifetime, spent.total |
| `bonus_transactions/{uid}/{txId}` | type (earn/spend/topup), currency (trust/promo), points, balanceAfter, createdAt |
| `bonus_promotions/{promotionId}` | uid, screen, targetId, status, expiresAt, moderationStatus |

### Cloud Functions (бонусы)

| Функция | Назначение |
|---------|-----------|
| `awardHelpRespondBonus(requestId)` | +бонус за отклик на заявку |
| `confirmHelperForRequest(requestId, helperUid)` | +бонус за подтверждение помощника |
| `closeRequestWithBonus(requestId)` | +бонус заявителю при закрытии |
| `awardGratitudeBonus(requestId, helperUid)` | +бонус за благодарность |
| `awardProfileThanksBonus(targetUid)` | +3 за "Спасибо" на профиле |
| `awardDailyLoginBonus()` | ежедневный бонус за вход |
| `awardMilestoneBonus(milestone)` | profile_complete, first_request, first_response |
| `purchaseBonusPromotion({promoType, duration, targetId})` | покупка промо-размещения |
| `adminGrantPromoCredits({targetUid, amount, reason})` | админ начисляет кредиты |
| `adminModeratePromotion({promotionId, action, reason?})` | approve/reject промо |

### Константы

```
BONUS_CAPS: invites=5000, likes=1000, help=2000, total=8000
WEEKLY_FREE_LIMIT_FALLBACK = 250
Badges: newcomer(0) → good_neighbor(100) → active_resident(500) → guardian(2000) → ambassador(5000)
Promo-кредиты (пакеты): 100=20₴, 500=90₴, 1000=170₴, 3000=450₴
```

---

### 1.1 Сценарии начисления бонусов [P0–P1]

#### SC-B01: Двойное начисление при повторном нажатии
- **Ситуация:** Пользователь быстро нажимает "Откликнуться" дважды → два вызова `awardHelpRespondBonus`
- **Ожидание:** Второй вызов возвращает `already_responded`, бонус не удваивается
- **Проверить:** Cloud Function использует транзакцию или идемпотентную проверку? Файл `functions/index.js`
- **Проверить:** Кнопка блокируется (disabled) после первого нажатия в `Detal-Zayavki.tsx`?

#### SC-B02: Начисление при отсутствии auth (offline queue)
- **Ситуация:** Приложение только запустилось (0–3 сек), auth ещё не готов, пользователь нажимает кнопку
- **Ожидание:** Действие сохраняется в `bonusQueue` (AsyncStorage `@bonus_queue_v1`), выполняется после auth
- **Проверить:** `tryBonusOrEnqueue()` в `bonusQueue.ts` — корректно ли определяет "auth не готов"?
- **Проверить:** `drainBonusQueue()` вызывается в `onAuthStateChanged`?
- **Проверить:** Дедупликация через `JSON.stringify()` — сломается ли при разном порядке ключей в payload?
- **Проверить:** TTL = 24 часа, maxRetries = 3, maxQueueSize = 20 — достаточно ли? Что если очередь переполнена?

#### SC-B03: Превышение недельного лимита (250 очков)
- **Ситуация:** Пользователь заработал 248 очков, следующее действие даёт +5
- **Ожидание:** Начисляется только 2 (до лимита) ИЛИ начисляется полные 5 (лимит — soft cap) ИЛИ отказ
- **Проверить:** Где проверяется `weeklyTotal` — на клиенте или в Cloud Function? Если только на клиенте — это обход (P0)
- **Проверить:** Как сбрасывается `weekKey`? Формат строки? Совпадает ли с серверным временем?
- **Проверить:** `WEEKLY_FREE_LIMIT_FALLBACK = 250` захардкожен в `BonusWalletScreen.tsx:32` — приходит ли реальный лимит с сервера?

#### SC-B04: Превышение общего лимита (BONUS_CAPS.total = 8000)
- **Ситуация:** У пользователя 7990 очков, заработал ещё 20
- **Ожидание:** Начисление ограничено до 8000 ИЛИ отказ с сообщением
- **Проверить:** `BONUS_CAPS` в `bonusService.ts` — используется ли серверно или только для UI?
- **Проверить:** Категорийные лимиты (invites=5000, likes=1000, help=2000) — проверяются ли серверно?

#### SC-B05: Начисление milestone-бонуса повторно
- **Ситуация:** Пользователь заходит в `EditProfileScreen`, заполняет профиль повторно → `awardMilestoneBonus('profile_complete')`
- **Ожидание:** Milestone начисляется только один раз
- **Проверить:** Cloud Function хранит флаг `milestones_awarded/{uid}/{milestone}`?

#### SC-B06: "Спасибо +3" на чужом профиле — самому себе
- **Ситуация:** Пользователь каким-то образом вызывает `awardProfileThanksBonus(ownUid)`
- **Ожидание:** Cloud Function отклоняет (нельзя благодарить себя)
- **Проверить:** UI скрывает кнопку для своего профиля в `ViewUserProfileScreen.tsx`?
- **Проверить:** Cloud Function проверяет `context.auth.uid !== targetUid`?

#### SC-B07: Ежедневный бонус за вход — накрутка через смену часового пояса
- **Ситуация:** Пользователь меняет timezone устройства → вызывает `awardDailyLoginBonus()` дважды
- **Ожидание:** Сервер использует UTC/серверное время, клиентское время игнорируется
- **Проверить:** `dailyKey` формируется на сервере (Cloud Function) или на клиенте?

### 1.2 Сценарии трат бонусов (промо-размещение) [P0–P1]

#### SC-B10: Покупка промо с недостаточным балансом
- **Ситуация:** Баланс 100 trust, промо стоит 120
- **Ожидание:** Ошибка `errorInsufficientFunds`, баланс не меняется
- **Проверить:** Проверка атомарна (транзакция) — нет ли race condition между проверкой и списанием?

#### SC-B11: Покупка промо для чужой карточки
- **Ситуация:** Пользователь A пытается продвигать карточку пользователя B
- **Ожидание:** Ошибка `errorOwnCard` ("можно продвигать только свою карточку")
- **Проверить:** Cloud Function `purchaseBonusPromotion` проверяет ownership по `context.auth.uid`?

#### SC-B12: Одновременная покупка двух промо на одну карточку
- **Ситуация:** Два быстрых нажатия → два вызова `purchaseBonusPromotion` с одним `targetId`
- **Ожидание:** Второй вызов → `errorAlreadyActive`
- **Проверить:** Атомарная проверка "уже есть активное промо" в транзакции?

#### SC-B13: Промо куплено, но на модерации — деньги списаны
- **Ситуация:** `purchaseBonusPromotion` возвращает `moderationStatus: 'pending'`, очки уже списаны
- **Ожидание:** При reject — очки возвращаются (`promotion_write_failed_funds_returned`)
- **Проверить:** Cloud Function `adminModeratePromotion('reject')` возвращает очки? Создаётся транзакция `type: 'earn'` с refund?
- **Проверить:** Если промо истекло пока было на модерации — что происходит?

#### SC-B14: Промо истекло — карточка возвращается в обычную позицию
- **Ситуация:** `expiresAt` прошёл для промо в `bonus_promotions/{id}`
- **Ожидание:** `subscribeActiveBonusPromotions` фильтрует по `expiresAt > now`, карточка падает вниз
- **Проверить:** Есть ли scheduled function для очистки истёкших промо? Или только client-side фильтр?

### 1.3 Промо-кредиты (покупка за реальные деньги) [P0]

#### SC-B20: Оплата прошла, кредиты не начислены
- **Ситуация:** Пользователь оплатил через поддержку, админ не увидел тикет
- **Ожидание:** Тикет создаётся в `ad_tickets`, отображается в `PromoCreditsAdminScreen` (таб "Topups")
- **Проверить:** `PromoCreditsTopupScreen.tsx` — создаётся ли тикет сразу или после подтверждения оплаты?
- **Проверить:** Есть ли уведомление админу о новом тикете?

#### SC-B21: Админ начисляет кредиты дважды
- **Ситуация:** Админ нажимает "Grant Credits" дважды по одному тикету
- **Ожидание:** Второе нажатие блокируется или тикет помечается как обработанный
- **Проверить:** `adminGrantPromoCredits` — есть ли проверка `ticketId` на уникальность?
- **Проверить:** Кнопка disabled после первого нажатия в `PromoCreditsAdminScreen.tsx`?

#### SC-B22: Refund — возврат денег после начисления кредитов
- **Ситуация:** Пользователь потребовал refund, но кредиты уже потрачены на промо
- **Ожидание:** Нет автоматического механизма refund (ручной процесс)
- **Проверить:** Документирован ли процесс? Что если баланс отрицательный после списания?

### 1.4 Бонусный кошелёк — UI [P2–P3]

#### SC-B30: Кошелёк при `bonuses === null` / `promoCredits === undefined`
- **Ситуация:** Новый пользователь, узлы `user_bonuses/{uid}` и `promo_credits/{uid}` не существуют в RTDB
- **Ожидание:** Отображаются нули, экран не падает
- **Проверить:** `subscribeMyBonuses` callback — обрабатывает ли `snapshot.val() === null`?

#### SC-B31: Прогресс-бар недельного лимита при смене недели
- **Ситуация:** Неделя сменилась, `weekKey` обновился, `weeklyTotal` сбросился
- **Ожидание:** Прогресс-бар показывает 0/250, не кэширует старое значение
- **Проверить:** `BonusWalletScreen.tsx` — зависит ли от Redux persist или от realtime listener?

#### SC-B32: История транзакций обрезается до 12
- **Ситуация:** У пользователя 50 транзакций
- **Ожидание:** Показаны последние 12 (sorted DESC by createdAt)
- **Проверить:** `subscribeMyBonusTransactions(callback, maxItems=30)` vs UI limit 12 — нужна ли пагинация "показать ещё"?

#### SC-B33: Badge-прогресс не обновляется в реальном времени
- **Ситуация:** Пользователь набрал 100 очков → должен стать `good_neighbor`
- **Ожидание:** Бейдж обновляется мгновенно (realtime listener)
- **Проверить:** Badge обновляется на сервере (Cloud Function) или вычисляется на клиенте?
- **Проверить:** `Profil-Polzovatelya.tsx` — откуда берёт badge?

### 1.5 Отсутствие Redux-слайса для бонусов [P2]

#### SC-B40: Рассинхрон между экранами
- **Ситуация:** Пользователь на `BonusWalletScreen` видит баланс 500, переходит на `ViewUserProfileScreen` → показывается badge для 450
- **Ожидание:** Данные консистентны
- **Проверить:** Бонусы живут ТОЛЬКО в component state (useState + useEffect subscribers) — нет централизованного Redux. Два экрана подписываются на один путь RTDB → получают одинаковые данные? Или один кэширует?

---

## 2. Система подписок (Premium / Premium Plus)

### Карта файлов

| Файл | Назначение |
|------|-----------|
| `src/redux/slices/subscriptionSlice.ts` (261 строка) | Redux: plan, status, expiresAt, trialUsed; селекторы, нормализация |
| `src/hooks/useSubscriptionSync.ts` | Realtime listener на `user_subscription/{uid}`, синхронизация с Redux |
| `src/hooks/usePremiumLimits.ts` | Лимиты по плану: buySellMax, requestsMax, soulPhotosPerDay и т.д. |
| `src/screens/Podpiska-Premium.tsx` | UI подписки: статус, триал, оплата через поддержку |
| `src/components/PremiumGate.tsx` | Гейт: блокирует контент если нет Premium |
| `src/components/PremiumActivatedModal.tsx` | Модалка-празднование при активации Premium |
| `admin-panel/src/pages/PremiumPage.tsx` | Админ: список подписчиков, активация, отмена |
| `admin-panel/src/services/premiumAdminService.ts` | Сервис: CRUD подписок, поиск пользователей |
| `functions/index.js` | Cloud Functions: активация, отмена, проверка истечения, напоминания |

### RTDB-пути

| Путь | Данные |
|------|--------|
| `user_subscription/{uid}` | plan, status, expiresAt, activatedAt, trialUsed, paymentMethod, notes |
| `users/{uid}/subscription` | Кэш: { plan, expiresAt } (синхронизируется при изменении) |
| `stats/free_premium_counter` | Глобальный счётчик бесплатных активаций (лимит 500) |

### Cloud Functions (подписки)

| Функция | Назначение |
|---------|-----------|
| `getUserSubscription()` | Получить текущую подписку, автомарк expired |
| `activateTrialPremium()` | Бесплатный 30-дневный триал (однократно, транзакция) |
| `activatePromoPremium(plan)` | Промо-активация (лимит 500 глобально) |
| `activatePremiumManual(uid, months, notes)` | Админ: ручная активация (продлевает если активна) |
| `cancelUserSubscription()` | Пользователь отменяет подписку |
| `cancelPremiumSubscription(uid)` | Админ: отмена подписки |
| `checkExpiredSubscriptions()` | Scheduled: daily 9:00 Europe/Kiev — маркирует expired |
| `sendSubscriptionReminders()` | Scheduled: daily 10:00 — push за 7, 3, 1, 0 дней до истечения |
| `getAllPremiumSubscriptions()` | Админ: список всех не-free подписок |

### Лимиты Premium

```
              Free    Premium
buySellMax:    2       5
requestsMax:   3       6
soulPhotos:    3       6
districtPhotos:5       10
jobsMax:       1       3
```

---

### 2.1 Сценарии активации подписки [P0–P1]

#### SC-S01: Двойная активация триала
- **Ситуация:** Пользователь нажимает "Попробувати безкоштовно" → запрос идёт медленно → нажимает ещё раз
- **Ожидание:** `activateTrialPremium` использует транзакцию, второй вызов → `already-exists`
- **Проверить:** `functions/index.js` — transaction на `user_subscription/{uid}` проверяет `trialUsed`?
- **Проверить:** `Podpiska-Premium.tsx` — кнопка блокируется (loading state) при нажатии?

#### SC-S02: Триал после истёкшего триала
- **Ситуация:** Пользователь использовал триал месяц назад, он истёк → нажимает "Триал" снова
- **Ожидание:** Показывается "Триал вже використано", кнопка триала скрыта/заблокирована
- **Проверить:** `selectTrialUsed()` из Redux → UI условие в `Podpiska-Premium.tsx`
- **Проверить:** Cloud Function тоже проверяет (defence in depth)?

#### SC-S03: `activatePromoPremium` — превышение глобального лимита 500
- **Ситуация:** 499 пользователей активировали промо, два пользователя нажимают одновременно
- **Ожидание:** Только один получает (транзакция на `stats/free_premium_counter`), второй — ошибка
- **Проверить:** `functions/index.js` — используется ли `transaction` для инкремента счётчика?
- **Проверить:** Что видит пользователь при ошибке? Есть ли catch в UI?

#### SC-S04: Ошибка сети при активации триала
- **Ситуация:** `callActivateTrialPremium()` упал с ошибкой (timeout / network error)
- **Ожидание:** Пользователю показывается тост об ошибке, можно попробовать снова
- **Проверить:** `Podpiska-Premium.tsx` — есть ли `try/catch` вокруг вызова? Есть ли тост?
- **Проверить:** Если запрос дошёл до сервера, но ответ не вернулся — триал активирован, но UI не обновился

#### SC-S05: Админ активирует Premium пользователю, у которого уже есть Business Plus
- **Ситуация:** У пользователя `plan: 'business_plus'`, админ активирует `premium` через `activatePremiumManual`
- **Ожидание:** Что приоритетнее? Перезаписывается? Или ошибка?
- **Проверить:** `activatePremiumManual` — проверяет ли текущий plan? Предупреждает ли админа?
- **Проверить:** `PremiumPage.tsx` — показывает ли текущую подписку перед активацией?

### 2.2 Сценарии истечения подписки [P0–P1]

#### SC-S10: Подписка истекает, но `checkExpiredSubscriptions` не запустился
- **Ситуация:** Scheduled function упала или задержалась → подписка `expiresAt` в прошлом, но `status` всё ещё `active`
- **Ожидание:** Клиент сам проверяет `expiresAt > now` через `selectIsPremium()` → возвращает false
- **Проверить:** `subscriptionSlice.ts` — `selectIsPremium` проверяет И `status` И `expiresAt`? Или только `status`?
- **Проверить:** `checkExpiry()` reducer — вызывается при старте приложения? При `AppState.change` к foreground?

#### SC-S11: Подписка истекла — лимиты сбрасываются, но контент уже создан
- **Ситуация:** У пользователя было 5 объявлений (Premium limit), подписка истекла (Free limit = 2)
- **Ожидание:** Существующие 5 остаются, новые нельзя создать до лимита 2
- **Проверить:** `usePremiumLimits().checkLimit(category, currentCount)` — проверяет текущий план, не удаляет старый контент?

#### SC-S12: `normalizeServerSubscription` теряет историю
- **Ситуация:** Сервер вернул `{ plan: 'premium', status: 'expired', trialUsed: false }`
- **Ожидание:** Нормализация сбрасывает до `free` (т.к. `trialUsed: false` + expired)
- **Потенциальный баг:** Если это была оплаченная подписка (не триал), а `trialUsed` не был установлен — теряется информация
- **Проверить:** `normalizeServerSubscription` в `subscriptionSlice.ts` — логика для `trialUsed: false` + expired

#### SC-S13: `loadSubscriptionFromFirebase` — разовое чтение vs realtime
- **Ситуация:** Админ активирует Premium пользователю → пользователь онлайн, но не перезагружает приложение
- **Ожидание:** `useSubscriptionSync` подписан на `user_subscription/{uid}` → обновление приходит мгновенно
- **Проверить:** `useSubscriptionSync.ts` — использует `.on('value')` (realtime) или `.get()` (разовый)?
- **Проверить:** `loadSubscriptionFromFirebase` — используется ли ещё, или заменён хуком?

#### SC-S14: `PremiumActivatedModal` показывается не вовремя
- **Ситуация:** Пользователь сам купил Premium → показывается celebration modal
- **Ожидание:** Modal показывается только при "сюрпризной" активации (админ активировал), не при собственной покупке
- **Проверить:** `useSubscriptionSync.ts` — как отличает "админ активировал" от "я сам активировал"?

### 2.3 Сценарии отмены подписки [P1–P2]

#### SC-S20: Пользователь отменяет — сервер не отправляет push
- **Ситуация:** `cancelUserSubscription()` → `status: 'free'`, но push не отправляется
- **Ожидание:** Пользователь видит изменения мгновенно (realtime listener)
- **Проверить:** Если realtime listener не сработал — пользователь видит "active" до перезагрузки?

#### SC-S21: Отмена подписки за 1 день до истечения
- **Ситуация:** Подписка истекает завтра, пользователь отменяет сегодня
- **Ожидание:** Подписка аннулируется сразу? Или действует до `expiresAt`?
- **Проверить:** `cancelUserSubscription` в `functions/index.js` — ставит `status: 'free'` сразу или `status: 'cancelled'` с сохранением `expiresAt`?

### 2.4 Push-уведомления подписок [P2]

#### SC-S30: Напоминание за 7/3/1/0 дней
- **Ситуация:** `sendSubscriptionReminders()` (daily 10:00 Europe/Kiev)
- **Проверить:** Тексты push: 7 дней="Ваша підписка закінчується через 7 днів", 3 дня, 1 день, 0 дней="Premium завершено"
- **Проверить:** Если `users/{uid}/fcmToken` отсутствует — тихий skip или логирование ошибки?
- **Проверить:** Business Plus — отправляются ли отдельные напоминания? За 7 дней (бизнесу нужно планирование)?

#### SC-S31: Push при активации — deeplink на правильный экран
- **Ситуация:** Push "Premium активовано" → пользователь тапает
- **Ожидание:** Открывается `Podpiska-Premium` экран
- **Проверить:** FCM payload содержит навигационные данные? Или тап открывает главный экран?

### 2.5 Redux Persist подписки [P1]

#### SC-S40: Несоответствие persisted и серверного состояния
- **Ситуация:** Подписка истекла на сервере, но Redux persist хранит `status: 'active'` (оффлайн запуск)
- **Ожидание:** При запуске `checkExpiry()` проверяет `expiresAt` локально, затем `useSubscriptionSync` синхронизирует с сервером
- **Проверить:** Порядок: rehydrate persist → checkExpiry → useSubscriptionSync → hydrate? Нет ли окна где пользователь видит "active"?
- **Проверить:** `store.ts` — persist version 4, whitelist: plan, status, expiresAt, activatedAt, trialUsed, paymentMethod

---

## 3. Business Plus

### Карта файлов

| Файл | Назначение |
|------|-----------|
| `src/screens/BusinessPlusSubscriptionScreen.tsx` (230 строк) | UI: преимущества, тарифы (49₴/мес, 480₴/год), статус |
| `src/screens/BusinessMenuEditorScreen.tsx` (462 строки) | Редактор меню: до 20 позиций, фото с модерацией |
| `src/screens/BusinessPromoEditorScreen.tsx` (415 строк) | Редактор промо-акций: до 3 карточек с валидацией дат |
| `admin-panel/src/pages/BusinessPlusModerationPage.tsx` | Админ: 3 таба (Claims, Cards, Subscriptions) |
| `admin-panel/src/services/businessPlusAdminService.ts` (359 строк) | CRUD: claims, cards, subscriptions |

### RTDB-пути

| Путь | Данные |
|------|--------|
| `business_plus_claims/{placeId}` | Заявка на владение: status (pending/approved/rejected), ownerUid |
| `business_plus_cards/{placeId}` | Меню, промо, фото: moderationStatus, ownerInfo |
| `business_plus_active/{placeId}` | Активная подписка: screen, activatedAt, expiresAt |
| `user_subscription/{uid}` | plan: 'business_plus', status, expiresAt |
| `user_business_notifications/{uid}` | Уведомления: claim_approved, claim_rejected |

### Cloud Functions (Business Plus)

| Функция | Назначение |
|---------|-----------|
| `activateBusinessPlusManual(uid, months, notes)` | Админ: активация + push |
| `cancelBusinessPlusSubscription(uid)` | Админ: отмена (только если plan === 'business_plus') |

---

### 3.1 Цепочка Claim → Approval → Subscription → Content [P0–P1]

#### SC-BP01: Claim на уже занятое заведение
- **Ситуация:** Пользователь A подал claim на "Кафе Чайка", Пользователь B тоже подаёт claim
- **Ожидание:** Второй claim создаётся как `pending`, админ видит конфликт
- **Проверить:** RTDB path `business_plus_claims/{placeId}` — перезаписывается ли claim? Или хранятся оба?
- **Проверить:** Админ видит историю claims для одного placeId?

#### SC-BP02: Claim одобрен, но подписка не оплачена
- **Ситуация:** Админ одобрил claim → пользователь теперь "владелец", но Business Plus не активен
- **Ожидание:** Пользователь видит "Claim одобрен, оплатите подписку", НЕ может редактировать меню/промо
- **Проверить:** `BusinessMenuEditorScreen.tsx` — проверяет `selectIsBusinessPlus()` перед разрешением редактирования?
- **Проверить:** Или разрешает редактирование любому с approved claim?

#### SC-BP03: Business Plus истёк — что с меню и промо
- **Ситуация:** Подписка `expiresAt` прошёл, `status: 'expired'`
- **Ожидание A:** Меню/промо деактивируются (скрываются на экранах категорий)
- **Ожидание B:** Меню/промо остаются видимыми, но редактирование заблокировано
- **Проверить:** `subscribeBiznesPlusPlaces(screen, callback)` в `bonusService.ts` — фильтрует по `expiresAt > now`?
- **Проверить:** `business_plus_cards/{placeId}` — данные остаются, но карточка не отображается в списке?
- **Проверить:** Scheduled function чистит `business_plus_active` при истечении?

#### SC-BP04: Пользователь-владелец удалил аккаунт
- **Ситуация:** Владелец с активным Business Plus удалил профиль
- **Ожидание:** Claim/card/active запись должны очиститься
- **Проверить:** Есть ли Cloud Function `onUserDelete` которая чистит business_plus данные?

### 3.2 Сортировка в категориях — Business Plus vs Bonus Promo [P1]

#### SC-BP10: Порядок приоритетов в списке
- **Ситуация:** Три заведения: A (Business Plus), B (Bonus Promo), C (обычное)
- **Ожидание:** Порядок: A → B → C
- **Проверить:** Sorting logic во всех трёх экранах (`Eda-Na-Chayke.tsx`, `Vse-Dlya-Detey.tsx`, `Salony-Krasoty.tsx`):
  ```
  1. biznesPlusIds.indexOf !== -1 → TOP
  2. promotedPlaceIds.has → MIDDLE
  3. Остальные → BOTTOM
  ```
- **Проверить:** Внутри Business Plus — сортировка по `activatedAt DESC` (новые плательщики первые)?

#### SC-BP11: Business Plus истёк, но Bonus Promo активно
- **Ситуация:** Заведение имело Business Plus (top) → истёк → но есть активное Bonus Promo
- **Ожидание:** Заведение перемещается из TOP в MIDDLE (Bonus Promo tier)
- **Проверить:** `subscribeBiznesPlusPlaces` перестаёт возвращать id после истечения? Или client-side фильтрация?

#### SC-BP12: Одновременно Business Plus И Bonus Promo
- **Ситуация:** Владелец оплатил Business Plus И купил Bonus Promo за бонусы
- **Ожидание:** Не двойное отображение; Business Plus приоритет выше
- **Проверить:** Sorting logic — если id есть в обоих массивах, не дублируется ли карточка?

### 3.3 Business Plus — пересечение с Premium [P1]

#### SC-BP20: Пользователь с Premium хочет Business Plus
- **Ситуация:** `plan: 'premium'` → пользователь оплачивает Business Plus
- **Ожидание:** Plan меняется на `business_plus`, Premium-лимиты теряются ИЛИ сохраняются?
- **Проверить:** `activateBusinessPlusManual` — перезаписывает ли `plan` в `user_subscription/{uid}`?
- **Проверить:** `selectIsPremium()` → false для `business_plus`? Тогда пользователь ТЕРЯЕТ Premium-лимиты!
- **Проверить:** Должен ли Business Plus включать все преимущества Premium?

#### SC-BP21: Business Plus истёк → план не восстанавливается на Premium
- **Ситуация:** Был Premium → перешёл на Business Plus → Business Plus истёк
- **Ожидание:** Plan = 'free' (нет автовосстановления старого плана)
- **Проверить:** Нет ли пользовательского ожидания "вернуться на Premium"?

---

## 4. Кросс-системные сценарии [P0–P1]

### SC-X01: Business Plus + множитель бонусов
- **Ситуация:** Документация упоминает "x1.5 для Premium, x2 для Business Plus"
- **Ожидание:** Множитель применяется при начислении бонусов
- **Проверить:** `bonusService.ts` — есть ли проверка `plan` при начислении? Cloud Functions — есть ли multiplier?
- **РЕЗУЛЬТАТ ИССЛЕДОВАНИЯ:** Множитель НЕ реализован в коде. Это gap между документацией и реализацией.

### SC-X02: Подписка истекает во время действия
- **Ситуация:** Пользователь с Premium нажимает "Создать объявление" (лимит 5), но в момент запроса подписка истекает (лимит 2)
- **Ожидание:** Серверная проверка использует актуальный plan
- **Проверить:** Лимиты проверяются на сервере (Cloud Function) или только на клиенте (Redux selector)?

### SC-X03: Два устройства — конфликт подписки
- **Ситуация:** Пользователь на устройстве A видит "Premium active", на устройстве B — "Free"
- **Ожидание:** Оба устройства синхронизируются через `useSubscriptionSync` (realtime listener)
- **Проверить:** `useSubscriptionSync.ts` — `.on('value')` отрабатывает на обоих устройствах?
- **Проверить:** Redux persist на устройстве B хранит старое состояние → пока listener не обновит

### SC-X04: Оффлайн → онлайн — порядок синхронизации
- **Ситуация:** Приложение запускается оффлайн → Redux persist показывает "Premium active" → интернет появляется
- **Ожидание:** `checkExpiry()` проверяет локальный `expiresAt` → если прошёл, сбрасывает → затем listener обновляет
- **Проверить:** Firebase persistence + RTDB `.on('value')` — корректный порядок событий при восстановлении?
- **Проверить:** `bonusQueue` — не пытается ли drain до восстановления сети?

### SC-X05: Одновременный триал Premium с двух устройств
- **Ситуация:** Пользователь нажимает "Триал" на двух телефонах одновременно
- **Ожидание:** Только один вызов успешен (транзакция на `user_subscription/{uid}`)
- **Проверить:** `activateTrialPremium` — атомарная транзакция?

### SC-X06: Промо-акция куплена за бонусы, потом подписка отменена
- **Ситуация:** Пользователь с Premium купил промо (которое требует Premium?) → отменил Premium
- **Ожидание:** Промо продолжает работать до своего `expiresAt` (не зависит от подписки)
- **Проверить:** `subscribeActiveBonusPromotions` — проверяет ли план пользователя или только `expiresAt` промо?

---

## 5. Экраны категорий

### Карта файлов

| Файл | Строк | Категория |
|------|-------|----------|
| `src/screens/Eda-Na-Chayke.tsx` | 1701 | Еда: кафе, пицца, рестораны, магазины |
| `src/screens/Vse-Dlya-Detey.tsx` | 1288 | Дети: садики, школы, спорт, медицина, события |
| `src/screens/Salony-Krasoty.tsx` | 1025 | Красота: волосы, ногти, косметология, массаж, барбер, спа |

### Общие подписки на каждом экране

```typescript
useEffect(() => subscribeBiznesPlusPlaces(screen, setBiznesPlusIds), []);
useEffect(() => subscribeActiveBonusPromotions(screen, setActivePromotions), []);
```

---

### 5.1 Сценарии отображения [P1–P2]

#### SC-C01: Загрузка данных при медленном интернете
- **Ситуация:** 3G-соединение, данные грузятся 5+ секунд
- **Ожидание:** Spinner/skeleton, экран не зависает, нет белого экрана
- **Проверить:** Все три экрана — есть ли `ActivityIndicator` при `loading === true`?
- **Проверить:** Timeout — если данные не пришли за 15 сек, показывается ошибка?

#### SC-C02: Пустой список
- **Ситуация:** В категории нет заведений (например, новая категория)
- **Ожидание:** Дружелюбное сообщение "Поки нічого немає" вместо пустого экрана
- **Проверить:** Все три экрана — обработка `places.length === 0`?

#### SC-C03: Ошибка RTDB — нет прав на чтение
- **Ситуация:** Security rules отклонили запрос
- **Ожидание:** Ошибка ловится, показывается сообщение, приложение не падает
- **Проверить:** `subscribeBiznesPlusPlaces`, `subscribeActiveBonusPromotions` — есть ли onError callback?

#### SC-C04: Фильтрация + сортировка по приоритету
- **Ситуация:** Пользователь фильтрует "только пиццерии" → в результатах есть Business Plus пиццерия
- **Ожидание:** Business Plus пиццерия остаётся первой после фильтрации
- **Проверить:** Sorting применяется ПОСЛЕ фильтрации или ДО?

#### SC-C05: Лишние подписки / утечки
- **Ситуация:** Пользователь открывает и закрывает экран категории 10 раз
- **Ожидание:** Каждый `useEffect` возвращает cleanup (`.off()` / unsubscribe)
- **Проверить:** Все три экрана — `return subscribeBiznesPlusPlaces(...)` корректно отписывается?
- **Проверить:** Нет ли `.on('value')` без парного `.off()` в cleanup?

#### SC-C06: Мемоизация и ререндеры
- **Ситуация:** `biznesPlusIds` обновился → весь список перерисовывается
- **Ожидание:** Используются `useMemo` / `React.memo` для предотвращения лишних ререндеров
- **Проверить:** Сортировка в `useMemo` с правильными deps? Или вычисляется в каждом рендере?

---

## 6. Безопасность [P0]

### SC-SEC01: Прямая запись в RTDB — обход Cloud Functions
- **Ситуация:** Злоумышленник через REST API пишет `user_subscription/{uid}: { plan: 'business_plus', status: 'active', expiresAt: '2030-01-01' }`
- **Ожидание:** RTDB Security Rules запрещают прямую запись (только Cloud Functions с admin SDK)
- **Проверить:** `database.rules.json` — правило для `user_subscription/{uid}` — `.write: false` или `.write: "auth.uid === $uid"`?
- **Проверить:** Если `.write: "auth.uid === $uid"` — пользователь МОЖЕТ написать себе `plan: 'business_plus'`!

### SC-SEC02: Прямая запись бонусов
- **Ситуация:** Злоумышленник пишет `user_bonuses/{uid}: { total: 8000, available: 8000 }`
- **Ожидание:** Rules запрещают, бонусы пишутся только через Cloud Functions
- **Проверить:** `database.rules.json` — `.write` для `user_bonuses`, `promo_credits`, `bonus_transactions`

### SC-SEC03: Cloud Functions — аутентификация
- **Ситуация:** Неаутентифицированный вызов `awardHelpRespondBonus`
- **Ожидание:** `context.auth` проверяется, ошибка `unauthenticated`
- **Проверить:** Все Cloud Functions в `functions/index.js` начинаются с проверки `context.auth`?

### SC-SEC04: Накрутка "Спасибо +3" через автоматизацию
- **Ситуация:** Скрипт вызывает `awardProfileThanksBonus` 1000 раз для разных targetUid
- **Ожидание:** Rate limiting на Cloud Functions или per-target daily limit
- **Проверить:** Есть ли ограничение "max N благодарностей в день"?
- **Проверить:** Есть ли ограничение "max 1 благодарность одному targetUid в день"?

### SC-SEC05: Админ-панель — доступ
- **Ситуация:** Обычный пользователь пытается открыть `PromoCreditsAdminScreen`
- **Ожидание:** Проверка роли админа, доступ запрещён
- **Проверить:** `PromoCreditsAdminScreen.tsx` — `requireWriteSession({ requireRealUser: true })` — достаточно ли? Проверяется ли роль admin?
- **Проверить:** Cloud Functions `adminGrantPromoCredits`, `adminModeratePromotion` — проверяют ли admin role через `context.auth.uid` === adminUid?

### SC-SEC06: apiKey в клиентском коде
- **Ситуация:** Firebase apiKey доступен в бандле приложения
- **Ожидание:** apiKey — публичный (by design Firebase), но Security Rules должны защищать данные
- **Проверить:** Нет ли дополнительных секретов (service account, admin tokens) в клиентском коде?

---

## 7. Производительность [P2]

### SC-PERF01: Количество открытых RTDB listeners
- **Ситуация:** Пользователь на главном экране → открыто N listeners
- **Проверить:** Сколько `.on('value')` подписок открыто одновременно? Не подписывается ли на всех пользователей?
- **Проверить:** Listener на `bonus_promotions` для экрана категории — query с фильтром по `screen` или загрузка всех промо?

### SC-PERF02: Размер узла `bonus_transactions/{uid}` через 6 месяцев
- **Ситуация:** Активный пользователь: 5 транзакций/день × 180 дней = 900 записей
- **Ожидание:** Query `orderByChild('createdAt').limitToLast(30)` работает быстро
- **Проверить:** Есть ли индекс в `database.rules.json` на `.indexOn: ["createdAt"]` для `bonus_transactions`?

### SC-PERF03: Cold start Cloud Functions
- **Ситуация:** Первый вызов `activateTrialPremium` после 15 минут простоя → cold start 5–10 сек
- **Ожидание:** UI показывает spinner, timeout не срабатывает
- **Проверить:** Есть ли min instances configured? Или UI обрабатывает задержку 10+ сек?

### SC-PERF04: Fan-out при большом количестве промо
- **Ситуация:** 200 активных промо на экране "Красота"
- **Ожидание:** Query возвращает только промо для `screen: 'beauty'` с `status: 'active'`
- **Проверить:** `subscribeActiveBonusPromotions` — query с `.orderByChild('screen').equalTo(screen)` или client-side filter?

### SC-PERF05: Redux ререндеры от `hydrateSubscription`
- **Ситуация:** `useSubscriptionSync` обновляет Redux → все компоненты с `useSelector(selectIsPremium)` ререндерятся
- **Проверить:** Если данные не изменились (тот же plan/status) — вызывается ли dispatch? Нужна ли shallow comparison?

---

## 8. Обработка ошибок [P1–P2]

### SC-ERR01: Loose matching ошибок промо
- **Ситуация:** Cloud Function возвращает ошибку с изменённым текстом → `.includes('insufficient')` больше не матчит
- **Ожидание:** Пользователь видит generic ошибку вместо конкретной
- **Проверить:** `BonusPromotionPurchaseScreen.tsx` — 9 типов ошибок определяются через `.includes()` на строках → хрупко
- **Рекомендация:** Использовать error codes вместо string matching

### SC-ERR02: `tryActivateFreePremium` — тихий catch
- **Ситуация:** Функция упала → `catch` возвращает `false`, пользователь ничего не видит
- **Проверить:** Где вызывается? Есть ли UI-обработка `false`?

### SC-ERR03: BonusWalletScreen — нет fallback для незагруженных данных
- **Ситуация:** `subscribeMyBonuses` вернул ошибку (permission denied)
- **Ожидание:** Показывается "Не вдалося завантажити" вместо пустого/сломанного экрана
- **Проверить:** onError callback в subscribe? Fallback UI?

---

## 9. Локализация [P3]

### SC-L10: Hardcoded English строки
- **Проверить:** `Podpiska-Premium.tsx` — есть ли строки типа `'Try free for the first month'` без `t.` prefix?
- **Проверить:** Ключи `t.bonus`, `t.promoCredits`, `t.subscription` — есть ли fallback для отсутствующих языков?
- **Проверить:** Push-уведомления — hardcoded Ukrainian или локализованы?

### SC-L11: Форматирование дат
- **Проверить:** `expiresAt` ISO string → отображается ли в формате DD.MM.YYYY для UA/RU?
- **Проверить:** `BusinessPromoEditorScreen.tsx` — валидация дат в формате DD.MM.YYYY — работает ли для всех locale?

---

## 10. Legacy-пользователи и миграция [P1]

### SC-MIG01: Пользователь без узла бонусов
- **Ситуация:** Пользователь зарегистрирован до появления бонусной системы → `user_bonuses/{uid}` не существует
- **Ожидание:** `subscribeMyBonuses` возвращает null → UI показывает нули
- **Проверить:** Cloud Functions при первом начислении создают узел? Или требуется предварительная инициализация?

### SC-MIG02: Старый формат подписки (`isActive` вместо `status`)
- **Ситуация:** Пользователь с legacy-записью `{ plan: 'premium', isActive: true }` (нет поля `status`)
- **Ожидание:** `normalizeServerSubscription` конвертирует `isActive` → `status: 'active'`
- **Проверить:** `subscriptionSlice.ts` — миграция legacy field? Redux persist version 4 — migration handler?

### SC-MIG03: `normalizeSubscriptionRecord` в Cloud Functions
- **Ситуация:** Серверная нормализация в `functions/index.js:571` (внутренняя, не экспортируется)
- **Проверить:** Совпадает ли логика серверной нормализации с клиентской (`subscriptionSlice.ts`)?
- **Проверить:** Сервер возвращает `{ plan, expiresAt, activatedAt, isActive }` — клиент ожидает `{ status }` → gap?

---

## 11. Методология тестирования

### 11.1 Автоматизированное
- Unit-тесты для: `normalizeServerSubscription`, `selectIsPremium`, `selectIsBusinessPlus`, `checkExpiry`
- Unit-тесты для: sorting logic в категорийных экранах
- Unit-тесты для: `bonusQueue` — enqueue, drain, dedup, TTL, maxRetries

### 11.2 Ручное (3 тестовых аккаунта)

| Аккаунт | План | Цель |
|---------|------|------|
| Test-Free | free, без бонусов | Проверка ограничений, триал, покупка |
| Test-Premium | premium (активировать триал) | Проверка лимитов, истечения, отмены |
| Test-Business | business_plus (через админку) | Проверка claim, menu editor, промо, сортировка в категориях |

**Тест-план:**
1. Пройти все экраны на каждом аккаунте
2. Активировать триал (Test-Free → Premium)
3. Начислить бонусы (все 7 функций), проверить weeklyLimit
4. Купить промо-размещение, проверить сортировку в категории
5. Купить промо-кредиты, проверить топап-flow
6. В админке: активировать/отменить подписку, начислить кредиты, модерировать промо
7. Установить время устройства вперёд → проверить истечение подписки и промо
8. Отключить сеть → проверить offline queue и fallback UI
9. Переключить язык → проверить все строки бонусов/подписок

### 11.3 Нагрузочное
- 200 одновременных `awardDailyLoginBonus()` через Firebase Emulator → проверить weeklyLimit integrity
- 50 одновременных `activateTrialPremium()` для одного uid → проверить транзакцию
- Fan-out: 500 активных промо на одном screen → проверить query time

### 11.4 Аудит Security Rules
- Попробовать REST API запись в `user_subscription/{uid}`, `user_bonuses/{uid}`, `promo_credits/{uid}` с пользовательским токеном
- Попробовать чтение `user_bonuses/{otherUid}` — запрещено?
- Проверить `.validate` правила на enum plan, numeric points, timestamp format

---

## 12. Ожидаемые результаты

1. **Список багов** с приоритетами P0–P3, файл:строка, steps to reproduce
2. **Security report:** результаты аудита RTDB rules + Cloud Functions auth checks
3. **Performance report:** количество listeners, query times, cold start times
4. **Исправления** — один коммит на один баг/фичу
5. **Gap analysis** — расхождения между документацией и реализацией (например, множитель x2)

---

## 13. Ограничения

- **НЕ менять:** auth flow, firebase rules structure, `deviceAuth`, `AppAccessGuard` — без явного запроса
- **НЕ переписывать** архитектуру — только точечные исправления
- **Перед каждым изменением:** показать файл:строка и expected diff
- **После каждого исправления:** регрессия: регистрация, вход, realtime-обновления, навигация

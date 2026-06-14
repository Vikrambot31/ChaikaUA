# Admin Panel Performance Audit
> Date: 2026-06-09 | Branch: codex/shared-building-ratings

## Легенда
- **CRITICAL** — данные растут без ограничений → крах при масштабировании
- **HIGH** — медленно сейчас, катастрофа при росте
- **MEDIUM** — оптимизация желательна, но не срочно
- **OK** — переписка говорила об этом, но реальный код лучше

---

## CRITICAL

### 1. Photo Approval — 3 неограниченных коллекции
`admin-panel/src/services/photoApprovalService.ts`

| Строки | Проблема |
|--------|---------|
| 141–147 | `get(ref(database, 'community_photos'))` — вся коллекция, нет лимита |
| 150–162 | `get(ref(database, 'user_photos'))` — двойной вложенный цикл по всем UID и всем фото |
| 165–182 | `get(ref(database, 'request_photos'))` — то же самое |

**Итог:** при каждом открытии вкладки Photo Approval грузится всё что есть в трёх коллекциях.

---

### 2. Bonus Admin — 5 неограниченных подписок
`admin-panel/src/services/bonusAdminService.ts`

| Строки | Проблема |
|--------|---------|
| 108–111 | `onValue(ref(database, 'user_bonuses'))` — вся коллекция, нет `limitToLast` |
| 116–119 | `onValue(ref(database, 'promo_credits'))` — то же |
| 134–145 | `get(ref(database, 'bonus_fraud_flags'))` — вся коллекция + клиентская сортировка |
| 147–158 | `get(ref(database, 'bonus_blocks'))` — вся коллекция |
| 163–178 | `onValue(ref(database, 'bonus_promotions'))` + клиентская сортировка при каждом обновлении |

---

### 3. Business Plus — дублирующиеся подписки
`admin-panel/src/services/businessPlusAdminService.ts` +
`admin-panel/src/pages/BusinessPlusModerationPage.tsx`

| Файл | Строки | Проблема |
|------|--------|---------|
| businessPlusAdminService.ts | 126–128 | `onValue(.../business_plus_claims)` без лимита |
| businessPlusAdminService.ts | 133–135 | `onValue(.../business_plus_cards)` без лимита |
| businessPlusAdminService.ts | 263–281 | `onValue(.../user_subscription)` — ВСЕ планы, фильтр `business_plus` только на клиенте |
| BusinessPlusModerationPage.tsx | 62–66 | claims подписка в дочернем ClaimsTab |
| BusinessPlusModerationPage.tsx | 250–254 | cards подписка в дочернем CardsTab |
| BusinessPlusModerationPage.tsx | 780–786 | родительский компонент ЕЩЁРАЗ подписывается на claims + cards для счётчика |

**Итог:** claims и cards загружаются **дважды одновременно** при открытии страницы.

---

### 4. Premium Admin — грузит всех пользователей для N UIDs
`admin-panel/src/services/premiumAdminService.ts`

| Строки | Проблема |
|--------|---------|
| 62–64 | `onValue(ref(database, 'user_subscription'))` — вся коллекция |
| 87–101 | `get(ref(database, 'users'))` — ВЕСЬ узел users, чтобы найти профили нескольких UID |
| 175–198 | `limitToFirst(300)` + клиентский поиск по имени/телефону |

---

### 5. Moderation — 13 коллекций одновременно
`admin-panel/src/services/moderationService.ts`

| Строки | Проблема |
|--------|---------|
| 283–309 | `Promise.allSettled(MODERATION_SECTIONS.map(...))` — 13 `get()` без лимитов одновременно |
| 254–274 | `flattenNested()` — двойной вложенный цикл по buildingId → itemId без ограничений |
| 316–334 | После загрузки resolves URLs для ВСЕХ элементов (батч по 25, но итерирует все) |

`admin-panel/src/pages/ModerationPage.tsx`

| Строки | Проблема |
|--------|---------|
| 297–315 | `refresh()` → `loadModerationItems()` — 13 путей при каждом рефреше |

---

### 6. Guarantor Tree — неограниченная загрузка дерева
`admin-panel/src/services/guarantorTreeService.ts`

| Строки | Проблема |
|--------|---------|
| 533 | `get(ref(database, TRUST_TREE_PATH))` — всё дерево доверия без лимита |
| 564 | `get(ref(database, ACCESS_PATH))` — весь узел user_access без лимита |
| 343–352 | Запрос детей гаранта без `limitToLast` → если 10 000 детей, грузит всех, потом `.slice(0, 50)` |
| 206–237 | Поиск: `limitToFirst(500)` + клиентское сравнение по всем 500 |

---

### 7. Dashboard — 13 потоковых подписок + users + devices
`admin-panel/src/services/dashboardService.ts`

| Строки | Проблема |
|--------|---------|
| 584–592 | `get(ref(database, USERS_PATH))` — весь узел users на mount |
| 594–597 | `onValue(ref(database, SECURITY_AUTHORIZED_DEVICES_PATH))` — все девайсы без лимита |
| 669–680 | `forEach(moderationDashboardPaths)` → 13 `onValue` одновременно, каждый стримит всю коллекцию |

`admin-panel/src/contexts/DashboardContext.tsx`

| Строки | Проблема |
|--------|---------|
| 40 | `subscribeDashboard()` активно всё время жизни admin-сессии → 13 потоков постоянно открыты |

---

## HIGH

### 8. Security Service — поток без лимита
`admin-panel/src/services/securityService.ts`

| Строки | Проблема |
|--------|---------|
| 72–78 | `get(ref(database, 'user_roles'))` — вся коллекция, фильтр admin/moderator на клиенте |
| 307–336 | `onValue(logsRef)` — подписка на весь SECURITY_LOGS_PATH без `limitToLast` |

---

### 9. Access Control Page — 4 источника данных на mount
`admin-panel/src/pages/AccessControlPage.tsx`

| Строки | Проблема |
|--------|---------|
| 157–223 | `refresh()` + `subscribeEmergencyAccess()` + `subscribeManagedAuthorizedDevices()` + `fetchSubmissionDenials()` + `getApkDownloads()` + `getCurrentVersionRegistry()` — все запускаются одновременно |

---

### 10. Invite Access — спонсоры без лимита
`admin-panel/src/services/inviteAccessService.ts`

| Строки | Проблема |
|--------|---------|
| 195–227 | Requests: ✅ `limitToLast(PAGE_SIZE)` — нормально. Sponsors: ❌ `get(ref(database, TRUSTED_SPONSORS_PATH))` без лимита |

---

## MEDIUM

### 11. Нет TTL / очистки данных
Ни в одном из сервисов нет механизма прунинга:
- security_logs — растут вечно
- bonus_fraud_flags — растут вечно
- moderation items после решения — остаются
- photo records после approve/reject — остаются

Нужна Cloud Function по расписанию.

### 12. Клиентская сортировка больших массивов
- `bonusAdminService.ts:145` — `result.sort()`
- `bonusAdminService.ts:178` — `result.sort()`
- `guarantorTreeService.ts:352` — `.sort()` после загрузки всех детей
- Все должны заменяться `orderByChild` + `limitToLast` на стороне сервера.

### 13. Нет `orderByChild` индексирования в запросах Photos/Moderation
Firebase rules содержат `.indexOn`, но запросы используют `get()` без `orderBy*` → индексы не задействованы.

---

## ЧТО В ОРИГИНАЛЬНОЙ ПЕРЕПИСКЕ ВЕРНО ✅

| Тезис | Статус |
|-------|--------|
| `onValue` без `limitToLast` в bonusAdminService | ✅ Подтверждено |
| `onValue` без `limitToLast` в securityService | ✅ Подтверждено (но структура сложнее: партиционированные логи) |
| Все 3 коллекции Business Plus одновременно | ✅ Подтверждено + найдены дубли |
| `onValue` в premiumAdminService | ✅ Подтверждено |
| 13 путей модерации без лимитов | ✅ Подтверждено |
| Dashboard 5+ подписок | ✅ Уточнено: реально 13+ |
| Гарантор — BFS + loadAllUsers | ✅ Частично: BFS нет, но полная загрузка trust_tree и user_access есть |
| Нет TTL | ✅ Подтверждено |

---

## ЧТО В ПЕРЕПИСКЕ НЕТОЧНО / ЛУЧШЕ НЕ ТРОГАТЬ ⚠️

| Тезис | Уточнение |
|-------|-----------|
| `photoApprovalService.ts Lines 40-120` | Реальные строки: 141–182 (не 40–120) |
| "Resolves Firebase Storage download URLs in loop" | Реально — batch по 25 (лучше чем описано), но всё равно для всех элементов |
| "bonusAdminService `limitToLast(200)` для транзакций" | В коде нет `limitToLast(200)` для transactions — нет поля transactions вообще, есть `user_bonuses` и `promo_credits` |
| "guarantorTreeService MAX_CHAIN_DEPTH=20, BFS" | BFS не найден; реальный алгоритм — flat load всего дерева + batch user profiles |
| "dashboardService lines 20-85" | Реальные строки значительно отличаются: users — 584, devices — 594, moderation — 669 |
| inviteAccessService "Load More appends to state" | Код с лимитом requests ✅, но есть "load more" — это безопасно если PAGE_SIZE фиксирован |

---

## ПРИОРИТЕТ ИСПРАВЛЕНИЙ

```
СНАЧАЛА (высокий риск):
1. businessPlusAdminService.ts:263 — фильтровать по plan на сервере, убрать дублирующиеся подписки в BusinessPlusModerationPage.tsx:780
2. premiumAdminService.ts:87 — заменить get('users') на batch get по конкретным UIDs
3. moderationService.ts:283 — добавить limitToLast(50) или пагинацию per section
4. photoApprovalService.ts:141,150,165 — добавить limitToLast(50) на каждую коллекцию
5. dashboardService.ts:669 — заменить 13 onValue стримов на агрегированный счётчик

ПОТОМ (масштабирование):
6. bonusAdminService.ts:108,116 — добавить limitToLast(200)
7. guarantorTreeService.ts:533,564 — lazy-load дерева по уровням
8. securityService.ts:307 — добавить limitToLast(100) к SECURITY_LOGS_PATH
9. Cloud Function для TTL: security_logs > 30 дней, resolved moderation > 90 дней

НЕ ТРОГАТЬ СЕЙЧАС:
- inviteAccessService.ts — пагинация requests уже есть (limitToLast(PAGE_SIZE))
- guarantorTreeService.ts:206 — limitToFirst(500) + score ranking достаточно пока база < 5000 чел
- accessControlPage.tsx — несколько источников данных нормально, просто добавить индикаторы загрузки
```

# STAGE 5 — ПРОИЗВОДИТЕЛЬНОСТЬ + P0 FIXES
## Дата: 2026-06-27

---

## ИСПРАВЛЕНИЯ В КОДЕ

### P0 Критические баги (исправлены в этом этапе)

| # | Файл | Строка | Проблема | Фикс |
|---|---|---|---|---|
| 1 | useFullRegistration.ts | 5, 170 | `dbSet()` перезаписывал весь узел `users/{uid}` — удалял существующие данные | `set` → `update` (partial update, не перезапись) |
| 2 | OSBB-Golosovanie.tsx | 143 | `options.reduce()` без initialValue на пустом массиве → TypeError crash | Добавлен guard `if (options.length === 0) return ''` |
| 3 | Status-Sveta.tsx | 612, 657 | `item.createdAt.toLocaleTimeString()` на string → TypeError crash | `item.createdAt` → `new Date(item.createdAt)` (оба места) |

### 5.4 Redux — мемоизация селекторов

Файл: `src/redux/selectors.ts`

**До:** 14 вычисляемых селекторов без мемоизации (возвращали новые массивы/объекты на каждый рендер).

**После:** Все 14 обёрнуты в `createSelector`:

| Селектор | Тип | Проблема |
|---|---|---|
| `selectPlaceById` | parametrized | `.find()` — новый ref каждый раз |
| `selectPlacesByType` | parametrized | `.filter()` — новый массив каждый раз |
| `selectHasActiveFilters` | computed | combined boolean check |
| `selectRequestById` | parametrized | `.find()` |
| `selectPendingRequests` | computed | `.filter()` |
| `selectPendingRequestsCount` | computed | `.filter().length` |
| `selectStatusByBuilding` | parametrized | `.find()` |
| `selectBuildingReports` | parametrized | `.filter()` |
| `selectBuildingsWithElectricity` | computed | Set + filter + Array.from |
| `selectBuildingsWithoutElectricity` | computed | Set + filter + Array.from |
| `selectActiveBurningRequests` | computed | filter + Date() |
| `selectCompletedRequests` | computed | filter |
| `selectActiveBurningCount` | computed | filter + Date() + .length |
| `selectHelpRequestsByTime` | parametrized | filter + Date() |
| `selectHelpRequestById` | parametrized | .find() |
| `selectAllErrors` | computed | объект создавался на каждый рендер |
| `selectSyncStatus` | computed | объект создавался на каждый рендер |

---

## АУДИТ (не требующий изменений)

### 5.1 Startup
- `startupSync.ts` — 209 строк, корректная логика, задачи: auth/firebase/remoteConfig/deviceAuth, timeout 25s. ✅ OK
- `cacheLayer.ts` — TTL константы присутствуют (securityConfig:5m, inviteAccess:30s, userRole:1m, userProfile:10m, feed:5m). ✅ OK

### 5.2 RTDB Listeners — memory leaks
- Проверено 52 файла с `onValue()`/`onChildAdded()`/`onChildChanged()`
- Большинство имеют cleanup в return useEffect
- `liveDiagnosticsService.ts` — избыточный двойной cleanup (`off()` + `unsubscribe()`), но не утечка
- `WhoLikedMeList.tsx` — использует `get()` (one-time read), не listener. ✅ OK

### 5.3 Pagination
- `Spisok-Zayavok.tsx` — FlatList с `keyExtractor` и `PAGE_SIZE = 20` уже есть. ✅ OK

### 5.5 Images
- `imageCompressor.ts` подключён в PhotoUploadEngine. ✅ OK (R-2: не трогаем)

---

## P1 — остаётся незакрытым
- Profile photo auto-approved (ProfileSetupScreen.tsx:259) — перенесено в Stage 7 (модерация)
- Raw EN category в модерации (Moderaciya-Foto.tsx:497) — Stage 7
- Raw buildingId в модерации (Moderaciya-Foto.tsx:690) — Stage 7
- Dark mode отсутствует (Mestsa-i-Lyudi-Hub.tsx) — Stage 3 backlog
- ~15 мест hardcoded `uk-UA` locale — Stage 4 backlog

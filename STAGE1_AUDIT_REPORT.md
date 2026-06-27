# ЭТАП 1 — АУДИТ И ИНВЕНТАРИЗАЦИЯ: ОТЧЁТ
## Дата: 2026-06-27 | Версия: 1.1.451

---

## СВОДКА НАХОДОК

| Область | Критических | Средних | Низких |
|---|---|---|---|
| Экраны (i18n / роли) | 0 | 16 | 1 |
| Навигация (мёртвые маршруты) | 0 | 23 | 50+ |
| Redux (утечки / perf) | 2 | 5 | 3 |
| Firebase Rules (безопасность) | 4 | 2 | 5 |
| **ИТОГО** | **6** | **46** | **59+** |

---

## 1. ЭКРАНЫ — 97 файлов найдено

### 16 экранов с hardcoded-текстом (не через i18n)

| # | Файл | Тип проблемы |
|---|---|---|
| 1 | `archive/Vibor-Temy-Zayavki-OLD.tsx` | Полностью hardcoded UA + битый Unicode |
| 2 | `AppMonitorScreen.tsx` | Ternary-переводы вместо useTranslation |
| 3 | `PendingApprovalScreen.tsx` | Hardcoded UA в getTitle/getBody/getStatusLabel |
| 4 | `PromoCreditsAdminScreen.tsx` | Hardcoded RU в getPromotionTypeTitle |
| 5 | `Razdel.tsx` | Локальный UI_TEXT объект |
| 6 | `AdminUserErrorsScreen.tsx` | Локальный UI_TEXT объект |
| 7 | `AdminRuntimeMonitorScreen.tsx` | Локальный UI_TEXT объект |
| 8 | `ServerStatusScreen.tsx` | Локальный COPY объект |
| 9 | `ServiceModerationIssuesScreen.tsx` | Локальный COPY объект |
| 10 | `UserErrorModerationMonitorScreen.tsx` | Локальный TEXT объект |
| 11 | `AuthDiagnosticScreen.tsx` | Локальный COPY объект |
| 12 | `SecurityControlScreen.tsx` | Hardcoded RU + `language = 'ru'` принудительно |
| 13 | `Detal-Detskogo-Mesta.tsx` | Локальный UI_TEXT объект |
| 14 | `ItemDetailScreen.tsx` | Локальный UI_TEXT объект |
| 15 | `Eda-Na-Chayke.tsx` | Локальный UI_TEXT объект |
| 16 | `Profil-Polzovatelya.tsx` | Локальный UI_TEXT объект |

### 9 admin/moderator-only экранов

| Экран | Метод проверки роли |
|---|---|
| `SecurityControlScreen.tsx` | Firebase query + hardcoded admin |
| `OSBB-AdminPanel.tsx` | `useIsAdmin` + `getUserRole()` |
| `PromoCreditsAdminScreen.tsx` | Неявный admin (admin-функции) |
| `AdminUserErrorsScreen.tsx` | Неявный admin |
| `AdminRuntimeMonitorScreen.tsx` | Неявный admin |
| `UserErrorModerationMonitorScreen.tsx` | Неявный moderator |
| `Detal-Detskogo-Mesta.tsx` | `useIsAdmin` hook |
| `ItemDetailScreen.tsx` | `useIsAdmin` hook |
| `Eda-Na-Chayke.tsx` | `useIsAdmin` hook |

### 1 архивный экран
- `archive/Vibor-Temy-Zayavki-OLD.tsx` — содержит битый Unicode, можно удалить

---

## 2. НАВИГАЦИЯ — 98 маршрутов зарегистрировано

### 23+ мёртвых маршрута (зарегистрированы, но не вызываются)

```
RequestsTab, ListScreen, TopPlacesScreen, TopGirlsBoysScreen,
ChaikaProblemsScreen, InterestingPlacesScreen, ElectricityStatusScreen,
HelpScreen, JobSearchScreen, TopCafeScreen, TopStoresScreen,
SectionScreen, PlaceDetailsPanel, RequestsScreen, RequestTopicScreen,
PoruchitelScreen, LostAndFoundScreen, ImportantNewsScreen,
MyApprovedPhotosScreen, AppVersionInfoScreen, ProfileSetupScreen,
PlacesAndPeopleHub, QRCodeScreen
```

### 50+ маршрутов без deep linking
Отсутствуют deeplink для: LoginScreen, RegisterScreenFull, RequestDetail, HelpRequestScreen, ItemDetailScreen, ViewUserProfile, все admin/moderator экраны, все бизнес-экраны и др.

### Аномалии навигации
- **RequestsTab vs RequestsScreen vs RequestTopicScreen** — 3 маршрута для похожей функции, путаница
- **OnlineChatTab** — лишний уровень вложенности Stack для одного экрана
- **backBehavior="history"** на Tab Navigator — ок, корректно

### Охранники маршрутов (GuardedScreen)
- 16 маршрутов с guard `'auth'`
- 2 маршрута с guard `'complete'` (RequestForm, CreateBuySell)
- 4 маршрута с guard `'moderator'`
- 6 маршрутов с guard `'admin'`

---

## 3. REDUX — 11 слайсов

### Критические проблемы

| # | Проблема | Файл | Уровень |
|---|---|---|---|
| 1 | **osbb slice НЕ очищается при logout** — данные прошлого юзера видны следующему | `osbbSlice.ts` | CRITICAL |
| 2 | **44 из 45 selectors без мемоизации** — `createSelector` используется только 1 раз | `selectors.ts` | HIGH |
| 3 | **electricitySlice — unbounded массивы** — `reports[]` и `todayReports[]` растут без лимита | `electricitySlice.ts` | CRITICAL |
| 4 | subscription slice не очищается при logout | `subscriptionSlice.ts` | MEDIUM |
| 5 | `.unshift()` O(n) на массивах до 200 элементов | helpRequests, electricity | MEDIUM |

### Детали слайсов

| Slice | Persist | Лимит | Миграция | Logout cleanup |
|---|---|---|---|---|
| auth | YES | - | v3 | YES |
| places | NO | - | - | N/A |
| requests | YES | 200 | v3 | YES |
| electricity | NO | **НЕТ** | - | N/A |
| helpRequests | YES | 200 | v3 | YES |
| language | YES | - | v4 | Нет (by design) |
| subscription | YES | - | v4 | **НЕТ** |
| theme | YES | - | v1 | Нет (by design) |
| osbb | YES | - | v3 | **НЕТ** |
| network | NO | - | - | N/A |
| notifications | NO | - | - | N/A |

---

## 4. FIREBASE RULES

### RTDB — 12 путей с публичным чтением (.read: true)

| # | Путь | Намеренно? |
|---|---|---|
| 1 | `requests` | Спорно — содержит данные заявок |
| 2 | `community_photos_public` | Да — только одобренные фото |
| 3 | `biznes_chaika_listings` | Да — публичные листинги |
| 4 | `lost_found` | Да — публичные объявления |
| 5 | `buy_sell_listings` | Да — маркетплейс |
| 6 | `food_top_listings` | Да — публичные |
| 7 | `beauty_top_listings` | Да — публичные |
| 8 | `children_top_listings` | Да — публичные |
| 9 | `job_listings` | Спорно — содержит резюме |
| 10 | `local_business` | Да — публичные |
| 11 | `sports_listings` | Да — публичные |
| 12 | **`security_config/app_control/current`** | **НЕТ — конфиг приложения exposed** |

### 2 пути с избыточными правами записи

| Путь | Проблема |
|---|---|
| `osbb_collection_payments/$buildingId/$collectionId` | Любой auth-юзер может писать платежи в любой дом |
| `bonus_triggers/close_request/$requestId` | Любой auth-юзер может триггернуть бонус на любую заявку |

### Storage — ВСЕ 15 путей без валидации размера/типа

**КРИТИЧНО:** Ни один путь в `storage.rules` не проверяет:
- `request.resource.size` (нет лимита размера файла)
- `request.resource.contentType` (нет whitelist типов)

Пользователь может загрузить файл любого размера и типа.

### Тесты правил
- 2 файла тестов найдено (security + emulator)
- Покрытие: ~30-40% критических путей
- НЕТ тестов для storage rules
- НЕТ тестов для public-read путей

---

## ПЛАН ДЕЙСТВИЙ (по этапам из GLOBAL_POLISH_SPEC)

### Немедленно (Этап 2 — безопасность):
1. `osbbSlice` — добавить очистку при logout
2. `storage.rules` — добавить size + contentType validation (R-1: корректировка, не новые правила)
3. `security_config/app_control/current` — добавить auth check
4. `osbb_collection_payments` — ограничить запись
5. `bonus_triggers` — ограничить запись

### Этап 3 (UI/UX):
6. 16 экранов — миграция hardcoded текста в useTranslation
7. 23+ мёртвых маршрута — ревизия и очистка

### Этап 5 (Performance):
8. 44 selectors — мемоизация через createSelector
9. electricitySlice — добавить лимит массивов

---

*Аудит выполнен автоматически: 2026-06-27*

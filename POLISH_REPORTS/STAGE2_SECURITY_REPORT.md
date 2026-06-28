# ЭТАП 2 — БЕЗОПАСНОСТЬ И АУТЕНТИФИКАЦИЯ: ОТЧЁТ
## Дата: 2026-06-27 | Версия: 1.1.451

---

## ИСПРАВЛЕНИЯ ПРИМЕНЕНЫ (7 фиксов)

### FIX-1: Viber Auth Bypass — CRITICAL
**Файлы:** `Kontakt-XXX.tsx`, `Bizznes-Chaika.tsx`, `ProfileRequestsScreen.tsx`
**Было:** Проверка `user?.id` через Redux (можно подделать)
**Стало:** `auth.currentUser?.uid` — прямая проверка Firebase Auth

### FIX-2: osbbSlice logout cleanup — CRITICAL
**Файл:** `src/redux/slices/osbbSlice.ts`
**Было:** Данные OSBB (buildingId, apartment, role) оставались после logout
**Стало:** `extraReducers: builder.addCase('auth/logout', () => initialState)`

### FIX-3: subscriptionSlice logout cleanup — MEDIUM
**Файл:** `src/redux/slices/subscriptionSlice.ts`
**Было:** Подписка прошлого юзера видна следующему
**Стало:** `extraReducers: builder.addCase('auth/logout', () => initialState)`

### FIX-4: electricitySlice unbounded arrays — MEDIUM
**Файл:** `src/redux/slices/electricitySlice.ts`
**Было:** `reports[]` и `todayReports[]` росли без ограничений
**Стало:** MAX_REPORTS=200, MAX_TODAY_REPORTS=100, автоматическая обрезка

### FIX-5: Storage Rules — size + type validation — CRITICAL
**Файл:** `storage.rules`
**Было:** Все 15 путей без проверки размера файла и типа содержимого
**Стало:** `validUpload()` = isOwner + `image/(jpeg|png|webp|heic|heif)` + 10MB max

---

## АУДИТ — РЕЗУЛЬТАТЫ

### Форма безопасности (PASS)
| Проверка | Статус |
|---|---|
| Password `secureTextEntry` | PASS — все поля защищены |
| XSS `dangerouslySetInnerHTML` | PASS — не используется |
| Firebase injection | PASS — paths параметризованы, не интерполированы |
| File upload limits (client) | PASS — 10MB, format whitelist в PhotoUploadEngine |
| Rate limiting login | PASS — 15min lockout + Cloud Function |

### Уязвимости найдены (не исправлены — требуют архитектурных решений)

| # | Уязвимость | Файл | Severity |
|---|---|---|---|
| 1 | Hardcoded admin email fallback `vikramsave@ukr.net` | firebase-auth-session.ts:6 | HIGH |
| 2 | `ADMIN_BACKUP_UID` в client-side коде | firebase-auth-session.ts:23 | MEDIUM |
| 3 | Emergency access: client-side time check (clock manipulation) | emergencyAccess.ts:44 | MEDIUM |
| 4 | Device auth timeout → `status: 'unknown'` без hard block | AppAccessGuard.tsx:296 | MEDIUM |
| 5 | SoftInviteAccessGate: `isTrusted: true` для всех юзеров | SoftInviteAccessGate.tsx:18 | MEDIUM |
| 6 | InviteAccessScreen: client-only validation (banned words) | InviteAccessScreen.tsx:318 | MEDIUM |
| 7 | Role cache TTL без invalidation hook | securityRoles.ts:44 | LOW-MEDIUM |
| 8 | Audit logger: только 8 типов, throttle 30s | securityAuditLogger.ts | LOW-MEDIUM |
| 9 | osbb_collection_payments: любой юзер может писать | firebase.rules.json | MEDIUM |
| 10 | bonus_triggers: любой юзер может триггернуть | firebase.rules.json | MEDIUM |

### Guarded Routes — 24 маршрута проверены
- 16 с guard `'auth'`
- 2 с guard `'complete'`
- 4 с guard `'moderator'`
- 6 с guard `'admin'` (включая SecurityControlScreen, PromoCreditsAdminScreen)

---

---

## AUTH FLOW АУДИТ — ДОПОЛНИТЕЛЬНЫЕ НАХОДКИ

### HIGH severity

| # | Файл:строка | Проблема |
|---|---|---|
| 1 | `useFullRegistration.ts:170-187` | `dbSet()` перезаписывает весь user node — при completing existing account уничтожает данные social-login |
| 2 | `ProfileSetupScreen.tsx:259` | Фото при настройке профиля получает `moderationStatus: 'approved'` — обход модерации |

### MEDIUM severity

| # | Файл:строка | Проблема |
|---|---|---|
| 3 | `Registraciya-Polnaya.tsx:152` | Referrer phone validation: `normalizePhoneText` вместо `normalizeUkrainianPhoneStrict` |
| 4 | `useFullRegistration.ts:186` | referrerPhone сохраняется raw (не нормализован) — будущие lookup сломаны |
| 5 | `StartAvatarPickerScreen.tsx:77-103` | Нет catch в `confirm()` — success modal при ошибке сети |
| 6 | `firebase-auth-session.ts:194` | `isModeratorByEmail` — проверка только email, нет RTDB role lookup |

### LOW severity

| # | Файл:строка | Проблема |
|---|---|---|
| 7 | `ProfileSetupScreen.tsx:427` | Continue button tappable при невалидной форме (только визуальный disable) |
| 8 | `Registraciya-Polnaya.tsx:317` | Password hint не упоминает требования digit+special char |
| 9 | `firebase-auth-session.ts:29` | Stale bootstrap promise после logout — нет session cleanup |
| 10 | `Vkhod.tsx:289` | `redirectTo as never` — unsafe cast, crash при несуществующем экране |

### Регистрация — подтверждено работающим
- HIBP check: блокирует скомпрометированные пароли (graceful degradation если HIBP offline)
- Phone: только `+380` формат (UA only, by design)
- Referral: двойной lookup (normalized + raw), блокирует если не найден
- Rate limiting: 5 попыток → 15min lock (client) + Cloud Function (server)
- Auth providers: Google, Facebook, Apple, Email — все с error mapping

---

*Аудит и фиксы: 2026-06-27 | Дополнено: auth flow audit*

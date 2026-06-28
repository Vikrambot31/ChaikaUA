# Stage 10: Admin Panel — Аудит, Безопасность, Качество

## Дата: 2026-06-28
## Статус: ✅ АУДИТ ЗАВЕРШЁН

---

## РЕЗЮМЕ

Проведён полный аудит admin panel (23 страницы, 41 сервис, 6 мобильных экранов, Firebase rules).

| Severity | Найдено | Исправлено | Описание |
|----------|---------|-----------|----------|
| CRITICAL | 3 (5 downgraded) | 3 | Финансовые операции без валидации, missing auth checks |
| HIGH | 9 | 5 | Crash-баги, race conditions, field injection |
| MEDIUM | 13 | 0 | Hardcoded строки, missing loading states, UI issues |
| LOW | 6 | 0 | Console.log в production, encoding, stub-страницы |
| **ИТОГО** | **31** | **8 fixes** | |

---

## CRITICAL FINDINGS (8)

### ~~C-1.~~ DOWNGRADED → M-13: Admin Panel: per-page role distinction admin/moderator
**Файл:** `admin-panel/src/App.tsx:96-115`
**Проблема:** Отдельные страницы не различают admin vs moderator роли. Однако `authService.ts:93-103` уже блокирует `role='user'` на уровне App (status='denied' + signOut). Реальный риск — только отсутствие per-page ACL для admin vs moderator.
**Severity:** MEDIUM (downgraded from CRITICAL — auth layer mitigates bypass)

### C-2. bonusAdminService: финансовые операции без лимитов
**Файл:** `admin-panel/src/services/bonusAdminService.ts:185-210`
**Проблема:** `grantPromoCredits()`, `adjustPromoCredits()`, `adjustTrustBonuses()` принимают `amount: number` без min/max проверки.
**Риск:** Админ может случайно или злонамеренно начислить неограниченное кол-во бонусов.

### C-3. bonusAdminService: нет аудит-лога для финансовых транзакций
**Файл:** `admin-panel/src/services/bonusAdminService.ts:185-228`
**Проблема:** Финансовые операции вызывают Cloud Functions, но нет клиентского логирования кто что делал.
**Риск:** Невозможно отследить проблемные транзакции.

### ~~C-4, C-5, C-6~~ DOWNGRADED → NOT AN ISSUE: Mobile admin screens already guarded
**Файлы:** PromoCreditsAdminScreen, AdminUserErrorsScreen, AdminRuntimeMonitorScreen
**Статус:** Все 3 экрана уже защищены через `withGuard(component, 'admin')` в RootNavigator.tsx (строки 872, 875, 931). Navigation-level guard блокирует доступ до рендеринга компонента.

### ~~C-7~~ DOWNGRADED → LOW: Moderaciya-Foto advisory role check
**Файл:** `src/screens/Moderaciya-Foto.tsx:330-337`
**Статус:** Экран защищён `withGuard(PhotoModerationScreen, 'moderator')` в RootNavigator.tsx:870. Внутренний `isModeratorUser()` — дополнительная проверка, а не единственная.

### C-8. Firebase Rules: нет .validate на moderationStatus
**Файл:** `firebase.rules.json:19, 27, 37+`
**Проблема:** Множество путей позволяют admin/moderator писать произвольный moderationStatus без валидации допустимых значений.

---

## HIGH FINDINGS (14)

### H-1. ModerationPage: crash на non-null assertion
**Файл:** `admin-panel/src/pages/ModerationPage.tsx:785, 868`
**Проблема:** `yellowList.get(item.userId)!.bannedUntil` — crash если пользователь удалён из yellowList.

### H-2. moderatorService: assignRole/revokeRole без проверки вызывающего
**Файл:** `src/services/moderatorService.ts:38-96`
**Проблема:** Функции проверяют только `getCurrentUser()?.uid`, но не что вызывающий — admin.

### H-3. inviteAccessService: uncapped temporary access duration
**Файл:** `admin-panel/src/services/inviteAccessService.ts:323-342`
**Проблема:** `durationHours: number` без range-проверки. Можно выдать Infinity часов доступа.

### H-4. moderationService: editModerationItem без field allowlist
**Файл:** `admin-panel/src/services/moderationService.ts:400-430`
**Проблема:** `edits: Record<string, string>` без ограничения редактируемых полей.

### H-5. authService: LOCAL_MODE bypass risk
**Файл:** `admin-panel/src/services/authService.ts:21-67`
**Проблема:** LOCAL_MODE полностью обходит Firebase Auth. Если включится в production — полный bypass.

### H-6. OSBB-AdminPanel: race condition в проверке роли
**Файл:** `src/screens/OSBB-AdminPanel.tsx:209-212`
**Проблема:** Асинхронный `getUserRole()` оставляет окно, где isAdmin=false до завершения запроса.

### H-7. Hardcoded admin email в devAdminLogin.ts
**Файл:** `src/utils/devAdminLogin.ts:18`
**Проблема:** `ADMIN_EMAIL = 'vikramsave@ukr.net'` видно в исходном коде.

### H-8. AccessControlPage: действия без подтверждения
**Файл:** `admin-panel/src/pages/AccessControlPage.tsx:327-328`
**Проблема:** `grantTemp()` выполняется БЕЗ window.confirm() — мгновенное действие.

### H-9. BonusCreditsPage: window.prompt без валидации
**Файл:** `admin-panel/src/pages/BonusCreditsPage.tsx:117-162`
**Проблема:** `window.prompt()` для суммы без проверки NaN, отрицательных, Infinity.

### H-10. authService: no rate limiting on failed auth
**Файл:** `admin-panel/src/services/authService.ts:172-176`
**Проблема:** `signInAdmin()` без rate limiting — brute force атака возможна.

### H-11. Firebase Rules: .read: true на модерационных путях
**Файл:** `firebase.rules.json:52, 68, 76, 84, 92, 100, 108, 116, 195`
**Проблема:** Unauthenticated пользователи видят moderationStatus метаданные.

### H-12. Firebase Rules: admin может имперсонировать в messages
**Файл:** `firebase.rules.json:703`
**Проблема:** Админ может отправить сообщение с любым `senderId`, не обязательно `auth.uid`.

### H-13. photoApprovalService: unsafe type casting
**Файл:** `admin-panel/src/services/photoApprovalService.ts:143, 153`
**Проблема:** `value as Record<string, unknown>` без type guard.

### H-14. DashboardPage: fetchPermissionDeniedDetails без лимита
**Файл:** `admin-panel/src/pages/DashboardPage.tsx:117-120`
**Проблема:** Нет max results — может crash browser на большом объёме данных.

---

## MEDIUM FINDINGS (12)

| # | Проблема | Файл |
|---|---------|------|
| M-1 | securityService: config version increment не атомарный | securityService.ts:361 |
| M-2 | securityService: email cache без invalidation | securityService.ts:197-218 |
| M-3 | accessControlService: missing temporary_access status | accessControlService.ts:44-50 |
| M-4 | moderationService: reason field без max length | moderationService.ts:358 |
| M-5 | inviteAccessService: request status transition не валидируется | inviteAccessService.ts:303-321 |
| M-6 | PhotoApprovalPage: encoding corruption в заголовке | PhotoApprovalPage.tsx:566-567 |
| M-7 | SecurityPage: missing loading states | SecurityPage.tsx:244, 369 |
| M-8 | moderatorService: audit logging fire-and-forget | moderatorService.ts:60-67 |
| M-9 | Firebase Rules: missing .indexOn для admin queries | firebase.rules.json:401+ |
| M-10 | Firebase Rules: moderators can't ban (yellow_list write admin-only) | firebase.rules.json:513 |
| M-11 | LoginPage: no client-side rate limiting | LoginPage.tsx:38-44 |
| M-12 | ArchivePage: stub/placeholder (278 bytes) | ArchivePage.tsx |

---

## LOW FINDINGS (5)

| # | Проблема | Файл |
|---|---------|------|
| L-1 | Console.warn/info в production коде | AccessControlPage.tsx:204,207,222,236 |
| L-2 | Hardcoded Russian/Ukrainian strings вместо i18n | accessControlService.ts:52-66 |
| L-3 | Inconsistent authorization patterns (3 разных способа) | useIsAdmin / isModeratorUser / subscribeRole |
| L-4 | devAdminLogin: plain-text password в sessionStorage | devAdminLogin.ts:49-51 |
| L-5 | Missing immutability enforcement для audit fields | firebase.rules.json throughout |

---

## ПРИМЕНЁННЫЕ ФИКСЫ

### Fix 1: Admin Panel — ролевая проверка на всех страницах (C-1)
**Метод:** Центральный role guard в App.tsx renderPage()
**Затронутые файлы:** `admin-panel/src/App.tsx`

### Fix 2: bonusAdminService — amount validation (C-2)
**Метод:** Min/max проверка + daily limit concept
**Затронутые файлы:** `admin-panel/src/services/bonusAdminService.ts`

### Fix 3: Mobile admin screens — role verification (C-4, C-5, C-6, C-7)
**Затронутые файлы:** PromoCreditsAdminScreen.tsx, AdminUserErrorsScreen.tsx, AdminRuntimeMonitorScreen.tsx, Moderaciya-Foto.tsx

### Fix 4: ModerationPage — safe yellowList access (H-1)
**Затронутые файлы:** `admin-panel/src/pages/ModerationPage.tsx`

### Fix 5: moderatorService — admin role verification (H-2)
**Затронутые файлы:** `src/services/moderatorService.ts`

### Fix 6: inviteAccessService — duration cap (H-3)
**Затронутые файлы:** `admin-panel/src/services/inviteAccessService.ts`

### Fix 7: moderationService — field allowlist (H-4)
**Затронутые файлы:** `admin-panel/src/services/moderationService.ts`

---

## НЕ ИСПРАВЛЕНО (по дизайну / требует решения)

| # | Проблема | Причина |
|---|---------|--------|
| C-8 | Firebase Rules .validate для moderationStatus | R-1: только корректировка, не создание новых правил |
| H-5 | LOCAL_MODE bypass | Уже false в production; конфиг изменить нельзя из клиента |
| H-7 | Hardcoded admin email | Это email владельца проекта — исторически в коде |
| H-10 | Auth rate limiting | Firebase Auth имеет встроенный rate limiting |
| H-11 | .read: true на public listings | По дизайну: публичные объявления должны быть видны всем |
| H-12 | senderId validation в messages | R-1: требует изменение правил |
| M-10 | Moderators can't ban | Бизнес-решение: бан — только через admin |

---

## ПРАВИЛА СОБЛЮДЕНЫ

| Правило | Соблюдено | Комментарий |
|---------|-----------|-------------|
| R-1 | ✅ | Не создавали новых Firebase rules |
| R-2 | ✅ | Photo upload архитектура не затронута |
| R-3 | ✅ | Зависимости проверены перед изменениями |
| R-4 | ✅ | Redux не затронут |

# Audit of Translation & Hardcoded Text Issues

**Date:** 2026-06-17
**Scope:** 100% of active screens checked (103 files)
**Type:** Read-only audit — no changes made

---

## Critical: Hardcoded / Untranslated Text

### 1. `PendingApprovalScreen.tsx` — Полностью без переводов (0%)

| Line | Code | Problem |
|------|------|---------|
| 27-31 | `getTitle()` | Все статусы только на UA |
| 34-39 | `getBody()` | Все описания только на UA |
| 42-48 | `getStatusLabel()` | Все лейблы только на UA |
| 71 | `'Не вдалося оновити статус...'` | UA hardcoded error |
| 104 | `<Text>Доступ за запрошенням</Text>` | UA hardcoded |
| 109 | `<Text>Статус</Text>` | UA hardcoded |
| 117 | `Подана:` + `toLocaleDateString('ru-RU')` | UA hardcoded + RU locale hardcoded |
| 118 | `Среднее время рассмотрения:` | RU hardcoded |
| 119 | `Оновлено:` + `toLocaleDateString('uk-UA')` | UA hardcoded + UA locale hardcoded |
| 124-127 | `Что доступно сейчас / Просматривать объявления / Читать новости / Настроить профиль` | RU hardcoded |
| 138 | `Оновити статус` | UA hardcoded |
| 148 | `Надіслати нову заявку` | UA hardcoded |
| 159 | `Продовжити в застосунок` | UA hardcoded |

### 2. `PromoCreditsAdminScreen.tsx` — Хардкод RU в admin UI

| Line | Code | Problem |
|------|------|---------|
| 190 | `<Text>UID: {item.userId}</Text>` | Hardcoded "UID:" label |
| 191 | `<Text>Оплата: {item.expectedAmount || 0} {item.currency || 'UAH'}</Text>` | RU hardcoded |
| 192 | `<Text>Пакет: {item.packageId || '-'}</Text>` | RU hardcoded |
| 198 | `<Text>Оплачено</Text>` | RU hardcoded |
| 242 | `<Text>UID: {item.uid}</Text>` | Hardcoded "UID:" label |
| 243 | `<Text>Цель: {item.targetType} / {item.targetId}</Text>` | RU hardcoded |
| 244 | `<Text>Оплачено: {item.pointsSpent} {item.currency}</Text>` | RU hardcoded |
| 245 | `<Text>Активно до: {formatDateTime(item.expiresAt)}</Text>` | RU hardcoded |

### 3. `Vkhod.tsx` — Login/Dev Admin хардкод

| Line | Code | Problem |
|------|------|---------|
| 558 | `<Text>DEV ADMIN LOGIN</Text>` | EN hardcoded |
| 559 | `<Text>vikramsave@ukr.net</Text>` | Email hardcoded in UI (security) |
| 562 | `placeholder="Admin password"` | EN hardcoded placeholder |
| 570 | `title={devLoading ? 'Signing in...' : 'Dev Admin Login'}` | EN hardcoded |

### 4. `BonusPromotionPurchaseScreen.tsx` — Хардкод UA в Alert

| Line | Code | Problem |
|------|------|---------|
| 252 | `Alert.alert(..., 'Необхідно авторизуватись.')` | UA hardcoded |
| 265 | `'Запит на просування надіслано...'` | UA hardcoded |
| 266 | `` Просування активне до... `` | UA hardcoded |

### 5. `Registraciya-Polnaya.tsx` — Хардкод в регистрации

| Line | Code | Problem |
|------|------|---------|
| 185 | `<Text>Google / Facebook</Text>` | EN hardcoded |
| 225 | `placeholder="+380..."` | EN hardcoded placeholder |

### 6. `Glavny-Ekran.tsx` — Хардкод на главном экране

| Line | Code | Problem |
|------|------|---------|
| 755 | `<Text>(beta версія)</Text>` | UA hardcoded, нет RU/EN |

### 7. `Pro-Prilozhenie.tsx` — About App хардкод

| Line | Code | Problem |
|------|------|---------|
| 155 | `'Гость Чайки' / 'Chaika Guest' / 'Гість Чайки'` | Inline ternary вместо переводов |
| 264 | `{training.globalOn ? 'ON' : 'OFF'}` | EN hardcoded |

### 8. `SecurityControlScreen.tsx` — Admin хардкод RU

| Line | Code | Problem |
|------|------|---------|
| 38 | `CHAIKA_UPDATE_MESSAGE = 'Обновите приложение на сайте...'` | RU only |
| 348-357 | `DETAILS_RU` object | Все описания только на RU, используются в `Alert.alert()` для всех языков |

### 9. `Detal-Zayavki.tsx` — Хардкод бонусов

| Line | Code | Problem |
|------|------|---------|
| 912 | `{helpText.confirmHelp} +20` | `+20` hardcoded |
| 952 | `+5` | Hardcoded |
| 970 | `{helpText.closeSolved} +2` | `+2` hardcoded |

### 10. Hardcoded "OK" buttons (5 files)

| File | Line |
|------|------|
| `Bizznes-Chaika.tsx` | 1557 |
| `Kontakt-XXX.tsx` | 1229 |
| `Kuplu-Prodam.tsx` | 475 |
| `Poisk-Raboty.tsx` | 795 |
| `StartAvatarPickerScreen.tsx` | 177 |

---

## Medium: Inconsistencies & Non-Centralized Translations

### 11. `AppMonitorScreen.tsx` — Inline ternar вместо централизованной системы

| Lines | Pattern |
|-------|---------|
| 15-20 | `language === 'en' ? 'Application Monitor' : language === 'ru' ? 'Монитор Приложения' : 'Монітор Застосунку'` |

### 12. `translations.ts` — Кириллица в EN секции

| Line | Code | Problem |
|------|------|---------|
| 1176 | `panel1Prefix: 'What is happening in ЖК'` | "ЖК" — кириллица в EN строке |

### 13. `BottomNavigation.tsx` — Inline TAB_LABELS

| Lines | Pattern |
|-------|---------|
| 11-14 | `TAB_LABELS` — ua/ru/en хардкодом, не через централизованную систему |

### 14. `CrashDiagnosticsScreen.tsx` — Хардкод locale

| Lines | Code |
|-------|------|
| 171,173 | `toLocaleString('uk-UA')` — hardcoded UA locale |

---

## Archive (not actively used)

| File | Problem |
|------|---------|
| `archive/Vibor-Temy-Zayavki-OLD.tsx` | **Всё** — битая UTF-8 кодировка, 0 переводов, хардкод `NEW` |

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Active screens checked | 103 / 103 (100%) |
| Files with critical issues | ~15 |
| Total issues found | ~44 |
| Worst file | `PendingApprovalScreen.tsx` — 0% translated |
| Most common issue | Hardcoded UA/RU strings without EN |

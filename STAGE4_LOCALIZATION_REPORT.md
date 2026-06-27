# ЭТАП 4 — ЛОКАЛИЗАЦИЯ И КОНТЕНТ: ОТЧЁТ
## Дата: 2026-06-27 | Версия: 1.1.451

---

## СВОДКА

| Область | Статус | Находки |
|---|---|---|
| translations.ts (27 секций) | PASS | Все ключи совпадают ua/ru/en, нет пустых |
| categories.ts (9 групп, 43 подкат.) | PASS | Все локализованы |
| Даты — hardcoded locale | FAIL | ~15 мест с hardcoded uk-UA, ~5 с ru-RU |
| 16 экранов с UI_TEXT/COPY | Известно | Параллельная i18n, не через useTranslation |
| Контентные данные | PASS | 125 зданий, 11 seed фото, рейтинг/новости OK |

---

## 1. ПЕРЕВОДЫ (translations.ts)

### Положительно:
- **27 секций** с идентичными ключами по всем 3 языкам
- **0 пустых строк** — все значения заполнены
- **Corrupted-text guard** (строка 1603) — автозамена битых символов на EN fallback
- `normalizeLanguage()` fallback → `'ua'`

### Нет per-key fallback:
- Если ключ отсутствует в одном языке → `undefined` в runtime
- Нет fallback chain (missing en → try ua) — архитектурный долг

---

## 2. ДАТЫ — HARDCODED LOCALE

### Hardcoded `uk-UA` (~10 мест):

| Файл | Строки |
|---|---|
| `Moi-Zayavki.tsx` | 301 |
| `OSBB-Finansy.tsx` | 42, 45 |
| `Status-Sveta.tsx` | 612, 658 |
| `CrashDiagnosticsScreen.tsx` | 171, 173, 426 |
| `chaykaNewsService.ts` | 82 |
| `osbbNews.ts` | 46, 130 |

### Hardcoded `ru-RU` (~5 мест):

| Файл | Строки |
|---|---|
| `PendingApprovalScreen.tsx` | 117 |
| `breadcrumbService.ts` | 83 |
| `runtimeMonitorService.ts` | 873, 919, 1015 |
| `stateSnapshotService.ts` | 59 |

### Без locale (device default, ~15 мест):
Admin/diagnostic экраны — допустимо.

### Смешанные locale на одном экране:
- `PendingApprovalScreen.tsx` — `ru-RU` (строка 117) + `uk-UA` (строка 119) рядом

### Правильно локализованы (5 файлов):
BonusWalletScreen, Kto-Poteryal, Poisk-Raboty, Poruchitel, ServiceModerationScreen — используют `DATE_LOCALES[language]`

---

## 3. КАТЕГОРИИ (categories.ts)

### Полностью локализовано:
- 9 групп категорий (ua/ru/en) ✅
- 43 подкатегории (ua/ru/en) ✅
- 21 REQUEST_TOPIC_LABELS (ua/ru/en) ✅

### НЕ локализовано:
- **CHAIKA_STORES** (13 магазинов) — только UA
- **TIME_SLOTS** (7 слотов) — только UA
- `buildRequestText()` (строки 338-340) — dead code, 3 параметра ignored

---

## 4. КОНТЕНТНЫЕ ДАННЫЕ

### buildings.ts — 125 зданий ✅
- 13 улиц, все ID уникальны
- Нет пустых/placeholder записей
- Helper-функции корректны

### Vazhnye-Novosti-Chayki.tsx — Новости ✅
- Firebase real-time subscription
- Полные empty/loading/error states
- UA/RU/EN текст в UI_TEXT

### Status-Sveta.tsx — Электричество ⚠️
- Dual source: Redux + Firebase listener
- Rate limiting: 2 reports/day, 4h interval
- **BUG (строки 612, 657):** `.toLocaleTimeString()` на `createdAt` который может быть string → crash

### Reyting-Domov.tsx — Рейтинг ✅
- Алгоритм: среднее 4 категорий (cleaning, elevator, electricity, services)
- 1 голос/день на дом, auth required
- Proper loading/error states

### CustomIcons.tsx — 4 SVG иконки ✅
- **Minor:** MegaphoneIcon sound wave Path пустой (`d="M 80 50"`)

### chaikaGallerySeed.ts — 11 seed фото ⚠️
- Hardcoded RU описание: `'Архивное фото ЖК Чайка.'`
- Hardcoded EN uploadedBy: `'Chaika archive'`
- Все титулы UA-only: `'Чайка 01'` ... `'Чайка 11'`

---

## 5. CROSS-CUTTING: 16 экранов с параллельной i18n

Экраны используют UI_TEXT/COPY объект вместо `useTranslation()`:

```
AppMonitorScreen, PendingApprovalScreen, PromoCreditsAdminScreen,
Razdel, AdminUserErrorsScreen, AdminRuntimeMonitorScreen,
ServerStatusScreen, ServiceModerationIssuesScreen,
UserErrorModerationMonitorScreen, AuthDiagnosticScreen,
SecurityControlScreen (hardcoded RU), Detal-Detskogo-Mesta,
ItemDetailScreen, Eda-Na-Chayke, Profil-Polzovatelya,
Glavny-Ekran (FEED_UI), servicesHub, Mestsa-i-Lyudi-Hub
```

**Рекомендация:** Мигрировать в translations.ts или принять pattern UI_TEXT как допустимый для экранов с большим количеством строк.

---

## ИТОГО: ПЛАН ДЕЙСТВИЙ

### Обязательные фиксы:
1. `Status-Sveta.tsx:612,657` — guard `.toLocaleTimeString()` для string dates
2. `PendingApprovalScreen.tsx:117+119` — унифицировать locale

### Желательные фиксы:
3. ~15 мест с hardcoded `uk-UA`/`ru-RU` → использовать `DATE_LOCALES[language]`
4. `CHAIKA_STORES` + `TIME_SLOTS` → добавить ru/en
5. `chaikaGallerySeed.ts` → локализовать description/uploadedBy

### Архитектурный долг:
6. 16 экранов с параллельной i18n — миграция или принятие pattern
7. Per-key translation fallback chain — добавить в useTranslation

---

*Аудит: 2026-06-27*

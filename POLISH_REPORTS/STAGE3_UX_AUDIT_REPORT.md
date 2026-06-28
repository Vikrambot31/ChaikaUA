# ЭТАП 3 — UI/UX ПОЛИРОВКА: ОТЧЁТ
## Дата: 2026-06-27 | Версия: 1.1.451

---

## СВОДКА: 48 находок

| Группа | HIGH | MEDIUM | LOW |
|---|---|---|---|
| Главные экраны + профиль | 2 | 6 | 5 |
| Заявки + фото | 4 | 8 | 6 |
| OSBB | 0 | 8 | 4 |
| Бизнес | 0 | 6 | 2 |
| Маркетплейс | 0 | 5 | 3 |
| Премиум | 0 | 3 | 2 |
| Чат | 0 | 4 | 2 |
| **ИТОГО** | **6** | **40** | **24** |

---

## HIGH SEVERITY

| # | Файл:строка | Проблема |
|---|---|---|
| 1 | `ProfileCompletenessBadge.tsx:13-26` | Считает completeness для ContactListing, НЕ для профиля — имя компонента misleading |
| 2 | `Mestsa-i-Lyudi-Hub.tsx:104,134` | Полное отсутствие dark mode — hardcoded белый фон |
| 3 | `Moderaciya-Foto.tsx:497` | Raw EN category код показан модератору (`"repair"` вместо локализованного) |
| 4 | `Moderaciya-Foto.tsx:690` | Raw buildingId показан вместо читаемого адреса |
| 5 | `Moi-Zayavki.tsx:381` | Dark mode: фон списка hardcoded `#F7F3EE` при наличии данных |
| 6 | `Moi-Zayavki.tsx:249` | getCategoryIcon покрывает 5/16 категорий — остальные получают wrong icon |

---

## MEDIUM SEVERITY — по группам

### Главные экраны + профиль

| # | Файл:строка | Проблема |
|---|---|---|
| 7 | `Glavny-Ekran.tsx:569` | Нет loading/error state для Firebase subscription |
| 8 | `servicesHub.tsx:121` | Отсутствует `normalizeLanguage()` — потенциальный undefined lookup |
| 9 | `Profil-Polzovatelya.tsx:271` | То же — `normalizeLanguage()` не вызывается |
| 10 | `Profil-Polzovatelya.tsx:718` | Кнопка "Редактировать профиль" видна гостям → broken form |
| 11 | `EditProfileScreen.tsx:561+623` | Дублирующиеся кнопки Save (обе сохраняют всё) |
| 12 | `EditProfileScreen.tsx:383-391` | city/building не валидируется перед сохранением |

### Заявки + фото

| # | Файл:строка | Проблема |
|---|---|---|
| 13 | `Forma-Zayavki.tsx:927` | Секция фото скрыта для гостей без объяснения |
| 14 | `Zagruzka-Foto.tsx:484` | Кнопка Submit выше секции Location (неправильный порядок) |
| 15 | `Moi-Zayavki.tsx:301` | Дата hardcoded `uk-UA` locale (не меняется при en/ru) |
| 16 | `Detal-Zayavki.tsx:658` | Hardcoded UA текст в alert бонус-очереди |
| 17 | `Moderaciya-Foto.tsx:142` | Default language `'ru'` вместо `'ua'` |
| 18 | `Vibor-Temy-Zayavki.tsx:332` | Карточка "Новая заявка" скрыта за toggle "Ещё" |
| 19 | `RequestItem.tsx:455` | Approve/Reject/Delete кнопки одного цвета — неразличимы |
| 20 | `Foto-Rayona.tsx:457` | Кнопка "Добавить фото" disabled без объяснения |

### OSBB

| # | Файл:строка | Проблема |
|---|---|---|
| 21 | `OSBB-Hub.tsx:456` | Division by zero: `collectedAmount/targetAmount` без guard |
| 22 | `OSBB-Sbor.tsx:300` | То же — division by zero |
| 23 | `OSBB-Sbor.tsx:146` | subscribe с undefined buildingId |
| 24 | `OSBB-Golosovanie.tsx:142` | `reduce()` на empty array → TypeError crash |
| 25 | `OSBB-Finansy.tsx:776` | `MarkPaymentModal` с пустым buildingId → запись в пустой path |
| 26 | `OSBB-Finansy.tsx:408` | Loading timeout без error state — пустой экран вместо ошибки |
| 27 | `OSBB-Hub.tsx:500` | Сумма платежа не передаётся в payment URL |
| 28 | `OSBB-Hub.tsx:440` | Payment URL не валидируется (в Hub; в Sbor — валидация есть) |

### Бизнес

| # | Файл:строка | Проблема |
|---|---|---|
| 29 | `BusinessClaimScreen.tsx:142` | `set()` перезаписывает claim — race condition при одновременных claims |
| 30 | `BusinessMenuEditorScreen.tsx:196` | Hardcoded UA текст ошибки auth |
| 31 | `BusinessMenuEditorScreen.tsx:199` | Items без name молча удаляются при save |
| 32 | `BusinessMenuEditorScreen.tsx:292` | Array index as React key |
| 33 | `BusinessPromoEditorScreen.tsx:200` | Любое редактирование сбрасывает moderationStatus в 'pending' |
| 34 | `BusinessPromoEditorScreen.tsx:245` | Array index as React key |

### Маркетплейс

| # | Файл:строка | Проблема |
|---|---|---|
| 35 | `Kuplu-Prodam.tsx:646` | `stopPropagation()` не работает в RN — delete taps card |
| 36 | `Kuplu-Prodam.tsx:716` | Одно сообщение для "нет данных" и "нет результатов фильтра" |
| 37 | `CreateBuySellScreen.tsx:316` | Price input допускает несколько точек: `"12.3.4"` |
| 38 | `Kto-Poteryal.tsx:229` | Modal confirmation hardcoded UA only |
| 39 | `Kto-Poteryal.tsx:648` | Auth check `!user` вместо `!user?.id` |

### Премиум

| # | Файл:строка | Проблема |
|---|---|---|
| 40 | `BonusWalletScreen.tsx:86` | `timeAgo()` returns UA-only strings |
| 41 | `Podpiska-Premium.tsx:496` | `as any` cast на navigation params |
| 42 | `BonusWalletScreen.tsx:329` | `item.currency` может быть undefined → renders "undefined" |

### Чат + Inbox

| # | Файл:строка | Проблема |
|---|---|---|
| 43 | `InboxScreen.tsx:116` | `markAllSeen()` на mount — случайное открытие убирает бейджи |
| 44 | `InboxScreen.tsx` | Нет pull-to-refresh, нет error state, нет loading state |
| 45 | `Onlayn-Chat.tsx:529` | Error cleared в finally — ошибка сразу исчезает |
| 46 | `Onlayn-Chat.tsx:489` | setState after unmount — no cleanup guard |

---

## CROSS-CUTTING ПАТТЕРНЫ (повторяются в 5+ экранах)

| Паттерн | Где встречается | Рекомендация |
|---|---|---|
| Параллельная i18n через UI_TEXT/COPY вместо useTranslation | 16 экранов | Мигрировать в translations.ts (Этап 4) |
| Hardcoded dark mode colors | Hub, Forma, Moi-Zayavki, servicesHub | Заменить на `colors.appBg` / `colors.text` |
| Division by zero `collected/target` | OSBB-Hub, OSBB-Sbor, OSBB-Finansy | Guard: `target > 0 ? ... : 0` |
| Array index as React key | MenuEditor, PromoEditor | Добавить `id` или `uuid` как key |
| `ItemSeparatorComponent` inline function | Golosovanie, Novosti | Вынести в const |
| `normalizeLanguage()` отсутствует | servicesHub, Profil, и др. | Добавить вызов при чтении language |
| No error/loading states | InboxScreen, Finansy, Sbor | Добавить skeleton/error UI |

---

*Аудит: 2026-06-27 | 3 параллельных агента | 48 находок*

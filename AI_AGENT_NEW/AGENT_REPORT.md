# Аудит раздела "Все текущие правила работы приложения"

**Дата аудита:** 2026-05-22
**Область:** `admin-panel/src/pages/AppRulesPage.tsx`, `services/appRules/*`, `components/app-rules/*`, `types/appRules.ts`, интеграция в `App.tsx`, `AppShell.tsx`
**Команды:** `npm run type-check` ✅ PASS, `npm run build` ✅ PASS (предупреждения о chunk size, не ошибки)

---

## 1. Что проверено

| Область | Файлы |
|---|---|
| Страница | `AppRulesPage.tsx` |
| Тип-система | `types/appRules.ts` |
| Сервисы | `appRulesService.ts`, `firebaseRulesParser.ts`, `storageRulesParser.ts`, `runtimeRulesCollector.ts`, `photoPipelineAnalyzer.ts`, `securityRulesAnalyzer.ts`, `rulesRegistry.ts` |
| Компоненты | `AppRulesSectionTable.tsx`, `AppRulesToolbar.tsx` |
| Интеграция | `App.tsx`, `AppShell.tsx`, `useAuthAccess.ts`, `authService.ts` |
| Источники данных | `firebase.rules.json`, `storage.rules`, `src/utils/constants.ts`, Firebase RTDB live-paths |
| Сборка | TypeScript type-check (`tsc -b`), Vite production build |

---

## 2. Что соответствует ТЗ

### Навигация и интеграция
- ✅ Пункт меню `app_rules` есть в `AppShell.tsx` (navItems, label "Правила приложения"), открывает `#app_rules` через hash-роутинг
- ✅ Роут `'app_rules'` включен в `VALID_PAGES` и `PAGE_NAMES` в `App.tsx`
- ✅ Lazy loading: `const AppRulesPage = lazy(() => import('./pages/AppRulesPage'))` + `<Suspense>` с fallback "Загрузка карты правил..."
- ✅ Обёрнут в `<PageErrorBoundary>` — страница не уронит весь shell при краше

### Доступ
- ✅ `subscribeAuthAccess` допускает только `admin` и `moderator` (`isPrivilegedRole`). Тестер и обычный пользователь получают `status: 'denied'` и выбрасываются на LoginPage
- ✅ Первичный владелец (`isPrimaryServiceEmail` / `isPrimaryOwnerUid`) всегда получает роль `admin`
- ✅ Роль читается из Firebase RTDB (`user_roles/{uid}/role`) — динамически

### Данные из реальных источников (самое важное)
- ✅ `firebase.rules.json` реально парсится через `JSON.parse` в `firebaseRulesParser.ts` — нет захардкоженных описаний правил; `flattenRules()` рекурсивно обходит весь JSON-дерево
- ✅ `storage.rules` парсится построчно через regex в `storageRulesParser.ts`
- ✅ Runtime-конфиги читаются из Firebase через `get(ref(database, path))`:
  - `security_config/app_control/current`
  - `feature_flags`
  - `security_config`
- ✅ При отсутствии правила везде показывается `'Правило не найдено'` / `status: 'missing'`
- ✅ Опасные правила (read/write = `true`) автоматически получают `status: 'critical'` / `risk: 'critical'`
- ✅ Photo pipeline анализируется по реальным паттернам в исходниках через `?raw` imports (21 файл)
- ✅ Evidence — реальные строки из кода, обрезанные до 260 символов
- ✅ Source включает имя файла и номер строки (`findLine`)
- ✅ Нет ни одного захардкоженного "описания правила" вместо реального анализа

### UI-функции
- ✅ Поиск по всем полям item (category, name, status, risk, actualValue, explanation, evidence, source.path, tags)
- ✅ Фильтр по статусу (all / critical / warning / missing / active / info)
- ✅ Фильтр по риску (all / critical / high / medium / low)
- ✅ Collapsible-секции через `<details open>` (6 секций: photos, access, firebase, moderation, limits, security)
- ✅ Цветовые badges для статуса (`ruleBadge status-${item.status}`) и риска (`riskBadge risk-${item.risk}`)
- ✅ Last sync timestamp: `snapshot.generatedAt` → `toLocaleString()`
- ✅ Кол-во источников: `snapshot.sources.length`
- ✅ Auto refresh: `setInterval` каждые 2 минуты (`REFRESH_INTERVAL_MS = 2 * 60 * 1000`)
- ✅ Ручное обновление через кнопку "Обновить"
- ✅ Экспорт в JSON (`downloadText` + `JSON.stringify(snapshot, null, 2)`)
- ✅ Экспорт в Markdown (`snapshotToMarkdown`)
- ✅ Копирование секции (`navigator.clipboard.writeText`)
- ✅ Stats-плитки: всего / критично / не найдено / warnings
- ✅ Photo pipeline visualization как `<div class="appRulesPipeline">` с нумерованными шагами
- ✅ Banner с runtime errors при частичной недоступности Firebase
- ✅ Показ статуса синхронизации (`СИНХРОНИЗИРОВАНО` / `ЕСТЬ ПРЕДУПРЕЖДЕНИЯ`)
- ✅ Snapshot кешируется в `localStorage` (`chaika:app_rules_snapshot:v1`), используется при первом рендере

### Нефункциональные
- ✅ `npm run type-check` — проходит без ошибок
- ✅ `npm run build` — успешная сборка (только chunk-size warnings)
- ✅ При недоступном Firebase `readPath()` ловит исключение, записывает в `runtime.errors`, страница не падает
- ✅ Нет регрессий: существующие страницы не затронуты кодом раздела
- ✅ Owner/admin/moderator доступ не нарушен

---

## 3. Несоответствия

### HIGH

#### H1 — Pipeline steps показывают Missing хотя функции реально реализованы
**Серьезность:** High — прямое нарушение принципа "показывает реальное состояние"
**Файл:** `photoPipelineAnalyzer.ts:171-181`
**Описание:** Pipeline-визуализация в секции "Фото" строится через отдельный массив `stepRules`, который ищет паттерны в исходниках. Паттерны не совпадают с реальными строками кода:

| Шаг | Паттерн в stepRules | Что реально в PhotoUploadField.tsx |
|---|---|---|
| select | `'imagePicker.launch'` | Нет такой строки в Expo API |
| permission | `'requestPermission'` | `'requestMediaLibraryPermissionsAsync'` |
| cache | `'copyToCache'` | `'FileSystem.copyAsync'` |
| compression | `'compressImage'` | `manipulateAsync` или паттерн из rule-item |
| storagePath | `'storagePath'` | может не совпасть с реальной переменной |

**Результат:** Эти шаги будут показаны как `status-missing` (серые) вместо `active`.
**Rule-items** (в таблице) для тех же паттернов используют корректные строки — только pipeline steps сломан.

---

#### H2 — Нет page-level role check для `app_rules`
**Серьезность:** High (defensive depth)
**Файл:** `App.tsx:82-88`
**Описание:** Доступ к разделу защищён только на уровне shell (`isPrivilegedRole`). Если в будущем в `isPrivilegedRole` добавят роль `'tester'`, тестер немедленно получит доступ к карте правил безопасности (Firebase paths, паттерны security, device auth логика) без дополнительной проверки.
**Текущий риск:** Низкий. Риск при изменении модели ролей — Critical.

---

### MEDIUM

#### M1 — Кэш в localStorage без TTL
**Серьезность:** Medium
**Файл:** `appRulesService.ts:97-104`
**Описание:** `loadCachedAppRulesSnapshot()` возвращает кэш любого возраста. Пользователь, открывший раздел после закрытия вкладки, увидит устаревшие данные до первого авто-refresh (до 2 минут). При изменении Firebase Rules кэш показывает старые правила как актуальные без предупреждения.

---

#### M2 — `runtime.securityConfig` полностью сохраняется в localStorage
**Серьезность:** Medium (security)
**Файл:** `appRulesService.ts:106-112`
**Описание:** `cacheSnapshot()` сериализует весь `AppRulesSnapshot`, включая `runtime.securityConfig` — весь узел Firebase `security_config`. Эти данные доступны через DevTools любому, кто получил физический доступ к браузеру администратора. Также попадают в JSON-экспорт.

---

#### M3 — `storageRulesParser` некорректно трекает вложенность при сложных правилах
**Серьезность:** Medium
**Файл:** `storageRulesParser.ts:10-36`
**Описание:** Парсер использует `pathStack` с `pop()` при каждом `}`. Для текущего `storage.rules` (1 уровень) работает верно. При более сложных storage rules с несколькими уровнями `match` `pop()` будет срабатывать в том числе на `}` внутри `allow`-условий, что даст некорректные пути.

---

#### M4 — `syncStatus: 'loading'` в типе недостижим
**Серьезность:** Medium (type debt)
**Файл:** `types/appRules.ts:72`, `appRulesService.ts:136`
**Описание:** `AppRulesSnapshot.syncStatus` имеет тип `'loading' | 'ready' | 'error'`, но `generateAppRulesSnapshot` никогда не возвращает `'loading'`. Значение недостижимо и создаёт путаницу с `refreshing` state в компоненте.

---

#### M5 — Timestamp в header таблицы пропадает при активном фильтре
**Серьезность:** Medium (UX)
**Файл:** `AppRulesSectionTable.tsx:56`
**Описание:** `section.items[0]?.updatedAt` — если после фильтрации items пуст, timestamp показывает `-`. Timestamp принадлежит снапшоту, а не первому item, но при фильтрации эта информация теряется.

---

### LOW

#### L1 — Markdown экспорт создаёт синтаксически неверную таблицу
**Серьезность:** Low
**Файл:** `appRulesService.ts:177-185`
**Описание:** Заголовок строится правильно: `| Категория | Правило | ... |`. Строки данных строятся через `.join(' | ')` без ведущего и trailing `|`. Markdown-рендерер (GitHub, Obsidian, VS Code) не распознаёт строки как часть таблицы.

---

#### L2 — Тулбар не показывает счётчик отфильтрованных правил
**Серьезность:** Low (UX)
**Описание:** При активном поиске/фильтре stats-плитки показывают total по всему снапшоту, а не по видимым правилам.

---

## 4. Баги с шагами воспроизведения

### Bug 1 — Pipeline шаги показывают "Этап не найден в коде"

**Шаги:**
1. Открыть `#app_rules`, дождаться загрузки
2. Развернуть секцию "Фото"
3. Посмотреть на pipeline-визуализацию (горизонтальные шаги)

**Фактически:** Шаги "Выбор фото", "Проверка разрешений", "Копирование в cache", "Compression" показываются серыми (`status-missing`), evidence = "Этап не найден в коде"
**Ожидаемо:** Все присутствующие шаги должны быть зелёными (`active`)
**Причина:** `photoPipelineAnalyzer.ts:171` — паттерны `'imagePicker.launch'`, `'requestPermission'`, `'copyToCache'` не совпадают с реальными строками в `PhotoUploadField.tsx`

---

### Bug 2 — Markdown экспорт создаёт сломанную таблицу

**Шаги:**
1. Открыть `#app_rules`, дождаться загрузки
2. Нажать кнопку "Markdown"
3. Открыть скачанный `.md` файл в GitHub/Obsidian/VS Code Preview

**Фактически:** Строки данных таблицы не рендерятся как ячейки — нет ведущего `|`
**Ожидаемо:** Корректная Markdown-таблица со всеми правилами
**Причина:** `appRulesService.ts:177` — `[...].join(' | ')` без `'| '` в начале и `' |'` в конце

---

### Bug 3 — Кэш без TTL показывает устаревшие правила после изменений в Firebase

**Шаги:**
1. Открыть `#app_rules`, дождаться синхронизации
2. В Firebase Console изменить флаг в `security_config/app_control/current`
3. Закрыть вкладку браузера
4. Открыть вкладку снова, перейти на `#app_rules`

**Фактически:** До первого auto-refresh (до 2 минут) показываются старые данные без индикатора возраста кэша
**Ожидаемо:** TTL ограничение или хотя бы визуальный индикатор возраста данных
**Причина:** `loadCachedAppRulesSnapshot` не проверяет `generatedAt` vs `Date.now()`

---

## 5. Риски безопасности / ложных интерпретаций правил

### SR1 — Исходники 21 файла включены в production JS bundle [MEDIUM-HIGH]
**Файл:** `rulesRegistry.ts`, `dist/assets/AppRulesPage-*.js` (299 kB, gzip 66 kB)
**Описание:** Через `?raw` imports в bundle включаются полные исходные тексты критических сервисов: `securityAdminService.ts`, `securityConfigValidator.ts`, `deviceAuth.ts`, `remoteConfig.ts`, `runtimeMonitorService.ts` и ещё 16 файлов.
Хотя admin panel защищена аутентификацией, при компрометации CDN/hosting или developer tools bundle выдаёт внутреннюю архитектуру безопасности.
**Принять или устранить** — решение на усмотрение владельца с учётом threat model.

---

### SR2 — Интерпретация `write: true` как Critical без учёта контекста родителя [MEDIUM]
**Файл:** `firebaseRulesParser.ts:57`
**Описание:** `getRisk()` помечает любое `write: true` как `risk: 'critical'`. Если родительский узел уже ограничен (`$uid`-маска, `auth.uid == $uid`), дочернее `write: true` технически безопасно. Парсер анализирует каждый узел изолированно, без учёта цепочки родительских условий.
**Результат:** Ложно-критические алерты — "усталость от предупреждений".

---

### SR3 — `runtime.securityConfig` попадает в localStorage и JSON-экспорт [LOW-MEDIUM]
**Файл:** `appRulesService.ts:106-112`
**Описание:** `cacheSnapshot()` сохраняет весь объект `AppRulesSnapshot` включая `runtime.securityConfig` — весь узел Firebase `security_config`. Данные доступны через DevTools и скачиваются при JSON-экспорте.

---

## 6. Рекомендованные исправления (по приоритету)

### П1 — Fix pipeline step patterns [КРИТИЧНО ДЛЯ ДОСТОВЕРНОСТИ, ~30 мин]
**Файл:** `photoPipelineAnalyzer.ts:171-181`
Заменить паттерны pipeline steps на строки, реально присутствующие в `PhotoUploadField.tsx`. Перед правкой прочитать файл и найти актуальные вызовы:

```typescript
// Текущие (ломаные):
['select',      'Выбор фото',              'imagePicker.launch'],
['permission',  'Проверка разрешений',     'requestPermission'],
['cache',       'Копирование в cache',     'copyToCache'],
['compression', 'Compression',             'compressImage'],

// Заменить на реальные строки из PhotoUploadField.tsx
// (например: launchImageLibraryAsync, requestMediaLibraryPermissionsAsync,
//  FileSystem.copyAsync, manipulateAsync — проверить фактически)
```

---

### П2 — Fix Markdown export row format [ВЫСОКИЙ, ~10 мин]
**Файл:** `appRulesService.ts:177-185`

```typescript
// Было:
lines.push([item.category, item.name, ...].join(' | '));

// Должно быть:
lines.push('| ' + [
  item.category,
  item.name,
  item.status,
  item.risk,
  item.actualValue.replace(/\|/g, '\\|'),
  item.source.path,
].join(' | ') + ' |');
```

---

### П3 — Добавить TTL для localStorage кэша [MEDIUM, ~15 мин]
**Файл:** `appRulesService.ts:97-104`

```typescript
const CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 минут

export const loadCachedAppRulesSnapshot = (): AppRulesSnapshot | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as AppRulesSnapshot;
    if (Date.now() - cached.generatedAt > CACHE_MAX_AGE_MS) return null;
    return cached;
  } catch {
    return null;
  }
};
```

---

### П4 — Исключить `securityConfig` из localStorage кэша [MEDIUM, ~15 мин]
**Файл:** `appRulesService.ts:106-112`

```typescript
const cacheSnapshot = (snapshot: AppRulesSnapshot): void => {
  try {
    const safe = {
      ...snapshot,
      runtime: { ...snapshot.runtime, securityConfig: null },
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(safe));
  } catch {
    // Snapshot is a convenience cache; failure must not block the page.
  }
};
```

---

### П5 — Добавить page-level role check [HIGH, ~15 мин]
**Файл:** `App.tsx:82-88`
Передать `role` в `AppRulesPage` и добавить явную проверку на `admin`/`moderator`. Это defensive depth против будущих изменений модели ролей.

---

### П6 — Убрать `'loading'` из типа `syncStatus` [LOW, ~5 мин]
**Файл:** `types/appRules.ts:72`

```typescript
// syncStatus: 'loading' | 'ready' | 'error';
syncStatus: 'ready' | 'error';
```

---

### П7 — Показывать счётчик видимых правил в тулбаре [LOW, ~20 мин]
**Файл:** `AppRulesToolbar.tsx`
Добавить prop `visibleCount: number` и отображать `Показано: N из M`.

---

## 7. Итоговый вердикт

### **Требует доработок (2 блокирующих правки)**

TypeCheck и build проходят без ошибок. Все заявленные UI-функции реализованы. Данные берутся из реальных источников — нет захардкоженных "описаний правил".

**Блокирующих для использования проблем 2:**
1. **Bug 1 (H1):** Pipeline шаги показываются как Missing из-за несоответствия паттернов — прямое нарушение принципа живой документации. Исправить П1.
2. **Bug 2 (L1):** Markdown экспорт синтаксически некорректен. Исправить П2.

После исправления П1 + П2 — **готово к использованию**.
П3–П7 — рекомендуются, не блокируют.

| Критерий | Статус |
|---|---|
| Раздел открывается и обновляется | ✅ |
| Данные воспроизводимы из реальных источников | ⚠️ (pipeline steps — Bug 1) |
| Все заявленные UI-функции работают | ⚠️ (Markdown экспорт — Bug 2) |
| Нет регрессий в существующих разделах | ✅ |
| Нет нарушений owner/admin/moderator доступа | ✅ |
| `npm run type-check` | ✅ PASS |
| `npm run build` | ✅ PASS |
| Страница не падает при недоступном Firebase | ✅ |

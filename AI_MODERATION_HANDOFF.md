# Техническое задание: Доработка AI-модерации (handoff)

> **Дата:** 01.06.2026  
> **Статус:** Предыдущая AI-модель (GPT/Claude) реализовала ~80% функционала, но не завершила интеграцию.  
> **Цель:** Довести AI-модерацию до рабочего состояния: настроить ключ API, задеплоить функции, проверить и починить админку.

---

## 1. Текущее состояние (что уже сделано)

### Код в репозитории (коммиты `e8fcf90` и `ac0aad7`):

| Файл | Что сделано |
|------|-------------|
| `functions/index.js` | Добавлены 3 callable функции: `adminAnalyzeContent`, `adminEditContentItem`, `adminSuggestFix` + адаптеры для DeepSeek/OpenAI/Claude + rate limiting + бюджет + кеш |
| `admin-panel/src/types/ai.ts` | Типы `AnalysisResult`, `AiVerdict`, `AnalysisContext`, `AiAnalyzePayload/Response` |
| `admin-panel/src/services/aiAnalysisService.ts` | Клиент `analyzeText(item)` → вызывает `adminAnalyzeContent`, в LOCAL_MODE мок |
| `admin-panel/src/services/aiSuggestionService.ts` | Клиент `suggestFix(item, fields)` → вызывает `adminSuggestFix` |
| `admin-panel/src/services/moderationService.ts` | Добавлена `editModerationItem(item, edits)` + экспорт `EditResult` |
| `admin-panel/src/components/AiAnalysisButton.tsx` | Кнопка AI-анализа с tooltip/popover, confidence bar, состояниями |
| `admin-panel/src/components/EditRequestModal.tsx` | Модалка редактирования с AI-подсказками, diff-историей |
| `admin-panel/src/pages/ModerationPage.tsx` | Колонка AI, фильтр по вердикту, авто-одобрение, масс-анализ (НО disagreement logging отсутствует) |
| `admin-panel/src/styles.css` | Стили для AiAnalysisButton, EditRequestModal, AI-индикации |
| `functions/.env` | Существует, но **ключ API — заглушка** `sk-your-key-here` |
| `AI_MODERATION_SPEC.md` | Полная спецификация на 1754 строки |

### Что удалось задеплоить (в ходе этого handoff):

- ✅ Удалён stale-манифест `functions/functions.yaml` (блокировал деплой новых функций)  
- ✅ Добавлен fallback на `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`  
- ✅ Добавлена защита от заглушечного ключа (`isConfiguredAiApiKey`)  
- ✅ 3 Cloud Functions успешно созданы на Firebase:  
  `adminAnalyzeContent`, `adminEditContentItem`, `adminSuggestFix`  
- ✅ Admin-panel собирается (`npm run build` — успешно)  
- ✅ TypeScript проверка проходит (`npm run type-check` — успешно)

---

## 2. Что НЕ СДЕЛАНО / требует доработки

### 2.1. ❌ КРИТИЧЕСКОЕ: Нет реального API-ключа

**Файл:** `functions/.env`  
**Проблема:** `AI_API_KEY=sk-your-key-here` — заглушка. Функция `isConfiguredAiApiKey()` вернёт `false`, и `adminAnalyzeContent` будет возвращать `failed-precondition`.

**Что нужно сделать:**

1. Получить реальный DeepSeek API-ключ (https://platform.deepseek.com)  
2. Записать в `functions/.env`:
   ```
   AI_PROVIDER=deepseek
   AI_API_KEY=sk-реальный-ключ
   AI_MODEL=deepseek-chat
   ```
3. Задеплоить функции с ключом:
   ```bash
   firebase deploy --only functions:adminAnalyzeContent,functions:adminEditContentItem,functions:adminSuggestFix
   ```
4. **Проверить**, что функция отвечает:
   ```bash
   # Вызвать через Firebase Console → Functions → adminAnalyzeContent → Test
   # Или через curl с idToken администратора
   ```

---

### 2.2. ❌ НЕТ disagreement logging (обратная связь)

**Файл:** `admin-panel/src/pages/ModerationPage.tsx`  
**Проблема:** Спецификация (п. 3.5) требует логировать расхождения AI-вердикта с решением модератора.  
**Признак:** `grep` показывает `disagreement: false`.  

**Что нужно сделать:**

1. Создать `admin-panel/src/services/aiFeedbackService.ts` (по спецификации):
   - `logDisagreement(data)` — вызывает Cloud Function `logAiDisagreement`
   - `fetchAiAccuracy(periodDays?)` — вызывает `getAiAccuracyStats`
   - `fetchAiBudgetUsage()` — вызывает `getAiBudgetUsage`

2. Создать 2 Cloud Function в `functions/index.js`:
   - `logAiDisagreement` — запись в `ops/ai_disagreements/{pushId}`
   - `getAiAccuracyStats` — чтение disagreement-логов за период

3. В `ModerationPage.tsx`:
   - В `handleManualAction` (или аналоге) добавить вызов `logDisagreement` при расхождении
   - Добавить секцию "📊 Точность AI" (п. 3.6 спецификации)

---

### 2.3. ⚠️ Админка: не хватает UI для авто-одобрения

**Файл:** `admin-panel/src/pages/ModerationPage.tsx`  
**Статус:** Тумблер `autoApproveEnabled` есть, `evaluateAutoApprove()` есть.

**Что доделать:**

1. **UI тумблера** в шапке страницы (сейчас может отсутствовать или быть скрытым)
2. **Таймер обратного отсчёта** для `pending_auto` (п. 3.4)
3. **Кнопка "Отменить авто-одобрение"** 
4. **Фильтр "Авто-одобренные"** (опция `auto_approved` в статусе)
5. **Лента авто-одобренных** с кнопкой "Отменить одобрение"

---

### 2.4. ⚠️ Тестирование Cloud Functions в реальном окружении

**Файлы:** `functions/index.js` (строки ~2570-3350)

Функции задеплоены, но **ни разу не вызывались**. Надо проверить:

1. **`adminAnalyzeContent`:**
   - С реальным ключом: возвращает ли `AnalysisResult`?
   - Без ключа: возвращает ли понятную ошибку?
   - С пустым текстом: возвращает `{ verdict: 'review', confidence: 0, ... }`?
   - Rate limit: превышение лимита возвращает `resource-exhausted`?
   - Кеш: повторный запрос возвращает `cached: true`?

2. **`adminEditContentItem`:**
   - Проверить `ADMIN_MODERATION_SECTIONS` — все ли секции там есть?
   - Срабатывает ли блокировка `BLOCKED_EDIT_FIELDS`?
   - Работает ли `editHistory` с лимитом в 5 редакций?

3. **`adminSuggestFix`:**
   - Возвращает ли `{ suggestions: [...] }`?
   - С пустыми `flags` — отрабатывает без ошибок?

---

### 2.5. ⚠️ Firebase Rules: доступ к `ops/ai_analysis/` и `moderation_analysis_cache/`

**Файл:** `firebase.rules.json`  
**Проблема:** Новые пути `ops/ai_analysis`, `moderation_analysis_cache`, `ops/ai_usage` должны быть доступны для чтения/записи только админам.

**Что нужно сделать:**
```
"moderation_analysis_cache": {
  ".read": "auth != null && (root.child('user_roles/'+auth.uid+'/role').val() in ['admin','moderator'])",
  ".write": "auth != null && (root.child('user_roles/'+auth.uid+'/role').val() == 'admin')"
}
"ops": {
  "ai_analysis": { ".read": "auth.uid != null", ".write": false },
  "ai_usage": { ".read": "auth.uid != null", ".write": false },
  "ai_disagreements": { ".read": false, ".write": false }
}
```

---

### 2.6. ❌ TypeScript-ошибки в закоммиченном коде

**Файлы:** `admin-panel/src/pages/ModerationPage.tsx` и `admin-panel/src/components/EditRequestModal.tsx`

Найдены реальные ошибки TypeScript (build проходил, но они есть):

1. **`ModerationItem`** — отсутствуют поля `editedAt`, `editHistory`, которые используются в коде:
   - `ModerationPage.tsx:474` — `item.editedAt` не существует
   - `EditRequestModal.tsx:177` — `item.editHistory` не существует
   - `EditRequestModal.tsx:197` — `item.editedAt` не существует

2. **`editModerationItem`** не экспортируется из `moderationService.ts`:
   - `EditRequestModal.tsx:8` — `"../services/moderationService"` не содержит `editModerationItem`

3. **Implicit `any`** в `EditRequestModal.tsx:259` — параметры `entry`, `idx` без типа

**Что делать:**
- В `types/moderation.ts` или в самом `moderationService.ts` обновить `ModerationItem`:
  ```ts
  editedAt?: number;
  editedBy?: string;
  editHistory?: Array<{
    field: string;
    previousValue: string;
    newValue: string;
    moderatorUid: string;
    moderatorEmail?: string;
    timestamp: number;
    aiSuggestionId?: string;
  }>;
  ```
- Добавить `editModerationItem` в экспорт `moderationService.ts`
- Явно типизировать параметры в `editHistory.map((entry, idx) => ...)`

---

### 2.7. ⚠️ Info-панель: провайдер/бюджет в футере или шапке

Спецификация (п. 3.6) требует в шапке страницы статистику:
- "🧠 AI: DeepSeek Flash 4"
- "✅ К одобрению: N / ⚠️ Проверить: M / ❌ Подозрительно: K"
- "🧠 Проанализировано: X"
- "Бюджет: Y/Z сегодня"

В `ModerationPage.tsx` статистика AI может отсутствовать или быть неполной. Добавить.

---

## 3. Порядок действий (рекомендуемый)

```
1. 🔑 Добавить API-ключ в functions/.env → deploy
2. 🔬 Протестировать adminAnalyzeContent через Firebase Console
3. 🧪 Протестировать adminEditContentItem, adminSuggestFix
4. 📊 Создать aiFeedbackService.ts + 2 CF (logDisagreement, getAiAccuracyStats)
5. 🖥️ Доделать UI: disagreement, точность AI, статистика, тумблер, таймер
6. 🔐 Обновить firebase.rules.json
7. ✅ Финальная проверка: build, type-check, deploy всех функций
```

## 4. Файлы, которые НЕЛЬЗЯ трогать

- `admin-panel/src/services/authService.ts` (содержит `isPrimaryServiceEmail`)
- `admin-panel/src/firebase/firebase.ts` (инициализация Firebase)
- `admin-panel/src/local/LOCAL_MODE.ts` (режим локальной разработки)

---

## 5. Проверка завершения (Definition of Done)

- [ ] Реальный DeepSeek API-ключ в `functions/.env`
- [ ] `adminAnalyzeContent` возвращает `AnalysisResult` при вызове
- [ ] `adminEditContentItem` редактирует поля и сохраняет `editHistory`
- [ ] `adminSuggestFix` возвращает AI-подсказки
- [ ] Disagreement logging работает при расхождении AI↔модератор
- [ ] В шапке ModerationPage отображается статистика AI
- [ ] Тумблер авто-одобрения работает с таймером
- [ ] Firebase Rules защищают AI-пути
- [ ] `npm run build` проходит без ошибок
- [ ] `npm run lint` проходит (functions)
- [ ] Ни один из запрещённых файлов не изменён

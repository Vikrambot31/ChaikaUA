# Дерево поручителей — что доделать

## Куда вставлять готовый код

| Компонент / Файл | Куда інтегрувати |
|---|---|
| `GuarantorTreePage.tsx` | `src/pages/GuarantorTreePage.tsx` (перенести) |
| `types.ts` | `src/types/guarantorTree.ts` або влити в `src/services/` |
| `guarantorTreeService.ts` | `src/services/guarantorTreeService.ts` |
| `useGuarantorTree.ts` | `src/hooks/useGuarantorTree.ts` |
| `ChainVisualization.tsx` | `src/components/ChainVisualization.tsx` |
| `ChainAccordion.tsx` | `src/components/ChainAccordion.tsx` |
| `UserSearchDropdown.tsx` | `src/components/UserSearchDropdown.tsx` |
| `StatusCard.tsx` | `src/components/StatusCard.tsx` (або змержити з існуючим) |

## Що НЕ зроблено (потрібно доробити)

### 1. Інтеграція в навігацію
- **Файл:** `src/components/AppShell.tsx`
- Додати `'guarantor_tree'` в `AdminPageKey` (рядок 8)
- Додати navItem (ключ, лейбл, хінт, іконка 🌳)
- Додати `navItemIcons` запис
- Доступ: admin + moderator

### 2. Додати роут
- **Файл:** `src/App.tsx`
- Додати `guarantor_tree` в `VALID_PAGES` (рядок 16)
- Додати `PAGE_NAMES` запис (рядок 52)
- Додати `renderPage()` умову (рядок 64):
  ```ts
  if (activePage === 'guarantor_tree') return <GuarantorTreePage user={access.user} role={access.role} onNavigate={navigate} />;
  ```
- Імпортувати: `import { GuarantorTreePage } from './components/GuarantorTreePage';`

### 3. CSS стилі
- **Файл:** `src/styles.css`
- Додати класи (див. ТЗ розділ 2, секції 2.3-2.5):
  - `.guarantor-tree-page`, `.page-header`, `.back-button`
  - `.chain-visualization`, `.chain-horizontal`, `.chain-node`, `.chain-circle`, `.chain-label`
  - `.status-card`, `.status-card-header`, `.status-card-text`
  - `.chain-accordion`, `.accordion-item`, `.accordion-header`, `.accordion-content`
  - `.user-search-dropdown`, `.search-input`, `.search-dropdown`
  - `.empty-state`, `.loading-skeleton`, `.error-banner`

### 4. Edge cases (types.ts + кожен компонент)
- **Deleted user:** uid не знайдено в `/users` → "Пользователь удален" + UID
- **Orphaned node:** parentUid не існує → "⚠️ Orphaned node"
- **Deep chain 10+:** обрізати візуалізацію, показати "...и ещё 7 уровней" (в ChainVisualization вже є `maxVisible=5`, але текст і поведінку доробити)
- **Цикли:** infinite loop protection при рендері (в `useGuarantorTree.ts`)
- **Empty chain:** "Зарегистрирован без поручителя" (в ChainVisualization є заглушка, але текст інший)

### 5. SVG лінії між кружками в ChainVisualization
- **Файл:** `ChainVisualization.tsx`
- Додати SVG або CSS `::before`/`::after` псевдоелемент з пунктирною лінією між `.chain-node`

### 6. Акордеон — поведінка
- **Файл:** `ChainAccordion.tsx`
- Перший елемент відкритий за замовчуванням (вже є `openIndex = 0`)
- Плавний CSS transition при відкритті/закритті
- Кнопка "Всего в системе: N человек →" веде на сторінку `invite_access` (хоча в ТЗ сказано на повний список — уточнити)

### 7. Справжній Firebase audit log
- **Файл:** `guarantorTreeService.ts` → `logAudit()`
- Замість console.info писати в `/audit_log/guarantor_tree/{timestamp}`

### 8. Реальний пошук
- **Файл:** `guarantorTreeService.ts` → `searchUsers()`
- Зараз фільтрує всіх users в клієнті. Оптимізувати:
  - Якщо є `trust_tree_index/by_phone/{phoneHash}` — використовувати його
  - Якщо немає — використовувати індекс `users` + `orderByChild`

### 9. Права moderator read-only
- **Файл:** `src/hooks/useAuthAccess.ts` (перевірити чи є обмеження)
- Або в `GuarantorTreePage.tsx` заборонити дії (клік на статус-картку для переходу на access_control)
- StatusCard: `onNavigate` тільки для admin (вже зроблено, перевірити)

### 10. Loading skeleton & Error toast
- **Файл:** `GuarantorTreePage.tsx`
- Skeleton loader зараз просто div-заглушка. Треба стилізувати через `.skeleton-chain`, `.skeleton-card`, `.skeleton-accordion`
- Помилки показувати як toast внизу, а не в `.error-banner`

### 11. Реальні SVG іконки InfoHint
- **Файл:** `GuarantorTreePage.tsx`
- Додати інформаційну іконку ⓘ поруч із заголовком, яка показує hint через `<InfoHint text={UI_TEXT.hint} />` (компонент вже є в `src/components/InfoHint.tsx`)

### 12. Покриття тестами (опціонально)
- `src/__tests__/guarantorTreeService.test.ts`
- `src/__tests__/ChainVisualization.test.tsx`
- `src/__tests__/ChainAccordion.test.tsx`
- `src/__tests__/UserSearchDropdown.test.tsx`

---

## Як тестувати

```bash
cd admin-panel
npm run dev              # запустити адмінку
npm run type-check       # TypeScript
```

Після інтеграції перейти на `http://localhost:5173/#guarantor_tree`

## Існуючі помилки (не наші)

`src/pages/AccessControlPage.tsx:241` та `:250` — `Promise<{ changed: boolean }>` несумісний з `Promise<void>`. Це pre-existing, не чіпати.

---

*Цей файл створено AI. Якщо щось змінилося — оновити.*

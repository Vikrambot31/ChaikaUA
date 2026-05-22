# DevOps Agent — Chaika Life

Локальный ИИ-агент для автоматизации сборки, проверки и деплоя Chaika Life.

## Запуск

```bash
node agents/run-devops-agent.mjs [режим] [опции]
```

### Режимы

| Режим    | Команда                                   | Описание                                  |
|----------|-------------------------------------------|-------------------------------------------|
| SAFE     | `node agents/run-devops-agent.mjs safe`   | Только проверки перед деплоем.            |
| DEPLOY   | `node agents/run-devops-agent.mjs deploy` | Проверки + Firebase Rules деплой.         |
| AUDIT    | `node agents/run-devops-agent.mjs audit`  | Анализ структуры проекта.                 |
| **STABLE**   | **`node agents/run-devops-agent.mjs stable`**  | **Запуск STABLE APK BUILD.bat** ← ТЫ РАБОТАЕШЬ ТУТ!  |

### Опции

| Флаг              | Описание                                  |
|-------------------|-------------------------------------------|
| `--dry-run`       | Показать что будет задеплоено, не деплоить|
| `--skip-tsc`      | Пропустить TypeScript-проверку            |
| `--skip-rules`    | Пропустить проверку Firebase Rules        |
| `--only-functions`| Деплоить только Firebase Functions        |
| `--only-db`       | Деплоить только Database Rules            |
| `--only-storage`  | Деплоить только Storage Rules             |
| `--verbose`       | Подробный вывод                           |

### Примеры

```bash
# Проверить проект перед тем как запускать STABLE BUILD
node agents/run-devops-agent.mjs safe

# ОСНОВНОЙ РЕЖИМ — запуск STABLE APK BUILD.bat с анализом
node agents/run-devops-agent.mjs stable

# Вся сборка + деплой APK + обновление сайта Чайки в одну команду
# (это эквивалентно прямому запуску STABLE APK BUILD.bat, но с подробным отчётом)
node agents/run-devops-agent.mjs stable

# Деплой Firebase Rules (опционально)
node agents/run-devops-agent.mjs deploy

# Аудит проекта
node agents/run-devops-agent.mjs audit
```

---

## Что делает каждый режим

### 🔒 SAFE MODE — Предполётная проверка
1. ✅ TypeScript check (`npm run type-check`)
2. ✅ Firebase Rules JSON validation (`npm run rules:check`)
3. ✅ Storage Rules validation (`npm run rules:check:storage`)
4. ✅ Проверка версии приложения
5. ✅ Анализ измёненных файлов (git status)
6. ✅ Предупреждение если трогал защищённые файлы
7. ❌ **Без деплоя**

**Результат**: Зелёный свет перед `node agents/run-devops-agent.mjs stable`

### 🚀 STABLE MODE — Основной рабочий режим (ТЫ РАБОТАЕШЬ ТУТ!)
1. ✅ Все проверки SAFE
2. ✅ Запускает `ЗАПУСК АПК\STABLE APK BUILD.bat`
3. ✅ **Параллельно запускает `deploy.bat`** (Firebase Rules)
4. ✅ Обновляет версию приложения
5. ✅ **Собирает APK** через Gradle
6. ✅ Измеряет размер APK в MB
7. ✅ **Деплоит на Netlify** (обновляет сайт Чайки)
8. ✅ Сохраняет APK в несколько папок (release/, chaika-site/, launch dir)
9. ✅ Генерирует подробный отчёт

**Результат**: Полный production release — APK готов, сайт обновлён ✨

### 🔧 DEPLOY MODE — Только Firebase
1. Все проверки SAFE
2. Backup текущих правил в `agents/backups/`
3. `firebase deploy --only database,storage`
4. Статус деплоя

### 🔎 AUDIT MODE — Анализ проекта
1. Все проверки SAFE
2. Проверка структуры папок
3. Проверка ключевых файлов
4. Диагностика проекта

---

## 💡 Рекомендуемый рабочий процесс

```bash
# Шаг 1: Перед тем как запустить STABLE BUILD — проверка
node agents/run-devops-agent.mjs safe

# ↓ Если всё хорошо (OK) — переходим дальше ↓

# Шаг 2: ПОЛНЫЙ RELEASE — сборка + деплой APK + обновление сайта
node agents/run-devops-agent.mjs stable

# ↓ Готово! APK собран, сайт обновлён ↓
```

---

## Защищённые файлы

Агент **только предупреждает** (никогда не изменяет):

- `firebase.rules.json` ← правила БД
- `storage.rules` ← правила хранилища
- `src/services/deviceAuth.ts` ← аутентификация
- `src/components/AppAccessGuard.tsx` ← контроль доступа
- `src/navigation/RootNavigator.tsx` ← навигация с ролями

Если ты изменишь эти файлы → агент предупредит в отчёте! ⚠️

---

## Логи и бэкапы

- Логи каждого запуска: `agents/logs/YYYY-MM-DD_HH-mm-ss_[mode].log`
- Бэкапы правил: `agents/backups/rules_YYYY-MM-DD_HH-mm-ss.json`

---

## Выходные коды

| Код | Значение                        |
|-----|---------------------------------|
| 0   | Успех                           |
| 1   | Критические ошибки              |
| 2   | Предупреждения (деплой остановлен)|

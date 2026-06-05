# Индекс папки: Bot Test Accounts

**Дата создания:** 26 мая 2026
**Проект:** Chaika Life (React Native + Firebase)
**Цель:** Система из 10 бот-аккаунтов для тестирования заявок

---

## 📋 Структура папки

### 🎯 Начните отсюда

| Файл | Размер | Описание |
|------|--------|---------|
| **README.md** | 8.6 KB | 📌 **ГЛАВНЫЙ ФАЙЛ** — обзор, быстрый старт, таблица ботов |
| **SETUP_REPORT_2026-05-26.md** | 13 KB | 📋 Полная документация о создании системы |
| **HOW_TO_USE.md** | 9.7 KB | 🎮 Инструкция как использовать ботов в приложении |
| **TECHNICAL_DETAILS.md** | 13 KB | ⚙️ Технические детали для программистов/AI |

### 📊 Данные ботов

| Файл | Размер | Содержание |
|------|--------|-----------|
| **bots-data.json** | 13 KB | Структурированный JSON со всеми данными (10 ботов, UID, email, телефон) |
| **00_Список_ботов.md** | 558 B | Исходный список 10 имён |
| **01_Luca_Moretti.md** | 1.4 KB | Профиль бота 1 |
| **02_Giulia_Romano.md** | 1.2 KB | Профиль бота 2 |
| **03_Matteo_Bianchi.md** | 1.2 KB | Профиль бота 3 |
| **04_Sofia_Conti.md** | 1.2 KB | Профиль бота 4 |
| **05_Alessandro_Ricci.md** | 1.2 KB | Профиль бота 5 |
| **06_Francesca_Gallo.md** | 1.2 KB | Профиль бота 6 |
| **07_Davide_Esposito.md** | 1.2 KB | Профиль бота 7 |
| **08_Chiara_Lombardi.md** | 1.2 KB | Профиль бота 8 |
| **09_Marco_Santoro.md** | 1.1 KB | Профиль бота 9 |
| **10_Elena_Ferrara.md** | 1.2 KB | Профиль бота 10 |

---

## 🗺️ Навигация по документам

### Если вы хотите...

**...быстро начать использовать ботов:**
1. Прочитать `README.md` (5 мин)
2. Запустить приложение
3. Использовать данные для входа из раздела "Быстрый старт"

**...понять как это работает:**
1. Прочитать `SETUP_REPORT_2026-05-26.md`
2. Посмотреть `bots-data.json` (таблица Firebase)
3. Прочитать `TECHNICAL_DETAILS.md` если нужны технические детали

**...использовать в своей AI системе:**
1. Скопировать всю папку
2. Прочитать `TECHNICAL_DETAILS.md`
3. Использовать `bots-data.json` для импорта данных
4. Запустить `node scripts/seed-bot-users.mjs` если нужно пересоздать

**...детально разобраться с ботами:**
1. Посмотреть таблицу в `README.md`
2. Прочитать описания в `01_Luca_Moretti.md` и т.д.
3. Использовать данные из `bots-data.json`

**...использовать в тестировании:**
1. Прочитать `HOW_TO_USE.md`
2. Выбрать бота по специализации
3. Следовать сценариям тестирования

---

## 🚀 Быстрая справка

### Пароль для всех ботов
```
BotChaika2026!
```

### Email ботов (@chaika-bot.test)
```
luca.moretti@chaika-bot.test
giulia.romano@chaika-bot.test
matteo.bianchi@chaika-bot.test
sofia.conti@chaika-bot.test
alessandro.ricci@chaika-bot.test
francesca.gallo@chaika-bot.test
davide.esposito@chaika-bot.test
chiara.lombardi@chaika-bot.test
marco.santoro@chaika-bot.test
elena.ferrara@chaika-bot.test
```

### UID ботов (в bots-data.json)
```json
{
  "Luca Moretti": "24h7Iz6ayzgeD73VkCKrIcGnXJ73",
  "Giulia Romano": "9rKrBVsQKAPflSblhpeWkM5wIDv1",
  "Matteo Bianchi": "YFqlL7WuosMgJrAdXcVvefGDrdz2",
  "Sofia Conti": "NzvDAlsLqPde8ueOvtZvY2zwy1Q2",
  "Alessandro Ricci": "GEaVFokn5Bdl5kf41ahbBa91jld2",
  "Francesca Gallo": "hSscTmJTKtTsI6pXeWePtWazDe83",
  "Davide Esposito": "cwwaHrtU2lNz5niY7NC3lMUM1hA3",
  "Chiara Lombardi": "jvFZoz7a1JdpA8WSL3w8GySrh762",
  "Marco Santoro": "gybAiGnrKfZUDqBdTtR3egbfRUH3",
  "Elena Ferrara": "zhCLiQnSAlbkuHKLKKMCsfhZ4iX2"
}
```

---

## 📖 Рекомендуемый порядок чтения

### Для новичка (новой AI системы)

1. **README.md** — общий обзор (10 мин)
2. **HOW_TO_USE.md** — как использовать (10 мин)
3. **bots-data.json** — структура данных (5 мин)

**Итого:** ~25 минут для базового понимания

### Для разработчика

1. **SETUP_REPORT_2026-05-26.md** — как создано (15 мин)
2. **TECHNICAL_DETAILS.md** — технические детали (20 мин)
3. **bots-data.json** — структура (10 мин)
4. **HOW_TO_USE.md** — использование (15 мин)

**Итого:** ~60 минут для полного понимания

### Для передачи другой системе

- 📦 Скопировать всю эту папку
- 📦 Добавить `scripts/seed-bot-users.mjs`
- 📦 Добавить `chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json` (осторожно!)
- 📋 Передать ссылку на эту папку с инструкцией

---

## ✅ Проверка целостности

Если все файлы на месте, должны быть:

- ✅ 4 документации (README, SETUP_REPORT, HOW_TO_USE, TECHNICAL_DETAILS)
- ✅ 1 JSON с данными (bots-data.json)
- ✅ 11 MD файлов с профилями (00_Список + 10 ботов)
- ✅ 1 INDEX.md (этот файл)

**Всего:** 17 файлов

---

## 🔐 Безопасность

⚠️ **ВАЖНО:**

- Не коммитить в git папку с service account ключом
- Не публиковать `chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json`
- Не использовать пароль `BotChaika2026!` в production
- Все ботовские email с доменом `.test` — это тестовые аккаунты

---

## 📝 История и версионирование

| Дата | Событие | Файлы |
|------|---------|-------|
| 2026-05-26 | Созданы 10 бот-аккаунтов | seed-bot-users.mjs |
| 2026-05-26 | Написана документация | README, SETUP_REPORT, HOW_TO_USE |
| 2026-05-26 | Технические детали | TECHNICAL_DETAILS |
| 2026-05-26 | JSON export | bots-data.json |
| 2026-05-26 | Индекс и навигация | INDEX.md |

---

## 💬 Контакты

Вопросы/проблемы? Смотреть разделы:
- "Возможные проблемы" в `TECHNICAL_DETAILS.md`
- "Контакты и поддержка" в `README.md`
- "Полезные команды" в `HOW_TO_USE.md`

---

**Индекс создан:** 26 мая 2026
**Версия:** 1.0
**Статус:** ✅ Complete and ready

# Bot Test Accounts — Chaika Life

**10 полностью зарегистрированных бот-аккаунтов для тестирования мобильного приложения Chaika Life**

---

## 📋 Быстрый старт

### Данные для входа

```
Пароль для всех: BotChaika2026!
Домен: @chaika-bot.test
```

**Email ботов:**
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

### Где это используется

- **Мобильное приложение:** Chaika Life (React Native Expo)
- **Backend:** Firebase (Auth + RTDB)
- **Цель:** Тестирование системы заявок, чата, профилей, модерации

---

## 📁 Файлы в этой папке

| Файл | Описание |
|------|---------|
| `README.md` | Этот файл — обзор |
| `SETUP_REPORT_2026-05-26.md` | Полная документация что было сделано |
| `HOW_TO_USE.md` | Инструкция как использовать ботов |
| `TECHNICAL_DETAILS.md` | Технические детали для программистов/AI |
| `bots-data.json` | Структурированные данные всех ботов |
| `00_Список_ботов.md` | Исходный список из 10 имён |
| `01_Luca_Moretti.md` до `10_Elena_Ferrara.md` | Описание каждого бота |

---

## 📊 Что было создано

### Этап 1: Firebase Auth (Аутентификация)

✅ 10 аккаунтов с email/password:
- Тип: Email/Password
- Пароль: `BotChaika2026!`
- Email: `{name}@chaika-bot.test`

### Этап 2: RTDB Профили (`users/{uid}`)

✅ Полный профиль каждого бота:
- Имя, телефон, здание, квартира
- **Статус:** `registrationStatus: 'complete'` ← **КЛЮЧЕВОЙ МОМЕНТ**
- Встроенная аватарка (startAvatarKey: 1-6)
- Профессия и описание из MD файлов

### Этап 3: Доступ в систему (`invite_access/{uid}`)

✅ Одобренный доступ:
- Статус: `'approved'`
- Причина: `'test_bot_account'`
- Дата: 2026-05-26

---

## 🎯 Ключевые характеристики

| Характеристика | Значение |
|---|---|
| Кол-во ботов | 10 |
| Статус регистрации | Complete (полная) |
| isActive в приложении | ✅ true |
| Может создавать заявки | ✅ да |
| Может редактировать профиль | ✅ да |
| Может общаться в чате | ✅ да |
| Имеет аватарку | ✅ встроенная (1-6) |
| Имеет телефон | ✅ +38067100000X |

---

## 🤖 Боты и их специализация

### Категория "Помощь" (Help)

- **Luca Moretti** — логистика, доставка
- **Alessandro Ricci** — еда, события
- **Francesca Gallo** — здоровье, уход
- **Elena Ferrara** — качество контента

### Категория "Проблемы" (Problems)

- **Matteo Bianchi** — электричество
- **Marco Santoro** — сантехника
- **Davide Esposito** — машины, техника

### Категория "События" (Events)

- **Giulia Romano** — озеленение, двор
- **Chiara Lombardi** — встречи, мероприятия

### Категория "Любые" (All)

- **Sofia Conti** — коммуникация, UX, обратная связь

---

## 🔧 Как использовать

### 1. Вход в приложение

```bash
# На эмуляторе/телефоне открыть Chaika Life
# Email: luca.moretti@chaika-bot.test
# Password: BotChaika2026!
```

### 2. Создать заявку

```
Главный экран → Кнопка + → Выбрать категорию → Заполнить → Опубліковать
```

### 3. Просмотреть профиль

```
Навигация → Профіль → Видеть аватарку, имя, профессию, телефон
```

### 4. Написать в чат

```
Лента → Нажать на чужую заявку → Ответить → Открыть чат
```

---

## 📝 Для других AI систем

Если эта информация передается другой AI системе:

### Минимально необходимо знать:

1. **UID каждого бота** — в файле `bots-data.json`
2. **Email и пароль** — для входа
3. **Firebase проект:** `chaikaua-3cd9d`
4. **RTDB пути:**
   - `users/{uid}` — профиль
   - `invite_access/{uid}` — доступ
   - `requests` — заявки

### Критические файлы для информации:

- `SETUP_REPORT_2026-05-26.md` — что и зачем
- `TECHNICAL_DETAILS.md` — как это устроено
- `bots-data.json` — структурированные данные

### Что скопировать/архивировать:

```bash
# Вся папка
C:\ChaikaUA\mobile-app-short\ЗАПУСК АПК\--Bot-Ai-Klienti\

# Плюс скрипт создания
C:\ChaikaUA\mobile-app-short\scripts\seed-bot-users.mjs

# Плюс service account ключ (осторожно! секрет!)
C:\ChaikaUA\mobile-app-short\chaikaua-3cd9d-firebase-adminsdk-fbsvc-0d750d2252.json
```

---

## ⚠️ Важные замечания

### Перед продакшеном:

- ❌ Не использовать пароль `BotChaika2026!` в production
- ❌ Не публиковать service account ключ
- ❌ Не использовать домен `@chaika-bot.test` для реальных пользователей

### Для тестирования:

- ✅ Пароль одинаковый для всех ботов — удобно для тестов
- ✅ Email с `.test` доменом — гарантирует что это тестовые аккаунты
- ✅ Скрипт идемпотентен — можно запускать повторно

### Безопасность:

- 🔒 Service account ключ в `.gitignore` (не коммитить!)
- 🔒 Пароли и API ключи в `.env` файлах
- 🔒 Firebase Rules настроены на ограничение доступа

---

## 📞 Контакты и поддержка

### Если что-то не работает:

1. **Бот не логинится** → проверить email и пароль
2. **Заявка не создается** → проверить `invite_access/{uid}` статус
3. **Аватарка не видна** → проверить `startAvatarKey` значение
4. **Приложение падает** → смотреть логи и Firebase Rules

### Где проверить:

- Firebase Console: https://console.firebase.google.com/project/chaikaua-3cd9d
- Admin Panel (если запущена): http://localhost:5173
- Логи приложения: Settings → Developer → Logs

---

## 📚 Дополнительно

### Как пересоздать ботов (если нужно):

```bash
cd /path/to/mobile-app-short
node scripts/seed-bot-users.mjs
```

Скрипт перезапишет все профили но пропустит существующие Auth аккаунты.

### Как добавить нового бота:

Отредактировать `scripts/seed-bot-users.mjs` и добавить в массив `BOTS`.

### Как изменить профиль бота:

```bash
# Вручную в Firebase Console
# Или через скрипт (отредактировать и пересоздать)
```

---

## 📖 Полная документация

- **SETUP_REPORT_2026-05-26.md** — полная история создания
- **HOW_TO_USE.md** — подробная инструкция с сценариями
- **TECHNICAL_DETAILS.md** — API, структура данных, примеры кода
- **bots-data.json** — JSON с данными для импорта/экспорта

---

**Создано:** 26 мая 2026
**Проект:** Chaika Life (React Native + Firebase)
**Статус:** ✅ Ready for testing

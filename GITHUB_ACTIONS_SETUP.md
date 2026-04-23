# GitHub Actions Setup for Chaika News Bot

## Что делает workflow

- запускается по расписанию каждые 30 минут
- запускается вручную через `workflow_dispatch`
- собирает новости
- резюмирует их через AI
- отправляет в Telegram-группу

## Что нужно создать в GitHub Secrets

В репозитории GitHub добавь secrets:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ANTHROPIC_API_KEY`
- `SITE_URL`

## Какой файл важен

- `.github/workflows/news-bot.yml`

## Как работает запуск

Workflow внутри репозитория вызывает:

```bash
npm run once
```

## Что должно быть в репозитории

- папка `chaika-server-bot`
- `package.json`
- `src/index.js`
- `src/news.js`
- `src/ai.js`
- `src/telegram.js`
- `src/storage.js`

## Что тебе нужно сделать руками

1. Создать репозиторий на GitHub.
2. Залить туда папку `chaika-server-bot`.
3. Добавить secrets.
4. Открыть Actions и запустить workflow вручную.

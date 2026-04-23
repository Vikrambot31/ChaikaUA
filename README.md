# Chaika Server Bot

Node.js bot for collecting news, summarizing them with AI and posting to Telegram.

## Setup

1. Copy `.env.example` to `.env`
2. Fill in `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `ANTHROPIC_API_KEY`
3. Install dependencies:

```bash
npm install
```

4. Run once:

```bash
npm run once
```

5. Or run on schedule:

```bash
npm start
```

## Notes

- Telegram bot must be added to the group and have permission to post.
- News are filtered for Chaika, Bucha district, Sofia area, Kyiv and Kyiv region.

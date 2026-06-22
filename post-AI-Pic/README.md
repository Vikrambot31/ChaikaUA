# post-AI-Pic

AI agent for Telegram posts: choose a fresh topic, write a Ukrainian post, generate an image in a stable style, and send it to a Telegram channel or group.

The folder is isolated from the main mobile app and admin panel. It can optionally read `../AI_AGENT_NEW/knowledge-base.json` as a content reference.

## Quick start

1. Copy `.env.example` to `.env`.
2. Fill:
   - `OPENAI_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
3. Install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

4. Test without API posting:

```powershell
python agent.py --dry-run
```

5. Create and publish one post:

```powershell
python agent.py --once
```

6. Run a daily scheduler:

```powershell
python agent.py --schedule
```

## Files

- `agent.py` - main orchestrator.
- `topic_generator.py` - picks a non-repeating topic.
- `text_writer.py` - writes the Telegram caption/post.
- `image_generator.py` - generates and saves the post image.
- `telegram_poster.py` - sends the post to Telegram.
- `config.py` - environment and paths.
- `posts_log.json` - publication history.
- `SYSTEM_PROMPT.md` - voice, domain, and content rules.
- `style_guide.md` - image style rules.

## Safe workflow

Use `--dry-run` first. It creates a draft in `out/` and does not call OpenAI or Telegram.

Use `--once` only when `.env` is ready and the bot is an admin in the target Telegram channel/group.

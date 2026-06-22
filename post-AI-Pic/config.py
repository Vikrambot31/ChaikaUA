from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return int(value)


@dataclass(frozen=True)
class Settings:
    openai_api_key: str
    openai_model: str
    openai_image_model: str
    telegram_bot_token: str
    telegram_chat_id: str
    post_language: str
    post_words_min: int
    post_words_max: int
    post_timezone: str
    post_hour: int
    post_minute: int
    knowledge_base_path: Path
    post_log_path: Path
    output_dir: Path

    @property
    def system_prompt_path(self) -> Path:
        return BASE_DIR / "SYSTEM_PROMPT.md"

    @property
    def style_guide_path(self) -> Path:
        return BASE_DIR / "style_guide.md"


def _path_env(name: str, default: str) -> Path:
    raw = os.getenv(name, default)
    path = Path(raw)
    if not path.is_absolute():
        path = BASE_DIR / path
    return path.resolve()


def load_settings() -> Settings:
    return Settings(
        openai_api_key=os.getenv("OPENAI_API_KEY", ""),
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        openai_image_model=os.getenv("OPENAI_IMAGE_MODEL", "dall-e-3"),
        telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN", ""),
        telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID", ""),
        post_language=os.getenv("POST_LANGUAGE", "uk"),
        post_words_min=_int_env("POST_WORDS_MIN", 250),
        post_words_max=_int_env("POST_WORDS_MAX", 450),
        post_timezone=os.getenv("POST_TIMEZONE", "Europe/Kyiv"),
        post_hour=_int_env("POST_HOUR", 10),
        post_minute=_int_env("POST_MINUTE", 0),
        knowledge_base_path=_path_env("KNOWLEDGE_BASE_PATH", "../AI_AGENT_NEW/knowledge-base.json"),
        post_log_path=_path_env("POST_LOG_PATH", "posts_log.json"),
        output_dir=_path_env("OUTPUT_DIR", "out"),
    )

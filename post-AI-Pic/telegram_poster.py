from __future__ import annotations

from pathlib import Path
from typing import Any


def send_photo(
    bot_token: str,
    chat_id: str,
    image_path: Path,
    caption: str,
) -> dict[str, Any]:
    if not bot_token:
        raise ValueError("TELEGRAM_BOT_TOKEN is empty.")
    if not chat_id:
        raise ValueError("TELEGRAM_CHAT_ID is empty.")
    if not image_path.exists():
        raise FileNotFoundError(image_path)

    url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"
    import httpx

    with httpx.Client(timeout=60) as client:
        with image_path.open("rb") as image_file:
            response = client.post(
                url,
                data={"chat_id": chat_id, "caption": caption},
                files={"photo": (image_path.name, image_file, "image/png")},
            )
            response.raise_for_status()
            data = response.json()

    if not data.get("ok"):
        raise RuntimeError(f"Telegram sendPhoto failed: {data}")
    return data

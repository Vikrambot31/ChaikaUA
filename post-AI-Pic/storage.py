from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return default
    return json.loads(text)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def append_post_log(path: Path, entry: dict[str, Any]) -> None:
    posts = load_json(path, [])
    posts.append({
        "created_at": datetime.now().isoformat(timespec="seconds"),
        **entry,
    })
    write_json(path, posts)


def load_knowledge_summary(path: Path, max_chars: int = 5000) -> str:
    if not path.exists():
        return ""

    data = load_json(path, {})
    parts: list[str] = []

    about = data.get("about")
    if isinstance(about, dict):
        parts.append("About: " + json.dumps(about, ensure_ascii=False))

    for key in ("key_themes", "hd_types", "consultation_topics", "glossary", "faq"):
        value = data.get(key)
        if value:
            parts.append(f"{key}: " + json.dumps(value, ensure_ascii=False))

    summary = "\n\n".join(parts)
    return summary[:max_chars]

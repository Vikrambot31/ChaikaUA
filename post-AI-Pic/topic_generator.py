from __future__ import annotations

import json
from typing import TYPE_CHECKING
from typing import Any

if TYPE_CHECKING:
    from openai import OpenAI


FALLBACK_TOPICS = [
    "Чому стратегія в Дизайні Людини знімає зайвий тиск",
    "Як розпізнати своє справжнє так у тілі",
    "Що робити, коли чужі очікування сильніші за власний ритм",
    "Профіль у Дизайні Людини як підказка до природного навчання",
    "Відкриті центри: де ми найчастіше підлаштовуємось",
]


def _published_topics(posts_log: list[dict[str, Any]]) -> list[str]:
    return [str(item.get("topic", "")).strip() for item in posts_log if item.get("topic")]


def generate_topic(
    client: OpenAI,
    model: str,
    system_prompt: str,
    knowledge_summary: str,
    posts_log: list[dict[str, Any]],
) -> dict[str, str]:
    published = _published_topics(posts_log)
    prompt = {
        "task": "Choose one fresh Telegram post topic about Human Design.",
        "language": "uk",
        "already_published_topics": published[-50:],
        "knowledge_reference": knowledge_summary,
        "output_json_schema": {
            "topic": "short Ukrainian topic",
            "angle": "specific emotional/practical angle",
            "audience": "who this post is for",
        },
    }

    response = client.chat.completions.create(
        model=model,
        temperature=0.8,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
        ],
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    data = json.loads(content)
    return {
        "topic": str(data.get("topic", "")).strip(),
        "angle": str(data.get("angle", "")).strip(),
        "audience": str(data.get("audience", "")).strip(),
    }


def dry_run_topic(posts_log: list[dict[str, Any]]) -> dict[str, str]:
    published = set(_published_topics(posts_log))
    for topic in FALLBACK_TOPICS:
        if topic not in published:
            return {
                "topic": topic,
                "angle": "практична самоперевірка без тиску",
                "audience": "люди, які знайомляться з Дизайном Людини",
            }
    return {
        "topic": FALLBACK_TOPICS[0],
        "angle": "новий погляд на вже знайому тему",
        "audience": "підписники Telegram-каналу",
    }

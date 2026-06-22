from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openai import OpenAI


def write_post(
    client: OpenAI,
    model: str,
    system_prompt: str,
    topic_data: dict[str, str],
    knowledge_summary: str,
    words_min: int,
    words_max: int,
) -> str:
    prompt = {
        "task": "Write a Telegram post in Ukrainian.",
        "topic": topic_data,
        "word_count": f"{words_min}-{words_max}",
        "knowledge_reference": knowledge_summary,
        "requirements": [
            "short strong title",
            "3-6 short paragraphs",
            "one practical self-observation question",
            "soft call to action",
            "3-6 hashtags",
            "no hard selling",
            "no medical claims",
        ],
    }

    response = client.chat.completions.create(
        model=model,
        temperature=0.75,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
        ],
    )
    return (response.choices[0].message.content or "").strip()


def dry_run_post(topic_data: dict[str, str]) -> str:
    topic = topic_data["topic"]
    return (
        f"{topic}\n\n"
        "Іноді найважче не знайти відповідь, а перестати шукати її там, "
        "де нас давно немає. Дизайн Людини може бути не ярликом, а мапою: "
        "вона не вирішує за вас, але допомагає уважніше чути власний ритм.\n\n"
        "Спробуйте сьогодні помітити одну ситуацію, де ви погоджуєтесь швидше, "
        "ніж тіло встигає відгукнутися. Що зміниться, якщо дати собі кілька "
        "секунд паузи?\n\n"
        "Якщо хочете розібрати свою карту глибше, напишіть у приватні повідомлення.\n\n"
        "#ДизайнЛюдини #HumanDesign #Самопізнання #Вікрам"
    )

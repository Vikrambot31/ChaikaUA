from __future__ import annotations

import base64
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openai import OpenAI


def build_image_prompt(topic_data: dict[str, str], style_guide: str) -> str:
    return (
        f"Topic: {topic_data.get('topic', '')}\n"
        f"Angle: {topic_data.get('angle', '')}\n"
        f"Audience: {topic_data.get('audience', '')}\n\n"
        f"{style_guide}"
    )


def generate_image(
    client: OpenAI,
    image_model: str,
    prompt: str,
    output_path: Path,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    response = client.images.generate(
        model=image_model,
        prompt=prompt,
        size="1024x1024",
        quality="standard",
        n=1,
    )

    image = response.data[0]
    if getattr(image, "b64_json", None):
        output_path.write_bytes(base64.b64decode(image.b64_json))
        return output_path

    if getattr(image, "url", None):
        import httpx

        with httpx.Client(timeout=60) as http:
            download = http.get(image.url)
            download.raise_for_status()
            output_path.write_bytes(download.content)
        return output_path

    raise RuntimeError("OpenAI image response did not include b64_json or url.")


def dry_run_image_prompt(topic_data: dict[str, str], style_guide: str, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    prompt_path = output_path.with_suffix(".prompt.txt")
    prompt_path.write_text(build_image_prompt(topic_data, style_guide), encoding="utf-8")
    return prompt_path

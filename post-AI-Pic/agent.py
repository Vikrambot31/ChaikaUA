from __future__ import annotations

import argparse
from datetime import datetime

from config import load_settings
from image_generator import build_image_prompt, dry_run_image_prompt, generate_image
from storage import append_post_log, load_json, load_knowledge_summary, read_text, write_json
from telegram_poster import send_photo
from text_writer import dry_run_post, write_post
from topic_generator import dry_run_topic, generate_topic


def run_once(dry_run: bool = False) -> dict:
    settings = load_settings()
    settings.output_dir.mkdir(parents=True, exist_ok=True)

    posts_log = load_json(settings.post_log_path, [])
    system_prompt = read_text(settings.system_prompt_path)
    style_guide = read_text(settings.style_guide_path)
    knowledge_summary = load_knowledge_summary(settings.knowledge_base_path)

    client = None
    if not dry_run:
        from openai import OpenAI

        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is empty. Fill post-AI-Pic/.env first.")
        client = OpenAI(api_key=settings.openai_api_key)

    if dry_run:
        topic_data = dry_run_topic(posts_log)
        post_text = dry_run_post(topic_data)
        image_path = dry_run_image_prompt(
            topic_data,
            style_guide,
            settings.output_dir / "dry-run-image.png",
        )
        telegram_response = {"dry_run": True}
    else:
        assert client is not None
        topic_data = generate_topic(
            client=client,
            model=settings.openai_model,
            system_prompt=system_prompt,
            knowledge_summary=knowledge_summary,
            posts_log=posts_log,
        )
        post_text = write_post(
            client=client,
            model=settings.openai_model,
            system_prompt=system_prompt,
            topic_data=topic_data,
            knowledge_summary=knowledge_summary,
            words_min=settings.post_words_min,
            words_max=settings.post_words_max,
        )
        image_prompt = build_image_prompt(topic_data, style_guide)
        image_path = generate_image(
            client=client,
            image_model=settings.openai_image_model,
            prompt=image_prompt,
            output_path=settings.output_dir / f"post-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png",
        )
        telegram_response = send_photo(
            bot_token=settings.telegram_bot_token,
            chat_id=settings.telegram_chat_id,
            image_path=image_path,
            caption=post_text,
        )

    draft = {
        "topic": topic_data.get("topic"),
        "topic_data": topic_data,
        "text": post_text,
        "image_path": str(image_path),
        "telegram_response": telegram_response,
    }

    write_json(settings.output_dir / "last_draft.json", draft)

    if not dry_run:
        append_post_log(
            settings.post_log_path,
            {
                "topic": topic_data.get("topic"),
                "topic_data": topic_data,
                "text": post_text,
                "image_path": str(image_path),
                "telegram_message_id": telegram_response.get("result", {}).get("message_id"),
            },
        )

    return draft


def run_schedule() -> None:
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger

    settings = load_settings()
    scheduler = BlockingScheduler(timezone=settings.post_timezone)
    scheduler.add_job(
        lambda: run_once(dry_run=False),
        CronTrigger(hour=settings.post_hour, minute=settings.post_minute),
        id="post-ai-pic-daily",
        replace_existing=True,
    )
    print(
        f"Scheduler started: daily at {settings.post_hour:02d}:{settings.post_minute:02d} "
        f"{settings.post_timezone}"
    )
    scheduler.start()


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Telegram post generator.")
    parser.add_argument("--dry-run", action="store_true", help="Create a local draft without OpenAI or Telegram.")
    parser.add_argument("--once", action="store_true", help="Generate and publish one post.")
    parser.add_argument("--schedule", action="store_true", help="Run scheduler.")
    args = parser.parse_args()

    if args.schedule:
        run_schedule()
        return

    result = run_once(dry_run=args.dry_run or not args.once)
    print(f"Done. Draft: {result['topic']}")
    print(f"Output image/prompt: {result['image_path']}")


if __name__ == "__main__":
    main()

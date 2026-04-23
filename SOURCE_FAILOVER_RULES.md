# Source Failover Rules

## Rules

1. If a source times out or errors, skip it immediately.
2. Do not retry the same source in the same run.
3. Continue to the next source.
4. Do not publish empty summaries.
5. Do not send empty Telegram posts.
6. Do not stop the whole run because one source failed.

## Result

The bot should always prefer:

`good source -> summary -> Telegram`

over

`failed source -> empty post -> Telegram error`

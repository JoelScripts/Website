Set one of these environment variables on the server for the Twitch ban appeal form:

- TWITCH_BAN_APPEAL_DISCORD_WEBHOOK_URL
- BAN_APPEALS_DISCORD_WEBHOOK_URL
- DISCORD_WEBHOOK_URL

Recommended route:
- /api/twitch-ban-appeal

This endpoint receives ban appeal submissions from pages/rules.html and forwards them to Discord.

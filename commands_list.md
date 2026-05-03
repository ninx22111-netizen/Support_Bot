# 122 Team ModMail Bot — Commands Reference

This file documents every command and interactive control the bot ships with on
`main`. Commands are message-prefix (`!`) commands rather than Discord slash
commands. The bot also exposes button and select-menu interactions inside the
ticket flow.

> See [`TODO.md`](TODO.md) for queued enhancements (including planned slash
> commands).

---

## User commands (DM the bot)

| Command  | Who can use | What it does |
| -------- | ----------- | ------------ |
| _(any DM)_ | Anyone in a mutual server | If you have no active ticket, the bot replies with a confirmation prompt (and a server picker if you share more than one server with the bot). Confirming opens a new ticket. |
| `!reset` | Anyone | Wipes any "ghost" ticket cache the bot still holds for **you** (e.g., if a ticket channel was deleted manually). |
| `!debug` | Anyone | Replies with the server ID and channel ID of your current ticket — useful when troubleshooting permissions. |

If you already have an active ticket, every other DM you send is forwarded to
the staff ticket channel as an embed.

### Buttons / select menus shown in DMs

- **Server picker** (`Select the server you are contacting:`) — appears when
  you share multiple servers with the bot.
- **Open Ticket / No Thanks** — confirmation buttons before a ticket is
  created.

---

## Staff commands (inside a ticket channel)

All staff commands require `isUserStaff(...)` to pass: server admins always
qualify, otherwise the user's highest role must rank at or above any role
configured in `STAFF_ROLE_ID`.

| Command  | What it does |
| -------- | ------------ |
| `!close` | Closes the current ticket, DMs the user a closure embed, logs to `ticket-logs` / `modmail-logs` (if found) with a "See the messages" transcript button, and deletes the channel after 5 seconds. |
| `!close <reason>` | **(New this cycle.)** Same as `!close`, but the supplied reason is shown to the user in their closure DM, included in the log-channel embed, and recorded in the saved transcript. Reasons over 500 characters are truncated. |
| `!transcript` | Generates a plain-text transcript of the last 100 messages in the channel and posts it as a `.txt` attachment. Does not close the ticket. |
| `!wipe @User` | Clears the bot's cached ticket for the mentioned user. Useful when their ticket channel was already deleted manually. Silent for non-staff. |

### Buttons shown in the ticket channel

| Button | Effect |
| ------ | ------ |
| 🙋 **Claim** | Marks the ticket as claimed by the clicking staff member. After this, only the claimant (or a server admin) can post staff replies — other staff messages are deleted. |
| 🔄 **Transfer** | Opens a user-select menu so the claimant can hand the ticket off to a different staff member. |
| 🔒 **Close** | Closes the ticket (same flow as `!close`, with no reason). |

### Buttons shown in the log channel

| Button | Effect |
| ------ | ------ |
| 📄 **See the messages** | Replies with the saved `transcripts/<channelId>.txt` file (ephemeral). Only available while the transcript file still exists on disk. |

### Sticky-bottom closure log

The most-recent closure log embed is "stuck" to the bottom of its log
channel. Whenever a **human** (non-bot) message is posted in the log
channel, the bot deletes its previous copy of that embed and re-posts an
identical one at the bottom, so the latest closure is always the last
visible message.

- Only the **single most recent** closure rides the bottom — when a new
  ticket closes, the previous closure stops being sticky and stays in
  place as a regular history entry. Its `📄 See the messages` button
  keeps working.
- Bot-authored messages (including the bot's own resend, *and* other
  audit/logger bots) are intentionally ignored. This breaks the
  feedback loop where an audit bot posts in response to the
  delete/send → triggers another bump → etc.
- A per-channel `bumpingChannels` lock prevents two rapid messages
  from racing through the bump and orphaning a duplicate embed.
- The sticky tracking lives in memory only and is reset on restart;
  the next closure starts a fresh sticky.

---

## Operational notes

- **Auto-detected channels.** When opening a ticket, the bot looks for a
  category named `tickets` or `support` and a log channel named `ticket-logs`
  or `modmail-logs`. Missing categories are auto-created.
  - **(New this cycle.)** Both name lists are configurable via env:
    `TICKET_CATEGORY_NAMES` and `LOG_CHANNEL_NAMES` accept a
    comma-separated list (case-insensitive) and fall back to the
    defaults above if unset or empty. The first entry of
    `TICKET_CATEGORY_NAMES` is also used (capitalized) as the display
    name when the bot has to auto-create the ticket category.
- **`MessageFlags.Ephemeral`.** As of this cycle, all ephemeral interaction
  replies use `flags: MessageFlags.Ephemeral` instead of the deprecated
  `ephemeral: true` shortcut. Behavior is unchanged.
- **Self-ping (Render).** When `RENDER_EXTERNAL_HOSTNAME` is set, the bot
  pings itself every 10 minutes to stay awake. The HTTPS request now has a
  15-second timeout so a hung connection can't leak handles.
- **Transcript pagination.** _(New this cycle.)_ Both the closure
  transcript saved to `transcripts/<channelId>.txt` and the `!transcript`
  command now page through `channel.messages.fetch` until the channel is
  exhausted (capped at 5,000 messages as a safety net). Long tickets are
  no longer truncated to the most recent 100 messages.

## Environment variables

| Variable | Required | What it does |
| -------- | -------- | ------------ |
| `DISCORD_TOKEN` | yes | Bot token from the Discord developer portal. The bot exits with `❌ No bot token found!` if unset. |
| `GUILD_ID` | yes | Primary server ID. Required even in multi-guild mode. |
| `STAFF_ROLE_ID` | yes | Comma-separated staff role IDs. Anyone whose highest role ranks at or above any of these is treated as staff. |
| `TICKET_CATEGORY_ID` | no | Pin tickets to a specific category ID (overrides auto-detection by name). |
| `LOG_CHANNEL_ID` | no | Pin closure logs to a specific channel ID (overrides auto-detection by name). |
| `TICKET_CATEGORY_NAMES` | no | Comma-separated list of acceptable category names for auto-detection. Defaults to `tickets,support`. The first entry is also used as the display name when auto-creating the category. |
| `LOG_CHANNEL_NAMES` | no | Comma-separated list of acceptable log-channel names for auto-detection. Defaults to `ticket-logs,modmail-logs`. |
| `PORT` | no | Express keep-alive port. Defaults to `3000`. |
| `RENDER_EXTERNAL_HOSTNAME` | no | When set, the bot pings `https://<hostname>` every 10 minutes (15s timeout) to keep Render's free tier awake. |

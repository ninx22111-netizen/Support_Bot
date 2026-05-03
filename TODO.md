# 122 Team ModMail Bot — TODO

Living backlog of follow-ups for the bot. Items are roughly ordered by
priority. When you finish one, mark it `[x]` and move it to the bottom of its
section.

## Stability / bugs

- [x] Fix `showPrompt` adding the **bot's** ID to `pendingPrompts` when called
      from the server-picker dropdown — should add the user's ID. _(this cycle)_
- [x] Replace deprecated `ephemeral: true` with
      `flags: MessageFlags.Ephemeral`. _(this cycle)_
- [x] Drop the unused `processedMessages` Set declared next to the raw-gateway
      hijack. _(this cycle)_
- [x] Add a 15s timeout to the Render keep-alive `https.get` request. _(this cycle)_
- [ ] Make the `activeTickets.has(userId)` check in the "open ticket" button
      handler atomic. Today, two button clicks that arrive in quick succession
      can both pass the check before either creates a channel.
- [x] Defensively null-check `message.member` before reading
      `member.permissions.has(PermissionFlagsBits.Administrator)` in the
      claim-protection branch — partials can be `null`. _(this cycle)_
- [x] Stop swallowing errors from the raw-gateway DM hijack — `catch (err) {}`
      hid real rate-limit / `Unknown Channel` failures. Now logged via
      `console.error`. _(this cycle)_
- [x] Gate the per-keystroke `[DEBUG TYPING]` console log behind `DEBUG_TYPING=1`
      so production logs aren't spammed. _(this cycle)_
- [ ] Fetch transcript messages with pagination instead of capping at 100 so
      long tickets aren't truncated.

## Features

- [x] `!close <reason>` — capture a free-text reason in the user-facing DM
      embed, the log-channel embed, and the saved transcript. _(prev cycle)_
- [x] **Sticky-bottom closure log.** Most-recent closure embed is anchored
      to the bottom of the log channel — every non-self message in that
      channel deletes the previous copy and re-posts the same embed +
      `📄 See the messages` button. _(this cycle)_
- [ ] `!areply <message>` — staff anonymous reply (forwards as "Support Team"
      without exposing the staff member's name). Standard ModMail feature.
- [ ] **Subject prompt on open** — collect a short subject line before the
      ticket channel is created and embed it in the opening message.
- [ ] **Slash commands.** Migrate the user-facing `!help` / `!status` (see
      PR #1) and the staff `!close` / `!transcript` to real Discord slash
      commands so they show up in autocomplete. Will need a registration
      script and the `applications.commands` scope.
- [ ] **Persistent storage.** Today `activeTickets` and `channelToUser` live
      only in memory and are rebuilt from channel topics on restart. Move to
      SQLite (or similar) so claim state and reasons survive restarts.
- [ ] **Configurable category / log-channel names.** Auto-detect currently
      hard-codes `tickets` / `support` and `ticket-logs` / `modmail-logs` —
      expose via env.
- [x] **Cooldown / spam protection** for users who DM the bot in bursts before
      a ticket is open. Tunable via `DM_COOLDOWN_THRESHOLD` (default `5`) and
      `DM_COOLDOWN_WINDOW_MS` (default `10000`); sends one warning per window
      and silently drops follow-up DMs until the window expires. Skipped once
      a ticket exists so legitimate forwarding is never throttled.
      _(this cycle)_

## Documentation / DX

- [ ] Add a `README.md` that covers env vars, hosting (Render), and the
      auto-detected channel names.
- [ ] Add an ESLint config + `npm run lint` script. There is currently no
      lint or typecheck command in `package.json`.
- [ ] Add a smoke test that loads the module without `DISCORD_TOKEN` and
      asserts the documented error path (already happens manually each
      maintenance cycle).
- [ ] Set up a `staging` branch + branch-protection so deployable commits can
      bake before reaching `main`.

# 122 Team ModMail Bot — TODO

Living backlog of follow-ups for the bot. Items are roughly ordered by
priority. When you finish one, mark it `[x]` and move it to the bottom of its
section.

## Stability / bugs

- [x] Fix `showPrompt` adding the **bot's** ID to `pendingPrompts` when called
      from the server-picker dropdown — should add the user's ID. _(prev cycle)_
- [x] Replace deprecated `ephemeral: true` with
      `flags: MessageFlags.Ephemeral`. _(prev cycle)_
- [x] Drop the unused `processedMessages` Set declared next to the raw-gateway
      hijack. _(prev cycle)_
- [x] Add a 15s timeout to the Render keep-alive `https.get` request. _(prev cycle)_
- [ ] Defensively null-check `message.member` before reading
      `member.permissions.has(PermissionFlagsBits.Administrator)` in the
      claim-protection branch — partials can be `null`.
- [ ] Fetch transcript messages with pagination instead of capping at 100 so
      long tickets aren't truncated.
- [x] Make the `activeTickets.has(userId)` check in the "open ticket" button
      handler atomic. Today, two button clicks that arrive in quick succession
      can both pass the check before either creates a channel. _(this cycle —
      added in-memory `creatingTickets` Set, reserved synchronously before
      `interaction.deferUpdate()`, released in a `finally`.)_

## Features

- [x] `!close <reason>` — capture a free-text reason in the user-facing DM
      embed, the log-channel embed, and the saved transcript. _(prev cycle)_
- [x] **Sticky-bottom closure log.** Most-recent closure embed is anchored
      to the bottom of the log channel — every non-self message in that
      channel deletes the previous copy and re-posts the same embed +
      `📄 See the messages` button. _(prev cycle)_
- [x] `!areply <message>` — staff anonymous reply (forwards as "Support Team"
      without exposing the staff member's name). Standard ModMail feature.
      _(this cycle — supports attachments, respects claim protection, deletes
      the original command message, and the staff-channel echo footer
      records the actual sender for audit.)_
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
- [ ] **Cooldown / spam protection** for users who DM the bot in bursts before
      a ticket is open.

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

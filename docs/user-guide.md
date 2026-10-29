# User guide

This guide covers the real API mode. See the [catalog](feature-catalog.md) for implementation/evidence status and [demo limitations](frontend.md#demo-mode). Platform and arena screens require an account; an invitation link never bypasses sign-in or ownership.

## Account access and recovery

At `/sign-up`, choose a 3–20 character username (ASCII letters, digits, underscores), provide email and an 8–128 character password twice, and check the terms checkbox. Availability/strength feedback is advisory; the server enforces uniqueness and confirmation. Email is trimmed/lowercased; username display case is preserved with case-insensitive uniqueness. Successful signup signs you in. Terms content is currently placeholder text, and consent is not stored as a separate record. There is no verification-email or OTP flow. Google, playstyle and marketing controls marked Coming Soon are disabled.

At `/sign-in`, use email/password. Remember me changes the default absolute session lifetime from 24 hours to 30 days and makes the refresh cookie persistent. Refresh does not extend that lifetime. Reload normally restores the session. Field errors, incorrect credentials, pending submission and network failures have explicit feedback; an outage never switches to fixtures. Use the account menu's sign-out confirmation. Failed logout retains an error; ordinary logout ends that session family, not independent devices.

At `/forgot-password`, submit your email. Unknown accounts and requests inside sending limits receive the same acknowledgement. Delivery requires operator-configured SMTP. Open the newest emailed link, wait for its status check, and submit a confirmed new password. Opening does not consume it; successful reset does. Default expiry is 30 minutes; replaced, expired, malformed and used links are unusable. Successful reset revokes all account sessions, disconnects their sockets and queues a password-changed notice. Sign in again. Never share a reset link.

## Launcher and private rooms

`/` redirects to `/play`. The launcher offers Play with Friends (invite dialog), Create Room, Find Players, quick-match links including Vs Engine, account/ratings, notifications, recent finished games and a responsive friends panel/mobile dialog. Recent games open saved replays; View All opens `/games`. The connectivity indicator measures a health-request round trip, not opponent delivery or engine search speed. General settings/profile/statistics/seasons/rewards remain gated; dedicated privacy and audio controls are available.

1. Open `/rooms/new`. Choose the clock and host color preference (white, black, random), optionally enter a registered username/email, then submit. No room exists before submission.
2. If optional invitation sending fails after room creation, the room remains and its waiting room lets you retry. The host can invite while its challenger seat is empty. Friendship is not required. Unknown emails are not a signup invitation.
3. The recipient opens `/rooms/join/{invitationId}` from an inbox/email link, signs in, reviews settings and accepts or declines. Wrong-account links offer Switch account without disclosing details. Another invitee may claim the single seat first.
4. In `/rooms/{roomId}`, both players select I'm ready after reviewing settings. Host edits reset both readiness flags. Stale confirmations ask you to review the newest settings.
5. Only the host starts a ready match. Seats/settings become final, pending invites close, colors are assigned and both clients enter the arena. Reloading a started room recovers its game link.

Presets are base minutes + increment seconds: Bullet **1+0, 2+1**; Blitz **3+0, 3+2, 5+0, 5+3**; Rapid **10+0, 10+5, 15+10**; Classical **30+0, 30+20**. Default 10+0. Custom/unlimited/variant controls are unavailable. Private games are casual.

Waiting rooms show empty seats, readiness, presence, expiry and pending/error states. Default limits are five open hosted rooms, 120-minute rooms and 30-minute invitations bounded by room expiry. Hosts Cancel room with confirmation; challengers Leave room before start, freeing the seat and clearing readiness. Hosts cancel rather than leave. Closed/expired states link back to the lobby. There is no general open-room listing: keep the room link. Duplicate, self, unknown-account, blocked, full, closed and revision-conflict cases show explicit errors; username invitations never expose recipient email.

## Inbox and email

The notification popover has unread state, contextual links, Mark as read, Mark all as read and Load older notifications, plus loading/empty/retry views. Reading or opening never accepts an invitation. Following a contextual link marks that entry read and opens the destination; answer there. Invitation state and notification read status are separate.

Eligible new realtime notifications show a toast/link and optional sound without forcing navigation from a match. Stable IDs deduplicate presentation; Web Locks/storage coordinate visible tabs on a best-effort basis. Reconnect recovers older inbox entries silently.

Only recipients with no authenticated socket when an invitation is created get an email job. Before sending, the worker rechecks expiry, answer/cancellation, block, room closure/fullness, current online status and whether the inbox notification was read. Going offline later does not create a job. Friend requests never email. A successful acknowledgement means queued domain work, not confirmed delivery; operators should inspect the [outbox](operations.md#email-delivery).

## Random matchmaking and engine games

Find Players opens `/matchmaking`. Select Casual or Rated, a clock and Find Match. Rated needs server support and Bullet/Blitz/Rapid; Classical is casual only. Current rating, provisional progress, elapsed time, cancellation, connection feedback and Retry status are shown. Searches match exact base/increment/rated/pool. Rated tolerance widens with waiting, and both players' windows must permit the pair. Colors are server-assigned.

Once paired, authenticated open tabs automatically confirm within 30 seconds. Only both confirmations create a game and start White's clock. Search expires after five minutes. Cancellation/arrival expiry returns players to idle; start a fresh search afterward. Cancel Search uses the search ID, so an old tab cannot cancel a new search or committed game. Closing the tab, signing out or navigating away does not cancel. Reopening/signing in restores status, and a session-wide bridge opens a committed assignment from another route. Active-game/search admission prevents overlapping starts. Blocked pairs cannot newly match or start from an uncommitted confirmation.

Vs Engine opens `/rooms/new?opponent=engine`. Choose clock/side, inspect Ready/Unavailable/Not set up, then Start game. No invitation/waiting room is involved. The backend checks fresh readiness and admission before clock start; displayed availability reserves nothing. An existing engine-game conflict offers Resume that game. Capacity/configuration/outage errors are visible and retryable as indicated.

Engine queued/thinking/retrying state is server-reported. Backend queueing, thinking and HTTP travel spend the engine's clock. Draw offers are unavailable. Normal rules/resignation apply; exhausted infrastructure recovery can produce Aborted with no winner or draw. If the clock actually flags, ordinary timeout rules decide. Difficulty, engine Elo, best-move hints, evaluation and accuracy are unavailable.

## Live board and recovery

`/games/{gameId}` is private to participants. Your side initially faces you; Flip changes only local orientation. Drag/drop or click/tap an origin and legal target. A focusable keyboard form accepts coordinates such as `e2e4`; live keyboard promotions need a suffix such as `e7e8q`. Pointer promotion offers queen/rook/bishop/knight and cancellation. Castling/en passant use normal legal targets.

Amber pending positions are provisional. One command runs at a time; only server acceptance makes it official. Invalid/stale/out-of-turn commands show feedback and authoritative state. There are no premoves. Captures and SAN move list derive from accepted moves. The live move log's Copy action copies saved PGN when available, otherwise current movetext; clipboard permission failure shows a toast. It is disabled before the first move.

Clocks are server-authoritative with local interpolation. Increment applies once per accepted move; server receipt determines time, without client lag compensation. Disconnecting does not pause clocks. Reconnecting/catching-up disables commands. Without realtime, HTTP polling is read-only; wait for synchronized live state before moving. Uncertain commands retry the same ID to avoid duplicate moves.

Select earlier move-list positions to review live history. New moves still arrive and official clocks continue; your review cursor does not affect the opponent. Moving is disabled while reviewing. Back to Live returns to the latest position. Captures/clocks remain tied to official state in live play; replay has recorded readings.

Offer Draw requires confirmation; the opponent accepts, declines or dismisses/reopens the response dialog. Moving declines an opponent's pending offer. A declined offerer must move before offering again. Resignation confirms first. Result dialogs show outcome/reason and settled rating deltas and can be reopened.

Automatic endings include checkmate, stalemate, supported insufficient material, third repetition and 100 halfmoves without pawn movement/capture. Repetition/50-move draws are automatic, not claim buttons. Timeout can draw when the other side cannot mate. The material detector does not solve every dead position. The arena header asks before leaving active play, but leaving is not resignation. Backend restart resumes active turns from last committed balances, restoring any uncommitted thinking time as well as not charging downtime.

## History, replay and manual variations

`/games` lists your finished games newest first: opponent, local date/time, mode, clock, side, result and committed rating change. Filter White/Black/Both and Win/Loss/Draw/All; Load more uses a cursor. Aborted games appear under All without a dedicated filter. Empty results suggest changing filters; errors offer retry and retain loaded pages.

Original replay has First/Previous/Next/Last, original move selection, recorded clocks, Flip, View result and read-only Original PGN text for selection/copy. No PGN import or separate download API exists.

Analyze manually opens `/games/{gameId}/analysis` after finish. Play both sides with board/UCI entry, branch at original/temporary positions, select sibling/nested continuations, Return to original line or Discard variations. The backend validates each proposed path without changing saved play. Temporary lines are untimed; cards show original final clocks. Pending/error/retry are visible. Limits: 128 temporary moves/path and 512 nodes.

Branches are unsaved. Exit, reload, game/account change, route hiding and browser page-cache restoration clear them. They never enter original PGN, ratings, history, storage or canonical game cache. An active game's analysis URL rejects editing. No engine is involved.

## Friends, blocks and ratings

`/friends` contains Friends, Incoming Requests, Sent Requests and Find Players. Here Find Players means username-prefix discovery (two characters minimum), separate from random matchmaking. Search excludes self/blocked pairs and shows current relationship state. Send a request; recipients accept/decline and senders cancel. Repeated/opposite sends return the current relationship without auto-acceptance. There is no request expiry worker. Default limits: 30 new sends/hour and 300-second pair resend cooldown after terminal requests.

Friends have server-backed filtering/Load more and online/offline presence while any authenticated tab is connected, with a short final-disconnect grace. Presence does not mean available to play, and exposes no activity/last-seen. Challenge opens a normal casual room/invitation. Remove friend confirms and deletes only the relationship.

Privacy settings at `/settings/blocked-accounts` shows only accounts you blocked. Blocking confirms, removes friendship, cancels pending requests/invites, hides discovery/friend presence and prevents future invitations/pairing either way. It preserves committed games, legal moves, participant room/game presence, replay, rating settlement, historic inbox records and public leaderboard rows. Unblocking restores none of the removed relationships. Unavailable errors do not disclose block direction. Lists and social actions have loading/empty/error/retry/Saving feedback.

Rated random games update only their pool. Each starts at 1200; ten settled rated games end provisional placement. Private/engine/casual games do not count. `/leaderboard` has Bullet/Blitz/Rapid tabs, personal placement, rankings, previous/next pages, manual refresh and older private rating changes. Equal ratings share competition rank (1,1,3). Provisional/ineligible accounts have no public rank. Empty pools and failures have explanatory/retry states. See [rating calculation](backend.md#ratings) for exact rounding/floor rules.

## Audio and troubleshooting

Audio popovers in lobby/room/arena headers offer Enable audio/Test sound, master mute, effects and volume. Enable is a deliberate per-tab gesture; saved preferences cannot autoplay. Preferences persist in this browser (`vortix.audio.v1`, default unmuted/effects on/65%), without account storage or active cross-tab synchronization.

Recordings are effects, with no speech/live voice. Result beats move; otherwise check beats promotion, castle, capture and ordinary own/opponent move. History/reconnect loads are silent; explicit replay/manual moves can sound locally. Hidden tabs suspend playback and discard stale cues. Interact after returning to an opted-in tab. Audio failure never blocks chess. Low-time, illegal-move and premove files are bundled but unused.

| Symptom | Meaning / next step |
| --- | --- |
| Repeated session expiry | Check absolute expiry, API/cookies and consistent localhost hostname; operator details in [security](security.md) |
| Wrong-account invitation | Switch account; forwarded link grants no permission |
| Room changed/readiness reset | Review settings and ready again |
| Missing email | Check newest link/expiry; ask operator to inspect SMTP/outbox |
| Cannot move | Check turn, result, review, pending command and live synchronization |
| Search keeps returning | Cancel explicitly; page/tab closure preserves it |
| No rank | Finish ten eligible rated games in that pool |
| Silent audio | Enable in this tab; unmute, effects on, volume above zero; interact after tab return |
| Coming Soon | Disabled capability, not a working service |

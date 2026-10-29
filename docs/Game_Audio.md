# Game audio

> **Historical milestone / handoff.** Preserved for dated decisions and original verification reports. Current scope, setup and contracts are superseded by the [feature catalog](feature-catalog.md), [current documentation index](../README.md), [deployment guide](deployment.md), [API notes](api.md) and [current testing evidence](testing.md). Old future-work statements, UCI-process proposals and test/performance counts are not proof of current functionality.


Implemented 28 October 2026. Browser-local audio is optional and never changes game rules, clock arithmetic, official move ordering, persistence, results or the independent live-review cursor. No audio package, backend endpoint, microphone permission or voice-chat UI was introduced.

## Assets

The discovered root folder was `chess.com-custom-sounds-main` (12 MP3s, no other or hidden files). All files are 48 kHz stereo and decode successfully. Files were copied unchanged to `frontend/public/audio/`, SHA-256 checked against their originals, and only then removed from the original folder. The empty original folder was removed. The asset README and `asset-inventory.json` record provenance and original names; no license/attribution was supplied.

Inspection used filenames, MP3 stream metadata, durations (0.117–0.477 seconds), and complete decoding. No audible listening verification was performed. There are no identifiable prerecorded announcements, separate victory/defeat/draw files or ambiguous long recordings in this pack. Voice announcements and a separate voice toggle are therefore not exposed. The unavailable voice-chat feature remains unavailable.

| Semantic cue | Public URL | Original filename |
| --- | --- | --- |
| Game start | `/audio/game/game-start.mp3` | `game-start.mp3` |
| Own move | `/audio/game/move-self.mp3` | `move-self.mp3` |
| Opponent move | `/audio/game/move-opponent.mp3` | `move-opponent.mp3` |
| Capture | `/audio/game/capture.mp3` | `capture.mp3` |
| Check | `/audio/game/check.mp3` | `move-check.mp3` |
| Castling | `/audio/game/castle.mp3` | `castle.mp3` |
| Promotion | `/audio/game/promotion.mp3` | `promote.mp3` |
| All game completions | `/audio/game/game-end.mp3` | `game-end.mp3` |
| Fresh notification | `/audio/notifications/notification.mp3` | `notify.mp3` |

Unmapped but preserved in `public/audio/game/`: `illegal-move.mp3` (original `illegal.mp3`), `premove.mp3`, `ten-seconds.mp3` (original `tenseconds.mp3`). The feature does not add premoves, rejected-move sounds or clock alarms. The single generic end effect covers wins, losses, draws and engine aborts; visible result text retains their distinctions.

## Architecture and integration

- `features/audio/audio-assets.ts`: typed semantic manifest; all runtime audio paths are centralized here.
- `audio-manager.ts`: one lazily created Web Audio context, master gain, cached fetch/decode promises, replaceable game/notification channels, abortable fetches, cancellation and teardown. Playback work starts in a microtask after accepted game state is reconciled. No audio objects or asset paths enter presentation components.
- `audio-provider.tsx` and `audio-preferences.ts`: one provider under `AppProviders`, stable hook operations, SSR-safe preference hydration through an external store, route/visibility lifecycle. No Axios or Query ownership of audio.
- `features/games/audio/game-audio.ts` and `screens/games/use-game-audio.ts`: small game event guard composed with audio by the screen. The game feature and audio feature do not import each other. `GameSessionProvider` offers lifecycle callbacks and invokes the update callback only after the existing authoritative revision reconciler accepts an update. Command acknowledgements mark rejected/duplicate answers silent; the existing cache revision check makes ack/event delivery order irrelevant.
- Full initial, HTTP and channel snapshots are silent. A channel snapshot establishes the baseline; disconnection/gaps pause it until resynchronization. Consecutive, applied live revisions can sound once, with an additional stable `game:<id>:<revision>` playback key. Delayed events more than two seconds from the synchronized server clock are discarded. A new HTTP baseline after a revision jump is silent. Engine progress and presence never play sounds. Optimistic board animation never invokes audio. Audio callbacks never update review state.
- `screens/rooms/use-game-start-audio.ts`: room start acknowledgements/events and successful engine creation share `start:<gameId>` deduplication. Only transitions from a loaded waiting/ready room to a fresh committed started room announce; loading an already started room does not. The short start effect may continue specifically into that game's route; other navigation cancels it. Random matchmaking logic is untouched.
- `SessionRealtimeBridge`: the existing once-per-notification callback adds a freshness check and notification ID key. Inbox/history fetching is silent. Reconnect establishes a new notification time boundary; stale, read, expired or cancelled invitation notifications do not sound.
- `PostGameWorkspace` and `useManualAnalysis`: recorded navigation sounds only on explicit changed selections; a temporary move sounds only once validation succeeds or a validated existing continuation is chosen. Loading positions, failed/cancelled previews and rerenders are silent. Replay/manual sounds use move effects only and never announce results.

## Cue precedence

One cue per accepted revision: **completion > check > promotion > castling > capture > normal move**. Check uses authoritative SAN's trailing `+`/`#`; other move semantics likewise use recorded SAN, including en passant captures and capture-promotions. Own/opponent uses the server viewer colour, independent of board orientation. The same move-effect selector is reused for explicit replay/manual interactions, without the completion branch.

Each newer game effect replaces the previous playing/loading game effect. Notifications have a separate short channel. No announcement queue exists. There are no supplied voice assets to load or arbitrate.

## Preferences, activation and browser limits

Audio controls appear in the launcher, room/setup headers and arena header using the existing popover/button styles. Controls have accessible labels and native keyboard behavior: **Master mute**, **Sound effects**, **Volume**, **Enable audio / Test sound**. Existing visual messages, clocks, result dialogs and notifications remain available when muted.

Only `{ muted, effects, volume }` is stored in local storage at `vortix.audio.v1`. Values are validated/clamped; corrupt data and denied storage fall back safely. The manager receives saved preferences before it can be unlocked, preventing a saved mute from briefly leaking sound. Activation is per tab and is not persisted. Press **Enable audio** once after each document load. Browsers that reject activation leave the button available to retry.

AudioContext is created/resumed only from an explicit button gesture or, after opting in, a subsequent trusted pointer/keyboard interaction. Hidden tabs stop sounds and pending playback and suspend the context. Returning never flushes old cues; a fresh interaction resumes opted-in audio. The latest event is discarded rather than played if its fetch/decode finishes after 750 ms, navigation, mute, suspension, a newer cue or disposal. Downloads/decodes are reused for the life of the provider and requested only on demand. Missing files, fetch errors, unsupported MP3 decoding and rejected context operations fail silently without interrupting gameplay. An asset that fails loading remains disabled for that provider lifetime; reload retries it.

All runtime browser APIs are called from client effects/actions, never during SSR. Cleanup removes provider listeners, cancels pending game playback on route/game changes, ignores late unmounted acknowledgements, aborts fetches and closes the context when the provider unmounts. Preferences are local to each tab's UI; cross-tab preference synchronization and cross-tab exclusive audio ownership are not included.

## Verification

Focused Vitest tests cover cue precedence, generic results, duplicate ack/event revisions, rejected/duplicate acknowledgements, gaps, reconnect/history boundaries, clock skew, delayed events, notification freshness, versioned preferences/denied storage, activation failures, mute/volume, one-time decoding, late decode cancellation, navigation, background suspension and disposal, using mocked playback/Web Audio.

The existing scripted demo publishes full snapshots for its live moves; those snapshots deliberately stay silent under the same catch-up policy. Production friend/engine games use compact `game.updated` events. Exercise live cue integration with those events; do not infer audio regression from the snapshot-only demo. Replay/manual effects remain available in the demo. Test-sound activation can verify actual MP3 fetching/decoding without a live API.

Browser QA used cached Playwright with headless Chromium at `http://localhost:3100` in explicit demo mode (the Browser plugin was unavailable), at 1440×960 and 390×844. Verified page identity, meaningful rendering, no error overlay, no uncaught page errors or browser console warnings/errors, activation with a real MP3 fetch/decode/source start, mute/effects suppression, keyboard volume, saved preferences after reload, resource reuse, explicit history replay sounds, and live review/back-to-live. A mobile popover clipping issue was found, fixed and visually checked after rerunning. Screenshots and the temporary QA script/report are outside the repository in the Windows temp directory. This was not audible verification. Full production friend/engine sessions and real incoming notifications were not exercised against a running backend; their event policy is covered by the focused tests and existing reconciliation tests.

Visibility changes establish a new audio time boundary for live moves and notifications. Buffered events generated before returning are discarded even if they arrive promptly after a new activation gesture. Room subscriptions treat the first `room.updated` after joining/reconnecting/backgrounding as a silent baseline because that event type also carries synchronization snapshots. Start acknowledgements still announce deliberate successful starts, deduplicated with live delivery.

Final frontend checks: `npm.cmd test` (118 tests across 21 files, including 49 new audio tests), `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check` passed. The build initially exposed the Cache Components `usePathname` Suspense requirement; route audio cleanup now uses an independently suspended leaf. Mobile headers use a compact speaker button and keep deferred XP decoration/arena latency metrics at larger widths to leave room for functional controls.

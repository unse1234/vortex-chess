# Game history, original replay and temporary manual analysis

> **Historical milestone / handoff.** Preserved for dated decisions and original verification reports. Current scope, setup and contracts are superseded by the [feature catalog](feature-catalog.md), [current documentation index](../README.md), [deployment guide](deployment.md), [API notes](api.md) and [current testing evidence](testing.md). Old future-work statements, UCI-process proposals and test/performance counts are not proof of current functionality.


Updated: 26 October 2026. **Milestone complete for the real API.** Implements the history/replay portion of phase 6 and the explicitly approved temporary manual-analysis scope. Earlier exclusions of all branching are superseded **for finished games only**. Live historical review stays read-only. Engine play, numerical evaluation, best moves, accuracy and automated review remain unavailable.

## Entry points and behavior

- `/games`: the signed-in participant's finished games, newest completion first, with opponent, completion date, assigned side, Friends mode, time control and viewer-relative result. Side/result filters run in PostgreSQL. Loading, empty, initial failure and next-page failure states use existing feedback components. “Load more games” requests the next backend page.
- Recent games on the launcher now use the authorized backend endpoint, with the same replay destination.
- `/games/[gameId]`: active games retain the existing arena and read-only historical review. Finished games open the original replay workspace.
- After an authoritative completion event, the result dialog offers **Replay game** and **Analyze manually**. Both use that game's workspace. A full snapshot fills the final PGN omitted by compact live updates; an equal-revision snapshot can fill a missing PGN without replacing recorded moves, clocks or result.
- `/games/[gameId]/analysis`: the same finished-game workspace with temporary manual moves enabled, independently of the deferred engine-analysis flag. Direct access for an active game displays the restriction and a return link. Direct preview API calls enforce it again.

Replay has First/Previous/Next/Last, notation selection, board orientation, original PGN and frozen recorded clock snapshots. Player cards and the fitted arena board layout are reused. All chessboard rendering uses the existing adapter and react-chessboard's default pieces. Board instances and input labels have distinct React IDs even when Next.js retains hidden routes.

Manual analysis is untimed: the user plays either side according to the server-returned turn. Clicking/tapping, dragging, UCI entry and promotion selection use backend legal destinations and validation. No automatic opponent runs. The board keeps its last validated FEN during a move request or failure. Temporary moves display amber, indented under their parent, alongside an explicit **Unsaved — cleared when leaving** notice. Returning to the original line retains branches within the current visit; **Discard variations** removes all of them.

Drag feedback follow-up: the adapter holds a translucent default piece at the drop square while preview is pending, hiding its source graphic. This avoids snapping back to the source and jumping forward again on a delayed response. This is square rendering only: no FEN is progressed, no chess rule is computed in the browser, and the tree/cursor stay at the validated node until acceptance. Rejection, failed requests, selection and discard remove the pending graphic. Castling rooks and en-passant captures remain in the validated position until the server response arrives.

This follow-up passed frontend typecheck, lint and all 57 unit tests. Playwright/Chromium on the running frontend at `localhost:3000`, with isolated HTTP/Socket.IO fixtures, verified frame-by-frame drag placement across a 400 ms preview delay, pending-node immutability, rejected-move rollback, discard during a pending preview, live-game drop regression and desktop/mobile layouts (1440x1000 and 390x844), without runtime errors. The Browser plugin was unavailable. Temporary script and screenshots are `%TEMP%/vortix-drag-check.cjs` and `%TEMP%/vortix-drag-*.png`; these checks do not write game records or use the development database.

## HTTP contracts

The machine-readable contract is [OpenAPI v1.3.0](../backend/openapi.json). All endpoints require bearer authentication and return `Cache-Control: no-store`. Unknown fields are rejected. The existing global body limit is 16 KiB and the existing HTTP rate limit applies.

| Method | Input | Response and policy |
| --- | --- | --- |
| `GET /api/games` | `limit` 1–50 (default 20), optional `cursor`, `side=w|b`, `result=win|loss|draw` | `{ items, nextCursor }`; only finished games in which the actor has a participant row. Fixed ordering: `endedAt DESC, id DESC`. Send the returned opaque cursor with the same filters. No client-side business filtering/sorting. |
| `GET /api/games/recent` | Same query contract | Same envelope; preserves the launcher's existing endpoint. No fabricated ratings. |
| `GET /api/games/:gameId` | UUID | Existing authorized canonical snapshot with initial FEN, full move/FEN/clock records, result and final PGN. Other accounts receive 404. |
| `POST /api/games/:gameId/analysis/preview` | `{ basePly, path }` | A separate read-only preview, never a live move command. `basePly` is the count of recorded moves before the variation; integer 0–20,000, also bounded by the game's actual history. `path` contains at most 128 UCI strings matching `^[a-h][1-8][a-h][1-8][qrbn]?$`. Empty paths retrieve legal destinations for an original position. |

Example after recorded White `e4`:

```json
{ "basePly": 1, "path": ["c7c5", "g1f3"] }
```

Preview success returns `{ basePly, moves, fen, turn, checkSquare, legalMoves }`. Each variation move contains `{ uci, san, fen, from, to, ply }`; `fen` is its position after the move. `legalMoves` maps source squares to unique legal destination squares for the side to move, including promotion destinations. `turn` is `w` or `b`. The caller supplies the promotion suffix; the existing dialog offers queen/rook/bishop/knight.

The isolated `AnalysisPreviewService` depends only on Prisma. It authorizes the participant and checks `FINISHED` from the database, reads initial FEN plus the ordered recorded prefix, replays and verifies every stored SAN/FEN/ply, then applies the proposed path in a fresh chess.js instance. Client FEN is never accepted. Later resignation, timeout or checkmate is not used to stop exploration of an earlier position. Castling and en passant rights come from reconstruction. Preview does not use the live game store, command pipeline, official clock, publisher or engine, and never writes any row.

Errors: 400 for invalid payload/base/limit/cursor; 401 unauthenticated; 404 `game_not_found` for unknown or unrelated games; 409 `analysis_requires_finished_game`; 422 `illegal_analysis_move` with the failing 1-based path index; 503 `game_integrity_error` for an invalid saved initial position or prefix. Illegal moves, unnecessary promotion suffixes and failed requests do not produce partial success.

Migration `202610260003_game_history` adds `(status, endedAt DESC, id DESC)` to `Game`. Existing participant indexes authorize history. No analysis table, saved studies, shared annotations or persistence is added. Apply with `npm run db:migrate` in `backend/`.

## State ownership and recovery

| State | Owner |
| --- | --- |
| Original game, moves/FENs, result, PGN, clock snapshots | Canonical `gameKeys.detail(gameId)` TanStack Query entry, reconciled by committed revision |
| Paginated history | TanStack infinite query keyed by current account and backend filter/limit parameters |
| HTTP transport | `game-history.service.ts` and the separate `analysis.service.ts`, through Axios |
| Preview coordination | `use-manual-analysis.ts`, through a TanStack mutation that resolves void and uses `gcTime: 0`, without placing paths/positions in query data |
| Variation tree, cursor, validated preview, pending/error state | Local to the current workspace visit |
| Orientation, square selection, promotion and coordinate entry | Local presentation |

Recorded positions have stable IDs `main:<ply>` and their original parent/next relationships follow the saved move order. Temporary nodes have UUID IDs, `parentId`, `basePly`, a UCI path and backend-returned SAN/FEN. Children are derived from `parentId`. Repeating the same UCI move under the same parent selects the existing temporary or recorded child; identical FENs at different nodes are never merged. Temporary nodes are limited to 512 per visit and each branch to 128 moves.

The local cursor remembers selected continuations: Previous then Next returns to the same variation even across its original base. Last follows that selected continuation. Return to original line clears those continuation preferences without removing the branches.

Selection, navigation and discard invalidate the current request generation and abort its HTTP request. Only a reply from the current generation may change the tree, board, cursor or error; transport cancellation alone is insufficient because an aborted reply can still arrive. Failed/illegal moves keep the prior validated board and existing branches. Legal-destination loading failures offer Retry.

Reload, game/account changes, logout and workspace exit clear temporary state. Next.js Cache Components can retain a page inside hidden React Activity instead of unmounting it: **layout-effect cleanup explicitly clears the tree/cursor/preview and transient input state when hidden**, including browser back/forward restoration. `pagehide` and persisted `pageshow` also clear the tree across full-document navigation and the browser's own back/forward cache. Within one visible workspace, returning to the original line keeps alternatives until discard. Variations are never serialized into browser storage, original PGN, database records or persisted Query caches.

## Verification status

- Prisma validation and all five migrations passed on a fresh, isolated PostgreSQL 18 test cluster at loopback port 55433. Prisma migration diff against the schema reported no difference. The development database was not used.
- Backend: typecheck, lint and production build passed; 70 unit tests passed. The full HTTP/Socket.IO/PostgreSQL suite passed 40 tests; the opt-in load benchmark was skipped. New integration coverage includes access, active-game restrictions, tied-date keyset pagination, backend side/result filtering, malformed/illegal paths, exact before/after equality of game/move/command rows and no preview broadcasts.
- Frontend: typecheck, lint, production build and 57 unit tests passed. New tests cover parent-based identities, sibling/nested branches, repeated-move selection without FEN merging, stale request invalidation and safe final-PGN hydration.
- OpenAPI JSON parsed with all 197 local references resolved across 35 paths. `git diff --check` passed. No frontend chess.js dependency, variation storage or persisted analysis cache was introduced.
- **Browser: 48 checks passed**, using regular Playwright/headless Chromium because the Browser plugin/skill is not available. Real API on `localhost:3002`, production frontend on `localhost:3003`; desktop 1440x1000 and 1440x900, short desktop 1440x768, mobile 390x844. Page identity, meaningful content, no framework overlay, screenshots and interaction checks passed with no runtime/hydration errors. Console resource failures were the deliberately exercised 422/503 errors and 401s during initial session restoration/sign-out; no unexplained application errors remained.
  - Both completion-dialog entry points and history -> original replay; First/Previous/Next/Last, notation selection, orientation, saved PGN and clocks staying unchanged over time.
  - Tap, drag and UCI alternative moves; both sides; multiple sibling/nested branches; repeated node reuse; back/forward across the original base; return to mainline; discard.
  - Both castlings, en passant and knight underpromotion through the dialog; final original Game and GameMove rows equal to their earlier database values.
  - Illegal moves, failed preview requests, retrying legal destinations, late replies after navigation and discard. Reload, workspace exit, switching games, browser Back, cross-tab logout and re-login never restore temporary branches.
  - Explicit pagehide and persisted pageshow lifecycle checks, plus full-document navigation to `about:blank` and browser Back, clear variations without runtime errors.
  - Backend side filtering, empty state, initial loading/failure/retry, next-page failure retaining 20 loaded rows, then pagination to 28 rows with no duplicates; active-game direct analysis route stays restricted; desktop history scroll and mobile overflow checks.

Screenshots and temporary browser scripts/results are outside the repository under `%TEMP%/vortix-history-*`: `analysis-desktop.png`, `analysis-mobile.png`, `analysis-short-desktop.png`, `list-desktop.png`, `browser.cjs`, `browser-extra.cjs`, `browser-lifecycle.cjs` and their JSON results. Browser fixture data and integration tests use separate disposable databases because the pre-existing email-worker test claims all pending outbox jobs; reusing browser fixtures caused that test to count unrelated queued invitations. The final full suite passed on the clean dedicated `vortix_history_checks` database. The temporary API, frontend and PostgreSQL cluster are stopped after verification; the stopped test cluster remains under `%TEMP%/vortix-history-pg-*`.

Explicit MSW demo mode preserves history loading/empty/error responses and recorded replay, including a promotion scenario whose plies now start at its saved initial position. It reports manual preview as unavailable rather than computing chess rules in the browser or falling through to a real backend. Arbitrary manual variations require real API mode.

No engine is required for this milestone. Engine play is delivered by the [engine gameplay milestone](Engine_Gameplay_Milestone.md); manual analysis still never calls the engine. Production deployment/other-browser validation remain separate work.

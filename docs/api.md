# HTTP API

Base path `/api`; paths below include it. [backend/openapi.json](../backend/openapi.json) is the checked-in machine-readable schema (paths there are relative to its server base). This guide supplements it with controller/schema/service behavior inspected on29 October2026. It does not introduce another versioned DTO contract. All61 concrete operations are listed below. Read the source validators when adding clients: some shared OpenAPI error lists are broader than the actual handler, and constraints omitted there still apply.

## Shared transport rules

**B** means `Authorization: Bearer <access token>` plus a live, unrevoked database session. Resource rules apply in addition. **C** means exact configured `Origin` and `X-Vortix-CSRF: 1`; cookie access if present is automatic in the browser. These cookie-auth POSTs do not require an access token. Username availability/health are unauthenticated. Protected domain routes use B, not cookie authorization; browser Axios still sends credentials/header.

JSON body limit 16 KiB, no-store responses, strict Zod objects where schemas are used. IDs are UUIDs unless otherwise stated. Revision is an integer1–2,147,483,647. Unknown schema fields fail400; routes with no body/query validator do not necessarily reject extras. Millisecond durations are numbers. Timestamps are ISO strings except `serverTime`, `since` and leaderboard `asOf` (epoch milliseconds). Successful POST defaults201 unless overridden below. All endpoints also inherit the HTTP throttler.

Errors use `{code,message,fieldErrors?}`, where fieldErrors maps field names to message arrays. Command errors may add `retryable` and `game`; engine admission may add `gameId`. Generic malformed JSON400, oversized body413, throttling429, unexpected500 are normalized. 401 means absent/expired/revoked access. Private resources often hide existence with 404; a wrong-account invitation explicitly uses403. Do not expose passwords/token/cookie values in logs or URLs.

Sanitized illustrative error:

```json
{"code":"room_revision_conflict","message":"The room changed. Review the latest settings and try again."}
```

## Authentication and session

Validators: [auth.schemas.ts](../backend/src/modules/auth/auth.schemas.ts). Controllers: [auth](../backend/src/modules/auth/auth.controller.ts), [session](../backend/src/modules/auth/session.controller.ts).

| Method/path | Auth and request | Success | Specific failures / repeat behavior |
| --- | --- | --- | --- |
| POST `/api/auth/sign-up` | C; `{username,email,password,confirmPassword,acceptTerms:true}` | 201 AuthResponse + refresh cookie | 400 input/confirmation/terms;409 identity_taken; not an idempotent create |
| POST `/api/auth/sign-in` | C; `{email,password,remember?:boolean=false}` | 200 AuthResponse + cookie | 401 invalid_credentials; new independent session each success |
| POST `/api/auth/refresh` | C; refresh cookie; no body fields consumed | 200 AuthResponse + rotated cookie | 401 unusable/replayed cookie, clears cookie; consumed replay revokes family |
| GET `/api/session` | B; no query consumed | 200 `{user}` | 401 dead session |
| POST `/api/session/sign-out` | C; refresh cookie if present | 204 no body, clears cookie | idempotent even without token; DB failure does not falsely report success |
| GET `/api/auth/username-availability` | public; strict `username` query | 200 `{username,available,tag:null}` | 400 invalid username/query; advisory only |
| POST `/api/auth/forgot-password` | C; `{email}` | 202 `{message}` generic | no account enumeration in message; in-process issuance may fail after acknowledgement |
| POST `/api/auth/reset-password/status` | C; `{token:string<=256}` in body | 200 `{valid:false}` or `{valid:true,expiresAt}` | malformed/unknown/replaced/used/expired token returns false; does not consume |
| POST `/api/auth/reset-password` | C; `{token,password,confirmPassword}` | 200 `{message}`, clears cookie, no new session | 400 reset_link_invalid or validation; one successful consumption, all sessions revoked |

Username trimmed3–20 ASCII alphanumeric/underscore; email trimmed/lowercased, valid format/max 254; new password8–128 with exact confirmation, no trimming; login accepts nonempty up to128. Reset token credentials are43 base64url characters; validators allow strings up to256 so the service can fail malformed tokens identically. Real user view: `id,username,email,avatarUrl:null,createdAt,updatedAt`. AuthResponse adds `accessToken,expiresIn` (seconds). Refresh secrets never appear in JSON. No email verification, Google or OTP API exists.

Safe shape illustration (angle-bracket values are placeholders, not usable credentials):

```json
{"user":{"id":"00000000-0000-4000-8000-000000000001","username":"ExamplePlayer","email":"player@example.invalid","avatarUrl":null,"createdAt":"2026-10-29T00:00:00.000Z","updatedAt":"2026-10-29T00:00:00.000Z"},"accessToken":"<access-token>","expiresIn":300}
```

## Health

| Method/path | Auth/input | 200 | Failure |
| --- | --- | --- | --- |
| GET `/api/health` | public; none | `{status:"ok",region:"local"}` | Does not query DB or engine |
| GET `/api/health/live` | public; none | `{status:"ok"}` | Process response only |
| GET `/api/health/ready` | public; none | `{status:"ok",database:"connected"}` | 503 if SELECT 1 fails |

## Rooms

[RoomsController](../backend/src/modules/rooms/rooms.controller.ts), [schemas](../backend/src/modules/rooms/rooms.schemas.ts), [RoomView](../backend/src/modules/rooms/room-view.ts). B on all routes.

| Method/path | Authority and input | Success | Failures / semantics |
| --- | --- | --- | --- |
| GET `/api/rooms/options` | any account | 200 `{timeControls,defaultTimeControlId,colorPreferences,roomTtlMinutes,invitationTtlMinutes}` | Options do not reserve a room |
| POST `/api/rooms` | any account; `{timeControl:{initialMs,incrementMs},colorPreference?:"white"\|"black"\|"random"}` | 201 `{room:RoomView}` | 400 unsupported preset;409 too_many_active_rooms |
| GET `/api/rooms/{roomId}` | current host/challenger | 200 `{room}` | 404 room_not_found also outsiders; due expiry persisted |
| PATCH `/api/rooms/{roomId}/settings` | host; `{expectedRevision,timeControl?,colorPreference?}` at least one change | 200 `{room}` | 403 not_room_host;409 room_revision_conflict/room_started/room_cancelled/room_expired; material change resets readiness |
| POST `/api/rooms/{roomId}/ready` | seated player; `{expectedRevision,ready:boolean}` | 200 `{room}` | 409 room_not_full/stale/closed; no-op value requires current revision |
| POST `/api/rooms/{roomId}/start` | host; `{expectedRevision}` | 200 `{room}` containing gameId | 409 room_not_ready/stale/active_game_conflict/matchmaking_active/interaction_unavailable; repeated started host call returns room |
| POST `/api/rooms/{roomId}/cancel` | host; no body consumed | 200 `{room}` | repeated cancelled room harmless; other terminal states conflict |
| POST `/api/rooms/{roomId}/leave` | challenger; no body consumed | 204 | 403 not_room_challenger; clears seat/readiness; after leaving actor no longer has room access |

Time controls must exactly match [time-controls.ts](../backend/src/modules/rooms/time-controls.ts):1+0,2+1,3+0,3+2,5+0,5+3,10+0,10+5,15+10,30+0,30+20. Values are integer milliseconds, default color random. RoomView includes `id,revision,status,settings:{timeControl,colorPreference},seats:{host,challenger},gameId,expiresAt,closedAt,createdAt,updatedAt,viewer`. Seat has public `player`, ready/online, color or null before random assignment. Viewer provides role and canEditSettings/canInvite/canCancel/canLeave/canSetReady/canStart; these are advisory UI permissions rechecked by services. Status waiting/ready/started/cancelled/expired. No public room list/join route.

Illustrative room creation body:

```json
{"timeControl":{"initialMs":600000,"incrementMs":0},"colorPreference":"random"}
```

## Invitations and notifications

[Invitation schemas](../backend/src/modules/invitations/invitations.schemas.ts), [views](../backend/src/modules/invitations/invitation-view.ts), [NotificationsController](../backend/src/modules/notifications/notifications.controller.ts). B throughout.

| Method/path | Authority/input | Success | Failures / semantics |
| --- | --- | --- | --- |
| POST `/api/rooms/{roomId}/invitations` | room host, empty seat; `{recipient:string}` | 201 `{invitation}` | 400 self_invitation;404 account_not_found;409 invitation_pending/room_full/closed/interaction_unavailable |
| GET `/api/rooms/{roomId}/invitations` | host | 200 `{items:InvitationView[]}` | newest50, no cursor;403 nonhost;404 outsider |
| GET `/api/invitations` | own sent/received; `role=received\|sent` default received; `status=pending\|all` default pending; cursor; limit 1–50 default 20 | 200 `{items,nextCursor}` | 400 invalid_cursor/input; due expiry applied |
| GET `/api/invitations/{invitationId}` | sender/recipient | 200 `{invitation}` | 403 invitation_wrong_account;404 not found |
| POST `/api/invitations/{invitationId}/accept` | intended recipient, no body | 200 `{invitation}` | row-locked seat claim;409 full/expired/closed/terminal/interaction_unavailable; repeats ACCEPTED harmless |
| POST `/api/invitations/{invitationId}/decline` | intended recipient, no body | 200 `{invitation}` | repeats DECLINED harmless; conflicting terminal state409 |
| POST `/api/invitations/{invitationId}/cancel` | sender, no body | 200 `{invitation}` | repeats CANCELLED harmless; conflicting terminal state409 |
| GET `/api/notifications` | own inbox;cursor;limit 1–50 default 20 | 200 `{items,nextCursor,unreadCount}` | bounded newest-first keyset; input400 |
| GET `/api/notifications/unread-count` | own account | 200 `{unreadCount:number}` | no read mutation |
| POST `/api/notifications/{notificationId}/read` | owner;no body | 200 `{notification,unreadCount}` | 404 notification_not_found for missing/outsider; repeat harmless |
| POST `/api/notifications/read-all` | owner;no body | 200 `{unreadCount}` | idempotent for already-read rows; concurrent arrivals can affect fresh count |

Recipient trimmed/max 254, `@` selects normalized valid email; otherwise username rules. Only registered accounts resolve. InvitationView has id/status/addressedBy/createdAt/expiresAt/respondedAt/sender/recipient/room/viewer. Sender/recipient are `{id,username,avatarUrl:null}`; never email. Room summary includes settings/host/seatOpen/expiry and availability open/full/closed/joined. Viewer role and canAccept/canDecline/canCancel govern UI. Terminal status is separate from room availability.

NotificationView has id/type/createdAt/readAt/actor/invitation/roomId/friendRequest. Types: invitation.received/accepted/declined, friend.request.received/accepted. Embedded invitation is its current effective view; friendRequest `{id,state}` uses uppercase request states. Marking read never answers an invitation. Old records are retained after block; new realtime presentation is filtered. Empty inbox example:

```json
{"items":[],"nextCursor":null,"unreadCount":0}
```

## Games and engine creation

[Games schemas](../backend/src/modules/games/games.schemas.ts), [GameSnapshotView / GameLiveView](../backend/src/modules/games/game-view.ts). B required; game reads/writes/manual preview are participant-only, outsiders404.

| Method/path | Input | Success | Failures / semantics |
| --- | --- | --- | --- |
| GET `/api/games` | side=w or b; result=win,loss,draw; cursor; limit 1–50 default 20 | 200 `{items,nextCursor}` | own finished games only, endedAt/id desc |
| GET `/api/games/recent` | identical history schema | 200 same history shape | no separate limit policy; caller chooses limit |
| GET `/api/games/{gameId}` | UUID | 200 `{game:GameSnapshotView}` |404 game_not_found;503 load/integrity failure |
| POST `/api/games/{gameId}/moves` | `{requestId,expectedRevision,from,to,promotion?}` | 200 `{game:GameLiveView,duplicate}` |409 stale_revision/not_your_turn/request_id_reused/game_finished;422 illegal_move/promotion_required/promotion_not_allowed;503 retryable persistence failure |
| POST `/api/games/{gameId}/resign` | `{requestId}` | 200 same command shape | winner opposite actor; deduped; finished conflict |
| POST `/api/games/{gameId}/draw-offer` | `{requestId}` | 200 same |409 draw_offers_unavailable/draw_offer_pending/draw_offer_cooldown |
| POST `/api/games/{gameId}/draw-offer/response` | `{requestId,response:"accept"\|"decline"}` | 200 same |409 no_draw_offer/engine restriction; accept finalizes draw |
| POST `/api/games/{gameId}/analysis/preview` | `{basePly:int0–20000,path:UCI[]}` max 128 entries | 200 `{basePly,moves,fen,turn,legalMoves,checkSquare}` |409 analysis_requires_finished_game;400 invalid_base_ply/schema;422 illegal_analysis_move;503 game_integrity_error |
| GET `/api/engine-games/status` | any signed-in account | 200 `{available,configured,engine:string\|null}` | health failure produces unavailable view, not reservation; no direct browser upstream call |
| POST `/api/engine-games` | same body as room creation | 201 `{game:GameSnapshotView}` |503 engine_not_configured/engine_unavailable/engine_capacity_reached;409 engine_game_active (adds gameId), active_game_conflict/matchmaking_active |

Request IDs are UUIDs; move squares regex `^[a-h][1-8]$`, promotion q/r/b/n. UCI preview path regex `^[a-h][1-8][a-h][1-8][qrbn]?$`. HTTP commands share the socket pipeline/ledger, but their receipt timestamp is after HTTP authentication. The normal UI writes over Socket.IO. Same command ID/content dedupes; changed intent with reused ID409. Retry only identical intent when outcome is uncertain. Acknowledgement success proves commit; a network timeout alone does not prove failure.

Full snapshot fields: `id,revision,ply,fen,initialFen,roomId,mode,timeControl,players,moves,startedAt,pgn,rating,status,clocks,lastMove,checkSquare,drawOffer,viewer,legalMoves,endedAt,engineTurn`. Status is `{phase:"in-progress",turn:"w"|"b"}` or `{phase:"finished",result:{outcome:"white"|"black"|"draw"|"aborted",reason}}`. Clocks contain remainingMs.w/b, runningSide/null, serverTime. Move entries contain SAN/UCI/from/to/promotion/captured/FEN/clock/elapsed/playedAt and own-only requestId. Compact live state omits accumulated history/settings/players/PGN and has `move` for the new accepted move. Consult canonical types/OpenAPI for exact nested DTOs.

History entries include id/startedAt/endedAt/side/mode/timeControl/result/viewer/opponent/rated/ratingPool/ratingPolicyVersion/ratingChange. All includes aborted; result filter only win/loss/draw. Engine seat userId is not a fake account; public engine profile identifies kind engine. Preview moves return `{uci,san,fen,from,to,ply}` and do not persist. No PGN import, branch save, spectating, result-write or engine-evaluation API exists.

## Matchmaking

[MatchmakingController](../backend/src/modules/matchmaking/matchmaking.controller.ts), [schemas](../backend/src/modules/matchmaking/matchmaking.schemas.ts). B; actor is always current account.

| Method/path | Input | Success | Errors / repeat behavior |
| --- | --- | --- | --- |
| GET `/api/matchmaking/options` | no query schema | 200 enabled/ratingsEnabled/policyVersion/ratingWindows/timeControls/defaultTimeControlId/searchTtlMs/arrivalTtlMs | flags returned rather than failing options read |
| GET `/api/matchmaking` | no query schema | 200 MatchmakingStatus | recovery still works while feature disabled; can perform expiry/pair maintenance |
| POST `/api/matchmaking/join` | `{timeControl:{initialMs,incrementMs},rated?:boolean=false}` | 200 MatchmakingStatus |503 matchmaking_disabled/ratings_disabled;400 unrated_time_control;409 active_game_conflict/search_already_active; matching active same search returns current |
| POST `/api/matchmaking/cancel` | `{searchId:uuid}` | 200 MatchmakingStatus | old/terminal/nonown ID no-op; cancel cannot undo committed assignment |
| POST `/api/matchmaking/ready` | `{searchId:uuid}` | 200 MatchmakingStatus |503 disabled; stale/nonconfirming no-op; both ready creates one game |

MatchmakingStatus is a direct object, **not** `{matchmaking}` HTTP wrapper: `revision,state,rated,ratingPool,searchId,timeControl,queuedAt,expiresAt,ready,gameId,reason,serverTime`. States idle/searching/confirming/matched. Reasons include cancelled/opponent_cancelled/search_expired/arrival_expired/opponent_unavailable/game_finished. searchId guards a search generation; revision is per account across searches. Search300000 ms, confirmation30000 ms. Exact matching/persistence rules: [backend](backend.md#matchmaking).

## Ratings and leaderboards

[Ratings schemas](../backend/src/modules/ratings/ratings.schemas.ts). All B and `RATINGS_ENABLED`; flag false503 ratings_disabled. No writable player-facing rating endpoint.

| Method/path | Parameters | 200 shape |
| --- | --- | --- |
| GET `/api/ratings/me` | strict empty query | `{policyVersion,items:RatingProfile[]}` for all three pools |
| GET `/api/ratings/me/history` | optional pool bullet/blitz/rapid;cursor;limit 1–100 default 25 | `{items,nextCursor}`; item gameId/pool/before/delta/after/score/createdAt/opponent/policyVersion |
| GET `/api/leaderboard` | required pool;page1–1000000 default 1;limit 1–100 default 25 | `{pool,page,limit,total,asOf,items}`; items rating/games/WDL/rank/user |
| GET `/api/leaderboard/me` | required pool only | profile fields + `{asOf,status:"ranked"\|"provisional"\|"ineligible",rank:number\|null}` |

RatingProfile: pool/rating/peakRating/games/wins/draws/losses/revision/provisional/placementsRemaining. Missing rows read as1200/zero games. Pagination400 for invalid/unknown fields. Ranks are global competition rank before pagination; ties ordered userId. Page/offset is not a snapshot spanning multiple requests; concurrent settlements can move rows between pages. Private history uses createdAt/gameId desc. [Elo and placement](backend.md#ratings).

## Social and player discovery

[Social schemas](../backend/src/modules/social/social.schemas.ts), [SocialController](../backend/src/modules/social/social.controller.ts), [UsersSearchController](../backend/src/modules/users/users-search.ts). B throughout. All list responses `{revision,items,nextCursor}`. Shared list query: limit 1–50 default 20, cursor max 160, optional search trimmed/max 20 ASCII username characters, default empty. Discovery requires search length2–20. Filtering is normalized username **prefix**, not substring; self and blocked pairs excluded from discovery. No email or arbitrary-presence search.

| Method/path | Authority/input | 200 shape / behavior |
| --- | --- | --- |
| GET `/api/users/search` | required username-prefix search; shared pagination | public player profiles + relationship `{state,requestId}` |
| GET `/api/social/friends` | own accepted friends;shared query | profiles + presence `{status:"ONLINE"\|"OFFLINE"}` |
| GET `/api/social/requests` | required direction incoming/outgoing;shared query | pending request views only |
| POST `/api/social/requests` | `{userId:uuid}` another eligible account | `{revision,relationship}`; repeated/opposite/already-friends returns current relationship |
| POST `/api/social/requests/{id}/accept` | recipient;no body consumed | `{revision,relationship,request}`; terminal immutable, repeat does not recreate removed friendship |
| POST `/api/social/requests/{id}/decline` | recipient;no body | same response envelope |
| POST `/api/social/requests/{id}/cancel` | sender;no body | same response envelope |
| DELETE `/api/social/friends/{id}` | other user's ID, not Friendship ID | `{revision,relationship}`; idempotent removal |
| GET `/api/social/blocks` | own directional blocks;shared query | blocked public profiles + block createdAt; no presence |
| POST `/api/social/blocks` | `{userId}` another existing user | `{revision,relationship}`; cancels pending interactions/removes friendship; repeated block no-op |
| DELETE `/api/social/blocks/{id}` | blocked user's ID | `{revision,relationship}`; own directional unblock only; no friendship restoration |

Relationship state none/incoming/outgoing/friends/unavailable; requestId is null when irrelevant. Request view fields are defined by [social-view.ts](../backend/src/modules/social/social-view.ts). Wrong actors403 friend_request_forbidden, missing/private requests404 friend_request_not_found, self400 self_interaction, blocked/unknown target409 interaction_unavailable without block direction, invalid query/cursor400. New sends additionally429 friend_request_rate_limit / friend_request_cooldown; default 30/hour and300-sec pair cooldown, persisted checks serialized in DB. Block does not prohibit already committed games or public rankings.

## Pagination, idempotency and rate limits

Cursor endpoints use opaque base64url serialized timestamp/ID from [cursor.ts](../backend/src/common/pagination/cursor.ts). Treat the string as opaque; reuse the same filter/direction and pass nextCursor until null. Invitations/inbox/social use createdAt/id descending; game history endedAt/id; rating history createdAt/gameId. Most cursor strings max 200, social160. Page sizes are enforced as above; take limit+1 determines next cursor. No totals unless explicitly returned. Mutating underlying records can change later list reads; cursors are not immutable snapshot tokens.

Global HTTP limit 120/minute/IP, with these controller overrides (all windows60000 ms):

| Endpoint | Limit/minute |
| --- | --- |
| signup, forgot-password | 5 |
| signin, reset-password | 10 |
| reset status, room create, invitation create | 20 |
| username availability, signout, users search | 30 |
| refresh | 60 |

Limits are process-memory and IP-based; social/password issuance add independent database-backed account/pair limits. No universal Idempotency-Key header exists. Games use requestId/fingerprint; queue uses searchId/current row; invitations/rooms/social implement explicit transition/no-op rules; outbox/inbox use unique dedupe keys. Do not blindly retry signup/room creation after uncertain network outcome.

## OpenAPI reconciliation notes

This audit compared every concrete controller route, expanding the social action enum, against all61 OpenAPI operations and resolved local `$ref`s. OpenAPI is a static file; no Swagger generation/served UI endpoint is configured. Its shared response lists sometimes describe errors a handler does not generate (for example503 on health/live and disabled matchmaking status). Empty-query strictness shown for some matchmaking reads is not implemented because those methods consume no Query schema. Domain Zod schemas are strict even where OpenAPI omits `additionalProperties:false` or revision bounds; room update also requires at least one material settings field. Social action responses add `request`, while the shared SocialOutcome schema is less specific. These are schema precision gaps, recorded here without changing runtime or fabricating endpoints.

Use the validators, controller status decorators and view functions linked above to interpret these gaps. Chat/conversations/season mock handler paths are deliberately absent from this API inventory because no live controller implements them. [Realtime](realtime.md) has separate message/ack contracts.

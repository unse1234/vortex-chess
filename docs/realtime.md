# Realtime contract

Implemented by [RealtimeGateway](../backend/src/modules/realtime/realtime.gateway.ts), [GamesGateway](../backend/src/modules/games/games.gateway.ts), [adapter](../backend/src/modules/realtime/realtime-io.adapter.ts), [publisher](../backend/src/modules/realtime/realtime-publisher.service.ts) and the [browser client](../frontend/src/lib/realtime/socket-realtime-client.ts). This is Socket.IO, not a raw-WebSocket JSON protocol. HTTP remains available for snapshots, history and non-game mutations.

## Connection and authorization

Socket.IO shares the backend HTTP server at `/api/socket.io`. Handshake `auth: { token: accessToken }` uses the in-memory access JWT. The server authenticates JWT and database session and records userId/sessionId/channels/verifiedAt in socket data. Browser Origin must be in CORS_ORIGINS; missing Origin is allowed for nonbrowser clients. Cookies do not authorize sockets. Size limit 16,000 bytes, heartbeat20-second interval/timeout. Default maximum 10 sockets/user; rejected connections receive `connection.rejected` then disconnect. Resource channel limit 20/socket.

Every socket automatically joins internal `user:{userId}`. Clients listen under logical channel `user`; they cannot subscribe to someone else's personal room. `channel.join` resolves only registered `room:{uuid}` / `game:{uuid}` and checks participant access through domain authorizers. Unknown/private subscriptions fail. Room host/challenger and game human participants alone can subscribe. Invitation recipients not yet seated use authorized HTTP/personal updates. No global social/presence/rating/spectator channel exists.

Immediate same-process session revocations disconnect a family. A default 60-second database session sweep catches expiry/outside revocation. Game commands recheck session at most every 5 seconds. Established sockets are not disconnected merely because their original short JWT expires; database session lifetime and rechecks govern them. Reconnect requires a valid JWT; the browser renews through auth on rejection/server close (bounded failures) and stops if identity ended. Arbitrary channel commands do not themselves recheck session on every call; the periodic check bounds their stale-session window.

## Client commands and acknowledgements

| Socket message | Body | Ack / authority |
| --- | --- | --- |
| `channel.join` | `{channel:"room:<uuid>"}` or game channel | `{ok:true}` after authorized join/sync send, or `{ok:false,error:{code,message}}`; errors invalid_request/not_found/forbidden/too_many_channels/disconnected/server_error |
| `channel.leave` | `{channel}` | `{ok:true}`; repeated/unknown membership is harmless |
| `game.move` | `{gameId,requestId,expectedRevision,from,to,promotion?}` | GameCommandAck; revision positive integer, squares a1–h8, promotion q/r/b/n, UUID IDs |
| `game.resign` | `{gameId,requestId}` | GameCommandAck |
| `game.draw.offer` | `{gameId,requestId}` | GameCommandAck; human games only |
| `game.draw.respond` | `{gameId,requestId,response:"accept"\|"decline"}` | GameCommandAck; pending opponent offer only |

Actor always comes from authenticated socket identity, never payload. Strict schemas reject extra fields. Commands run through the same `GameCommandsService` as [HTTP fallback](api.md). Receipt time is captured before socket validation/session checking for clocks/metrics. Game ack:

```typescript
type GameCommandAck =
  | { ok: true; duplicate: boolean; game: GameLiveView }
  | { ok: false; error: { code: string; message: string; retryable: boolean };
      game: GameLiveView | null };
```

`GameLiveView` is the compact authoritative shape in [game-view.ts](../backend/src/modules/games/game-view.ts), including id/revision/ply/FEN, status, clocks, viewer permissions/legal targets, draw/rating/result data and optional newly accepted `move`. Failures can include known current state. Ack success is issued only after persistence. Same `(game,actor,requestId)` with identical fingerprint returns duplicate success/current state; reusing it for different intent returns `request_id_reused`. Engine applications have internal deterministic turn identifiers, not a public engine command.

The browser never buffers a disconnected write. Default ack timeout 5 sec means **uncertain**, not rejected. `useGameCommands` retries identical intent/ID while synchronized, up to five attempts with 1.2-second delay. Rejected commands show safe error text. Socket gateways skip Nest HTTP throttling; payload, subscription and socket bounds are present, but no per-command socket rate limiter is implemented.

## Server event envelope

All domain events use Socket.IO event name `event` with:

```json
{"channel":"room:00000000-0000-4000-8000-000000000001","type":"room.updated","payload":{"room":{}}}
```

The empty room above illustrates the envelope only; complete shapes are the corresponding view/types below. Events are viewer-specific where permissions/request IDs differ.

| Logical channel | `type` | Payload / interpretation |
| --- | --- | --- |
| `user` | `connection.rejected` | `{code:"too_many_connections"}` before disconnect |
| `user` | `session.ended` | `{}` before server disconnect of a revoked/expired session family; browser recovery is driven by disconnect/auth renewal |
| resource channel | `channel.closed` | `{code:"forbidden"}` when viewer-specific publication finds lost access; server removes socket membership |
| room | `room.updated` | `{room:RoomView}` complete revisioned viewer-specific room; includes gameId once started |
| room | `room.presence` | `{roomId,userId,online}`; no revision change |
| game | `game.snapshot` | `{game:GameSnapshotView}` complete initial state/moves/PGN, viewer permissions, presence/engine progress |
| game | `game.updated` | `GameLiveView` directly, not `{game}`; newly accepted move only, no accumulated history |
| game | `game.presence` | `{id:gameId,userId,online}`; no game revision change |
| game | `game.engine` | `{id:gameId,revision,engineTurn}`; null or `{revision,color,phase,attempt,since}`; queued/thinking/retrying; no official revision increment |
| `user` | `invitation.updated` | `{invitation:InvitationView}` for sender/recipient, after committed transition; no invitation revision field |
| `user` | `notification.created` | `{notification:NotificationView,unreadCount}`; stable ID, durable inbox recovery |
| `user` | `notification.read` | `{ids:string[],all:boolean,unreadCount}`; applied to owner's tabs |
| `user` | `matchmaking.status`, `matchmaking.found` | `{matchmaking:MatchmakingStatus}`; found means committed matched assignment with gameId; revision/searchId guard |
| `user` | `ratings.updated` | `{gameId,pool}`; invalidation, browser refetches own profiles/history/placement; no event revision |
| `user` | `social.updated` | `{eventId:"social:<userId>:<revision>",revision}`; personal invalidation only |
| `user` | `social.presence` | `{}`; friends refetch authorized snapshots; no subject identity/status leaked in delayed event |

Types live in backend `room-view.ts`, `invitation-view.ts`, `notification-view.ts`, `game-view.ts`, `matchmaking.service.ts` and frontend feature `types/`/`realtime/`. `channel.error` is synthesized by the browser adapter for rejected/timed-out joins; `channel.closed` is a server signal when publication detects lost access. Neither is a durable event feed. There are no implemented chat, media/voice, typing or spectating server events.

Notification payload `notification.type` has separate discriminants: `invitation.received`, `invitation.accepted`, `invitation.declined`, `friend.request.received` and `friend.request.accepted`. These are inbox entry types carried inside `notification.created`, not additional Socket.IO event names.

## Ordering, deduplication and recovery

Resource authorizers produce a sync view before joining; the gateway joins then emits that view. That closes the post-join delivery window but cannot make snapshot capture plus join atomic. A change between capture and joining can be missed. A newer event can also arrive before its older sync snapshot. Revisions discard older state; a later revision gap/reconnect/HTTP recovery repairs observed gaps. There is no formal durable cursor/resume token guaranteeing catch-up of an otherwise unobserved last update. Do not describe this as exactly-once or guaranteed gap-free delivery.

Socket.IO preserves emission order on one connection; application publications from concurrent operations/presence/HTTP may arrive in different orders. Engine phase publication is chained per game and checked against revision/phase time. Game next-revision updates append accepted moves; duplicates/old/different-game payloads are ignored. Gaps suspend commands and refetch until highest-seen revision is reached. Full snapshots fill missing final PGN. Live review has its own cursor and remains independent.

The adapter joins a resource when its first local handler subscribes, leaves after the final unsubscribe and rejoins after reconnect. Each join provides fresh state. Personal reconnect invalidates inbox/invites/social; matchmaking status polls every 2 sec non-idle/10 sec idle, ready retries3 sec; social friends/requests15 sec; ratings/placement30 sec. No-transport game fallback polls 5 sec and is read-only. A temporarily reconnecting transport relies on reconnect/resync rather than pretending writes succeeded.

Notification IDs/dedupe keys prevent durable duplicates. Presentation claims are separate from delivery/read state: per-tab set plus a bounded localStorage claim history/Web Locks best effort; no universal cross-device toast guarantee. Reading inbox never changes an invitation response. Presence is ephemeral and default 3-second last-socket grace avoids flicker; restart loses its prior online map.

Post-commit emits can be lost if a process dies after COMMIT. Durable records remain recoverable through reads. There is no Redis adapter, broker, durable event outbox, distributed presence or game-owner routing. Matchmaking's database relay supports local sockets across its worker tests, but full application hosting still requires one backend process. See [operations](operations.md).

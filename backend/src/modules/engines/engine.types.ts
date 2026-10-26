/**
 * Application-facing engine boundary. Games ask for one move in a position;
 * how the request travels (HTTP/JSON to the engine service, which speaks UCI
 * internally) stays inside this module. Nothing here knows about games,
 * clocks or persistence.
 */

/** Exactly one search limit per request until combined limits are confirmed upstream. */
export type SearchLimit =
  | { kind: 'movetime'; ms: number }
  | { kind: 'depth'; plies: number }
  | { kind: 'nodes'; count: number };

export type SearchRequest = {
  /** Six-field FEN of the authoritative position. */
  fen: string;
  limit: SearchLimit;
};

export type SearchScore = { type: 'cp' | 'mate'; value: number };

/**
 * A validated engine reply. `bestMove` is the only field that may become a
 * game move; `ponder` and `pv` are informational and never applied.
 */
export type SearchResult = {
  /** UCI coordinate move such as e2e4 or e7e8q; null when the engine reports no move. */
  bestMove: string | null;
  ponder: string | null;
  score: SearchScore | null;
  depth: number;
  nodes: number;
  nps: number;
  /** Search time the engine reported. */
  engineTimeMs: number;
  pv: string[];
  /** Measured by us: request sent until the response body was parsed. */
  roundTripMs: number;
};

export type EngineHealth = {
  status: string;
  engine: string;
  ready: boolean;
  roundTripMs: number;
};

export type CallOptions = {
  /** Hard limit for this HTTP call; the request is aborted when it passes. */
  timeoutMs: number;
  signal?: AbortSignal;
};

/** One provider of engine moves. The HTTP adapter is the production implementation. */
export interface ChessEngineProvider {
  health(options: CallOptions): Promise<EngineHealth>;
  analyze(request: SearchRequest, options: CallOptions): Promise<SearchResult>;
}

export const CHESS_ENGINE_PROVIDER = Symbol('CHESS_ENGINE_PROVIDER');

/** UCI coordinate notation, including promotion suffixes. */
export const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** The upstream contract's accepted ranges. */
export const LIMIT_RANGES = {
  movetime: { min: 10, max: 30_000 },
  depth: { min: 1, max: 20 },
  nodes: { min: 1, max: 10_000_000 },
} as const;

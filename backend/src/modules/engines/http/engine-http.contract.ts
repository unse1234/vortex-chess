import { z } from 'zod';
import { UCI_MOVE } from '../engine.types';

/**
 * Runtime validation of the engine service's documented contract
 * (`/openapi.json`, version 0.1.0-phase6). Responses are untrusted input:
 * anything that does not match is a contract violation, never a move.
 */

const uciMove = z.string().regex(UCI_MOVE);
const count = z.number().int().min(0);

export const healthResponseSchema = z.object({
  status: z.string().max(100),
  engine: z.string().min(1).max(64),
  ready: z.boolean(),
});

export const analyzeResponseSchema = z.object({
  success: z.literal(true),
  bestmove: uciMove.nullable(),
  ponder: uciMove.nullable(),
  score: z
    .object({ type: z.enum(['cp', 'mate']), value: z.number().int() })
    .nullable(),
  depth: count,
  nodes: count,
  nps: count,
  time_ms: count,
  pv: z.array(uciMove).max(256),
  timed_out: z.boolean(),
});
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

/**
 * Error bodies. The documented shape is `{ success: false, error, detail }`;
 * the deployed service currently nests it in FastAPI's `{ detail: {...} }`.
 * Validation errors (422) use FastAPI's `{ detail: [...] }`. Error text is
 * only logged, truncated; it never reaches players.
 */
const errorBody = z.object({ error: z.string(), detail: z.string().nullable().optional() });
export function describeErrorBody(body: unknown): string {
  const direct = errorBody.safeParse(body);
  if (direct.success) return direct.data.error;
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    const nested = errorBody.safeParse((body as { detail: unknown }).detail);
    if (nested.success) return nested.data.error;
    if (Array.isArray((body as { detail: unknown }).detail)) return 'validation error';
  }
  return 'unrecognized error body';
}

/** Request body: one limit, with its documented range checked before sending. */
export type AnalyzeRequestBody = {
  fen: string;
  limits: { movetime: number } | { depth: number } | { nodes: number };
};

import type { Outcome, Termination } from './chess-rules';

export type PgnInput = {
  white: string;
  black: string;
  startedAt: Date;
  initialMs: number;
  incrementMs: number;
  initialFen: string;
  standardStart: boolean;
  sans: readonly string[];
  outcome: Outcome;
};

const TERMINATION_TEXT: Record<Termination, string> = {
  checkmate: 'checkmate',
  resignation: 'resignation',
  timeout: 'time forfeit',
  'timeout-vs-insufficient-material': 'time forfeit; opponent cannot checkmate',
  stalemate: 'stalemate',
  'insufficient-material': 'insufficient material',
  'threefold-repetition': 'threefold repetition',
  'fifty-move-rule': 'fifty-move rule',
  agreement: 'agreement',
  'engine-failure': 'abandoned; engine service failure',
};

export function resultToken(outcome: Outcome) {
  // "*" is PGN's token for a game without a result.
  if (outcome.termination === 'engine-failure') return '*';
  if (!outcome.winner) return '1/2-1/2';
  return outcome.winner === 'w' ? '1-0' : '0-1';
}

const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/** Final PGN of a finished game, built from the durable SAN record. */
export function buildPgn(input: PgnInput) {
  const result = resultToken(input.outcome);
  const date = input.startedAt.toISOString().slice(0, 10).replace(/-/g, '.');
  const headers: [string, string][] = [
    ['Event', 'Vortex Chess casual game'],
    ['Site', 'Vortex Chess'],
    ['Date', date],
    ['Round', '-'],
    ['White', input.white],
    ['Black', input.black],
    ['Result', result],
    ['TimeControl', `${input.initialMs / 1000}+${input.incrementMs / 1000}`],
    ['Termination', TERMINATION_TEXT[input.outcome.termination]],
  ];
  if (!input.standardStart)
    headers.push(['SetUp', '1'], ['FEN', input.initialFen]);
  const tokens: string[] = [];
  input.sans.forEach((san, index) => {
    if (index % 2 === 0) tokens.push(`${index / 2 + 1}.`);
    tokens.push(san);
  });
  tokens.push(result);
  const lines: string[] = [];
  let line = '';
  for (const token of tokens) {
    if (line && line.length + token.length + 1 > 80) {
      lines.push(line);
      line = token;
    } else line = line ? `${line} ${token}` : token;
  }
  if (line) lines.push(line);
  return `${headers.map(([k, v]) => `[${k} "${escape(v)}"]`).join('\n')}\n\n${lines.join('\n')}\n`;
}

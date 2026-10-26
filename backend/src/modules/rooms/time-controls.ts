export type TimeControlCategory = 'bullet' | 'blitz' | 'rapid' | 'classical';
export type TimeControl = {
  category: TimeControlCategory;
  initialMs: number;
  incrementMs: number;
};

const minutes = (n: number) => n * 60_000;
const seconds = (n: number) => n * 1_000;

/** Supported room presets; requests must match one exactly. */
export const TIME_CONTROL_PRESETS: readonly (TimeControl & { id: string })[] = [
  { id: '1+0', category: 'bullet', initialMs: minutes(1), incrementMs: 0 },
  { id: '2+1', category: 'bullet', initialMs: minutes(2), incrementMs: seconds(1) },
  { id: '3+0', category: 'blitz', initialMs: minutes(3), incrementMs: 0 },
  { id: '3+2', category: 'blitz', initialMs: minutes(3), incrementMs: seconds(2) },
  { id: '5+0', category: 'blitz', initialMs: minutes(5), incrementMs: 0 },
  { id: '5+3', category: 'blitz', initialMs: minutes(5), incrementMs: seconds(3) },
  { id: '10+0', category: 'rapid', initialMs: minutes(10), incrementMs: 0 },
  { id: '10+5', category: 'rapid', initialMs: minutes(10), incrementMs: seconds(5) },
  { id: '15+10', category: 'rapid', initialMs: minutes(15), incrementMs: seconds(10) },
  { id: '30+0', category: 'classical', initialMs: minutes(30), incrementMs: 0 },
  { id: '30+20', category: 'classical', initialMs: minutes(30), incrementMs: seconds(20) },
];
export const DEFAULT_TIME_CONTROL_ID = '10+0';

export function findPreset(initialMs: number, incrementMs: number) {
  return TIME_CONTROL_PRESETS.find(
    (preset) =>
      preset.initialMs === initialMs && preset.incrementMs === incrementMs,
  );
}

export function timeControlOf(room: {
  initialMs: number;
  incrementMs: number;
}): TimeControl {
  const preset = findPreset(room.initialMs, room.incrementMs);
  // Every stored room matches a preset; the fallback keeps old rows readable.
  const category: TimeControlCategory =
    preset?.category ??
    (room.initialMs < minutes(3)
      ? 'bullet'
      : room.initialMs < minutes(10)
        ? 'blitz'
        : room.initialMs < minutes(30)
          ? 'rapid'
          : 'classical');
  return {
    category,
    initialMs: room.initialMs,
    incrementMs: room.incrementMs,
  };
}

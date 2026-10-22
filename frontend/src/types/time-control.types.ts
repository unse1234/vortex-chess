export type TimeControlCategory = "bullet" | "blitz" | "rapid" | "classical";

export type TimeControl = {
  category: TimeControlCategory;
  /** Starting time per side. */
  initialMs: number;
  /** Time added to the mover's clock after each move. */
  incrementMs: number;
};

import type { TimeControl } from "@/types/time-control.types";

/** Whether this server can start an engine game now. Readiness is not a reservation. */
export type EngineStatus = {
  available: boolean;
  /** False when the server has no engine service configured at all. */
  configured: boolean;
  /** Name the engine service reports, e.g. "lightweight-chess-engine". */
  engine: string | null;
};

/** The same settings contract as a room: a supported preset and a colour preference. */
export type CreateEngineGameRequest = {
  timeControl: Pick<TimeControl, "initialMs" | "incrementMs">;
  colorPreference: "white" | "black" | "random";
};

import { delay, HttpResponse } from "msw";

/**
 * Development scenarios, selected with the `mock` query parameter, e.g.
 * `/play?mock=empty`. Handlers run in the page, so they can read its URL.
 *
 * - default: populated account
 * - empty:   no friends, games or conversations
 * - error:   data endpoints fail with a 503
 * - slow:    long responses to review loading states
 * - draw-offer: the bot offers a draw a few seconds into the live game
 * - reconnect:  the realtime connection drops and recovers mid-game
 */
export type MockScenario = "default" | "empty" | "error" | "slow" | "draw-offer" | "reconnect";

const scenarios: readonly MockScenario[] = ["default", "empty", "error", "slow", "draw-offer", "reconnect"];

export function getMockScenario(): MockScenario {
  const requested = new URLSearchParams(window.location.search).get("mock");
  return scenarios.find((scenario) => scenario === requested) ?? "default";
}

/** Applies the scenario's network timing and returns a failure response when it calls for one. */
export async function simulateNetwork(): Promise<Response | null> {
  const scenario = getMockScenario();
  await delay(scenario === "slow" ? 2_500 : "real");

  if (scenario === "error") {
    return HttpResponse.json(
      {
        code: "service_unavailable",
        message: "The mock server is simulating an outage. Remove ?mock=error to recover.",
      },
      { status: 503 },
    );
  }
  return null;
}

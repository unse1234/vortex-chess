import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { toApiError } from "@/lib/http/api-error";

function axiosError(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("failed", "ERR_BAD_RESPONSE", config, null, { status, statusText: "", headers: {}, config, data });
}

describe("toApiError", () => {
  it("keeps extra body fields, such as a conflicting game's id, as details", () => {
    const error = toApiError(axiosError(409, { code: "engine_game_active", message: "Already playing", retryable: false, gameId: "g-1" }));
    expect(error).toMatchObject({ code: "engine_game_active", status: 409, retryable: false, details: { gameId: "g-1" } });
  });

  it("uses the server's retryable flag when it sends one, and the status otherwise", () => {
    expect(toApiError(axiosError(503, { code: "engine_unavailable", message: "x", retryable: true })).retryable).toBe(true);
    expect(toApiError(axiosError(503, { code: "engine_not_configured", message: "x" })).retryable).toBe(true);
    expect(toApiError(axiosError(422, { code: "illegal_move", message: "x" })).retryable).toBe(false);
  });
});

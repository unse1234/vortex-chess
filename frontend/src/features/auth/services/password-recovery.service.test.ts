import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it } from "vitest";
import { isRouteAvailable, routes } from "@/config/routes";
import { features } from "@/config/capabilities";
import { httpClient } from "@/lib/http/browser-client";
import { ApiError } from "@/lib/http/api-error";
import {
  forgotPasswordSchema,
  readResetToken,
  resetPasswordSchema,
} from "@/features/auth/schemas/password-recovery.schema";
import {
  RESET_LINK_INVALID,
  getResetLinkStatus,
  requestPasswordReset,
  resetPassword,
} from "@/features/auth/services/password-recovery.service";

const token = "A".repeat(43);
const originalAdapter = httpClient.defaults.adapter;
const seen: InternalAxiosRequestConfig[] = [];

function respond(handler: (config: InternalAxiosRequestConfig) => { status: number; data: unknown }) {
  httpClient.defaults.adapter = async (config) => {
    seen.push(config);
    const { status, data } = handler(config);
    const response = { config, data, status, statusText: "", headers: new AxiosHeaders() };
    if (status >= 400) throw new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, undefined, response);
    return response;
  };
}

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
  seen.length = 0;
});

describe("Password recovery input", () => {
  it("reads only a well-formed token from the link fragment", () => {
    expect(readResetToken(`#token=${token}`)).toBe(token);
    expect(readResetToken(`token=${token}`)).toBe(token);
    for (const hash of ["", "#", "#token=", "#token=short", `#token=${token}x`, `#other=${token}`])
      expect(readResetToken(hash)).toBeNull();
  });

  it("validates email and the sign-up password policy with confirmation", () => {
    expect(forgotPasswordSchema.parse({ email: " player@example.com " }).email).toBe("player@example.com");
    expect(forgotPasswordSchema.safeParse({ email: "player" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: "long-enough", confirmPassword: "long-enough" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: "short", confirmPassword: "short" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: "long-enough", confirmPassword: "different!" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: "p".repeat(129), confirmPassword: "p".repeat(129) }).success).toBe(false);
  });

  it("is reachable whenever the real API is in use", () => {
    expect(features.passwordRecovery.available).toBe(true);
    expect(isRouteAvailable(routes.forgotPassword)).toBe(true);
    expect(isRouteAvailable(`${routes.resetPassword}#token=${token}`)).toBe(true);
  });
});

describe("Password recovery service", () => {
  it("sends unauthenticated requests and never puts the token in the URL", async () => {
    respond((config) =>
      config.url === "/auth/reset-password/status"
        ? { status: 200, data: { valid: true, expiresAt: "2026-10-28T12:00:00Z" } }
        : { status: 200, data: { message: "ok" } },
    );
    await requestPasswordReset({ email: "player@example.com" });
    await expect(getResetLinkStatus(token)).resolves.toMatchObject({ valid: true });
    await resetPassword({ token, password: "new-password", confirmPassword: "new-password" });
    expect(seen.map((c) => c.url)).toEqual([
      "/auth/forgot-password",
      "/auth/reset-password/status",
      "/auth/reset-password",
    ]);
    for (const config of seen) {
      expect(config.skipAuthentication).toBe(true);
      expect(config.headers.get("Authorization")).toBeFalsy();
      expect(String(config.url)).not.toContain(token);
      expect(config.params).toBeUndefined();
    }
  });

  it("surfaces failures as ApiError without request data and never as success", async () => {
    respond(() => ({ status: 400, data: { code: RESET_LINK_INVALID, message: "This reset link is invalid." } }));
    const error = await resetPassword({ token, password: "new-password", confirmPassword: "new-password" }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: RESET_LINK_INVALID, status: 400 });
    expect(JSON.stringify(error)).not.toContain(token);
    expect(JSON.stringify(error)).not.toContain("new-password");

    httpClient.defaults.adapter = async (config) => {
      throw new AxiosError("Network Error", "ERR_NETWORK", config);
    };
    await expect(requestPasswordReset({ email: "player@example.com" })).rejects.toMatchObject({
      code: "network_error",
      retryable: true,
    });
  });
});

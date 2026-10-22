import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { beforeEach, describe, expect, it } from "vitest";
import { httpClient } from "@/lib/http/browser-client";
import {
  endLocalSession,
  establishSession,
  getAccessToken,
  onSessionEvent,
  refreshSession,
} from "@/features/auth/services/auth-session.service";
import { signOut, getSession } from "@/features/auth/services/session.service";

const user = {
  id: "user-1",
  username: "Player",
  email: "player@example.com",
  avatarUrl: null,
  createdAt: "2026-10-22T00:00:00Z",
  updatedAt: "2026-10-22T00:00:00Z",
};
function response(
  config: InternalAxiosRequestConfig,
  data: unknown,
  status = 200,
): AxiosResponse {
  return {
    config,
    data,
    status,
    statusText: "OK",
    headers: new AxiosHeaders(),
  };
}
function failure(config: InternalAxiosRequestConfig, status = 401): never {
  throw new AxiosError(
    "Request failed",
    "ERR_BAD_RESPONSE",
    config,
    undefined,
    response(
      config,
      {
        code: status === 401 ? "unauthenticated" : "service_unavailable",
        message: "Request failed",
      },
      status,
    ),
  );
}
beforeEach(() => {
  endLocalSession();
});
describe("In-memory authentication transport", () => {
  it("coalesces concurrent refreshes and retries each failed request only once", async () => {
    let refreshes = 0;
    let protectedCalls = 0;
    httpClient.defaults.adapter = async (config) => {
      if (config.url === "/auth/sign-in")
        return response(config, {
          user,
          accessToken: "expired",
          expiresIn: 300,
        });
      if (config.url === "/auth/refresh") {
        refreshes++;
        await Promise.resolve();
        return response(config, { user, accessToken: "fresh", expiresIn: 300 });
      }
      protectedCalls++;
      if (config.headers.get("Authorization") !== "Bearer fresh")
        failure(config);
      return response(config, { user });
    };
    await establishSession("/auth/sign-in", {
      email: user.email,
      password: "password123",
    });
    const results = await Promise.all([
      httpClient.get("/protected-a"),
      httpClient.get("/protected-b"),
      httpClient.get("/protected-c"),
    ]);
    expect(results).toHaveLength(3);
    expect(refreshes).toBe(1);
    expect(protectedCalls).toBe(6);
    expect(getAccessToken()).toBe("fresh");
  });
  it("ends the local session if the retried request is also unauthorized", async () => {
    let refreshes = 0,
      attempts = 0,
      ended = 0;
    const stop = onSessionEvent(() => {
      ended++;
    });
    httpClient.defaults.adapter = async (config) => {
      if (config.url === "/auth/refresh") {
        refreshes++;
        return response(config, { user, accessToken: "fresh", expiresIn: 300 });
      }
      attempts++;
      failure(config);
    };
    await expect(httpClient.get("/protected")).rejects.toMatchObject({
      status: 401,
    });
    expect(refreshes).toBe(1);
    expect(attempts).toBe(2);
    expect(ended).toBe(1);
    expect(getAccessToken()).toBeNull();
    stop();
  });
  it("never refreshes a failed login or loops after refresh rejection", async () => {
    let calls = 0;
    httpClient.defaults.adapter = async (config) => {
      calls++;
      failure(config);
    };
    await expect(establishSession("/auth/sign-in", {})).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toBe(1);
    await expect(refreshSession()).rejects.toMatchObject({ status: 401 });
    expect(calls).toBe(2);
    expect(getAccessToken()).toBeNull();
  });
  it("restores the user after reload through refresh then the current-user endpoint", async () => {
    const paths: string[] = [];
    httpClient.defaults.adapter = async (config) => {
      paths.push(config.url!);
      return response(
        config,
        config.url === "/auth/refresh"
          ? { user, accessToken: "restored", expiresIn: 300 }
          : { user },
      );
    };
    expect(await getSession()).toEqual(user);
    expect(paths).toEqual(["/auth/refresh", "/session"]);
  });
  it("surfaces real refresh outages without replacing them with mock responses", async () => {
    const paths: string[] = [];
    httpClient.defaults.adapter = async (config) => {
      paths.push(config.url!);
      failure(config, 503);
    };
    await expect(getSession()).rejects.toMatchObject({
      status: 503,
      code: "service_unavailable",
    });
    expect(paths).toEqual(["/auth/refresh"]);
  });
  it("does not let an in-flight old response restore data after logout", async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    httpClient.defaults.adapter = async (config) => {
      if (config.url === "/session/sign-out")
        return response(config, undefined, 204);
      started();
      await waiting;
      return response(config, { user });
    };
    const pending = httpClient.get("/private");
    const rejected = expect(pending).rejects.toMatchObject({
      code: "ERR_CANCELED",
    });
    await ready;
    await signOut();
    finish();
    await rejected;
    expect(getAccessToken()).toBeNull();
  });
  it("discards refresh completion if logout changes the session generation", async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    httpClient.defaults.adapter = async (config) => {
      if (config.url === "/session/sign-out")
        return response(config, undefined, 204);
      started();
      await waiting;
      return response(config, { user, accessToken: "late", expiresIn: 300 });
    };
    const pending = refreshSession();
    const rejected = expect(pending).rejects.toMatchObject({
      code: "ERR_CANCELED",
    });
    await ready;
    await signOut();
    finish();
    await rejected;
    expect(getAccessToken()).toBeNull();
  });
});

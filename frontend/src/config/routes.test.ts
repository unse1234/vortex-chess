import { describe, expect, it } from "vitest";
import {
  deferredRoutes,
  isRouteAvailable,
  routeFeature,
  routes,
  toSafeInternalPath,
} from "@/config/routes";

describe("V1 navigation boundaries", () => {
  it("blocks existing deferred destinations including preset/deep-link queries", () => {
    for (const [path, feature] of Object.entries(deferredRoutes)) {
      expect(isRouteAvailable(path)).toBe(false);
      expect(isRouteAvailable(`${path}?mode=standard#section`)).toBe(false);
      expect(routeFeature(`${path}/?next=/play`)).toBe(feature);
    }
  });

  it("preserves authentication, private rooms, history, live games and replay destinations", () => {
    for (const path of [
      routes.signIn,
      routes.signUp,
      routes.play,
      routes.terms,
      routes.createRoom({ invite: ["player"] }),
      "/rooms/new?opponent=engine",
      routes.games,
      routes.game("vortex-demo"),
      routes.game("completed-game"),
    ]) {
      expect(isRouteAvailable(path)).toBe(true);
    }
    expect(isRouteAvailable("/unbuilt-feature")).toBe(false);
  });
  it("preserves supported return queries while rejecting external or malformed destinations", () => {
    expect(toSafeInternalPath("/rooms/new?invite=friend", routes.play)).toBe(
      "/rooms/new?invite=friend",
    );
    for (const path of [
      "https://evil.invalid",
      "//evil.invalid",
      "/\\evil.invalid",
      "/\t/evil.invalid",
      "/unknown",
      "/matchmaking",
    ]) {
      expect(toSafeInternalPath(path, routes.play)).toBe(routes.play);
    }
  });
});

import { describe, expect, it } from "vitest";
import { features } from "@/config/capabilities";
import {
  deferredRoutes,
  isRouteAvailable,
  routeFeature,
  routes,
  toSafeInternalPath,
} from "@/config/routes";

describe("V1 navigation boundaries", () => {
  it("enforces feature availability for existing destinations including preset/deep-link queries", () => {
    for (const [path, feature] of Object.entries(deferredRoutes)) {
      expect(isRouteAvailable(path)).toBe(features[feature].available);
      expect(isRouteAvailable(`${path}?mode=standard#section`)).toBe(features[feature].available);
      expect(routeFeature(`${path}/?next=/play`)).toBe(feature);
    }
  });

  it("preserves authentication, private rooms, history, live games and replay destinations", () => {
    for (const path of [
      routes.signIn,
      routes.signUp,
      routes.play,
      routes.matchmaking(),
      routes.terms,
      routes.createRoom({ invite: "player" }),
      routes.room("6f1c2d3e-0000-4000-8000-000000000000"),
      routes.invitation("6f1c2d3e-0000-4000-8000-000000000001"),
      "/rooms/new?opponent=engine",
      routes.games,
      routes.game("vortex-demo"),
      routes.game("completed-game"),
      routes.analysis("completed-game"),
    ]) {
      expect(isRouteAvailable(path)).toBe(true);
    }
    expect(isRouteAvailable("/unbuilt-feature")).toBe(false);
  });
  it("preserves supported return queries while rejecting external or malformed destinations", () => {
    expect(toSafeInternalPath("/rooms/new?invite=friend", routes.play)).toBe(
      "/rooms/new?invite=friend",
    );
    // Invitation links survive sign-in and sign-up.
    expect(toSafeInternalPath("/rooms/join/abc-123", routes.play)).toBe("/rooms/join/abc-123");
    expect(toSafeInternalPath(routes.analysis("completed-game"), routes.play)).toBe(routes.analysis("completed-game"));
    for (const path of [
      "https://evil.invalid",
      "//evil.invalid",
      "/\\evil.invalid",
      "/\t/evil.invalid",
      "/unknown",
    ]) {
      expect(toSafeInternalPath(path, routes.play)).toBe(routes.play);
    }
  });
});

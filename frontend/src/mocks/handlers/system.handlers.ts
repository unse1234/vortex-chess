import { delay, http, HttpResponse } from "msw";
import { apiPath } from "@/mocks/handlers/api-path";
import { getMockScenario } from "@/mocks/scenarios/network";

export const systemHandlers = [
  http.get(apiPath("/health"), async () => {
    const scenario = getMockScenario();
    // A short, slightly variable delay so the connection indicator has a realistic reading.
    await delay(scenario === "slow" ? 320 : 18 + Math.round(Math.random() * 30));
    if (scenario === "error") return new HttpResponse(null, { status: 503 });
    return HttpResponse.json({ status: "ok", region: "US-EAST-01" });
  }),
];

import { COMING_SOON } from "@/config/capabilities";
import { env } from "@/config/env";

/** Design labels must be truthful about the explicit demo/API boundary. */
export const authTelemetry = {
  footer: {
    node: "VORTIX CHESS // V1",
    transport: env.apiMocking ? "DEMO / MOCK SERVICES" : "API MODE",
    copyright: "Vortix Chess",
  },
  signIn: {
    leftTitle: "VORTIX CORE // V1",
    leftDetail: env.apiMocking ? "DEMO / MOCK SERVICES" : "API MODE",
    rightTitle: `SPECTATING // ${COMING_SOON}`,
    rightDetail: `ENGINE ANALYSIS // ${COMING_SOON}`,
    systemId: "EMAIL / PASSWORD",
    transport: env.apiMocking ? "MOCK SESSION" : "API SESSION",
    client: "VORTIX CHESS // V1",
    server: env.apiMocking ? "DEMO / MOCK SERVICES" : "API MODE",
    antiCheat: `ADVANCED ANTI-CHEAT: ${COMING_SOON}`,
  },
  signUp: {
    leftTitle: "VORTIX CORE // V1",
    leftDetails: [env.apiMocking ? "DEMO / MOCK SERVICES" : "API MODE", `ADVANCED TELEMETRY // ${COMING_SOON}`],
    rightTitle: "V1 ACCOUNT REGISTRATION",
    rightDetails: [`TOURNAMENTS // ${COMING_SOON}`, "EMAIL / PASSWORD"],
    engine: `ENGINE ANALYSIS // ${COMING_SOON}`,
    build: "VORTIX CLIENT // V1",
  },
} as const;

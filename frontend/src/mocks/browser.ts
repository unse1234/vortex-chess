import { setupWorker } from "msw/browser";
import { authHandlers } from "@/mocks/handlers/auth.handlers";
import { gameRoomHandlers } from "@/mocks/handlers/game-room.handlers";
import { gamesHandlers } from "@/mocks/handlers/games.handlers";
import { sessionHandlers } from "@/mocks/handlers/session.handlers";
import { socialHandlers } from "@/mocks/handlers/social.handlers";
import { systemHandlers } from "@/mocks/handlers/system.handlers";

const worker = setupWorker(
  ...authHandlers,
  ...sessionHandlers,
  ...gamesHandlers,
  ...gameRoomHandlers,
  ...socialHandlers,
  ...systemHandlers,
);

export async function startMockWorker() {
  await worker.start({
    quiet: true,
    // Framework assets and anything outside the mocked API go to the network.
    onUnhandledFrame: "bypass",
  });
}

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "mode" "GameMode" NOT NULL DEFAULT 'FRIENDS';

-- AlterTable
ALTER TABLE "GameParticipant" ADD COLUMN "kind" "ParticipantKind" NOT NULL DEFAULT 'PLAYER',
ADD COLUMN "engineName" VARCHAR(64),
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "GameMove" ALTER COLUMN "actorId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Game_mode_status_idx" ON "Game"("mode", "status");

-- Integrity rules Prisma cannot express.
-- A seat is either a registered account or the engine, never both; engines are not users.
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_identity" CHECK (
    ("kind" = 'PLAYER') = ("userId" IS NOT NULL)
    AND ("kind" = 'ENGINE') = ("engineName" IS NOT NULL)
);
-- Every move belongs to one of the game's two seats.
ALTER TABLE "GameMove" ADD CONSTRAINT "GameMove_gameId_color_fkey" FOREIGN KEY ("gameId", "color")
    REFERENCES "GameParticipant"("gameId", "color") ON DELETE CASCADE ON UPDATE CASCADE;
-- Each result matches its termination. An engine-service failure aborts the game without a winner or a draw.
ALTER TABLE "Game" DROP CONSTRAINT "Game_result_matches_termination";
ALTER TABLE "Game" ADD CONSTRAINT "Game_result_matches_termination" CHECK (
    "termination" IS NULL
    OR ("termination" IN ('CHECKMATE', 'RESIGNATION', 'TIMEOUT') AND "result" IN ('WHITE_WINS', 'BLACK_WINS'))
    OR ("termination" = 'ENGINE_FAILURE' AND "result" = 'ABORTED')
    OR ("termination" NOT IN ('CHECKMATE', 'RESIGNATION', 'TIMEOUT', 'ENGINE_FAILURE') AND "result" = 'DRAW')
);
ALTER TABLE "Game" ADD CONSTRAINT "Game_engine_failure_only_engine_mode" CHECK (
    "termination" IS DISTINCT FROM 'ENGINE_FAILURE' OR "mode" = 'ENGINE'
);
-- Engine games are created directly, not from a room.
ALTER TABLE "Game" ADD CONSTRAINT "Game_engine_mode_without_room" CHECK ("mode" = 'FRIENDS' OR "roomId" IS NULL);

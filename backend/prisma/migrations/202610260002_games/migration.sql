-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('ACTIVE', 'FINISHED');

-- CreateEnum
CREATE TYPE "GameColor" AS ENUM ('WHITE', 'BLACK');

-- CreateEnum
CREATE TYPE "GameResult" AS ENUM ('WHITE_WINS', 'BLACK_WINS', 'DRAW');

-- CreateEnum
CREATE TYPE "GameTermination" AS ENUM ('CHECKMATE', 'RESIGNATION', 'TIMEOUT', 'TIMEOUT_VS_INSUFFICIENT_MATERIAL', 'STALEMATE', 'INSUFFICIENT_MATERIAL', 'THREEFOLD_REPETITION', 'FIFTY_MOVE_RULE', 'AGREEMENT');

-- CreateEnum
CREATE TYPE "GameCommandKind" AS ENUM ('MOVE', 'RESIGN', 'OFFER_DRAW', 'ACCEPT_DRAW', 'DECLINE_DRAW');

-- CreateTable
CREATE TABLE "Game" (
    "id" UUID NOT NULL,
    "roomId" UUID,
    "status" "GameStatus" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "ply" INTEGER NOT NULL DEFAULT 0,
    "initialFen" VARCHAR(100) NOT NULL,
    "fen" VARCHAR(100) NOT NULL,
    "initialMs" INTEGER NOT NULL,
    "incrementMs" INTEGER NOT NULL,
    "whiteRemainingMs" INTEGER NOT NULL,
    "blackRemainingMs" INTEGER NOT NULL,
    "turnStartedAt" TIMESTAMPTZ(3),
    "drawOfferBy" "GameColor",
    "drawDeclinedBy" "GameColor",
    "result" "GameResult",
    "termination" "GameTermination",
    "pgn" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameParticipant" (
    "gameId" UUID NOT NULL,
    "color" "GameColor" NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameParticipant_pkey" PRIMARY KEY ("gameId","color")
);

-- CreateTable
CREATE TABLE "GameMove" (
    "gameId" UUID NOT NULL,
    "ply" INTEGER NOT NULL,
    "color" "GameColor" NOT NULL,
    "actorId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "uci" VARCHAR(5) NOT NULL,
    "san" VARCHAR(12) NOT NULL,
    "captured" CHAR(1),
    "fenAfter" VARCHAR(100) NOT NULL,
    "playedAt" TIMESTAMPTZ(3) NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "whiteRemainingMs" INTEGER NOT NULL,
    "blackRemainingMs" INTEGER NOT NULL,

    CONSTRAINT "GameMove_pkey" PRIMARY KEY ("gameId","ply")
);

-- CreateTable
CREATE TABLE "GameCommand" (
    "gameId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "kind" "GameCommandKind" NOT NULL,
    "fingerprint" VARCHAR(80) NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameCommand_pkey" PRIMARY KEY ("gameId","actorId","requestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_roomId_key" ON "Game"("roomId");

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");

-- CreateIndex
CREATE INDEX "GameParticipant_userId_createdAt_idx" ON "GameParticipant"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "GameParticipant_gameId_userId_key" ON "GameParticipant"("gameId", "userId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMove" ADD CONSTRAINT "GameMove_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMove" ADD CONSTRAINT "GameMove_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCommand" ADD CONSTRAINT "GameCommand_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCommand" ADD CONSTRAINT "GameCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity rules Prisma cannot express.
ALTER TABLE "Game" ADD CONSTRAINT "Game_counters_valid" CHECK ("revision" >= 1 AND "ply" >= 0);
ALTER TABLE "Game" ADD CONSTRAINT "Game_time_control_range" CHECK ("initialMs" BETWEEN 60000 AND 10800000 AND "incrementMs" BETWEEN 0 AND 180000);
ALTER TABLE "Game" ADD CONSTRAINT "Game_clocks_non_negative" CHECK ("whiteRemainingMs" >= 0 AND "blackRemainingMs" >= 0);
-- An active game always has a running clock; a finished one never does.
ALTER TABLE "Game" ADD CONSTRAINT "Game_clock_runs_while_active" CHECK (("status" = 'ACTIVE') = ("turnStartedAt" IS NOT NULL));
-- A result, its reason and the end time are recorded together, exactly once the game finishes.
ALTER TABLE "Game" ADD CONSTRAINT "Game_result_when_finished" CHECK (
    ("status" = 'FINISHED') = ("result" IS NOT NULL)
    AND ("result" IS NULL) = ("termination" IS NULL)
    AND ("result" IS NULL) = ("endedAt" IS NULL)
);
ALTER TABLE "Game" ADD CONSTRAINT "Game_result_matches_termination" CHECK (
    "termination" IS NULL
    OR ("termination" IN ('CHECKMATE', 'RESIGNATION', 'TIMEOUT')) = ("result" <> 'DRAW')
);
ALTER TABLE "Game" ADD CONSTRAINT "Game_offers_only_while_active" CHECK ("status" = 'ACTIVE' OR ("drawOfferBy" IS NULL AND "drawDeclinedBy" IS NULL));
ALTER TABLE "GameMove" ADD CONSTRAINT "GameMove_values_valid" CHECK (
    "ply" >= 1 AND "elapsedMs" >= 0 AND "whiteRemainingMs" >= 0 AND "blackRemainingMs" >= 0
    AND "uci" ~ '^[a-h][1-8][a-h][1-8][qrbn]?$'
);
ALTER TABLE "GameCommand" ADD CONSTRAINT "GameCommand_revision_positive" CHECK ("revision" >= 1);

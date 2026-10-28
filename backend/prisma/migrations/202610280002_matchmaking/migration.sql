CREATE TABLE "MatchmakingSearch" (
  "userId" UUID PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "searchId" UUID NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "state" VARCHAR(16) NOT NULL DEFAULT 'idle' CHECK ("state" IN ('idle','searching','confirming','matched')),
  "initialMs" INTEGER NOT NULL DEFAULT 600000,
  "incrementMs" INTEGER NOT NULL DEFAULT 0,
  "queuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "pairId" UUID,
  "ready" BOOLEAN NOT NULL DEFAULT false,
  "gameId" UUID REFERENCES "Game"("id") ON DELETE CASCADE,
  "reason" VARCHAR(32),
  CONSTRAINT "MatchmakingSearch_pair" CHECK (("state" = 'confirming') = ("pairId" IS NOT NULL)),
  CONSTRAINT "MatchmakingSearch_assignment" CHECK ("state" <> 'matched' OR "gameId" IS NOT NULL)
);
CREATE INDEX "MatchmakingSearch_state_initialMs_incrementMs_queuedAt_userId_idx"
  ON "MatchmakingSearch"("state", "initialMs", "incrementMs", "queuedAt", "userId");
CREATE INDEX "MatchmakingSearch_pairId_idx" ON "MatchmakingSearch"("pairId");

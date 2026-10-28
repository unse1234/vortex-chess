-- Additive: every existing game and queue entry stays casual.
CREATE TYPE "RatingPool" AS ENUM ('bullet', 'blitz', 'rapid');
ALTER TABLE "Game" ADD COLUMN "rated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ratingPool" "RatingPool", ADD COLUMN "ratingPolicyVersion" VARCHAR(24);
ALTER TABLE "GameParticipant" ADD COLUMN "ratingBefore" INTEGER, ADD COLUMN "ratingGamesBefore" INTEGER;
ALTER TABLE "MatchmakingSearch" ADD COLUMN "rated" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "ratingPool" "RatingPool";
CREATE TABLE "PlayerRating" (
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "pool" "RatingPool" NOT NULL,
  "rating" INTEGER NOT NULL DEFAULT 1200, "peakRating" INTEGER NOT NULL DEFAULT 1200,
  "games" INTEGER NOT NULL DEFAULT 0, "wins" INTEGER NOT NULL DEFAULT 0,
  "draws" INTEGER NOT NULL DEFAULT 0, "losses" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 0, "leaderboardEligible" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("userId", "pool"),
  CHECK ("rating" >= 100 AND "peakRating" >= "rating" AND "games" >= 0
    AND "wins" >= 0 AND "draws" >= 0 AND "losses" >= 0
    AND "games" = "wins" + "draws" + "losses" AND "revision" >= 0)
);
CREATE INDEX "PlayerRating_pool_leaderboardEligible_rating_userId_idx"
  ON "PlayerRating"("pool", "leaderboardEligible", "rating" DESC, "userId");
CREATE TABLE "RatingSettlement" (
  "gameId" UUID PRIMARY KEY REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "policyVersion" VARCHAR(24) NOT NULL, "kFactor" INTEGER NOT NULL, "ratingFloor" INTEGER NOT NULL,
  "expectedWhite" DOUBLE PRECISION NOT NULL, "scoreWhite" DOUBLE PRECISION NOT NULL,
  "roundedDeltaWhite" INTEGER NOT NULL, "appliedDeltaWhite" INTEGER NOT NULL,
  "settledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("scoreWhite" IN (0, 0.5, 1) AND "expectedWhite" BETWEEN 0 AND 1)
);
CREATE TABLE "RatingChange" (
  "gameId" UUID NOT NULL REFERENCES "RatingSettlement"("gameId") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "opponentId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "pool" "RatingPool" NOT NULL, "before" INTEGER NOT NULL, "delta" INTEGER NOT NULL,
  "after" INTEGER NOT NULL, "score" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("gameId", "userId"),
  FOREIGN KEY ("gameId", "userId") REFERENCES "GameParticipant"("gameId", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK ("before" >= 100 AND "after" >= 100 AND "after" = "before" + "delta"
    AND "score" IN (0, 0.5, 1) AND "userId" <> "opponentId")
);
CREATE INDEX "RatingChange_userId_pool_createdAt_gameId_idx"
  ON "RatingChange"("userId", "pool", "createdAt" DESC, "gameId" DESC);
ALTER TABLE "Game" ADD CONSTRAINT "Game_rating_settings_check" CHECK (
  (NOT "rated" AND "ratingPool" IS NULL AND "ratingPolicyVersion" IS NULL)
  OR ("rated" AND "mode" = 'RANDOM' AND "ratingPool" IS NOT NULL
    AND "ratingPolicyVersion" IS NOT NULL AND "ratingPolicyVersion" = 'elo-v1')
);
ALTER TABLE "MatchmakingSearch" ADD CONSTRAINT "MatchmakingSearch_rating_settings_check"
  CHECK ("rated" = ("ratingPool" IS NOT NULL));
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_rating_snapshot_check"
  CHECK (("ratingBefore" IS NULL AND "ratingGamesBefore" IS NULL)
    OR ("kind" = 'PLAYER' AND "ratingBefore" IS NOT NULL AND "ratingGamesBefore" IS NOT NULL
      AND "ratingBefore" >= 100 AND "ratingGamesBefore" >= 0));
-- Keep the creation contract immutable even if a future writer forgets it.
CREATE FUNCTION protect_game_rating_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."mode", NEW."rated", NEW."ratingPool", NEW."ratingPolicyVersion", NEW."initialMs", NEW."incrementMs", NEW."startedAt")
    IS DISTINCT FROM
    (OLD."mode", OLD."rated", OLD."ratingPool", OLD."ratingPolicyVersion", OLD."initialMs", OLD."incrementMs", OLD."startedAt") THEN
    RAISE EXCEPTION 'Game creation settings are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_game_rating_settings BEFORE UPDATE ON "Game"
  FOR EACH ROW EXECUTE FUNCTION protect_game_rating_settings();
CREATE FUNCTION protect_rating_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."ratingBefore", NEW."ratingGamesBefore") IS DISTINCT FROM (OLD."ratingBefore", OLD."ratingGamesBefore") THEN
    RAISE EXCEPTION 'Game rating snapshots are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_rating_snapshot BEFORE UPDATE ON "GameParticipant"
  FOR EACH ROW EXECUTE FUNCTION protect_rating_snapshot();

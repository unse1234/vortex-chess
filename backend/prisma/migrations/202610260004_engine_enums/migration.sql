-- New enum values are committed on their own so the next migration can use them.

-- AlterEnum
ALTER TYPE "GameResult" ADD VALUE 'ABORTED';

-- AlterEnum
ALTER TYPE "GameTermination" ADD VALUE 'ENGINE_FAILURE';

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('FRIENDS', 'ENGINE');

-- CreateEnum
CREATE TYPE "ParticipantKind" AS ENUM ('PLAYER', 'ENGINE');

ALTER TABLE "User" ADD COLUMN "socialRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TYPE "NotificationType" ADD VALUE 'FRIEND_REQUEST_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'FRIEND_REQUEST_ACCEPTED';
CREATE TYPE "FriendRequestState" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');
CREATE TABLE "FriendRequest" (
  "id" UUID PRIMARY KEY, "senderId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "recipientId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "pairLow" UUID NOT NULL, "pairHigh" UUID NOT NULL,
  "state" "FriendRequestState" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL, "respondedAt" TIMESTAMPTZ(3),
  CHECK ("pairLow" < "pairHigh" AND "pairLow" = LEAST("senderId", "recipientId") AND "pairHigh" = GREATEST("senderId", "recipientId"))
);
CREATE UNIQUE INDEX "FriendRequest_pending_pair_key" ON "FriendRequest" ("pairLow", "pairHigh") WHERE state = 'PENDING';
CREATE INDEX "FriendRequest_recipientId_state_createdAt_id_idx" ON "FriendRequest" ("recipientId", state, "createdAt" DESC, id DESC);
CREATE INDEX "FriendRequest_senderId_state_createdAt_id_idx" ON "FriendRequest" ("senderId", state, "createdAt" DESC, id DESC);
CREATE INDEX "FriendRequest_senderId_createdAt_idx" ON "FriendRequest" ("senderId", "createdAt");
CREATE INDEX "FriendRequest_pairLow_pairHigh_updatedAt_idx" ON "FriendRequest" ("pairLow", "pairHigh", "updatedAt" DESC);
CREATE TABLE "Friendship" (
  "id" UUID PRIMARY KEY,
  "pairLow" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "pairHigh" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("pairLow" < "pairHigh")
);
CREATE UNIQUE INDEX "Friendship_pairLow_pairHigh_key" ON "Friendship" ("pairLow", "pairHigh");
CREATE INDEX "Friendship_pairLow_createdAt_id_idx" ON "Friendship" ("pairLow", "createdAt" DESC, id DESC);
CREATE INDEX "Friendship_pairHigh_createdAt_id_idx" ON "Friendship" ("pairHigh", "createdAt" DESC, id DESC);
CREATE TABLE "UserBlock" (
  "id" UUID PRIMARY KEY,
  "blockerId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "blockedId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("blockerId" <> "blockedId")
);
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock" ("blockerId", "blockedId");
CREATE INDEX "UserBlock_blockerId_createdAt_id_idx" ON "UserBlock" ("blockerId", "createdAt" DESC, id DESC);
CREATE INDEX "UserBlock_blockedId_blockerId_idx" ON "UserBlock" ("blockedId", "blockerId");
ALTER TABLE "Notification" ADD COLUMN "friendRequestId" UUID REFERENCES "FriendRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

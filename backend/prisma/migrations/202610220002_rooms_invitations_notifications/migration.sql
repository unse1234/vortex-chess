-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'READY', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ColorPreference" AS ENUM ('WHITE', 'BLACK', 'RANDOM');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvitationAddress" AS ENUM ('USERNAME', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INVITATION_RECEIVED', 'INVITATION_ACCEPTED', 'INVITATION_DECLINED');

-- CreateEnum
CREATE TYPE "EmailJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "hostId" UUID NOT NULL,
    "challengerId" UUID,
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "initialMs" INTEGER NOT NULL,
    "incrementMs" INTEGER NOT NULL,
    "colorPreference" "ColorPreference" NOT NULL DEFAULT 'RANDOM',
    "hostReady" BOOLEAN NOT NULL DEFAULT false,
    "challengerReady" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "addressedBy" "InvitationAddress" NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "respondedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "actorId" UUID,
    "type" "NotificationType" NOT NULL,
    "invitationId" UUID,
    "roomId" UUID,
    "dedupeKey" VARCHAR(120) NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailJob" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "dedupeKey" VARCHAR(120) NOT NULL,
    "recipientId" UUID NOT NULL,
    "invitationId" UUID,
    "status" "EmailJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockToken" UUID,
    "lockedAt" TIMESTAMPTZ(3),
    "lastError" VARCHAR(500),
    "providerMessageId" VARCHAR(250),
    "providerResponse" VARCHAR(500),
    "skipReason" VARCHAR(60),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EmailJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Room_hostId_status_idx" ON "Room"("hostId", "status");

-- CreateIndex
CREATE INDEX "Room_challengerId_status_idx" ON "Room"("challengerId", "status");

-- CreateIndex
CREATE INDEX "Room_status_expiresAt_idx" ON "Room"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Invitation_recipientId_status_createdAt_idx" ON "Invitation"("recipientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Invitation_senderId_createdAt_idx" ON "Invitation"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "Invitation_roomId_status_idx" ON "Invitation"("roomId", "status");

-- CreateIndex
CREATE INDEX "Invitation_status_expiresAt_idx" ON "Invitation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_id_idx" ON "Notification"("recipientId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "EmailJob_dedupeKey_key" ON "EmailJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailJob_status_availableAt_idx" ON "EmailJob"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailJob" ADD CONSTRAINT "EmailJob_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailJob" ADD CONSTRAINT "EmailJob_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Database-enforced invariants, so concurrent writers cannot bypass them.
-- At most one pending invitation per recipient and room; answered invitations are history.
CREATE UNIQUE INDEX "Invitation_one_pending_per_recipient" ON "Invitation"("roomId", "recipientId") WHERE "status" = 'PENDING';
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_not_self" CHECK ("senderId" <> "recipientId");
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_responded_when_answered" CHECK (("status" IN ('ACCEPTED', 'DECLINED')) = ("respondedAt" IS NOT NULL));

ALTER TABLE "Room" ADD CONSTRAINT "Room_distinct_seats" CHECK ("challengerId" IS NULL OR "challengerId" <> "hostId");
ALTER TABLE "Room" ADD CONSTRAINT "Room_ready_requires_challenger" CHECK ("challengerId" IS NOT NULL OR NOT "challengerReady");
ALTER TABLE "Room" ADD CONSTRAINT "Room_ready_status" CHECK ("status" <> 'READY' OR ("challengerId" IS NOT NULL AND "hostReady" AND "challengerReady"));
ALTER TABLE "Room" ADD CONSTRAINT "Room_closed_when_terminal" CHECK (("status" IN ('CANCELLED', 'EXPIRED')) = ("closedAt" IS NOT NULL));
ALTER TABLE "Room" ADD CONSTRAINT "Room_time_control_range" CHECK ("initialMs" BETWEEN 60000 AND 10800000 AND "incrementMs" BETWEEN 0 AND 180000);
ALTER TABLE "Room" ADD CONSTRAINT "Room_revision_positive" CHECK ("revision" >= 1);

-- Unread count and unread filtering only touch unread rows.
CREATE INDEX "Notification_unread_idx" ON "Notification"("recipientId") WHERE "readAt" IS NULL;
ALTER TABLE "EmailJob" ADD CONSTRAINT "EmailJob_attempts_bounded" CHECK ("attempts" >= 0 AND "attempts" <= "maxAttempts");
ALTER TABLE "EmailJob" ADD CONSTRAINT "EmailJob_locked_when_processing" CHECK (("status" = 'PROCESSING') = ("lockToken" IS NOT NULL));

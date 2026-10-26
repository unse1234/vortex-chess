-- A room becomes STARTED when its game is created. Added in its own migration
-- so the value is committed before later migrations reference it.
ALTER TYPE "RoomStatus" ADD VALUE 'STARTED' BEFORE 'CANCELLED';

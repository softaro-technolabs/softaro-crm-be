-- Manual migration to fix kanban_position column type
-- Run this SQL directly in your PostgreSQL database

-- Change kanban_position from integer to bigint
ALTER TABLE "leads" ALTER COLUMN "kanban_position" TYPE bigint USING "kanban_position"::bigint;

-- If the above fails, try this alternative:
-- ALTER TABLE "leads" ALTER COLUMN "kanban_position" TYPE bigint;


-- Migration 002: Add pre-fill / draft support columns to form_responses
--
-- This migration adds columns required for the pre-fill draft workflow:
--   • status     — tracks response lifecycle (draft → submitted → completed)
--   • draft_token — unique token for public access to draft responses
--   • updated_by  — user who last edited the response
--   • updated_at  — timestamp of last edit
--
-- Safe to run on both fresh and existing databases.
-- On a fresh install where schema.sql already created these columns the
-- ALTER TABLE statements will fail with "duplicate column name" — that is
-- expected and harmless (D1 executes each statement independently).
--
-- Usage:
--   wrangler d1 execute cloudyforms --remote --file=src/db/migrations/002_add_response_prefill_support.sql
--   wrangler d1 execute cloudyforms --local  --file=src/db/migrations/002_add_response_prefill_support.sql

-- 1. Response lifecycle status (draft, submitted, completed).
--    Added as nullable first; existing rows are back-filled below.
ALTER TABLE form_responses ADD COLUMN status TEXT DEFAULT 'submitted';

-- Back-fill any existing rows that got NULL (should be none, but safe).
UPDATE form_responses SET status = 'submitted' WHERE status IS NULL;

-- 2. Unique token used to share a pre-filled draft via a public URL.
--    SQLite / D1 does not support inline UNIQUE on ALTER TABLE ADD COLUMN;
--    uniqueness is enforced by the UNIQUE INDEX created in step 5 below.
ALTER TABLE form_responses ADD COLUMN draft_token TEXT;

-- 3. User who last updated the response (editor / admin sign-off).
ALTER TABLE form_responses ADD COLUMN updated_by TEXT REFERENCES users(id);

-- 4. Timestamp of the most recent update.
ALTER TABLE form_responses ADD COLUMN updated_at TEXT;

-- 5. Index for quick draft-token lookups.
--    UNIQUE enforces the one-token-per-response invariant (SQLite supports
--    UNIQUE INDEX even when the plain UNIQUE column constraint is not
--    available via ALTER TABLE ADD COLUMN).
CREATE UNIQUE INDEX IF NOT EXISTS idx_responses_draft_token ON form_responses(draft_token);

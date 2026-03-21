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
ALTER TABLE form_responses ADD COLUMN status TEXT NOT NULL DEFAULT 'submitted';

-- 2. Unique token used to share a pre-filled draft via a public URL.
ALTER TABLE form_responses ADD COLUMN draft_token TEXT UNIQUE;

-- 3. User who last updated the response (editor / admin sign-off).
ALTER TABLE form_responses ADD COLUMN updated_by TEXT REFERENCES users(id);

-- 4. Timestamp of the most recent update.
ALTER TABLE form_responses ADD COLUMN updated_at TEXT;

-- 5. Index for quick draft-token lookups.
CREATE INDEX IF NOT EXISTS idx_responses_draft_token ON form_responses(draft_token);

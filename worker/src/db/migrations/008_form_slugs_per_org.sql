-- Migration 008: Form slugs are unique per organisation instead of globally.
--
-- SQLite cannot drop a column-level UNIQUE constraint without rebuilding the
-- table, and rebuilding `forms` on D1 risks cascade-deleting form responses.
-- Instead the old column is renamed to `legacy_slug` (it keeps its UNIQUE
-- constraint; new rows store the form id there) and a fresh `slug` column is
-- added with a composite unique index on (org_id, slug).
--
-- On a fresh install where schema.sql already has `legacy_slug`, the first
-- statement fails with "duplicate column name" and the migration stops there.

ALTER TABLE forms RENAME COLUMN slug TO legacy_slug;
ALTER TABLE forms ADD COLUMN slug TEXT NOT NULL DEFAULT '';
UPDATE forms SET slug = legacy_slug;
DROP INDEX IF EXISTS idx_forms_slug;
DROP INDEX IF EXISTS idx_forms_org_slug;
CREATE INDEX idx_forms_slug ON forms(slug);
CREATE UNIQUE INDEX idx_forms_org_slug ON forms(org_id, slug);

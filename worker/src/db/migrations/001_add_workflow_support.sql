-- Migration 001: Add workflow support
--
-- This migration adds support for:
--   • User Groups (org_groups, org_group_members)
--   • Form Workflow Stages (form_workflow_stages)
--   • Workflow progress tracking (current_stage on form_responses)
--
-- Safe to run on both fresh and existing databases.
-- New tables use CREATE TABLE IF NOT EXISTS (idempotent).
-- The ALTER TABLE ADD COLUMN will fail harmlessly if the column
-- already exists (e.g. on a fresh install that ran schema.sql first).
--
-- Usage:
--   wrangler d1 execute cloudyforms --remote --file=src/db/migrations/001_add_workflow_support.sql
--   wrangler d1 execute cloudyforms --local  --file=src/db/migrations/001_add_workflow_support.sql

-- 1. Add current_stage column to form_responses (tracks which workflow
--    stage a response is currently at; NULL means no workflow).
--    NOTE: This will error with "duplicate column name" on fresh installs
--    where schema.sql already created the column — that is expected and harmless.
ALTER TABLE form_responses ADD COLUMN current_stage TEXT;

-- 2. User Groups — named permission groups within an organization.
CREATE TABLE IF NOT EXISTS org_groups (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(org_id, name)
);

-- 3. User Group Members — assign org members to groups.
CREATE TABLE IF NOT EXISTS org_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES org_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(group_id, user_id)
);

-- 4. Form Workflow Stages — sequential sign-off stages for a form.
CREATE TABLE IF NOT EXISTS form_workflow_stages (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  allowed_roles TEXT NOT NULL DEFAULT '[]',
  allowed_groups TEXT NOT NULL DEFAULT '[]',
  allowed_users TEXT NOT NULL DEFAULT '[]',
  notify_on_ready INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 5. Indexes for the new tables.
CREATE INDEX IF NOT EXISTS idx_org_groups_org ON org_groups(org_id);
CREATE INDEX IF NOT EXISTS idx_org_group_members_group ON org_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_org_group_members_user ON org_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_form_workflow_stages_form ON form_workflow_stages(form_id);

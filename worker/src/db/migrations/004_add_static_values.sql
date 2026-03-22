-- Migration 004: Add organization static values
-- Key-value constants shared across all forms in an organization.

CREATE TABLE IF NOT EXISTS org_static_values (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,              -- unique name within org, used in {{static:Key}} placeholders
  label TEXT NOT NULL,            -- human-readable label
  value TEXT NOT NULL DEFAULT '', -- the constant value
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(org_id, key)
);

CREATE INDEX IF NOT EXISTS idx_org_static_values_org ON org_static_values(org_id);

-- CloudyForms Database Schema
-- Compatible with Cloudflare D1 (SQLite)

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_super_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#6366f1',
  secondary_color TEXT DEFAULT '#8b5cf6',
  custom_domain TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Organization Members
CREATE TABLE IF NOT EXISTS org_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer', -- owner, admin, editor, viewer
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(org_id, user_id)
);

-- Forms
CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, published, closed
  access_type TEXT NOT NULL DEFAULT 'public', -- public, unlisted, code, kiosk_only
  access_code TEXT,
  fields TEXT NOT NULL DEFAULT '[]', -- JSON array of FormField
  settings TEXT NOT NULL DEFAULT '{}', -- JSON FormSettings
  branding TEXT NOT NULL DEFAULT '{}', -- JSON BrandingConfig
  document_template TEXT, -- JSON DocumentTemplate (optional PDF/MD template config)
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Form Responses
CREATE TABLE IF NOT EXISTS form_responses (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}', -- JSON field values
  metadata TEXT NOT NULL DEFAULT '{}', -- JSON metadata
  submitter_email TEXT,
  fingerprint TEXT,
  is_spam INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Field Groups (reusable field templates)
CREATE TABLE IF NOT EXISTS field_groups (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE, -- null = global
  name TEXT NOT NULL,
  description TEXT,
  fields TEXT NOT NULL DEFAULT '[]', -- JSON array of FormField
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Kiosk Devices
CREATE TABLE IF NOT EXISTS kiosks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  form_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of form IDs
  allow_multiple_responses INTEGER DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Webhooks
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT NOT NULL DEFAULT '["response.created"]', -- JSON array of event types
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Response File Attachments
CREATE TABLE IF NOT EXISTS response_files (
  id TEXT PRIMARY KEY,
  response_id TEXT NOT NULL REFERENCES form_responses(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL,
  file_key TEXT NOT NULL, -- R2 key
  file_name TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  blob_data TEXT, -- base64 encoded for small files
  created_at TEXT DEFAULT (datetime('now'))
);

-- ACL Rules (granular field-level access control)
CREATE TABLE IF NOT EXISTS acl_rules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  form_id TEXT REFERENCES forms(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- viewer, editor, admin, owner
  can_view_fields TEXT NOT NULL DEFAULT '[]', -- JSON array of field IDs (empty = all)
  can_view_responses INTEGER DEFAULT 1,
  can_delete_responses INTEGER DEFAULT 0,
  can_edit_responses INTEGER DEFAULT 0,
  can_export INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Custom Domains (multiple domains per organisation)
-- Each record maps a verified domain to an organisation.
-- The global admin creates these; org admins can request them.
CREATE TABLE IF NOT EXISTS custom_domains (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain TEXT UNIQUE NOT NULL,         -- e.g. "forms.example.com"
  verified INTEGER DEFAULT 0,          -- 1 once DNS TXT record confirmed
  verification_token TEXT NOT NULL,    -- random token placed in DNS TXT
  is_primary INTEGER DEFAULT 0,        -- at most one primary per org
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Platform Settings (key-value store for global configuration)
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_forms_org_id ON forms(org_id);
CREATE INDEX IF NOT EXISTS idx_forms_slug ON forms(slug);
CREATE INDEX IF NOT EXISTS idx_responses_form_id ON form_responses(form_id);
CREATE INDEX IF NOT EXISTS idx_responses_fingerprint ON form_responses(fingerprint);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_kiosks_token ON kiosks(token);
CREATE INDEX IF NOT EXISTS idx_webhooks_form_id ON webhooks(form_id);
CREATE INDEX IF NOT EXISTS idx_field_groups_org_id ON field_groups(org_id);
CREATE INDEX IF NOT EXISTS idx_response_files_response_id ON response_files(response_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX IF NOT EXISTS idx_custom_domains_org ON custom_domains(org_id);

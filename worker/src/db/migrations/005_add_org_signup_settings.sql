-- Migration 005: Per-organization registration settings for custom domains.
-- Platform-wide settings (platform_settings) apply on the canonical host only.

ALTER TABLE organizations ADD COLUMN signups_enabled INTEGER DEFAULT 1;
ALTER TABLE organizations ADD COLUMN allowed_signup_domains TEXT DEFAULT '[]';

-- Migration 003: Add theme support
-- Adds theme preferences at user, organization, and system levels.

-- Per-user theme preference (JSON ThemeConfig: {mode, preset})
ALTER TABLE users ADD COLUMN theme TEXT;

-- Per-organization theme (JSON ThemeConfig: {mode, preset})
ALTER TABLE organizations ADD COLUMN theme TEXT;

-- Migration 007: Per-org email provider and sender address.

ALTER TABLE organizations ADD COLUMN email_provider TEXT;
ALTER TABLE organizations ADD COLUMN email_from TEXT;

-- Add organization_settings table for per-org feature flags
CREATE TABLE IF NOT EXISTS organization_settings (
  id TEXT PRIMARY KEY,
  clerk_org_id TEXT UNIQUE NOT NULL,
  tracks_drivers BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_settings_clerk_org_id ON organization_settings(clerk_org_id);

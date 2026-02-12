-- Add organization_settings table for feature flags
CREATE TABLE IF NOT EXISTS organization_settings (
  id TEXT PRIMARY KEY,
  clerk_org_id TEXT UNIQUE NOT NULL,
  tracks_drivers BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_settings_clerk_org_id ON organization_settings(clerk_org_id);

-- Insert default settings for existing orgs
-- Wolverine: tracks drivers (Motive with HOS/ELD)
INSERT INTO organization_settings (id, clerk_org_id, tracks_drivers, created_at, updated_at)
VALUES (
  'org_settings_wolverine',
  'org_2ZBQsLlFpgzE9CvpkGR4SYWdRJi',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (clerk_org_id) DO UPDATE SET
  tracks_drivers = true,
  updated_at = NOW();

-- Atlas: does NOT track drivers (Samsara without driver assignment)
INSERT INTO organization_settings (id, clerk_org_id, tracks_drivers, created_at, updated_at)
VALUES (
  'org_settings_atlas',
  'org_39RQY3qNO861ScQb0ZLFSUIFZkN',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (clerk_org_id) DO UPDATE SET
  tracks_drivers = false,
  updated_at = NOW();

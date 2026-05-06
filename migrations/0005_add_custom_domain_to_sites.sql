-- Add custom_domain column to sites table
-- This enables custom domain functionality for paid plans

ALTER TABLE sites ADD COLUMN custom_domain TEXT;

-- Add index for faster lookups
CREATE INDEX idx_sites_custom_domain ON sites(custom_domain);

-- Add constraint to ensure custom domains are unique
CREATE UNIQUE INDEX idx_sites_custom_domain_unique ON sites(custom_domain) WHERE custom_domain IS NOT NULL;

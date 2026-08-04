-- Enable review_requests entitlement for all sites that don't already have it
INSERT INTO site_entitlements (id, site_id, organization_id, key, value, source, created_at, updated_at)
SELECT
  'entl-' || lower(hex(randomblob(12))),
  s.id,
  s.organization_id,
  'review_requests',
  'true',
  'migration',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM sites s
WHERE NOT EXISTS (
  SELECT 1 FROM site_entitlements se
  WHERE se.site_id = s.id AND se.key = 'review_requests'
);

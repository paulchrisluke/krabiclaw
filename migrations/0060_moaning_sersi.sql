ALTER TABLE `invitation_access_scope` ADD `grant_source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `member_access_scope` ADD `grant_source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint

-- Existing location_manager scopes were created by WhatsApp notification
-- configuration. Mark them before folding the role into editor so later
-- config changes can revoke only those derived grants.
UPDATE member_access_scope
SET grant_source = 'whatsapp_config'
WHERE member_id IN (SELECT id FROM member WHERE role = 'location_manager');--> statement-breakpoint

UPDATE invitation_access_scope
SET grant_source = 'whatsapp_config'
WHERE invitation_id IN (SELECT id FROM invitation WHERE role = 'location_manager');--> statement-breakpoint

-- Existing editors were organization-wide before this migration. Preserve
-- that access explicitly for every site, even if an editor happened to have
-- an unrelated scope row already.
INSERT OR IGNORE INTO member_access_scope
  (id, member_id, organization_id, site_id, location_id, grant_source)
SELECT
  lower(hex(randomblob(16))),
  m.id,
  m.organizationId,
  s.id,
  NULL,
  'migration_backfill'
FROM member m
JOIN sites s ON s.organization_id = m.organizationId
WHERE m.role = 'editor';--> statement-breakpoint

UPDATE member SET role = 'editor' WHERE role = 'location_manager';--> statement-breakpoint
UPDATE invitation SET role = 'editor' WHERE role = 'location_manager';

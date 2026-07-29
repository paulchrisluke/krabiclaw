UPDATE `organization`
SET `slug` = 'org-' || lower(substr(replace(`id`, '-', ''), 1, 42))
WHERE `slug` IS NULL OR trim(`slug`) = '';--> statement-breakpoint
DROP TRIGGER IF EXISTS `organization_slug_required_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `organization_slug_required_update`;--> statement-breakpoint
CREATE TRIGGER `organization_slug_required_insert`
BEFORE INSERT ON `organization`
FOR EACH ROW
WHEN NEW.`slug` IS NULL OR trim(NEW.`slug`) = ''
BEGIN
  SELECT RAISE(ABORT, 'organization.slug is required');
END;--> statement-breakpoint
CREATE TRIGGER `organization_slug_required_update`
BEFORE UPDATE OF `slug` ON `organization`
FOR EACH ROW
WHEN NEW.`slug` IS NULL OR trim(NEW.`slug`) = ''
BEGIN
  SELECT RAISE(ABORT, 'organization.slug is required');
END;

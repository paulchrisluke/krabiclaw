CREATE TRIGGER `prices_overlap_insert`
BEFORE INSERT ON `prices`
WHEN EXISTS (
	SELECT 1 FROM `prices` AS `existing`
	WHERE existing.product_id = NEW.product_id
		AND existing.id <> NEW.id
		AND (existing.valid_until IS NULL OR NEW.valid_from < existing.valid_until)
		AND (NEW.valid_until IS NULL OR existing.valid_from < NEW.valid_until)
)
BEGIN
	SELECT RAISE(ABORT, 'prices_overlap');
END;
--> statement-breakpoint
CREATE TRIGGER `prices_overlap_update`
BEFORE UPDATE OF `product_id`, `valid_from`, `valid_until` ON `prices`
WHEN EXISTS (
	SELECT 1 FROM `prices` AS `existing`
	WHERE existing.product_id = NEW.product_id
		AND existing.id <> NEW.id
		AND (existing.valid_until IS NULL OR NEW.valid_from < existing.valid_until)
		AND (NEW.valid_until IS NULL OR existing.valid_from < NEW.valid_until)
)
BEGIN
	SELECT RAISE(ABORT, 'prices_overlap');
END;
--> statement-breakpoint
-- Exercise the update trigger against every historical interval. Any existing
-- overlap aborts the migration before it can be marked applied.
UPDATE `prices` SET `valid_from` = `valid_from`;

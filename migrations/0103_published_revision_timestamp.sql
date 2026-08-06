ALTER TABLE `content_revisions` ADD `published_at` text;
--> statement-breakpoint
UPDATE `content_revisions`
   SET `published_at` = `created_at`
 WHERE `id` IN (
   SELECT `published_revision_id`
     FROM `content_documents`
    WHERE `published_revision_id` IS NOT NULL
 );

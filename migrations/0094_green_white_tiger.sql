ALTER TABLE `tenant_page_variants` ADD `draft_path` text DEFAULT '/' NOT NULL;
UPDATE tenant_page_variants SET draft_path = published_path;

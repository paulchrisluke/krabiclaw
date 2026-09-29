CREATE TABLE `article_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`collection` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "article_categories_instants_check" CHECK((created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)),
	CONSTRAINT "article_categories_collection_check" CHECK(collection IN ('blog', 'docs')),
	CONSTRAINT "article_categories_name_not_blank_check" CHECK(trim(name) <> ''),
	CONSTRAINT "article_categories_slug_check" CHECK(slug <> '' AND slug = lower(slug) AND slug NOT GLOB '*[^a-z0-9-]*' AND slug NOT LIKE '-%' AND slug NOT LIKE '%-' AND slug NOT LIKE '%--%'),
	CONSTRAINT "article_categories_sort_order_check" CHECK(sort_order >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_categories_slug_unique` ON `article_categories` (`organization_id`,`collection`,`slug`);--> statement-breakpoint
CREATE INDEX `article_categories_org_sort_idx` ON `article_categories` (`organization_id`,`collection`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `article_categories_org_id_unique` ON `article_categories` (`organization_id`,`id`);--> statement-breakpoint
CREATE TABLE `article_category_articles` (
	`article_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`category_id` text NOT NULL,
	`article_row_role` text DEFAULT 'root' NOT NULL,
	`article_kind` text DEFAULT 'article' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`category_id`) REFERENCES `article_categories`(`organization_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`article_id`,`article_row_role`,`article_kind`) REFERENCES `content_documents`(`organization_id`,`id`,`row_role`,`kind`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "article_category_articles_instants_check" CHECK((created_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 days') IS created_at) AND (updated_at IS NULL OR strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0 days') IS updated_at)),
	CONSTRAINT "article_category_articles_constants_check" CHECK(article_row_role = 'root' AND article_kind = 'article')
);
--> statement-breakpoint
CREATE INDEX `article_category_articles_category_idx` ON `article_category_articles` (`category_id`);--> statement-breakpoint
-- Every article's typed category becomes a record of its organization's
-- collection, in the order its first article sits, and the article links to
-- it. A category that cannot become a valid slug fails the slug CHECK here
-- rather than being stored as something else.
INSERT INTO `article_categories` (`id`, `organization_id`, `collection`, `name`, `slug`, `sort_order`, `created_by`, `updated_by`)
SELECT 'acat_' || lower(hex(randomblob(12))), organization_id, collection, name,
  trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
    lower(name), '&', ' '), '''', ''), '’', ''), ',', ' '), '.', ' '), '/', ' '), ':', ' '), '(', ' '), ')', ' '),
    ' ', '-'), '---', '-'), '--', '-'), '-'),
  (ROW_NUMBER() OVER (PARTITION BY organization_id, collection ORDER BY first_position, name)) - 1,
  author, author
FROM (
  SELECT organization_id, metadata_json ->> '$.collection' AS collection, trim(metadata_json ->> '$.category') AS name,
    min(sort_order) AS first_position,
    -- Who wrote the articles, or the organization's owner where they record no one.
    coalesce(min(coalesce(created_by, updated_by, author_id)), (SELECT m.userId FROM member m WHERE m.organizationId = content_documents.organization_id AND m.role = 'owner' ORDER BY m.createdAt LIMIT 1)) AS author
  FROM content_documents
  WHERE kind = 'article' AND row_role = 'root' AND trim(coalesce(metadata_json ->> '$.category', '')) <> ''
  GROUP BY organization_id, metadata_json ->> '$.collection', trim(metadata_json ->> '$.category')
);
--> statement-breakpoint
INSERT INTO `article_category_articles` (`article_id`, `organization_id`, `category_id`)
SELECT d.id, d.organization_id, c.id
FROM content_documents d
JOIN article_categories c ON c.organization_id = d.organization_id
  AND c.collection = d.metadata_json ->> '$.collection' AND c.name = trim(d.metadata_json ->> '$.category')
WHERE d.kind = 'article' AND d.row_role = 'root';
--> statement-breakpoint
-- A translated category name lived on each translated article; it becomes the
-- category's own translation, once per locale.
INSERT INTO `resource_localizations` (`id`, `organization_id`, `resource_type`, `resource_id`, `locale`, `values_json`, `created_by_user_id`, `updated_by_user_id`)
SELECT 'rl_' || lower(hex(randomblob(12))), organization_id, 'article_category', category_id, locale,
  json_object('name', translated), author, author
FROM (
  SELECT m.organization_id, m.category_id, p.locale, min(trim(p.metadata_json ->> '$.category')) AS translated,
    coalesce(min(coalesce(p.updated_by, p.created_by, r.author_id)), (SELECT m.userId FROM member m WHERE m.organizationId = m.organization_id AND m.role = 'owner' ORDER BY m.createdAt LIMIT 1)) AS author
  FROM article_category_articles m
  JOIN content_documents r ON r.id = m.article_id
  JOIN content_documents p ON p.root_id = r.id AND p.row_role = 'representation'
  WHERE trim(coalesce(p.metadata_json ->> '$.category', '')) <> ''
  GROUP BY m.organization_id, m.category_id, p.locale
);
--> statement-breakpoint
UPDATE `content_documents` SET `metadata_json` = json_remove(`metadata_json`, '$.category', '$.tags')
WHERE kind = 'article' AND (json_type(metadata_json, '$.category') IS NOT NULL OR json_type(metadata_json, '$.tags') IS NOT NULL);

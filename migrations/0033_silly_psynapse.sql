ALTER TABLE `blog_posts` ADD `nav_section` text;--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `nav_title` text;--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `nav_order` integer;--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `nav_section_order` integer;--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `hide_from_nav` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `featured_order` integer;--> statement-breakpoint
ALTER TABLE `platform_docs` ADD `nav_section` text;--> statement-breakpoint
ALTER TABLE `platform_docs` ADD `nav_title` text;--> statement-breakpoint
ALTER TABLE `platform_docs` ADD `nav_order` integer;--> statement-breakpoint
ALTER TABLE `platform_docs` ADD `nav_section_order` integer;--> statement-breakpoint
ALTER TABLE `platform_docs` ADD `hide_from_nav` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `platform_docs` ADD `featured_order` integer;
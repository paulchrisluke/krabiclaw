-- The physical posts/blog_posts tables are referenced parents and must not be
-- rebuilt on D1. Their legacy CHECK shape remains physical history; these
-- triggers enforce the narrower current schema contract in place.
DROP TRIGGER IF EXISTS `posts_publication_status_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `posts_publication_status_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `blog_posts_publication_status_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `blog_posts_publication_status_update`;--> statement-breakpoint
CREATE TRIGGER `posts_publication_status_insert`
BEFORE INSERT ON `posts`
WHEN NEW.`status` NOT IN ('published', 'scheduled')
BEGIN SELECT RAISE(ABORT, 'posts.status must be published or scheduled'); END;--> statement-breakpoint
CREATE TRIGGER `posts_publication_status_update`
BEFORE UPDATE OF `status` ON `posts`
WHEN NEW.`status` NOT IN ('published', 'scheduled')
BEGIN SELECT RAISE(ABORT, 'posts.status must be published or scheduled'); END;--> statement-breakpoint
CREATE TRIGGER `blog_posts_publication_status_insert`
BEFORE INSERT ON `blog_posts`
WHEN NEW.`status` NOT IN ('published', 'scheduled')
BEGIN SELECT RAISE(ABORT, 'blog_posts.status must be published or scheduled'); END;--> statement-breakpoint
CREATE TRIGGER `blog_posts_publication_status_update`
BEFORE UPDATE OF `status` ON `blog_posts`
WHEN NEW.`status` NOT IN ('published', 'scheduled')
BEGIN SELECT RAISE(ABORT, 'blog_posts.status must be published or scheduled'); END;

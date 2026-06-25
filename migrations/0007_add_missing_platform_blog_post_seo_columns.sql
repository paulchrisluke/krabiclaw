-- Migration number: 0007

-- platform_blog_posts.seo_description/seo_keywords/canonical_url/robots were added
-- to 0001_initial.sql's CREATE TABLE during a later squash, but production already
-- had an 0001_initial.sql row recorded in d1_migrations from before that squash, so
-- `wrangler d1 migrations apply` (which tracks by filename, not content) silently
-- skipped the new columns. This broke list_platform_blog_posts/get_platform_blog_post
-- with "no such column: p.seo_description". Same fix pattern as 0003
-- (site_pageview_events) and 0006 (platform_docs). The columns are also removed from
-- 0001_initial.sql's CREATE TABLE so a fresh environment doesn't get them twice.
ALTER TABLE platform_blog_posts ADD COLUMN seo_description TEXT;
ALTER TABLE platform_blog_posts ADD COLUMN seo_keywords TEXT;
ALTER TABLE platform_blog_posts ADD COLUMN canonical_url TEXT;
ALTER TABLE platform_blog_posts ADD COLUMN robots TEXT;

-- Migration number: 0019  2026-07-02T00:00:00.000Z
--
-- Hand-authored instead of using the raw `drizzle-kit generate` output: the
-- generator also proposed rebuilding blog_posts/menu_items/posts and dropping
-- location_qa indexes, unrelated to this change. That's schema drift left
-- over from 0018_repair_site_analytics_daily_schema.sql being hand-authored
-- outside drizzle-kit (never captured in migrations/meta/_journal.json), not
-- something to silently resolve here. This migration only adds the column
-- contact_submissions actually needs.
--
-- No CHECK constraint here: `ALTER TABLE ... ADD CHECK` is not valid SQLite —
-- adding a CHECK after the fact requires a full table rebuild (as done for
-- blog_posts/menu_items/posts elsewhere), which is unrelated schema drift and
-- shouldn't be bundled into this migration. `subject` is already validated
-- against an allow-list in contact.post.ts before insert.

ALTER TABLE contact_submissions ADD `subject` text;

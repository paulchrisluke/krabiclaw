-- Migration number: 0006

-- platform_docs never got canonical_url/robots, even though platform_blog_posts
-- has both and server/db/schema.ts + the public docs query already expect them
-- on platform_docs too. Without this, /docs/[slug] 500s on every published doc
-- (queryFirst throws "no such column: p.canonical_url").
ALTER TABLE platform_docs ADD COLUMN canonical_url TEXT;
ALTER TABLE platform_docs ADD COLUMN robots TEXT;

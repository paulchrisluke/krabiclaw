-- Seed platform documentation for KrabiClaw.
-- Run locally: yarn wrangler d1 execute DB --local --file=scripts/seed-docs.sql
-- Run remotely: yarn wrangler d1 execute DB --remote --file=scripts/seed-docs.sql

-- Retire the old restaurant-onboarding doc set (doc-001..doc-011). Re-running
-- this file against any environment that already has them cleans them up —
-- DELETE is idempotent, unlike INSERT OR REPLACE which can only add/update.
DELETE FROM platform_content_components
  WHERE content_type = 'doc' AND content_id IN (
    'doc-001','doc-002','doc-003','doc-004','doc-005','doc-006',
    'doc-007','doc-008','doc-009','doc-010','doc-011'
  );
DELETE FROM platform_docs
  WHERE id IN (
    'doc-001','doc-002','doc-003','doc-004','doc-005','doc-006',
    'doc-007','doc-008','doc-009','doc-010','doc-011'
  );

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-012',
  'Connect KrabiClaw to ChatGPT (MCP Setup)',
  'mcp-setup',
  '## Connect KrabiClaw to ChatGPT

KrabiClaw runs an MCP (Model Context Protocol) server so you can manage your site, menus, and media directly from ChatGPT.

## MCP server URL

```
https://krabiclaw.com/api/mcp
```

Paste this into ChatGPT''s connector setup. Don''t open it directly in a browser tab — it isn''t a page you visit, it''s the address ChatGPT itself connects to. If you tapped this link from an email, WhatsApp message, or chat, you landed here instead.

## What you''re giving ChatGPT access to

When you connect, KrabiClaw asks you to approve:

- Verifying your identity.
- Reading and updating your site content, menus, and media.
- Managing locations, reviews, and Q&A.
- Submitting and tracking work requests.

You can review or revoke this access anytime from [Account Settings](/dashboard/account/settings).

## Prefer a guided page with a copy button?

Visit [KrabiClaw for ChatGPT](/plugin) for the same instructions with a one-click copy button and setup screenshots.',
  'Connect the KrabiClaw MCP server to ChatGPT so you can manage your site through conversation.',
  'Integrations',
  NULL,
  'Connect KrabiClaw to ChatGPT using the MCP server URL, with step-by-step setup instructions and a list of requested permissions.',
  'KrabiClaw MCP, connect ChatGPT, MCP server URL, ChatGPT connector setup, KrabiClaw ChatGPT integration',
  '/docs/mcp-setup',
  'index, follow',
  'Beginner',
  1,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

DELETE FROM platform_content_components WHERE content_type = 'doc' AND content_id = 'doc-012';

INSERT INTO platform_content_components (id, content_type, content_id, type, position, label, status, render_enabled, schema_enabled, data_json, created_at, updated_at)
VALUES (
  'doc-012-howto',
  'doc',
  'doc-012',
  'how_to',
  1,
  'Set up the connector',
  'active',
  1,
  1,
  '{"steps":[
    {"name":"Enable Developer Mode","text":"Go to ChatGPT Settings -> Connectors -> Advanced, and enable Developer mode.","position":0},
    {"name":"Create an app","text":"Click Create an App from the Connectors screen.","position":1},
    {"name":"Configure app details","text":"Set the title to KrabiClaw, choose OAuth authentication, and paste the MCP server URL: https://krabiclaw.com/api/mcp","position":2},
    {"name":"Create and connect","text":"Click Create, then Connect, and sign in with your KrabiClaw account when prompted.","position":3},
    {"name":"Try it","text":"Start a new chat, add the KrabiClaw app, and try a prompt like \"What can you do?\"","position":4}
  ],"estimated_time":"PT2M"}',
  datetime('now'),
  datetime('now')
);

INSERT INTO platform_content_components (id, content_type, content_id, type, position, label, status, render_enabled, schema_enabled, data_json, created_at, updated_at)
VALUES (
  'doc-012-faq',
  'doc',
  'doc-012',
  'faq',
  2,
  'Common questions',
  'active',
  1,
  1,
  '{"items":[
    {"question":"I clicked this link and landed on a page instead of connecting — what happened?","answer":"The MCP server URL is meant to be pasted into the ChatGPT connector setup, not opened directly in a browser. Copy the URL above into the connector field instead.","position":0},
    {"question":"What can ChatGPT do once connected?","answer":"It can read and update your site content, menus, and media, manage locations, reviews, and Q&A, and submit or track work requests — the same permissions shown on the consent screen when you connect.","position":1},
    {"question":"Can I disconnect ChatGPT later?","answer":"Yes. Open [Account Settings](/dashboard/account/settings) and remove the connected app at any time.","position":2}
  ]}',
  datetime('now'),
  datetime('now')
);

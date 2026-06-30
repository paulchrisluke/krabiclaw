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
  '/docs/integrations/mcp-setup',
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

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-013',
  'Getting started with KrabiClaw',
  'getting-started-with-krabiclaw',
  'Deploy your website on KrabiClaw in three steps: create a KrabiClaw account, use AI to build your website, and deploy.

## AI Assistance

Copy this prompt into ChatGPT, Claude, or another LLM if you want help getting the first version live:

```text
Help me launch a KrabiClaw website in the right order.

1. Tell me to create a KrabiClaw account at https://krabiclaw.com/signup.
2. Walk me through KrabiClaw onboarding using either my Google Maps URL or manual business details.
3. After the site exists, help me connect KrabiClaw to ChatGPT using https://krabiclaw.com/docs/integrations/mcp-setup.
4. Then suggest the next edits I should make before I publish, based on what a local business site usually needs first.
```

## Prerequisites

- A [KrabiClaw account](/signup)
- Optional: ChatGPT, Claude, or another LLM

## Create

Every KrabiClaw workflow starts with your site setup inside KrabiClaw.

Onboarding walks you through four short steps to turn your real business details into the first live version of your site:

1. **Pick your business type** — restaurant, café or bar, or experience, class or activity. This sets the right layout and copy for your site.
2. **Choose how to add your details** — paste your Google Maps link so KrabiClaw can pull your name, address, phone, hours, and photos automatically, or start manually by typing your business name.
3. **Confirm the match** — if you used Google Maps, KrabiClaw shows you what it found and asks you to confirm it''s the right listing before using it.
4. **Fill in the details** — name, city, address, phone, website, hours, a manager alert number, and your timezone. Anything you leave blank can be filled in later from the dashboard.

That''s it — your site is created and live on a free krabiclaw.com address as soon as you submit the details.

{{component type="how_to"}}

If you want a deeper walkthrough of the setup flow itself, continue to [Use the onboarding flow](/docs/getting-started/onboarding).

## Add ChatGPT later

ChatGPT is optional. Your first job is to get the website live.

After the site exists, you can connect KrabiClaw to ChatGPT if you want to edit the site through conversation, ask for content changes, or use AI help for updates and planning.

- [Open KrabiClaw for ChatGPT](/plugin)

## Next steps

- [Use the onboarding flow](/docs/getting-started/onboarding)
- [Connect KrabiClaw to ChatGPT (MCP Setup)](/docs/integrations/mcp-setup)
- [Browse all documentation](/docs)
- [Read the platform blog](/blog)
- [See pricing](/pricing)

{{component type="faq"}}',
  'Create your first KrabiClaw site, add your business details, choose how you want to manage it, and publish your first version.',
  'Getting Started',
  NULL,
  'Learn how to create a KrabiClaw account, use onboarding to build your first site, connect ChatGPT, and publish the first live version.',
  'getting started with KrabiClaw, create website, business onboarding, connect ChatGPT, publish site, local business website setup',
  '/docs/getting-started/getting-started-with-krabiclaw',
  'index, follow',
  'Beginner',
  0,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-014',
  'Use the onboarding flow',
  'onboarding',
  'Onboarding is a short conversation, not a form — KrabiClaw asks a few questions and builds your homepage live as you answer. The exact steps with screenshots are below in **Go through onboarding**.

![Onboarding welcome screen](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/1c7cbfd3-7d88-405d-6de6-e7f4701e8200/public)

## What to prepare

- Your business name
- Your Google Maps URL, if you have one
- Contact details (phone, address)
- Hours
- A website URL, if you already have one

## Google Maps or manual — which to use

If your business already has a Google Maps listing, paste the link and KrabiClaw pulls your name, address, phone, hours, and photos automatically — you only need to fix what looks off. If it does not, or you would rather not use Maps, start manually: type your business name and fill in the rest yourself. Either way nothing publishes without your say — if you came from Google Maps, KrabiClaw shows you the match and asks you to confirm it is right before using it, and every field in the details form stays editable.

## What your site looks like right after onboarding

Your site goes live immediately on a free `krabiclaw.com` address with your real name, address, hours, and contact details in place — but it is not finished. There is no hero image, menu or experience list, or brand story yet, so those sections show realistic example content (not a blank page) until you replace it. Notification preferences, team invites, and other dashboard settings are not part of onboarding — they wait until you are in the dashboard. See [What happens after onboarding](/docs/getting-started/after-onboarding) for what to fill in first.

{{component type="how_to"}}

## Related guides

- [Getting started with KrabiClaw](/docs/getting-started/getting-started-with-krabiclaw)
- [What happens after onboarding](/docs/getting-started/after-onboarding)
- [Connect KrabiClaw to ChatGPT (MCP Setup)](/docs/integrations/mcp-setup)',
  'Use KrabiClaw onboarding to add your business details, review the first version of your site, and get ready to publish.',
  'Getting Started',
  NULL,
  'Learn how the KrabiClaw onboarding flow works, what to prepare, and how it helps you build the first version of your site.',
  'KrabiClaw onboarding, website setup, business details, publish website, getting started',
  '/docs/getting-started/onboarding',
  'index, follow',
  'Beginner',
  1,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

DELETE FROM platform_content_components WHERE content_type = 'doc' AND content_id = 'doc-014';

INSERT INTO platform_content_components (id, content_type, content_id, type, position, label, status, render_enabled, schema_enabled, data_json, created_at, updated_at)
VALUES (
  'doc-014-howto',
  'doc',
  'doc-014',
  'how_to',
  1,
  'Go through onboarding',
  'active',
  1,
  1,
  '{"steps":[
    {"name":"Pick your business type","text":"Tell KrabiClaw whether you run a restaurant, cafe or bar, or an experience, class or activity. This sets the layout and copy your site starts with.","url":"https://krabiclaw.com/dashboard/onboarding","image_asset_id":"8842b435-2b73-4641-b5ba-6b5e3a8afd88","position":0},
    {"name":"Choose how to add your details","text":"Paste your Google Maps link so KrabiClaw can pull your name, address, phone, hours, and photos automatically, or start manually by typing your business name.","url":"https://krabiclaw.com/dashboard/onboarding","image_asset_id":"c6e614bc-2223-44af-9cd1-0c9d0e19c2eb","position":1},
    {"name":"Confirm the match","text":"If you used Google Maps, KrabiClaw shows you what it found and asks you to confirm it is the right listing before using it.","url":"https://krabiclaw.com/dashboard/onboarding","image_asset_id":"b491fc85-ddf3-4e98-bcc0-b6e24354b469","position":2},
    {"name":"Fill in the details","text":"Review or fill in your name, city, address, phone, website, hours, a manager alert number, and your timezone. Anything you leave blank can be filled in later from the dashboard.","url":"https://krabiclaw.com/dashboard/onboarding","image_asset_id":"589a02b6-a58a-465f-ab3e-22b89faac018","position":3},
    {"name":"Publish and keep building","text":"Your site goes live immediately on a free krabiclaw.com address. From there, open your dashboard, keep building with ChowBot or the structured editor, or connect ChatGPT to manage it through conversation.","url":"https://krabiclaw.com/dashboard/onboarding","image_asset_id":"628f0450-70c6-4174-9b21-dda3b01ed1da","position":4}
  ],"estimated_time":"PT5M"}',
  datetime('now'),
  datetime('now')
);

DELETE FROM platform_content_components WHERE content_type = 'doc' AND content_id = 'doc-013';

INSERT INTO platform_content_components (id, content_type, content_id, type, position, label, status, render_enabled, schema_enabled, data_json, created_at, updated_at)
VALUES (
  'doc-013-howto',
  'doc',
  'doc-013',
  'how_to',
  1,
  'Launch your first KrabiClaw site',
  'active',
  1,
  1,
  '{"steps":[
    {"name":"Create a KrabiClaw account","text":"Go to [Create your account](/signup) and sign up. After signup, KrabiClaw sends you into onboarding so you can create your first site.","url":"https://krabiclaw.com/signup","position":0},
    {"name":"Add your local business info","text":"Open [Onboarding](/dashboard/onboarding) and choose one of the two supported setup paths: paste your Google Maps URL so KrabiClaw can draft the first version for you, or enter the business details manually. For the first publish, focus on the business name, short description, contact details, hours, main call to action, and your services, offerings, menu, or pricing.","url":"https://krabiclaw.com/dashboard/onboarding","position":1},
    {"name":"Deploy your website","text":"Review the first version of the site and publish it. For most businesses, the first live version should include a complete homepage, accurate business details, services or menu, pricing, images, and a contact or booking path. Keep the first launch simple, then improve it in small updates.","url":"https://krabiclaw.com/dashboard/onboarding","position":2}
  ],"estimated_time":"PT10M"}',
  datetime('now'),
  datetime('now')
);

INSERT INTO platform_content_components (id, content_type, content_id, type, position, label, status, render_enabled, schema_enabled, data_json, created_at, updated_at)
VALUES (
  'doc-013-faq',
  'doc',
  'doc-013',
  'faq',
  2,
  'Common questions',
  'active',
  1,
  1,
  '{"items":[
    {"question":"Do I need ChatGPT to use KrabiClaw?","answer":"No. You can create and manage your site from KrabiClaw alone. ChatGPT is an optional editing surface if you want to make changes through conversation.","position":0},
    {"question":"What should I publish first?","answer":"Publish the clearest useful version first: homepage, business details, services or menu, pricing, contact information, hours, and your main action such as booking or inquiry.","position":1},
    {"question":"Can I keep updating the site after it is live?","answer":"Yes. KrabiClaw is designed for ongoing updates. You can change pages, images, menus, pricing, hours, and business details after launch from ChatGPT or the dashboard.","position":2}
  ]}',
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-015',
  'What happens after onboarding',
  'after-onboarding',
  'Onboarding gets your name, address, hours, and contact details live. Almost everything else — your hero image, menu or experiences, your story, your first post, notification preferences, and your team — is left for you to fill in afterward, and KrabiClaw does not walk you through it as a wizard. Here is where each of those actually lives.

## The "Finish setting up with ChatGPT" checklist

Open your site''s dashboard at `/dashboard/{your-org}/sites/{your-site}` and you will see a card tracking five things: business info imported, hero image added, menu added (or experiences listed, for experience-vertical sites), an About section written, and a first post published.

![The post-onboarding checklist card](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/5d63ac03-69f6-45c7-8175-ae94f5fb1b00/public)

In practice, most new sites start at 4 of 5 — KrabiClaw seeds starter placeholder content for your menu, About section, and first post automatically, so usually only the hero image is genuinely empty. Worth checking the seeded text and replacing it with your own, even on items already checked off.

Each item has a copy-to-clipboard prompt, not an upload form — the checklist is built to feed ChatGPT or ChowBot, not to be filled in directly on the card. Click the clipboard icon, paste the prompt into ChatGPT (with the KrabiClaw app connected) or into ChowBot in your dashboard, and answer what it asks you. You can dismiss the card at any time; once dismissed or fully complete, a smaller "Quick actions" card with the same prompts stays in its place.

## Adding your hero image

The checklist prompt ("Generate a hero image for [your business]''s homepage") asks ChatGPT to generate one for you. If you would rather use your own photo, skip the prompt and upload it directly from the structured editor instead — open your site workspace, go to the page with your hero section, and upload from there.

## Inviting your team

Team invites are not part of any onboarding nudge — you go find them yourself, under **Settings → Members** (`/dashboard/{your-org}/~/settings/members`). From there you can see who already has access, invite someone by email with a Member or Admin role, and see pending invitations that have not been accepted yet.

![Inviting a team member from organization settings](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/1f356c74-89de-4946-62dd-98406faf8800/public)

## Changing your notification number

The manager alert number you set during onboarding is the only notification preference KrabiClaw asks for, and there is no separate notification settings page for it. To change it afterward, go to your location''s page at `/dashboard/{your-org}/sites/{your-site}/{your-location}` and update the manager alert number field there.

## Related guides

- [Use the onboarding flow](/docs/getting-started/onboarding)
- [Connect KrabiClaw to ChatGPT (MCP Setup)](/docs/integrations/mcp-setup)',
  'After onboarding, KrabiClaw nudges you to add a hero image, menu or experiences, your story, and a first post through a dashboard checklist — team invites and notification settings live elsewhere and are not part of any nudge.',
  'Getting Started',
  NULL,
  'What to do after KrabiClaw onboarding: the post-onboarding checklist, adding a hero image, inviting team members, and changing your notification number.',
  'KrabiClaw after onboarding, post onboarding checklist, invite team members, hero image, notification preferences',
  '/docs/getting-started/after-onboarding',
  'index, follow',
  'Beginner',
  2,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

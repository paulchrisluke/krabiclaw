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
  'Connect KrabiClaw to ChatGPT',
  'mcp-setup',
  '# Connect KrabiClaw to ChatGPT

Connect KrabiClaw to ChatGPT so you can manage your website, menus, media, locations, reviews, and work requests by conversation.

This takes about 5 minutes. Use ChatGPT in a web browser, not the mobile app.

## Before you start

Copy this exact server URL:

```text
https://krabiclaw.com/api/mcp
```

Do not open this URL in a browser tab. Paste it into ChatGPT''s Connection field when asked.

## 1. Open Advanced settings

Find the Advanced settings row in ChatGPT Apps or Connectors settings and tap it.

![Advanced settings row in ChatGPT settings](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/f848fb38-bbfb-47fe-c83c-cf0ce70bdd00/public)

## 2. Turn on Developer mode

Turn Developer mode on so the switch is blue, then tap Create app.

![Developer mode enabled with Create app button](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/ec7fb04a-da9d-44c6-3612-0842c5904000/public)

## 3. Create the KrabiClaw app

Fill in the app form like this:

| Field | What to enter |
|---|---|
| Name | `KrabiClaw` |
| Description | `Manage your KrabiClaw website.` |
| Connection | `https://krabiclaw.com/api/mcp` |
| Authentication | `OAuth` |

The important part is the Connection field. It must be exactly:

```text
https://krabiclaw.com/api/mcp
```

Use `https`, not `http`. Use `krabiclaw.com`, not your own website domain.

![New app form with KrabiClaw MCP server URL](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/5e59bfbb-9c54-4914-cf0e-b551ee5a8500/public)

## 4. Accept the warning and create

Scroll down, check the box that says you understand and want to continue, then tap Create.

![Custom MCP warning and Create button](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/05f000be-cfb0-4249-e358-5a83b4468e00/public)

## 5. Connect KrabiClaw

After the app is created, tap Connect on the KrabiClaw app page.

![KrabiClaw app page with Connect button](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/45a0b618-f9e9-4a77-8264-53204d6f3d00/public)

## 6. Sign in with KrabiClaw

Tap Sign in with KrabiClaw and sign in to your KrabiClaw account.

![Sign in with KrabiClaw screen](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/a0eff553-ef60-419a-6775-3cbe9b9ef100/public)

## 7. Approve access

Review what ChatGPT is allowed to access and tap Agree.

![KrabiClaw account access approval screen](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/b57038c4-0c20-4980-af17-ec2736079500/public)

## 8. Use KrabiClaw in ChatGPT

Open a new ChatGPT chat, tap the plus button, choose Plugins, then choose KrabiClaw and try asking "What tools do you have?"

![Plus button beside the ChatGPT message box](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/a068390b-4b28-4b5e-9901-f25d07f6e500/public)

![Plugins option in the ChatGPT attachment menu](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/de38068b-37bc-4a6a-1bf2-0b9ef0d25a00/public)

![KrabiClaw plugin selected in ChatGPT](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/59371233-b090-46c3-4b61-9e27f839cf00/public)

{{component type="how_to"}}

## Common problems

### I clicked the KrabiClaw server URL and got an error

That is normal. Do not open the server URL directly. Copy and paste https://krabiclaw.com/api/mcp into the ChatGPT Connection field instead.

### ChatGPT says the connection is wrong

Check three things: use https not http, use krabiclaw.com not your own site domain, and delete any extra spaces in the field and paste the URL again.

### I cannot find Developer mode or Create app

Use ChatGPT in a web browser at https://chatgpt.com/apps#settings/Connectors. If you are using the ChatGPT mobile app, switch to Chrome or Safari and sign in to ChatGPT there.

### I am on a different device

That is fine. Use any phone, tablet, or computer as long as you sign in to the same ChatGPT account.

### I created the app but cannot use it in chat

Open a new chat, tap the plus button, choose Plugins, then choose KrabiClaw. If KrabiClaw does not appear, go back to ChatGPT Apps or Connectors settings and make sure KrabiClaw is connected.

### I see a safety warning

That is expected. KrabiClaw uses ChatGPT developer mode because it can make real changes to your website. Only connect KrabiClaw if you trust the KrabiClaw account and website you are signing in to.

## What you are giving ChatGPT access to

When you approve the connection, KrabiClaw asks permission for ChatGPT to:

- Verify your identity.
- Read and update your site content, menus, and media.
- Manage locations, reviews, and Q&A.
- Submit and track work requests.

You can review or revoke access anytime from your KrabiClaw account settings.

## Technical notes

KrabiClaw connects to ChatGPT through MCP, the Model Context Protocol.

MCP server URL:

```text
https://krabiclaw.com/api/mcp
```

Authentication:

```text
OAuth
```

ChatGPT developer mode and MCP apps are beta features, so ChatGPT screens and wording may change over time. OpenAI''s current guidance says to use Settings -> Apps -> Advanced settings -> Developer mode, then create an app from the MCP server URL.',
  'Connect KrabiClaw to ChatGPT so you can manage your website through conversation with step-by-step setup instructions.',
  'Integrations',
  NULL,
  'Step-by-step guide to connect KrabiClaw to ChatGPT using the MCP server URL, with screenshots and troubleshooting tips.',
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
    {"question":"I clicked the KrabiClaw server URL and got an error","answer":"That is normal. Do not open the server URL directly. Copy and paste https://krabiclaw.com/api/mcp into the ChatGPT Connection field instead.","position":0},
    {"question":"ChatGPT says the connection is wrong","answer":"Check three things: use https not http, use krabiclaw.com not your own site domain, and delete any extra spaces in the field and paste the URL again.","position":1},
    {"question":"I cannot find Developer mode or Create app","answer":"Use ChatGPT in a web browser at https://chatgpt.com/apps#settings/Connectors. If you are using the ChatGPT mobile app, switch to Chrome or Safari and sign in to ChatGPT there.","position":2},
    {"question":"I am on a different device","answer":"That is fine. Use any phone, tablet, or computer as long as you sign in to the same ChatGPT account.","position":3},
    {"question":"I created the app but cannot use it in chat","answer":"Open a new chat, tap the plus button, choose Plugins, then choose KrabiClaw. If KrabiClaw does not appear, go back to ChatGPT Apps or Connectors settings and make sure KrabiClaw is connected.","position":4},
    {"question":"I see a safety warning","answer":"That is expected. KrabiClaw uses ChatGPT developer mode because it can make real changes to your website. Only connect KrabiClaw if you trust the KrabiClaw account and website you are signing in to.","position":5},
    {"question":"Can I disconnect ChatGPT later?","answer":"Yes. Open your KrabiClaw account settings and remove the connected app at any time.","position":6}
  ]}',
  datetime('now'),
  datetime('now')
);

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
    {"name":"Open Advanced settings","text":"Find the Advanced settings row in ChatGPT Apps or Connectors settings and tap it.","position":0,"image_public_url":"https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/f848fb38-bbfb-47fe-c83c-cf0ce70bdd00/public"},
    {"name":"Turn on Developer mode","text":"Turn Developer mode on so the switch is blue, then tap Create app.","position":1,"image_public_url":"https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/ec7fb04a-da9d-44c6-3612-0842c5904000/public"},
    {"name":"Create the KrabiClaw app","text":"Fill in the app form with Name: KrabiClaw, Description: Manage your KrabiClaw website, Connection: https://krabiclaw.com/api/mcp, Authentication: OAuth","position":2,"image_public_url":"https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/5e59bfbb-9c54-4914-cf0e-b551ee5a8500/public"},
    {"name":"Accept the warning and create","text":"Scroll down, check the box that says you understand and want to continue, then tap Create.","position":3,"image_public_url":"https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/05f000be-cfb0-4249-e358-5a83b4468e00/public"},
    {"name":"Connect KrabiClaw","text":"After the app is created, tap Connect on the KrabiClaw app page.","position":4,"image_public_url":"https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/45a0b618-f9e9-4a77-8264-53204d6f3d00/public"},
    {"name":"Sign in with KrabiClaw","text":"Tap Sign in with KrabiClaw and sign in to your KrabiClaw account.","position":5,"image_public_url":"https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/a0eff553-ef60-419a-6775-3cbe9b9ef100/public"},
    {"name":"Approve access","text":"Review what ChatGPT is allowed to access and tap Agree.","position":6,"image_public_url":"https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/b57038c4-0c20-4980-af17-ec2736079500/public"},
    {"name":"Use KrabiClaw in ChatGPT","text":"Open a new ChatGPT chat, tap the plus button, choose Plugins, then choose KrabiClaw and try asking \"What tools do you have?\"","position":7,"image_public_url":"https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/a068390b-4b28-4b5e-9901-f25d07f6e500/public"}
  ],"estimated_time":"PT5M"}',
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-013',
  'Getting started with KrabiClaw',
  'getting-started-with-krabiclaw',
  '# Getting started with KrabiClaw

Create your first KrabiClaw site, add your business details, choose how you want to manage it, and publish your first version.

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

That''s it — your details are saved as a private draft. Preview it, then commit to create your live site on a free krabiclaw.com address.

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

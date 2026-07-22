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

This takes about 5 minutes. Use ChatGPT in a web browser first to install and connect KrabiClaw. After that, you can use the same connected app in ChatGPT web or in the ChatGPT mobile apps on iPhone or Android.

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

Open a new ChatGPT chat on the web or in the mobile app, tap the plus button, choose Plugins, then choose KrabiClaw and try asking "What tools do you have?"

Once you have installed KrabiClaw on the web, the connected app is available in the same ChatGPT account on desktop and mobile.

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

### Can I use KrabiClaw in the ChatGPT mobile app?

Yes. Install and connect KrabiClaw in ChatGPT on the web first, then open the mobile app on the same account and start a new chat there.

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
    {"question":"Can I use KrabiClaw in the ChatGPT mobile app?","answer":"Yes. Install and connect KrabiClaw in ChatGPT on the web first, then open the mobile app on the same account and start a new chat there.","position":5},
    {"question":"I see a safety warning","answer":"That is expected. KrabiClaw uses ChatGPT developer mode because it can make real changes to your website. Only connect KrabiClaw if you trust the KrabiClaw account and website you are signing in to.","position":6},
    {"question":"Can I disconnect ChatGPT later?","answer":"Yes. Open your KrabiClaw account settings and remove the connected app at any time.","position":7}
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
    {"name":"Use KrabiClaw in ChatGPT","text":"Open a new ChatGPT chat on the web or in the mobile app, tap the plus button, choose Plugins, then choose KrabiClaw and try asking \"What tools do you have?\" Once you have installed KrabiClaw on the web, the connected app is available in the same ChatGPT account on desktop and mobile.","position":7,"image_public_url":"https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/a068390b-4b28-4b5e-9901-f25d07f6e500/public"}
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

If you want a deeper walkthrough of the setup flow itself, continue to [Deploy your site](/docs/getting-started/deploy-your-site).

## Add ChatGPT later

ChatGPT is optional. Your first job is to get the website live.

After the site exists, you can connect KrabiClaw to ChatGPT if you want to edit the site through conversation, ask for content changes, or use AI help for updates and planning.

- [Open KrabiClaw for ChatGPT](/plugin)

## Next steps

- [Deploy your site](/docs/getting-started/deploy-your-site)
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
  'Deploy your site',
  'deploy-your-site',
  'Deploying a site takes about 5 minutes. KrabiClaw asks a handful of questions, builds a private preview after you submit the details form, and only reserves your live address once you approve it.

![Onboarding welcome screen](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/1cea1097-025e-4d90-a82f-1ad8f86f0a00/public)

## Before you start

Have ready:

- Your business name
- Your Google Maps URL, if you have one
- Contact details (phone, address)
- Hours
- A website URL, if you already have one

## 1. Pick your business type

Open [onboarding](/dashboard/onboarding) and choose Restaurant, café or bar, or Experience, class or activity. This sets the layout and copy your site starts with — you cannot change it later without contacting support.

![Choosing a business type](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/f85cd2c3-0394-457e-f508-bed0bc891000/public)

## 2. Choose Google Maps or manual entry

![Choosing Google Maps or manual entry](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/6a75af3c-74dd-4a16-1fcf-c5c01bda4b00/public)

**Google Maps** — paste the full URL from your browser, or a short `maps.app.goo.gl` link. KrabiClaw looks up the listing and shows you the match before using it; pulls your name, address, phone, hours, and photos automatically.

**Manual** — type your business name and fill in the rest yourself. Use this if your business is not on Google Maps yet, or you would rather not connect it.

## 3. Fill in the details

Review or fill in your name, city, address, phone, website, hours, manager alert number, timezone, and currency. If you came from Google Maps, most fields are already filled in — fix anything that looks off.

![Business details form](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/3658852e-7519-4791-dc75-28e55aa02500/public)

Manager alert number, timezone, and currency are required on every path now, not just manual — a missing alert number used to silently degrade booking alerts to email-only with no warning, so KrabiClaw asks up front instead. Timezone and currency are pre-guessed from your browser and country; check them rather than leaving the defaults blind.

![Details form filled in with required fields](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/aaf6bc61-eb84-462f-5367-ac144f109600/public)

## 4. Review your draft, then create the site

Submitting the form does not go live yet — it saves a private draft and shows you a real preview of it first.

![Draft ready, with a private preview link](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/a86fa447-4453-460e-6c2c-73a8cfc05300/public)

Check the preview, then choose **Create site** to reserve your `krabiclaw.com` address and publish, or **Edit details** to go back first. Nothing is public until you choose Create site. This is a separate explicit commit step — onboarding only creates the draft.

## 5. Make it yours (optional)

Right after the site is created, KrabiClaw offers a quick pass at branding: a brand color, a logo, and a real hero photo. Skip it if you would rather do this later from ChatGPT or the dashboard — nothing here blocks your site from being live.

![Make it yours: brand color, logo, and hero photo](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/62a050af-22e2-43bf-bb2e-cdfc9fbf2b00/public)

## 6. You are live

Your site is published immediately once you create it. From here, open your dashboard, keep building with ChowBot or the structured editor, or connect ChatGPT to manage it through conversation.

![Setup complete with next-step options](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/770d9d26-3bee-4b2a-210b-91a53bbbd800/public)

{{component type="how_to"}}

## Common problems

### KrabiClaw could not find my business on Google Maps

Paste the full URL from your browser''s address bar rather than a search result link, or use a short `maps.app.goo.gl` link copied from the Maps app''s Share button. If your business genuinely is not listed yet, switch to manual entry instead.

### The Create site button stays disabled

Manager alert number, timezone, and currency are required before you can submit, on every path. Scroll the form for a field still showing red.

### I do not want to commit to a subdomain yet

You do not have to. After filling in details, you land on a private draft preview with no public address — review it, then choose Edit details to keep adjusting, or Create site only when you are ready to reserve the address for real.

### I skipped "Make it yours" — can I still add a logo and hero photo?

Yes. Nothing there is required to go live. Add them anytime from ChatGPT, ChowBot, or the structured editor in your dashboard.

## Related guides

- [Getting started with KrabiClaw](/docs/getting-started/getting-started-with-krabiclaw)
- [Customize your brand and theme](/docs/getting-started/customize-brand-theme)
- [Invite your team](/docs/getting-started/invite-your-team)
- [Set up notifications](/docs/getting-started/set-up-notifications)
- [Connect KrabiClaw to ChatGPT (MCP Setup)](/docs/integrations/mcp-setup)',
  'Deploy your first KrabiClaw site in about 5 minutes: pick a business type, add your details from Google Maps or manually, review a private draft, then go live.',
  'Getting Started',
  NULL,
  'Step-by-step guide to deploying a KrabiClaw site: business type, Google Maps or manual entry, the details form, draft preview, and going live.',
  'KrabiClaw onboarding, deploy website, website setup, business details, publish website, getting started',
  '/docs/getting-started/deploy-your-site',
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
  'Deploy your site',
  'active',
  1,
  1,
  '{"steps":[
    {"name":"Pick your business type","text":"Choose Restaurant, cafe or bar, or Experience, class or activity. This sets the layout and copy your site starts with.","url":"https://krabiclaw.com/dashboard/onboarding","image_asset_id":"d99df1a2-7999-4817-bf1c-88594284dcd4","position":0},
    {"name":"Choose Google Maps or manual entry","text":"Paste your Google Maps link so KrabiClaw can pull your name, address, phone, hours, and photos automatically, or start manually by typing your business name.","url":"https://krabiclaw.com/dashboard/onboarding","image_asset_id":"216f3103-5fd8-4e9a-8ade-7e550117b5e8","position":1},
    {"name":"Fill in the details","text":"Review or fill in your name, city, address, phone, website, hours. Manager alert number, timezone, and currency are required; other fields are optional.","url":"https://krabiclaw.com/dashboard/onboarding","image_asset_id":"572033d7-0fc1-4143-99fa-53283fb7d5bc","position":2},
    {"name":"Review your draft, then create the site","text":"Submitting saves a private draft with a real preview first. Choose Create site to go live, or Edit details to keep adjusting.","url":"https://krabiclaw.com/dashboard/onboarding","image_asset_id":"8d7cf0e6-b2d5-4b1f-bfe0-9dbf3af09b16","position":3},
    {"name":"Make it yours","text":"Optional: set a brand color, upload a logo, and add a real hero photo. Skip it and do this later if you would rather.","url":"https://krabiclaw.com/dashboard/onboarding","image_asset_id":"0d841791-9cda-44bb-bd49-dae270e8f485","position":4},
    {"name":"You are live","text":"Your site is published after you choose Create site. Open your dashboard, keep building with ChowBot or the structured editor, or connect ChatGPT.","url":"https://krabiclaw.com/dashboard/onboarding","image_asset_id":"717d66cc-9f1e-4639-bf91-3d91561586bb","position":5}
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

DELETE FROM platform_content_components WHERE content_type = 'doc' AND content_id = 'doc-015';
DELETE FROM platform_docs WHERE id = 'doc-015';

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-016',
  'Customize your brand and theme',
  'customize-brand-theme',
  'A new site starts with your real business details but a generic look — no logo, no real hero photo, and a default brand color. None of this blocks your site from being live; it is just what makes it look like yours instead of a template.

## 1. Open the brand essentials

If you skipped this during setup, open ChatGPT or ChowBot in your dashboard and ask to update your brand color, logo, or hero photo. Each can also be set directly from the structured editor in your site workspace.

![Make it yours: brand color, logo, and hero photo](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/62a050af-22e2-43bf-bb2e-cdfc9fbf2b00/public)

## 2. Set a brand color

Pick one of the preset swatches or use the color picker for a custom value. This color is used across your site''s buttons, accents, and the homepage hero treatment when no photo is set yet.

## 3. Upload a logo

Upload a logo file. It is used in your site header and anywhere else your brand mark appears.

## 4. Add a real hero photo

Until you add one, your homepage hero shows your brand color instead of a stock photo that is not actually yours — KrabiClaw never substitutes a generic stock image for your business. Upload your own photo here, or generate one by asking ChatGPT or ChowBot, for example "Generate a hero image for my homepage."

## Common problems

### My hero section is just a solid color

That is intentional, not a bug — until you add a real photo, the brand-color treatment is the placeholder, not a broken image. Upload a photo to replace it.

### I want a different look entirely, not just color and photos

Brand color, logo, and hero photo are the essentials covered here. For deeper page-by-page changes, use the structured editor in your dashboard or ask ChatGPT to make specific edits.

## Related guides

- [Deploy your site](/docs/getting-started/deploy-your-site)
- [Connect KrabiClaw to ChatGPT (MCP Setup)](/docs/integrations/mcp-setup)',
  'Set a brand color, upload a logo, and add a real hero photo so your KrabiClaw site looks like your business, not a template.',
  'Getting Started',
  NULL,
  'How to customize your KrabiClaw site''s brand color, logo, and hero photo after deploying.',
  'KrabiClaw branding, logo upload, hero photo, brand color, customize theme',
  '/docs/getting-started/customize-brand-theme',
  'index, follow',
  'Beginner',
  2,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-017',
  'Invite your team',
  'invite-your-team',
  'Team invites are not part of onboarding or any dashboard nudge — you go find them yourself, under organization settings.

## 1. Open Members

Go to **Settings → Members** (`/dashboard/{your-org}/settings/members`). You will see everyone who already has access, with their role.

![Inviting a team member from organization settings](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/1f356c74-89de-4946-62dd-98406faf8800/public)

## 2. Send an invite

Enter their email, pick a role — Member or Admin — and send the invite. They will need to accept it before they show up as a full member; until then you will see them under Pending Invitations.

## 3. Choose the right role

- **Owner** — the original account that created the organization. Cannot be changed here.
- **Admin** — full access to settings, billing, and content.
- **Member** — can edit content but not organization-level settings like billing.

## Common problems

### My invite is not showing as accepted

Check Pending Invitations on the same page. If it has expired, cancel it and send a new one.

### I need to remove someone

From the Members list, use the remove action next to their name. This does not apply to the Owner.

## Related guides

- [Deploy your site](/docs/getting-started/deploy-your-site)
- [Set up notifications](/docs/getting-started/set-up-notifications)',
  'Invite team members to your KrabiClaw organization from Settings → Members, and choose between Admin and Member roles.',
  'Getting Started',
  NULL,
  'How to invite team members to a KrabiClaw organization and choose their role.',
  'KrabiClaw team invite, organization members, admin role, member role',
  '/docs/getting-started/invite-your-team',
  'index, follow',
  'Beginner',
  3,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, status, published_at, created_at, updated_at)
VALUES (
  'doc-018',
  'Set up notifications',
  'set-up-notifications',
  'KrabiClaw alerts you about new bookings, messages, and reviews. By default that goes to your account email — no setup required. Add WhatsApp if you want alerts there too, and override the number for a specific location if it needs its own.

## 1. Open Site Settings

Go to `/dashboard/{your-org}/sites/{your-site}/settings` and find the Notifications card.

![Notification channel and site-wide WhatsApp number](https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/8a9b504e-efce-4b5d-ba84-f4a79a2e4700/public)

## 2. Choose your alert channel

Pick Email, WhatsApp, or both. Email always works and needs no number — it goes to the organization owner''s account address. WhatsApp requires a number below.

## 3. Set a site-wide WhatsApp number (optional)

This number is used for every location''s alerts unless that location sets its own number to override it. Use international format, for example `+66812345678`.

## 4. Override the number for one location (optional)

If a specific location needs its own alert number — a different manager, a different country — set it from that location''s settings page at `/dashboard/{your-org}/sites/{your-site}/locations/{your-location}/settings`, under **Notifications**. It falls back to the site-wide number above if left blank.

## Common problems

### I set a WhatsApp number but did not get an alert

Check that WhatsApp is actually selected as an alert channel — adding a number alone does not turn the channel on. Both need to be set.

### I want different alert numbers for different locations

Set a site-wide default in Site Settings, then override it in Location Settings. The location-level number always wins for that location.

### I never set anything — am I getting alerts at all?

Yes. Email is the default fallback and always sends to the organization owner''s account email, even with nothing configured here.

## Related guides

- [Deploy your site](/docs/getting-started/deploy-your-site)
- [Invite your team](/docs/getting-started/invite-your-team)',
  'Choose how KrabiClaw alerts you about new bookings, messages, and reviews — email by default, with an optional WhatsApp number you can override per location.',
  'Getting Started',
  NULL,
  'How to set up KrabiClaw notifications: choosing email or WhatsApp, setting a site-wide number, and overriding it per location.',
  'KrabiClaw notifications, WhatsApp alerts, email alerts, manager alert number, notification settings',
  '/docs/getting-started/set-up-notifications',
  'index, follow',
  'Beginner',
  4,
  'published',
  datetime('now'),
  datetime('now'),
  datetime('now')
);

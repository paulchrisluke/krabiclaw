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

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, created_at, updated_at)
VALUES (
  'doc-012',
  'Connect KrabiClaw to ChatGPT',
  'mcp-setup',
  '# Connect KrabiClaw to ChatGPT

Connect KrabiClaw as a custom ChatGPT MCP app to inspect and manage the sites your KrabiClaw account can access.

## Before you start

Use ChatGPT on the web and copy this public MCP endpoint:

```text
https://krabiclaw.com/api/mcp
```

The endpoint belongs in the custom app MCP server field. It is not a page to open directly.

## 1. Confirm workspace access

Custom MCP apps with write actions are available on ChatGPT web for Business and Enterprise/Edu workspaces.

- **Business:** a workspace admin or owner enables Developer mode, creates and tests the app, and publishes it to the workspace.
- **Enterprise/Edu:** an admin grants Developer mode through RBAC and controls access to the published app. Enabled members can then turn on Developer mode in their user settings and test apps.

## 2. Create the custom app

- **Admins and owners:** open **Workspace Settings → Apps → Create**.
- **Authorized users:** open **Settings → Apps → Create**.

Only an admin or owner can publish the app. Enter:

| Field | Value |
|---|---|
| Name | `KrabiClaw` |
| Description | `Manage your KrabiClaw website.` |
| MCP server URL | `https://krabiclaw.com/api/mcp` |

Create the app. ChatGPT discovers KrabiClaw OAuth authentication and tool metadata from the server. Review the discovered read and write tools before making the app available.

## 3. Review and authorize

A workspace admin or owner publishes the reviewed app to the intended workspace users. Those users choose Connect, sign in with their KrabiClaw account, and approve access. OAuth limits the connection to sites their account can manage.

## 4. Start a new conversation

Start a new ChatGPT conversation, select KrabiClaw from Apps, and try:

> List my KrabiClaw sites and summarize the homepage of the first one. Do not change anything.

ChatGPT may ask for confirmation based on the app permissions, action, and impact.

## Files and media

Attach photos with ChatGPT''s native attachment control. For every video, attach both the video and its poster image. If the poster is missing, the assistant asks you to attach it before uploading. Ask KrabiClaw to upload and place the attachments after they appear in the conversation. KrabiClaw does not provide a separate upload widget.

## Troubleshooting

- Confirm the endpoint uses `https`, the `krabiclaw.com` host, and the exact `/api/mcp` path.
- If metadata changed, recreate and republish the custom app, then start a new conversation. Business workspaces cannot currently update a published app in place.
- If Developer mode or Create is missing, confirm the ChatGPT plan, workspace role, RBAC grant, and Connected Data policy with a workspace admin.
- If authorization fails, disconnect KrabiClaw and connect again with the intended KrabiClaw account.

You can revoke the connection from your KrabiClaw connected-app settings at any time.',
  'Connect KrabiClaw to ChatGPT so you can manage your website through conversation with step-by-step setup instructions.',
  'Integrations',
  NULL,
  'Step-by-step guide to connect KrabiClaw to ChatGPT using the MCP server URL, with screenshots and troubleshooting tips.',
  'KrabiClaw MCP, connect ChatGPT, MCP server URL, ChatGPT connector setup, KrabiClaw ChatGPT integration',
  '/docs/integrations/mcp-setup',
  'index, follow',
  'Beginner',
  1,
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
    {"question":"I clicked the KrabiClaw server URL and got an error","answer":"That is normal. Do not open the server URL directly. Copy and paste https://krabiclaw.com/api/mcp into the custom app MCP server URL field instead.","position":0},
    {"question":"ChatGPT says the connection is wrong","answer":"Check three things: use https not http, use krabiclaw.com not your own site domain, and delete any extra spaces in the field and paste the URL again.","position":1},
    {"question":"I cannot find Developer mode","answer":"Ask a workspace admin to confirm your ChatGPT plan, role, RBAC grant, and the custom MCP app policy under Workspace Settings → Permissions & Roles → Connected Data. Authorized users enable Developer mode under Settings → Apps → Advanced Settings.","position":2},
    {"question":"I am on a different device","answer":"Use ChatGPT on the web. Custom MCP apps are not currently available in the mobile app.","position":3},
    {"question":"I created the app but cannot use it in chat","answer":"Confirm that an admin published it to your workspace access group, connect it from Apps, then start a new conversation and select KrabiClaw from Apps.","position":4},
    {"question":"Can I use KrabiClaw in the ChatGPT mobile app?","answer":"No. Custom MCP apps are currently available on ChatGPT web only.","position":5},
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
    {"name":"Enable developer access","text":"A workspace admin enables custom MCP apps under Workspace Settings → Permissions & Roles → Connected Data. Authorized users enable Developer mode under Settings → Apps → Advanced Settings.","position":0},
    {"name":"Create the custom app","text":"Open Workspace Settings → Apps → Create and enter https://krabiclaw.com/api/mcp as the MCP server URL.","position":1},
    {"name":"Review and authorize KrabiClaw","text":"Review the discovered read and write tools, publish the app to the intended users, connect, sign in with KrabiClaw, and approve OAuth access.","position":2},
    {"name":"Start a conversation","text":"Start a new conversation, select KrabiClaw from Apps, and begin with a read-only site request.","position":3}
  ],"estimated_time":"PT3M"}',
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, created_at, updated_at)
VALUES (
  'doc-013',
  'Getting started with KrabiClaw',
  'getting-started',
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
  '/docs/getting-started/getting-started',
  'index, follow',
  'Beginner',
  0,
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, created_at, updated_at)
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

- [Getting started with KrabiClaw](/docs/getting-started/getting-started)
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

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, created_at, updated_at)
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
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, created_at, updated_at)
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
  datetime('now'),
  datetime('now')
);

INSERT OR REPLACE INTO platform_docs (id, title, slug, body, excerpt, category, author_id, seo_description, seo_keywords, canonical_url, robots, difficulty_level, sort_order, created_at, updated_at)
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
  datetime('now'),
  datetime('now')
);

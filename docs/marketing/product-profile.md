# Krabiclaw marketing source of truth

Last verified: 2026-09-07. Use this file for directory listings, launch pages, press requests, social profiles, and reusable marketing copy. Update facts here before reusing them elsewhere.

## Product identity

| Field | Canonical value | Evidence / status |
|---|---|---|
| Product name | Krabiclaw | Product and repository name |
| Website | https://krabiclaw.com | Production platform site |
| Contact email | hello@krabiclaw.com | Cloudflare forwarding verified end to end on 2026-09-07 |
| Founder / listing owner | Paul Chris Luke | Repository history and signed-in directory profiles |
| Founder LinkedIn | https://www.linkedin.com/in/paulchrisluke/ | Supplied by the owner on 2026-09-07 |
| Start date | May 2026 | First repository commit that renamed the project to Krabiclaw: 2026-05-03 |
| Initial commitment | Full time | Confirmed by the owner on 2026-09-07 |
| Product type | Web SaaS | Product contract and pricing model |
| Business model | Freemium subscriptions | Free Starter plan and paid Growth plan in `PRODUCT.md` |
| Primary audience | Restaurants, experience operators, and professional-service businesses | `PRODUCT.md` |
| MCP endpoint | https://krabiclaw.com/api/mcp | `docs/mcp.md` |
| MCP registry name | io.github.paulchrisluke/krabiclaw | Published in the official MCP Registry |

The following founder facts still need an explicit owner decision before they are treated as canonical:

- Funding label: self funded or bootstrapped. Directory drafts currently use **Self Funded** where a choice is mandatory.
- Team size: directory drafts currently use **Solo Founder** and **No Employees**, based on the available repository and listing evidence.
- Founder skillset: directory drafts currently use **Founders Code**, based on repository authorship.

## Positioning

## Founder story

**Long version — About page, interviews, and launch posts**

```text
Krabiclaw grew out of a problem I first encountered during COVID. Restaurant owners and tour operators I knew suddenly needed online ordering, bookings, and dependable websites. We built an early open-source product to help them adapt quickly.

The software worked, but maintaining the websites did not scale. Many owners had no interest in learning another CMS—and they should not have needed to. They would send us photos of menus or new dishes, and we would visit their businesses to take more photos, organize the content, and update everything ourselves. We helped where we could, but that service-heavy model became impossible to maintain, so we eventually shut the product down.

AI changed what was possible. With ChatGPT and modern agent tools, restaurant owners could describe a new item or ask for a change in plain language to keep their website current.

I returned to the idea in May 2026 and built Krabiclaw. It helps restaurants, tour operators, and other local businesses manage content, bookings, inquiries, products, media, and translations through AI while preserving the fundamentals that make a website effective: fast performance, structured content, strong local SEO, accessible pages, and clear paths to conversion.

My name is Paul Chris Luke, and my background is in marketing. Krabiclaw combines that marketing discipline with a simpler way for business owners to maintain the information their customers depend on. The goal is straightforward: give local businesses a website that performs well without turning website administration into another job.
```

**Short version — directories and founder profiles**

```text
During COVID, restaurant owners and tour operators I knew urgently needed online ordering, bookings, and better websites. We built an early open-source product, but maintaining every menu, photo, and update for clients became impossible to scale. AI made the workflow owners already preferred practical: send a photo or describe a change, and let the system keep the website current. I returned to the idea in May 2026 and built Krabiclaw to combine conversational website management with fast performance, structured content, and strong local SEO.
```

**One-paragraph version — compact forms**

```text
Krabiclaw grew from an open-source product we built during COVID to help restaurants and tour operators add online ordering and bookings. The first version proved the need, but manually maintaining client menus, photos, and content did not scale. AI made the natural workflow possible: owners can send a photo or describe a change while Krabiclaw keeps an SEO-ready, high-performance website current.
```

Story chronology:

- COVID era: an early open-source predecessor helped restaurants and tour operators move ordering and bookings online.
- The predecessor was shut down because hands-on content maintenance could not scale.
- May 2026: Paul Chris Luke began the current Krabiclaw product after AI made conversational maintenance practical.
- Do not describe the COVID-era predecessor as the current Krabiclaw product or use the COVID period as Krabiclaw's start date.

**Short tagline**

```text
Build and manage local business websites with ChatGPT
```

**Alternative tagline under 60 characters**

```text
Manage your business website through AI conversation.
```

**Short description under 160 characters**

```text
Update your Krabiclaw website from ChatGPT: edit products, publish posts, manage media, and review inquiries and experience bookings.
```

**Directory description**

```text
Krabiclaw lets local business owners launch and manage multilingual websites through a dashboard or ChatGPT. Owners can update pages, products, menus, photos, translations, and posts, then review customer inquiries and bookings from the same permissioned business data.
```

**Founder motivation**

```text
Krabiclaw exists so restaurants and local businesses can keep a polished, multilingual website current without wrestling with a traditional CMS. Owners manage real website content, bookings, inquiries, products, experiences, media, translations, and analytics through ChatGPT, while the dashboard and assistant use the same permissioned business data.
```

## Calendar release content

Prepared on 2026-10-04 for PR #1240. Calendar and member availability are qualified
locally; this is not a production release announcement. Public Google OAuth
verification remains outstanding. Analytics is already approved, as confirmed by
the owner; the new verification demonstration concerns Calendar.

Public content remains in the platform organization's CMS (`organization_id:
platform`), edited through the ordinary MCP tools. The **Calendar and bookings**
docs category is `9ec9c29e-696e-41c3-b821-d41ce1232278`. The following articles were
created as private drafts and read back through MCP; their bodies are not copied
into repository documentation.

| Draft | CMS article ID |
| --- | --- |
| Connect Google Calendar | `241019f4-2176-4858-bfcd-92a11b0c461c` |
| Set your working hours | `3283d505-4d01-4beb-b665-dd317d159b17` |
| Add time off | `81fddbb6-4ecf-4361-833f-12fc6214c112` |
| Avoid double bookings with your personal calendar | `60033f23-c250-4a52-97b1-a7a1b2a9897e` |
| Choose who guests meet | `4dacfe5e-b8f4-41de-932b-a0d79b925b35` |
| Update your public profile | `3bbee519-d084-43f4-b159-689be788b055` |
| Manage your bookings | `1e9ee926-4794-4f93-aef2-f96edfb34f8f` |
| Make room for your next booking (blog) | `043d5238-1e65-42bd-baba-afbef1985843` |

Use short task titles, one clear outcome and numbered steps matching the actual
CMS labels. [Airbnb's Calendar and bookings topic](https://www.airbnb.com/help/topic/1330)
is the editorial reference. Explain our Google connection rather than copying
Airbnb's ICS import/export instructions or its two-way booking claims.

After deployment and release qualification, publish the guides and launch article
through MCP. Update the existing **Invite your team**, **Connect your accounts to
KrabiClaw**, and **What AI assistants can and cannot do** guides to include Member
self-service, Calendar connection and scheduling tools. Preserve their existing
content and media when editing.

Update the existing `/products` booking section to include services, working hours
and time off, with a link to the new category. The `/legal` capability sections
should offer native consultations alongside external intake. Keep the NCLS
showcase's Clio Grow description until that tenant's actual setup changes.
The shared pricing comparison adds **Team availability** for both plans; it
does not add Google availability claims before verification or alter Stripe's
paid marketing bullets. Review the existing privacy disclosure against the final
Calendar scopes and data handling before submitting verification.

## Classification

- Primary categories: Website Builder, Content Management System, AI, SaaS.
- Secondary categories: B2B, Marketing, No Code, Productivity.
- Platform: Web / Online / SaaS.
- Pricing label: Freemium or Paid with a free plan, depending on the directory vocabulary.
- Suggested alternatives: Squarespace, Webflow, Wix, BentoBox, and Toast where the directory permits meaningful comparisons.
- Do not claim that site or location setup happens in ChatGPT. Setup remains in the CMS.
- Do not claim public ChatGPT directory approval unless it has been verified separately.

## Approved assets

- Canonical logo source: `public/platform/krabiclaw-symbol.svg`. Every other logo file in the
  repository is generated from it and none of them is a second master.
- Square logo, 1024×1024: `docs/marketing/directory-assets/00-krabiclaw-logo-1024.png`, a derived
  distribution export of that source.
- Today's bookings, 1270×760: `docs/marketing/directory-assets/01-todays-bookings.png`
- Operations calendar, 1270×760: `docs/marketing/directory-assets/02-operations-calendar.png`
- Location content, 1270×760: `docs/marketing/directory-assets/03-location-content.png`
- Customer inbox, 1270×760: `docs/marketing/directory-assets/04-customer-inbox.png`

The screenshots use the populated Ember & Slice local fixture and direct owner authentication. They contain no impersonation UI.

## Evidence

- Product model and pricing: `PRODUCT.md`
- Domain language: `PRODUCT.md`
- MCP endpoint and boundaries: `docs/mcp.md`
- Start date evidence: commit `ec82d46a` on 2026-05-03, “Upgrade to Nuxt 4 and rename project”

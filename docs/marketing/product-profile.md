# KrabiClaw marketing source of truth

Last verified: 2026-09-07. Use this file for directory listings, launch pages, press requests, social profiles, and reusable marketing copy. Update facts here before reusing them elsewhere.

## Product identity

| Field | Canonical value | Evidence / status |
|---|---|---|
| Product name | KrabiClaw | Product and repository name |
| Website | https://krabiclaw.com | Production platform site |
| Contact email | hello@krabiclaw.com | Cloudflare forwarding verified end to end on 2026-09-07 |
| Founder / listing owner | Paul Chris Luke | Repository history and signed-in directory profiles |
| Founder LinkedIn | https://www.linkedin.com/in/paulchrisluke/ | Supplied by the owner on 2026-09-07 |
| Start date | May 2026 | First repository commit that renamed the project to KrabiClaw: 2026-05-03 |
| Initial commitment | Full time | Confirmed by the owner on 2026-09-07 |
| Product type | Web SaaS | Product contract and pricing model |
| Business model | Freemium subscriptions | Free Starter plan and paid Growth plan in `PRODUCT.md` |
| Primary audience | Restaurants, experience operators, and professional-service businesses | `PRODUCT.md` and `CONTEXT.md` |
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
KrabiClaw grew out of a problem I first encountered during COVID. Restaurant owners and tour operators I knew suddenly needed online ordering, bookings, and dependable websites. We built an early open-source product to help them adapt quickly.

The software worked, but maintaining the websites did not scale. Many owners had no interest in learning another CMS—and they should not have needed to. They would send us photos of menus or new dishes, and we would visit their businesses to take more photos, organize the content, and update everything ourselves. We helped where we could, but that service-heavy model became impossible to maintain, so we eventually shut the product down.

AI changed what was possible. With ChatGPT and modern agent tools, restaurant owners could describe a new item or ask for a change in plain language to keep their website current.

I returned to the idea in May 2026 and built KrabiClaw. It helps restaurants, tour operators, and other local businesses manage content, bookings, inquiries, products, media, and translations through AI while preserving the fundamentals that make a website effective: fast performance, structured content, strong local SEO, accessible pages, and clear paths to conversion.

My name is Paul Chris Luke, and my background is in marketing. KrabiClaw combines that marketing discipline with a simpler way for business owners to maintain the information their customers depend on. The goal is straightforward: give local businesses a website that performs well without turning website administration into another job.
```

**Short version — directories and founder profiles**

```text
During COVID, restaurant owners and tour operators I knew urgently needed online ordering, bookings, and better websites. We built an early open-source product, but maintaining every menu, photo, and update for clients became impossible to scale. AI made the workflow owners already preferred practical: send a photo or describe a change, and let the system keep the website current. I returned to the idea in May 2026 and built KrabiClaw to combine conversational website management with fast performance, structured content, and strong local SEO.
```

**One-paragraph version — compact forms**

```text
KrabiClaw grew from an open-source product we built during COVID to help restaurants and tour operators add online ordering and bookings. The first version proved the need, but manually maintaining client menus, photos, and content did not scale. AI made the natural workflow possible: owners can send a photo or describe a change while KrabiClaw keeps an SEO-ready, high-performance website current.
```

Story chronology:

- COVID era: an early open-source predecessor helped restaurants and tour operators move ordering and bookings online.
- The predecessor was shut down because hands-on content maintenance could not scale.
- May 2026: Paul Chris Luke began the current KrabiClaw product after AI made conversational maintenance practical.
- Do not describe the COVID-era predecessor as the current KrabiClaw product or use the COVID period as KrabiClaw's start date.

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
Update your KrabiClaw website from ChatGPT: edit products, publish posts, manage media, and review inquiries and experience bookings.
```

**Directory description**

```text
KrabiClaw lets local business owners launch and manage multilingual websites through a dashboard or ChatGPT. Owners can update pages, products, menus, photos, translations, and posts, then review customer inquiries and bookings from the same permissioned business data.
```

**Founder motivation**

```text
KrabiClaw exists so restaurants and local businesses can keep a polished, multilingual website current without wrestling with a traditional CMS. Owners manage real website content, bookings, inquiries, products, experiences, media, translations, and analytics through ChatGPT, while the dashboard and assistant use the same permissioned business data.
```

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

The screenshots use the populated Ember & Slice local fixture and direct owner authentication. They contain no impersonation UI. Do not use `krabi-claw-free.png`.

## Evidence

- Product model and pricing: `PRODUCT.md`
- Domain language: `PRODUCT.md`
- MCP endpoint and boundaries: `docs/mcp.md`
- Start date evidence: commit `ec82d46a` on 2026-05-03, “Upgrade to Nuxt 4 and rename project”

# KrabiClaw marketing source of truth

Source reconciliation: 2026-10-04 against staging `baa1bd2ee`, current PRODUCT.md, and owner-approved issue bodies #941/#939. This is a source review, not new runtime, listing, email-delivery or customer-outcome verification. Use this file for directory listings, launch pages, press requests, social profiles, and reusable marketing copy. Update facts here before reusing them elsewhere.

## Product identity

| Field | Canonical value | Evidence / status |
|---|---|---|
| Public company/product name | KrabiClaw | Owner-approved #941; runtime/repository identifiers retain their spelling |
| Website | https://krabiclaw.com | Production platform site |
| Contact email | hello@krabiclaw.com | Cloudflare forwarding verified end to end on 2026-09-07 |
| Founder / listing owner | Paul Chris Luke | Repository history and signed-in directory profiles |
| Founder LinkedIn | https://www.linkedin.com/in/paulchrisluke/ | Supplied by the owner on 2026-09-07 |
| Start date | May 2026 | First repository commit that renamed the project to KrabiClaw: 2026-05-03 |
| Initial commitment | Full time | Confirmed by the owner on 2026-09-07 |
| Product type | Web SaaS | Product contract and pricing model |
| Business model | Free Starter and paid subscription | PRODUCT.md; paid display name and prices belong to Stripe |
| Primary audience | Restaurants, experience operators, and professional-service businesses | `PRODUCT.md` and `CONTEXT.md` |
| MCP endpoint | https://krabiclaw.com/api/mcp | `docs/mcp.md` |
| MCP registry identity | io.github.paulchrisluke/krabiclaw | Historical listing; re-verify live status before reuse (#941) |

Owner-approved company facts ([#941](https://github.com/paulchrisluke/krabiclaw/issues/941), reviewed 2026-10-04): bootstrapped/self-funded; no outside investment to date; open to investment; Salt Lake City, Utah, USA; global from day one. Do not publish a street address for general marketing.

Public team: 4 people, founder + 3 employees. Use first names only: Paul — Founder & Product; Julia — Design & Customer Operations; Kaze — Payments Engineering; Rich — Legal Counsel & Office Cheerleader. Approved headshot links live in #941; do not infer biographies or surnames. Paul owns final launch approval, Julia creative approval, Kaze billing accuracy, and Rich legal/policy claims.

Public contacts approved in #941: hello@krabiclaw.com (general), privacy@krabiclaw.com, legal@krabiclaw.com. Product support uses `/help`; do not publish an unverified support mailbox or promise a support SLA. Contact approval is not fresh delivery verification.

## Positioning

KrabiClaw helps restaurants, experience operators and professional-service businesses keep their websites current through the dashboard and supported conversational clients, Claude and ChatGPT, using one MCP service. Site/location creation and domain setup remain in the CMS ([MCP contract](../mcp.md)). A supported client is not proof of public directory approval or a successful current session.

The next restaurant campaign should lead with a useful result: current menu information and clearer paths for customers, with less website administration. Show actual Kikuzuki dishes, menu or location information and explain the observed workflow. Keep the broader product positioning across all three verticals. Do not imply measured time savings, sales uplift, bookings or rankings without evidence and permission.

### Claims that remain unresolved

[PRODUCT.md](../../PRODUCT.md) owns current product policy; read its open decisions before any plan comparison. Paid names, amounts, currency and cadence come from the current `/api/billing/plans` Stripe-backed response, not this profile or an old snapshot. Never infer an annual amount, substitute an interval or turn missing data into zero. Starter is the free/no-subscription contract.

Review-request sending is currently paid, with the Free decision open. WhatsApp business notifications require paid messaging; authentication OTP is separate. Saya/Blawby provisioning and Growth marketing disagree. Community/Priority support copy does not establish a service promise. Do not publish settled comparison claims until these discrepancies are resolved. Customer GA4/Search Console integration, automatic social synchronization and ranking guarantees are not established by internal analytics or a tool name.

[#939](https://github.com/paulchrisluke/krabiclaw/issues/939) and #941 retain their approved-design/released-UI gates. This profile reconciliation does not approve final launch collateral, replace their design source, or complete either issue.

### Paul's voice

Style evidence inspected 2026-10-04: [multi-touch attribution](https://becominghuman.ai/multi-touch-attribution-in-digital-marketing-and-why-you-should-stop-caring-about-it-d246ef773990) (2019-01-04) and [Kirirom](https://medium.com/@PaulChrisLuke/building-the-tech-future-of-cambodia-in-a-national-park-kirirom-d05555e0f271) (2019-03-25). These establish writing habits, not current biographical facts or product results.

Start with a concrete observation, explain the mechanism, find the commercial opportunity, then connect it to people. The attribution piece moves from technical self-correction through burritos and a game analogy to the business outcome. Kirirom connects audience selection and revenue to education and protecting a place. Technology and money serve people.

Use first-person experience only when sourced; admit changed thinking when real. Food, everyday or pop-culture examples can make a mechanism tangible. Occasional self-deprecating asides should sound natural, not like mandatory jokes. Write connected conversational paragraphs; keep short-video scripts concise without reducing them to disconnected slogans. Avoid generic AI copy, architecture lists, invented anecdotes and unsupported personal opinions.

Illustrative draft cadence, not an approved testimonial or result: “A customer wants to know what’s on the menu. Show them the dish, the price, and where to find you. That’s useful work for a website.” Adapt to the actual captured facts and approved script.

## Founder story

**Long version — About page, interviews, and launch posts**

```text
KrabiClaw grew out of a problem I first encountered during COVID. Restaurant owners and tour operators I knew suddenly needed online ordering, bookings, and dependable websites. We built an early open-source product to help them adapt quickly.

The software worked, but maintaining the websites did not scale. Many owners had no interest in learning another CMS—and they should not have needed to. They would send us photos of menus or new dishes, and we would visit their businesses to take more photos, organize the content, and update everything ourselves. We helped where we could, but that service-heavy model became impossible to maintain, so we eventually shut the product down.

AI changed what was possible. With ChatGPT and modern agent tools, restaurant owners could describe a new item or ask for a change in plain language to keep their website current.

I returned to the idea in May 2026 and built KrabiClaw. It helps restaurants, tour operators, and other local businesses manage content, bookings, inquiries, products, media, and translations through AI while preserving the fundamentals that make a website effective: structured content, multilingual pages, and clear paths for customers.

My name is Paul Chris Luke, and my background is in marketing. KrabiClaw combines that marketing discipline with a simpler way for business owners to maintain the information their customers depend on. The goal is straightforward: give local businesses a website that performs well without turning website administration into another job.
```

**Short version — directories and founder profiles**

```text
During COVID, restaurant owners and tour operators I knew urgently needed online ordering, bookings, and better websites. We built an early open-source product, but maintaining every menu, photo, and update for clients became impossible to scale. AI made the workflow owners already preferred practical: send a photo or describe a change, and let the system keep the website current. I returned to the idea in May 2026 and built KrabiClaw to combine conversational website management with structured content and multilingual pages.
```

**One-paragraph version — compact forms**

```text
KrabiClaw grew from an open-source product we built during COVID to help restaurants and tour operators add online ordering and bookings. The first version proved the need, but manually maintaining client menus, photos, and content did not scale. AI made the natural workflow possible: owners can send a photo or describe a change while KrabiClaw keeps an structured, multilingual website current.
```

Story chronology:

- COVID era: an early open-source predecessor helped restaurants and tour operators move ordering and bookings online.
- The predecessor was shut down because hands-on content maintenance could not scale.
- May 2026: Paul Chris Luke began the current KrabiClaw product after AI made conversational maintenance practical.
- Do not describe the COVID-era predecessor as the current KrabiClaw product or use the COVID period as KrabiClaw's start date.

**Short tagline**

```text
Keep your business website current with KrabiClaw
```

**Alternative tagline under 60 characters**

```text
Manage your business website through AI conversation.
```

**Short description under 160 characters**

```text
Update your KrabiClaw website with Claude or ChatGPT: edit products, publish posts, manage media, and review inquiries and experience bookings.
```

**Directory description**

```text
KrabiClaw lets local business owners launch websites in the dashboard and manage existing content with Claude or ChatGPT. Owners can update pages, products, menus, photos, translations, and posts, then review customer inquiries and bookings from the same permissioned business data.
```

**Founder motivation**

```text
KrabiClaw exists so restaurants and local businesses can keep a polished, multilingual website current without wrestling with a traditional CMS. Owners manage real website content, bookings, inquiries, products, experiences, media, translations, and analytics through Claude or ChatGPT, while the dashboard and assistant use the same permissioned business data.
```

## Classification

- Primary categories: Website Builder, Content Management System, AI, SaaS.
- Secondary categories: B2B, Marketing, No Code, Productivity.
- Platform: Web / Online / SaaS.
- Pricing label: Freemium or Paid with a free plan, depending on the directory vocabulary.
- Suggested alternatives: Squarespace, Webflow, Wix, BentoBox, and Toast where the directory permits meaningful comparisons.
- Do not claim that site or location setup happens in Claude or ChatGPT. Setup remains in the CMS.
- Do not claim public ChatGPT directory approval unless it has been verified separately.

## Assets and customer-proof permissions

- Canonical logo source: `public/platform/krabiclaw-symbol.svg`. Every other logo file in the
  repository is generated from it and none of them is a second master.
- Square logo, 1024×1024: `docs/marketing/directory-assets/00-krabiclaw-logo-1024.png`, a derived
  distribution export of that source.
- Today's bookings, 1270×760: `docs/marketing/directory-assets/01-todays-bookings.png`
- Operations calendar, 1270×760: `docs/marketing/directory-assets/02-operations-calendar.png`
- Location content, 1270×760: `docs/marketing/directory-assets/03-location-content.png`
- Customer inbox, 1270×760: `docs/marketing/directory-assets/04-customer-inbox.png`

The directory screenshots are historical Ember & Slice local-fixture demonstrations with direct owner authentication, not Kikuzuki evidence or today's captured UI. Replacement final launch captures remain gated by #941.

| Source | Permission / provenance / status |
|---|---|
| `public/images/products` | Owner-approved reference-package assets; see [products overview](../product/products-overview.md) for provenance. Inspect before reuse; not new captures. NCLS is a website example, not proof of AI usage. |
| Kikuzuki, Pottery House Krabi, North Carolina Legal Services | #941 permits names and approved logos/screenshots. Exact testimonial wording needs customer approval; named-customer metrics need period, source and customer approval. No metric or testimonial is approved here. |
| [Good Taste website](https://krabiclaw.com/posts/good-taste) / [Instagram](https://www.instagram.com/reel/DeBUOXAAB8Y/) | Owner reports already published (#1253 and task instruction). Do not rebuild or repost as the pilot. Website retrieval failed during this source review; no new permalink readback claimed. |

Keep original captures immutable, with URL, tenant, environment, UTC time, viewport, state/revision and approval status in the run record or existing capture manifest. Label local demos, customer proof and generated illustration distinctly; keep sanitized derivatives separate. See the [marketing skill](../../.agents/skills/krabiclaw-marketing/SKILL.md) for the operating procedure.

## Evidence

- Product model and pricing: `PRODUCT.md`
- Domain language: `PRODUCT.md`
- MCP endpoint and boundaries: `docs/mcp.md`
- Start date evidence: commit `ec82d46a` on 2026-05-03, “Upgrade to Nuxt 4 and rename project”

## Implementation verification — 2026-10-04

This change refreshes sources and adds the repository skill; it does not complete the new-video acceptance run in #1253. Local Codex config specifies `gpt-6.1-sol` and `model_reasoning_effort = "low"`; the current turn's model selection was not independently observed. The new skill is not in this already-running executor's initial catalog; fresh repository-session discovery remains unverified. HyperFrames is not on PATH; no installation or render was attempted.

Flow browser verification advanced after the first Workspace account returned “Service Not Allowed.” The owner supplied the existing project URL, which opened the correct signed-in account without authentication changes. Account details → Manage avatar showed saved Me. Add ingredients → category Avatars → Me attached the likeness chip; literal `@me` text alone was insufficient. With separate owner authorization for exactly one output up to 15 credits, one private test used Omni 1.1 Flash, Ingredients, 9:16, 720p, 10s, x1. Quote and observed debit were 15 credits (1,050 → 1,035), with no retries/new uploads. Completed private asset: “Avatar speaking to camera”; its owner-session URL is retained only in local evidence. It is a distinct private workflow test, not a Good Taste rebuild.

Original download succeeded via More options → Download media → 720p Original size. Flow's success toast and local `Avatar_speaking_to_camera_20261004113946.mp4` reconciled a timed-out browser download-event waiter. Installed ffprobe verified H.264 720×1280, video 10s, AAC stereo 48kHz, container 10.005s; ffmpeg confirmed non-silent audio (mean -25.3dB, max -0.1dB). Playback and visible likeness were inspected. The agent did not hear audio, so exact speech, saved-voice fidelity, pronunciation, pacing and lip sync remain unverified. No generated footage or owner-avatar screenshot is committed or externally uploaded.

Still required for acceptance: approved new-video brief/script, authentic current product captures and provenance, listening review of the take, editable HyperFrames assembly, full export QA and owner-accessible deliverables. Any needed dependency installation/permissions and specific external upload destination require authorization; publication requires separate exact-content/target authorization. The single paid test's budget is exhausted. Do not close #1253 on partial verification.

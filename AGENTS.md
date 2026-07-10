# KrabiClaw — LLM Working Rules

When an internal API returns errors, nulls, or malformed data, fix the API contract/source of truth first. Do not add frontend fallbacks, guards, or workaround logic unless the API behavior is intentionally nullable and documented.

---

## Platform Strategy — Dual Surface

KrabiClaw supports **both** the ChatGPT MCP app and the dashboard/ChowBot surfaces.
Content creation and editing may flow through:

- The MCP server (`server/api/mcp.post.ts`)
- Dashboard CMS pages
- ChowBot in the dashboard
- ChowBot over WhatsApp where applicable

The dashboard is still the home for:

- Billing and plan management
- Organization settings: domains, members, general
- Inbox triage: contact submissions, reservations, reviews
- Work requests and support
- Analytics overview

ChowBot and dashboard CMS are supported product surfaces. Keep MCP and ChowBot aligned on the same backend source of truth; do not fork business logic or create shadow data models.

`server/utils/chowbot-media.ts` remains valid shared infrastructure for media-driven menu import. Rename it when refactoring if a better shared name becomes obvious.

**Image generation** uses ChatGPT's native `image_generation` Responses API tool.

- Model: `gpt-image-1` or `gpt-image-2`
- Do not use DALL-E
- Output is base64 in `image_generation_call.result`, but do NOT pass that base64 to MCP tools — OpenAI's safety scanner blocks tool calls carrying raw base64 image data
- MCP flow:
  1. Generate natively with `image_generation`
  2. Call `save_generated_image_file({ site_id, attachment_id: <file-reference>, prompt })` — pass the generated image as a file reference (not raw base64)
  3. Call `show_generated_images` with returned `assetId` and `publicUrl`

Canonical generated-image contracts:

- Native generation: `save_generated_image_file({ site_id, attachment_id, prompt })` — always use this after `image_generation`; passing base64 to `save_generated_image` is blocked by OpenAI safety checks
- Raw base64 (non-native, rare): `save_generated_image({ site_id, image_data_base64, prompt })`

Do not pass raw local file paths like `/mnt/data/...` to MCP tools.

Dashboard CMS pages remain supported. When changing editing behavior, prefer shared server/domain utilities so MCP, dashboard CMS, ChowBot, and WhatsApp all operate on the same canonical state.

---

## Database Schema Workflow

`server/db/schema.ts` (Drizzle ORM) is the **source of truth** for new schema changes. `migrations/0001_initial.sql` through `migrations/0007_*.sql` are historical, hand-authored, **already applied to every real environment (staging, production) and immutable** — never rename, edit, renumber, or re-squash them. From `0008` onward, migrations are _generated_ from `schema.ts` via `drizzle-kit generate` and applied via wrangler D1 migrations.

**Why the split:** `wrangler d1 migrations apply` tracks applied migrations by **filename**, not content/checksum. An environment that already ran `0001_initial.sql`...`0007_*.sql` has those exact filenames recorded — it has no idea a squashed `0000_something.sql` is "the same" schema. Renaming/squashing history that's already applied anywhere makes wrangler treat the new file as unapplied and try to re-run it, immediately failing with `table X already exists`. There is no clever flag around this; the only safe move is to never touch an already-applied filename and always add new migrations with higher numbers.

`migrations/meta/0007_snapshot.json` + `migrations/meta/_journal.json` are drizzle-kit's own bookkeeping — a snapshot of what `schema.ts` looks like as of migration `0007`, established once so `drizzle-kit generate` has something to diff against. **There is no `0007_snapshot.sql` file and there shouldn't be one** — the snapshot exists purely so future generates produce a small incremental diff instead of a full from-scratch recreation. Never hand-edit `migrations/meta/*` except when deliberately re-establishing this baseline.

1. Edit `server/db/schema.ts` by hand to make the schema change.
2. Run `yarn db:generate`.
3. `drizzle-kit generate` only emits what's declared in `schema.ts`.
4. Hand-append triggers or `CHECK` constraints to the generated migration if needed.
5. Run `yarn schema:local`.
6. Run `yarn drizzle:check`.
7. Never write ad-hoc SQL files in `scripts/` for schema changes.
8. Better Auth tables use camelCase. App tables use snake_case.
9. Any schema change must be checked against current server queries.
10. Never define `d1_migrations` in `schema.ts`.
11. After `db:generate`, wipe `.wrangler/state/v3/d1`, run `yarn schema:local`, then run the relevant seed command.

### D1 does not support raw transactions

Cloudflare D1 rejects `BEGIN`/`COMMIT`/`ROLLBACK` sent as raw SQL.

- Use `db.batch([...])` / `executeBatch()` when the full statement list is known up front.
- For write sequences that depend on intermediate reads, run statements sequentially and use compensating cleanup in `catch`.
- If a D1 write path wraps multiple statements in `BEGIN`/`COMMIT`, it is broken.

---

## Email & WhatsApp Notifications

`server/utils/notifications.ts` is the single dispatcher for every guest/owner notification. Email templates live in `server/emails/templates/*.ts`; WhatsApp bodies are built in `server/utils/whatsapp.ts`'s `TEMPLATES` map. `server/api/dev/notifications-preview.get.ts` renders `getNotificationCopyPreviews()` for dev-only review.

### Form parity rule

Every field a public form collects must appear in all surfaces for that flow:

- Owner email
- Guest email
- Owner WhatsApp

When adding or renaming a form field:

1. Update the DB insert/select in the relevant public route.
2. Thread it through the matching `*NotificationInput` interface.
3. Add it to every template for both new and cancelled states, owner and guest.
4. Update `getNotificationCopyPreviews()` fixture props.

No customer-facing WhatsApp exists for any flow. `sendWhatsAppNotification` is only called from `notifyOwner`.

### `EmailDetails.ts` Vue `h()` gotcha

For host/string tags, pass a direct array or string as the third `h()` argument. Do not pass a function child to native tags.

Correct:

```ts
h("tbody", null, rows);
```

Incorrect:

```ts
h("tbody", null, () => rows);
```

Function-as-slot is valid only for component references.

If touching `server/emails/`, render the template and inspect actual output. Typecheck and preview 200s do not prove the email is correct.

### WhatsApp templates are Meta-approved

The bodies in `server/utils/whatsapp.ts`'s `TEMPLATES` map must match approved templates in WhatsApp Business Manager for parameter count and order.

- Fetch the live template definition before changing parameters.
- Meta allows approved template edits at most once per 24 hours per template.
- If blocked by cooldown, pack extra data into an existing free-text parameter as a stopgap and track the real fix.

---

## Notification Testing And Live Sends

- Email and WhatsApp delivery modes are explicit:
  - `EMAIL_DELIVERY_MODE=log_only|provider`
  - `WHATSAPP_DELIVERY_MODE=log_only|provider`
- Missing, blank, or invalid mode must fall back to `log_only`.
- Local dev, preview, and staging should stay `log_only` unless a task explicitly requires a real provider send.
- Do not use production public forms as casual smoke tests.
- Production real-send paths include:
  - `POST /api/contact`
  - `/help` escalations submitted by `components/platform/PublicHelpChowBot.vue`
  - Tenant public contact, reservation, and experience-booking endpoints
- Preferred testing order:
  1. Read-only provider checks: `yarn canary:status`, `/api/canary/provider-status`
  2. Log-only tests in local, preview, or staging
  3. DB/log inspection: `notifications`, `submission_messages`, related submission tables
  4. Manual production real-send canaries with dedicated canary identities
- Use the manual GitHub Actions workflow `Production Real-Send Canaries` for temporary live email/WhatsApp verification.
- Do not trigger live production sends through ad hoc form submissions unless explicitly asked.

---

## CI / E2E Architecture

Three tiers exist:

### e2e-smoke

Runs on every PR.

1. Build
2. `yarn migrate:preview`, then seed `krabiclaw-db-preview`
3. `yarn deploy:preview:worker`
4. Run E2E against `preview.krabiclaw.com`

### e2e-staging

Runs on push to `staging`.

1. Build
2. `yarn migrate:staging`, then seed `krabiclaw-db-staging`
3. `yarn deploy:staging:worker`
4. Run E2E against `staging.krabiclaw.com`

### prod-deploy

Runs on push to `main`.

1. `yarn migrate:prod`, then `yarn deploy:prod:worker`
2. `prod-smoke` job runs afterward (needs: prod-deploy)
3. Production canaries run separately — gated behind `vars.ENABLE_REAL_SEND_TESTS` (real-send canaries) or the daily schedule (status-only canary)

### CI Environment Rules

- Cloudflare credentials are scoped only to Cloudflare steps.
- Never put `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` in top-level job `env:`.
- All E2E jobs require Stripe env vars.
- Remote staging seeds must be idempotent.
- Production smoke must not include intentionally disabled paid customer domains.
- `www.potteryhousekrabi.com` is intentionally disabled and excluded from `prod-smoke`.
- `pottery-house.krabiclaw.com` remains covered.

---

## Design System Enforcement

Nuxt UI is the default for dashboard/admin surfaces. Saya public, high-traffic surfaces should avoid Nuxt UI interactive components when they affect every tenant page load.

- Dashboard pages use:
  - `UCard`
  - `UPage`
  - `UPageBody`
- Dashboard pages do not use `UPageHeader`.
- Dashboard page content goes directly in `UPageBody`.
- Saya theme pages keep their raw layout shell and theme-specific components.
- On `components/saya/**`, prefer native `<button>`, `<NuxtLink>`, `<a>`, Tailwind classes, and inline SVG for always-rendered header/footer paths.
- Use `components/saya/SayaDropdown.vue` instead of `UDropdownMenu` on the Saya public surface.
- Before replacing more Nuxt UI on Saya public pages, re-measure with production build output through local `wrangler dev`.
- Do not de-Nuxt-UI-ify Saya wholesale without measurement.

### Public support carve-out

`/help` is a platform support surface, not part of the always-rendered tenant public shell. It may use Nuxt UI for ChowBot/chat interaction primitives, but keep that dependency route-scoped.

- Prefer plain SSR Vue + Tailwind for `/help` shell, hero, cards, and static chrome.
- Keep Nuxt UI confined to the chat island.
- Do not generalize this carve-out to Saya tenant pages or platform marketing routes.

### UCard Rules

UCard `:ui` prop only accepts:

- `root`
- `header`
- `title`
- `description`
- `body`
- `footer`

Use `class` for border, background, rounded, and shadow styling.

---

## Saya Empty States

Saya components never render a blank section or skeleton-only placeholder when content is missing.

- Core sections show filled examples:
  - Menu
  - Experiences
  - Locations
- Supplementary sections use low-key empty states:
  - Posts
  - Reviews
  - Q&A
- `config/saya-empty-states.ts` is the source of truth.
- `components/saya/SayaEmptyExample.vue` renders example cards.
- `components/saya/SayaMcpHint.vue` renders owner-only ChowBot prompt hints in dashboard edit mode.
- `config/content-registry.ts` `defaultValue` values must be generic and vertical-neutral.
- Never leak demo tenant identity into tenant fallback copy.

---

## Client Onboarding Pipeline

Use this for every new client:

```bash
yarn client:onboard \
  --slug pottery-house-krabi \
  --vertical experience \
  --maps-url "https://www.google.com/maps/place/Pottery+House+Krabi/..." \
  --maps-url "https://www.google.com/maps/place/Beachfront+Pottery+Krabi/..." \
  --images ./new-client-Pottery-House-Krabi \
  --live-url https://pottery-house.krabiclaw.com \
  --site-id site-pottery-house-krabi \
  --remote
```

Or:

```bash
yarn client:onboard --from client-intake/pottery-house-krabi.yml
```

No manual SQL. No ad-hoc seeds.

---

## LLM Operating Rule — Client Sites

Never manually seed, patch D1, invent client data, use stock images, leave tenant media on third-party hosts, or claim deployment success for a client site.

A site is not complete until `client:verify` passes and `client-handoff.md` is generated.

Required pipeline:

1. `client:import --dry-run`
2. Human review of `client-imports/<slug>/`
3. `client:import --approve`
4. `client:import --apply`
5. `client:verify`
6. `client:deploy`

If any step fails, fix the source of truth:

- API data
- Schema
- Theme copy

Do not add frontend workarounds.

---

## Pottery House Krabi Regression Case

These failures must never recur:

- Stock photos when client photos exist
- Restaurant copy on an experience vertical:
  - “Come dine with us”
  - “Reserve a table”
  - “From the kitchen”
- Saya fallback copy, including “Also part of Saya,” on any tenant page
- Wrong phone/email fallback from Saya demo data
- Experience detail route rendering the index page because of a Nuxt nested routing conflict
- Image 404s serving from `bootstrap` response
- Manual D1 mutations outside the approved `client:apply` path

Run fixture before merging PRs that touch `scripts/`, `components/saya/`, `pages/`, or `utils/vertical-copy.ts` (the same paths the `changes` job's `pottery_house` filter watches in `.github/workflows/ci.yml`):

```bash
yarn fixture:pottery-house --url http://localhost:3000 --site-id site-pottery-house
yarn fixture:pottery-house --url https://staging.krabiclaw.com --site-id site-pottery-house --slug pottery-house
```

Use live identifiers:

- Slug: `pottery-house`
- Site ID: `site-pottery-house`

---

## Custom Domains

Custom domain onboarding:

```http
POST /api/sites/[siteId]/domains
```

Dashboard route:

```text
/dashboard/[orgSlug]/~/settings/domains
```

Rules:

- `customers.krabiclaw.com` is the SaaS fallback origin.
- It must be `A 192.0.2.1` and proxied.
- Never make `customers.krabiclaw.com` a CNAME to `pages.dev` or `workers.dev`.
- Never make `customers.krabiclaw.com` a Worker Custom Domain.
- `*/*` Worker route in `wrangler.toml` is required.
- SSL validation must use direct TXT records at `_acme-challenge.www`.
- Do not use the DCV delegation CNAME `*.dcv.cloudflare.com`.
- After provisioning:
  - `site_domains.role = 'canonical'` for the custom domain
  - `site_domains.role = 'secondary'` for the krabiclaw subdomain

### DNS Instructions For Clients

1. `CNAME www → customers.krabiclaw.com`
2. `TXT _acme-challenge.www → <value1>`
3. `TXT _acme-challenge.www → <value2>`
4. Apex without `www`: use registrar HTTP forwarding:

```text
potteryhousekrabi.com → https://www.potteryhousekrabi.com
```

Do not touch DNS again until the cert issues. Every PATCH to the custom hostname rotates ACME tokens.

---

## Agent skills

### Issue tracker

PRDs and issues live in `paulchrisluke/krabiclaw` GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository using root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

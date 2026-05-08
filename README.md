# KIKUZUKI Thailand Marketing Website

A Nuxt 4 application for KIKUZUKI Japanese Restaurant in Krabi, Thailand. Deployed on **Cloudflare Pages** with a **D1 SQLite** database.

## Package Manager

**This project uses yarn.** Do not use npm or pnpm — they will generate conflicting lockfiles.

```bash
yarn install
```

## Architecture

- **Runtime**: Cloudflare Pages + Pages Functions (Nitro `cloudflare-pages` preset)
- **Database**: Cloudflare D1 (`REVIEWS_DB` binding — one database, all tables)
- **Auth**: better-auth with multi-tenant support running inside Pages Functions
- **Styling**: Tailwind CSS v3
- **Languages**: English, Thai, Japanese, Arabic (nuxt-i18n)

There is **no separate Worker** — everything runs as Pages Functions inside the same Cloudflare Pages project.

## Scripts

| Command | What it does |
|---|---|
| `yarn dev` | Nuxt dev server (localhost:3000, or next available port). **D1 bindings and Cloudflare context are available via `nitro-cloudflare-dev` — full local emulation, hot reload, no build step required.** |
| `yarn build` | Production build with `cloudflare_pages` preset → outputs to `dist/` |
| `yarn build:cf` | Alias for `nuxt build` (same preset) |
| `yarn deploy` | Build, patch the generated Cloudflare/Nitro process shim, and deploy `dist/` to Cloudflare Pages |
| `yarn preview` | Nuxt preview server |

## Local Development with D1

### 1. Database Setup (D1)

The project uses Cloudflare D1. The schema is consolidated in the root `schema.sql` file and applied directly with Wrangler.

```bash
# Apply the schema locally
yarn schema:local
```

> [!NOTE]
> Since this is a greenfield project, schema changes are consolidated in `schema.sql` instead of kept as numbered migration history.

### 2. Environment Variables

Create a `.env` file with the following (see `.env.example`):
- `BETTER_AUTH_SECRET`: Generate with `openssl rand -base64 32`
- `BETTER_AUTH_URL`: `http://localhost:8788` (for local dev)
- `GOOGLE_CLIENT_ID` / `SECRET`: From Google Cloud Console

### 3. Development Server (with D1)

For local development with D1 and Cloudflare emulation, just run:

```bash
yarn dev
```

The app will be available at `http://localhost:3000` (or the next available port). Hot reload is supported. D1 is available via `event.context.cloudflare.env.REVIEWS_DB`.

> [!NOTE]
> No build step or wrangler pages dev is needed for local dev. The `nitro-cloudflare-dev` module automatically reads your `wrangler.toml` and emulates bindings.

### EMFILE fix (macOS)

macOS defaults to 256 open files which crashes the watcher. Run this in your terminal before starting the dev server, or add it to your shell profile (`~/.zshrc`):

```bash
ulimit -n 65536
```

For a permanent fix (requires sudo, survives reboots):

```bash
sudo tee /Library/LaunchDaemons/limit.maxfiles.plist > /dev/null << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>limit.maxfiles</string>
    <key>ProgramArguments</key>
    <array>
      <string>launchctl</string><string>limit</string>
      <string>maxfiles</string><string>65536</string><string>200000</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>ServiceIPC</key><false/>
  </dict>
</plist>
EOF
sudo launchctl load -w /Library/LaunchDaemons/limit.maxfiles.plist
```

## Schema

All database structure lives in `schema.sql`. Edit that file directly when the app needs a table, column, index, or seed row change.

The schema keeps Better Auth's expected singular tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`) alongside KrabiClaw's app tables for sites, domains, content, Google Business, menus, reviews, and billing.

### Apply locally

```bash
yarn schema:local
```
## Seeding Demo Data (Local Only)

After applying the schema, if your database is empty (first setup or after reset), seed demo data:

```bash
npx wrangler d1 execute REVIEWS_DB --local --file scripts/seed-krabiclaw.sql
```

You only need to seed if you reset/drop the database or clear `.wrangler/state`. Seeding is not required for every server restart.

## Local Development Flows

### Fast Hot-Reload Dev (Recommended)

```bash
yarn dev
```

Runs Nuxt with `nitro-cloudflare-dev` for full Cloudflare emulation, D1 bindings, and hot reload. App available at http://localhost:3000 (or next available port).

### SSR/Edge Emulation (Cloudflare Pages Preview)

To test the actual Cloudflare Pages build and edge runtime:

```bash
yarn build
npx wrangler pages dev ./dist --local --port 8788
```

App available at http://localhost:8788

## Testing Auth/Login

- Open http://localhost:3000 (yarn dev) or http://localhost:8788 (wrangler pages dev)
- Use the login/signup button to start Google OAuth
- Or test directly: http://localhost:8788/api/auth/sign-in/social?provider=google

### Apply to production

```bash
yarn schema:remote
```

### Rebuild a greenfield database

For a fresh rebuild, clear the target database first, then apply `schema.sql`. Do not recreate numbered migration files for schema drift cleanup.

## Deployment

```bash
yarn deploy
```

`yarn deploy` runs the production build, applies the required generated-bundle patch for the current Nitro/Cloudflare `nodejs_compat_v2` process shim, then publishes `dist/` with Wrangler.

If deploying manually, run the same steps in order:

```bash
yarn build
perl -0pi -e 's/Reflect\\.get\\(g,r,s\\)/Reflect.get(g,r,g)/g' dist/_worker.js/chunks/nitro/nitro.mjs
npx wrangler pages deploy dist
```

Cloudflare Pages CI/CD will also trigger automatically on pushes to the connected branch.

## Environment Variables

Set these in Cloudflare Pages dashboard → Settings → Environment Variables.

```bash
# Google OAuth (admin login via better-auth)
NUXT_PUBLIC_GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Google Business API (auto-sync reviews/data)
GOOGLE_CLIENT_ID=
GOOGLE_BUSINESS_CLIENT_ID=
GOOGLE_BUSINESS_CLIENT_SECRET=
GOOGLE_BUSINESS_REDIRECT_URI=
GOOGLE_BUSINESS_ACCOUNT_ID=
GOOGLE_PUBSUB_TOPIC=

# Analytics
NUXT_PUBLIC_GA4_PROPERTY_ID=

# Cloudflare Turnstile (contact form bot protection)
NUXT_PUBLIC_TURNSTILE_SITE_KEY=

# Stripe (billing)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

For local development, copy `.env.example` to `.env`.

## Admin Panel

Access at `/admin` — requires Google OAuth sign-in via better-auth.

## Database Schema (summary)

- `schema.sql` — canonical source of truth for all D1 tables
- `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation` — Better Auth tables
- `google_business_connections` — per-organization Google Business connections
- `google_business_events` — queued Google Business notification events
- `business_locations` — synced location data
- `site_content` / `site_content_drafts` — CMS draft/publish workflow
- `staff_profiles` / `awards_recognition` — team and achievements content
- `sites` / `site_domains` / `site_config` — multi-tenant site and domain management
- `organization_billing` / `organization_entitlements` / `stripe_webhook_events` — billing and plan management
- `menus` / `menu_items` — restaurant menu management
- `reviews` — customer reviews with moderation status

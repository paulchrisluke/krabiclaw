# KIKUZUKI Thailand Marketing Website

A modern Nuxt 3 application for KIKUZUKI Japanese Restaurant in Krabi, Thailand. Features include content management system, Google Business integration, review management, and multi-language support.

## Features

- **Content Management System**: Draft/publish workflow with Shopify-style editing
- **Google Business Integration**: Auto-sync business data, reviews, and media
- **Multi-language Support**: English, Thai, Japanese, Arabic
- **Review Management**: Customer reviews with moderation
- **Staff & Awards Management**: Dynamic staff profiles and recognition
- **Analytics Integration**: Google Analytics 4 and Search Console
- **Responsive Design**: Mobile-first with Tailwind CSS

## Setup

Make sure to install the dependencies:

```bash
# yarn (recommended)
yarn install

# npm
npm install

# pnpm
pnpm install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# yarn
yarn dev

# npm
npm run dev

# pnpm
pnpm run dev

# bun
bun run dev
```

## Production

Build the application for production:

```bash
# yarn
yarn build

# npm
npm run build

# pnpm
pnpm run build

# bun
bun run build
```

## Deployment

### Cloudflare Pages (Recommended)

This application is configured for Cloudflare Pages deployment with D1 database:

```bash
# Build and deploy
yarn build
npx wrangler --cwd dist pages deploy
```

The Nuxt configuration automatically generates the required Wrangler configuration in `dist/_worker.js/wrangler.json`.

### Local Development with D1

For local development with the D1 database:

```bash
# Create local D1 database
npx wrangler d1 create kikuzuki-reviews

# Run migrations locally
npx wrangler d1 execute kikuzuki-reviews --local --file migrations/0001_reviews.sql
npx wrangler d1 execute kikuzuki-reviews --local --file migrations/0002_google_business_sync.sql
npx wrangler d1 execute kikuzuki-reviews --local --file migrations/0003_site_config.sql
npx wrangler d1 execute kikuzuki-reviews --local --file migrations/0004_content_management.sql
npx wrangler d1 execute kikuzuki-reviews --local --file migrations/0005_content_drafts.sql
npx wrangler d1 execute kikuzuki-reviews --local --file migrations/0006_content_schema_v2.sql

# Start local development with D1
npx wrangler dev
```

### Remote Database Management

For remote D1 database operations:

```bash
# Query remote database
npx wrangler d1 execute kikuzuki-reviews --remote --command "SELECT * FROM reviews LIMIT 10"

# Run migrations on remote
npx wrangler d1 execute kikuzuki-reviews --remote --file migrations/0004_content_management.sql
```

## Configuration

### Nuxt Configuration

The application uses Nuxt 3 with Cloudflare module preset. Key configurations in `nuxt.config.ts`:

- **D1 Database**: Configured via Nitro preset with automatic Wrangler config generation
- **Modules**: Google Analytics, robots.txt, sitemap, schema.org, i18n
- **SEO**: Multi-language support with proper meta tags and structured data
- **Components**: Auto-import from `components/ui`, `components/global`, `components/google`, `components/menu`

### Database Schema

The application uses D1 with these main tables:

- `site_content` - Published content with draft/publish workflow
- `site_content_drafts` - Draft content for admin editing
- `reviews` - Customer reviews with moderation
- `google_business_snapshots` - Synced Google Business data
- `staff_profiles` - Staff member management
- `awards_recognition` - Awards and achievements

### Environment Variables

Required environment variables:

```bash
# Google OAuth (for admin authentication)
NUXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Google Analytics
NUXT_PUBLIC_GA4_PROPERTY_ID=your_ga4_property_id

# Cloudflare Turnstile (optional)
NUXT_PUBLIC_TURNSTILE_SITE_KEY=your_turnstile_site_key
```

## Content Management

The CMS provides:

- **Draft/Publish Workflow**: Save drafts, preview changes, publish when ready
- **Field-based Editing**: Individual field editing with live preview
- **Google Business Integration**: Auto-sync business details, no manual override
- **Staff & Awards Management**: Dynamic content for team and achievements
- **Multi-language Support**: Content management across all supported languages

Access the admin panel at `/admin` (requires Google authentication).

## Architecture

- **Frontend**: Nuxt 3 with Vue 3 Composition API
- **Backend**: Nitro serverless functions on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Styling**: Tailwind CSS with custom components
- **Deployment**: Cloudflare Pages with automatic CI/CD

## Development Notes

- The application uses `useFetch` with proper SSR handling
- Content management uses session-based authentication (no query params needed)
- Google Business data is fetched and cached automatically
- All API endpoints include proper error handling and validation
- The codebase follows TypeScript best practices with proper typing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is proprietary software for KIKUZUKI Thailand.

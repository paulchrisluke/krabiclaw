export const HIGH_IMPACT_PATTERNS = [
  'app.vue', 'build/**', 'error.vue', 'nuxt.config.ts', 'patch.cjs',
  'playwright.config.ts', 'wrangler.toml', 'yarn.lock', 'migrations/**',
  'seed-definitions/**', 'server/db/schema.ts', 'server/middleware/**',
  'server/plugins/**', 'tests/e2e/helpers.ts', 'tests/e2e/helpers/**',
  'tests/e2e/test-env.ts', 'workers/**',
]

export const NON_RUNTIME_PATTERNS = [
  '**/*.md', '.agents/**', '.claude/**', '.codex/**',
  '.github/ISSUE_TEMPLATE/**', 'docs/**',
]

export const CORE_ONLY_PATTERNS = [
  '.github/**', 'config/e2e-impact-map.mjs', 'package.json',
  'scripts/run-preview-e2e.mjs', 'scripts/select-preview-e2e.mjs', 'tests/unit/**',
]

export const IMPACT_GROUPS = [
  {
    id: 'tenant-public',
    patterns: [
      'components/saya/**', 'components/blawby/**', 'components/blog/**',
      'components/content/**', 'components/menu/**', 'components/tenant-pages/**',
      'composables/loadPublicResourcePayload.ts', 'composables/usePublic*.ts',
      'layouts/saya.vue', 'layouts/blawby.vue', 'pages/[...tenantPath].vue',
      'pages/about.vue', 'pages/article/**', 'pages/blog/**', 'pages/contact/**',
      'pages/donate.vue', 'pages/experiences/**', 'pages/locations/**',
      'pages/menu/**', 'pages/photos.vue', 'pages/policies/**', 'pages/posts/**',
      'pages/pricing.vue', 'pages/qa.vue', 'pages/reservations/**', 'pages/reviews.vue',
      'pages/schedule.vue', 'pages/services/**',
      'server/middleware/public-resource-provider.ts', 'server/utils/public-*.ts',
      'server/utils/public*.ts', 'server/utils/site-i18n.ts',
      'server/utils/site-template.ts', 'scripts/generate-kikuzuki-seed.ts',
      'scripts/generate-pottery-house-seed.ts', 'scripts/generate-ncls-seed.ts',
      'seed-definitions/kikuzuki.ts', 'seed-definitions/pottery-house.ts',
      'seed-definitions/ncls.ts', 'utils/blawby-*.ts', 'utils/public-*.ts',
      'utils/tenant-page-blocks.ts', 'utils/vertical-copy.ts',
    ],
    specs: [
      'tests/e2e/tenant-rendering.spec.ts',
      'tests/e2e/tenant-client-navigation.spec.ts',
      'tests/e2e/tenant-localization.spec.ts',
    ],
  },
  {
    id: 'guest-journeys',
    patterns: [
      'components/booking/**', 'components/blawby/BlawbyContact.vue',
      'pages/contact/**', 'pages/experiences/**', 'pages/reservations/**',
      'server/api/public/sites/**/contact.post.ts',
      'server/api/public/sites/**/reservations*.ts',
      'server/api/public/sites/**/experiences/**', 'server/emails/**',
      'server/utils/booking-*.ts', 'server/utils/notifications.ts',
      'server/utils/whatsapp.ts',
    ],
    specs: ['tests/e2e/tenant-guest-journeys.spec.ts'],
  },
  {
    id: 'tenant-calendar',
    patterns: [
      'components/dashboard/AvailabilityCalendar.vue',
      'pages/dashboard/**/calendar.vue',
      'server/api/editor/sites/**/availability.*.ts',
      'server/utils/availability.ts',
    ],
    specs: ['tests/e2e/availability-calendar.spec.ts'],
  },
  {
    id: 'tenant-mcp',
    patterns: [
      'components/mcp/**', 'server/api/mcp.post.ts', 'server/api/mcp/**',
      'server/api/auth/oauth2/**', 'server/api/.well-known/**',
      'server/utils/mcp-*.ts', 'server/utils/mcp*.ts',
      'server/utils/conversational-*.ts', 'scripts/test-mcp-oauth.mjs',
    ],
    specs: [
      'tests/e2e/mcp-authorization.spec.ts',
      'tests/e2e/mcp-content.spec.ts',
      'tests/e2e/mcp-media.spec.ts',
      'tests/e2e/mcp-owner-tools.spec.ts',
      'tests/e2e/oauth-discovery.spec.ts',
    ],
  },
]

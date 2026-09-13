export const HIGH_IMPACT_PATTERNS = [
  'app.vue', 'build/**', 'error.vue', 'nuxt.config.ts', 'patch.cjs',
  'playwright.config.ts', 'wrangler.toml', 'yarn.lock', 'migrations/**',
  'server/db/schema.ts', 'server/middleware/**',
  'scripts/pull-production-snapshot.ts', 'scripts/provision-development-auth.ts',
  'config/development-auth-fixtures.ts',
  'server/plugins/**', 'tests/e2e/helpers.ts', 'tests/e2e/helpers/**',
  'tests/e2e/test-env.ts', 'workers/**',
]

export const NON_RUNTIME_PATTERNS = [
  '**/*.md', '.agents/**', '.claude/**', '.codex/**', '.coderabbit.yaml',
  '.github/ISSUE_TEMPLATE/**', 'docs/**',
  // Developer-machine gate over the CodeRabbit CLI; never bundled into the Worker.
  'scripts/coderabbit-gate.mjs',
]

export const CORE_ONLY_PATTERNS = [
  '.github/**', 'config/e2e-impact-map.mjs', 'package.json',
  'scripts/run-preview-e2e.mjs', 'scripts/select-preview-e2e.mjs',
  // Local-only sign-in convenience: no spec drives it, and it 404s wherever
  // dev routes are off. Other server/api/dev routes stay unclassified on purpose.
  'server/api/dev/login.get.ts', 'tests/unit/**',
]

export const IMPACT_GROUPS = [
  {
    id: 'platform-site',
    patterns: [
      'composables/useBlogNav.ts', 'composables/useDocsArticles.ts', 'components/blog/**', 'components/docs/**',
      'pages/blog/**', 'pages/docs/**', 'server/api/public/blog.get.ts', 'server/api/public/blog/**',
      'server/utils/content/publishing.ts', 'server/utils/platform-llm.ts', 'server/utils/platform-site.ts',
      'server/routes/blog/**', 'server/routes/blog-md/**', 'server/routes/docs/**', 'server/routes/docs-md/**',
      'utils/article-collections.ts', 'utils/blog-categories.ts', 'utils/docs-categories.ts', 'utils/tenant-blog-route.ts',
    ],
    specs: ['tests/e2e/platform-blog-ssr.spec.ts'],
  },
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
      'server/utils/site-template.ts', 'utils/blawby-*.ts', 'utils/public-*.ts',
      'utils/tenant-page-blocks.ts', 'utils/vertical-copy.ts',
    ],
    specs: [
      'tests/e2e/tenant-rendering.spec.ts',
      'tests/e2e/tenant-client-navigation.spec.ts',
      'tests/e2e/kikuzuki-localization.spec.ts',
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
      'server/domain/guest-threads/**',
      'server/api/dashboard/**/guest-threads/**',
      'server/utils/notification-*.ts',
    ],
    specs: ['tests/e2e/tenant-guest-journeys.spec.ts', 'tests/e2e/guest-thread-state.spec.ts'],
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
      'tests/e2e/mcp-product-large-batch.spec.ts',
      'tests/e2e/mcp-product-pricing.spec.ts',
      'tests/e2e/mcp-content.spec.ts',
      'tests/e2e/mcp-media.spec.ts',
      'tests/e2e/mcp-owner-tools.spec.ts',
      'tests/e2e/oauth-discovery.spec.ts',
    ],
  },
  {
    id: 'onboarding',
    patterns: [
      'pages/dashboard/onboarding.vue', 'pages/dashboard/onboarding/**',
      'lib/components/workspace/onboarding/**',
      'composables/useOnboardingFlow.ts', 'composables/useOnboardingDraft.ts',
      'pages/dashboard/**/locations/new.vue', 'server/api/dashboard/locations/add.post.ts',
      'server/api/dashboard/onboarding/**', 'server/api/sites.post.ts',
      'server/utils/onboarding-*.ts',
      'server/utils/site-creation.ts', 'server/utils/session-organization.ts',
      'server/utils/google-places.ts', 'server/utils/post-login-routing.ts',
      'server/utils/preview-token.ts', 'server/utils/tenant-deletion.ts',
      'server/api/user/delete-account.*.ts', 'server/api/dashboard/organizations/deletion.*.ts',
      'utils/phone.ts', 'utils/timezone.ts', 'utils/tenant-site-origin.ts',
    ],
    specs: [
      'tests/e2e/onboarding.spec.ts',
      'tests/e2e/post-login.spec.ts',
    ],
  },
  {
    id: 'billing-and-session',
    patterns: [
      'server/api/webhooks/**', 'server/utils/stripe*.ts', 'server/utils/billing*.ts',
      'server/utils/auth.ts', 'composables/useAuth*.ts', 'layouts/default.vue',
      'components/layout/**',
    ],
    specs: [
      'tests/e2e/provider-ingress.spec.ts',
      'tests/e2e/post-login.spec.ts',
    ],
  },

]

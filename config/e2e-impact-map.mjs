export const HIGH_IMPACT_PATTERNS = [
  'app.vue',
  'build/**',
  'error.vue',
  'nuxt.config.ts',
  'patch.cjs',
  'playwright.config.ts',
  'wrangler.toml',
  'yarn.lock',
  'migrations/**',
  'seed-definitions/**',
  'scripts/provision-e2e-auth.ts',
  'scripts/provision-staging-fixtures.ts',
  'scripts/reset-e2e-artifacts.ts',
  'server/db/schema.ts',
  'server/middleware/**',
  'server/plugins/**',
  'tests/e2e/helpers.ts',
  'tests/e2e/helpers/**',
  'tests/e2e/test-env.ts',
  'workers/**'
]

export const NON_RUNTIME_PATTERNS = [
  '**/*.md',
  '.agents/**',
  '.claude/**',
  '.codex/**',
  '.github/ISSUE_TEMPLATE/**',
  'docs/**'
]

export const CORE_ONLY_PATTERNS = [
  '.github/**',
  'config/e2e-impact-map.mjs',
  'package.json',
  'scripts/run-preview-e2e.mjs',
  'scripts/select-preview-e2e.mjs',
  'tests/unit/**'
]

export const IMPACT_GROUPS = [
  {
    id: 'saya-public',
    patterns: [
      'components/saya/**',
      'layouts/saya.vue',
      'pages/experiences/**',
      'pages/locations/**',
      'pages/menu/**',
      'pages/order.vue',
      'pages/photos.vue',
      'pages/posts/**',
      'pages/qa.vue',
      'pages/reservations/**',
      'pages/reviews.vue',
      'scripts/generate-kikuzuki-seed.ts',
      'scripts/generate-pottery-house-seed.ts',
      'utils/vertical-copy.ts'
    ],
    specs: [
      'tests/e2e/pottery-house.spec.ts',
      'tests/e2e/tenant-client-navigation.spec.ts'
    ]
  },
  {
    id: 'blawby-public',
    patterns: [
      'client-imports/north-carolina-legal-services/**',
      'components/blawby/**',
      'layouts/blawby.vue',
      'pages/article/**',
      'pages/donate.vue',
      'pages/policies/**',
      'pages/pricing.vue',
      'pages/schedule.vue',
      'pages/services/**',
      'scripts/generate-ncls-seed.ts',
      'seed-definitions/ncls.ts',
      'types/blawby.ts',
      'utils/blawby-*.ts'
    ],
    specs: [
      'tests/e2e/blawby.spec.ts',
      'tests/e2e/site-content-scopes.spec.ts'
    ]
  },
  {
    id: 'public-runtime',
    patterns: [
      'components/blog/**',
      'components/booking/**',
      'components/content/**',
      'components/menu/**',
      'components/platform/**',
      'components/tenant-pages/**',
      'components/ui/**',
      'composables/loadPublicResourcePayload.ts',
      'composables/usePublic*.ts',
      'layouts/default.vue',
      'pages/[...tenantPath].vue',
      'pages/about.vue',
      'pages/blog/**',
      'pages/contact/**',
      'pages/docs/**',
      'pages/features.vue',
      'pages/help.vue',
      'pages/index.vue',
      'pages/links.vue',
      'pages/plugin.vue',
      'pages/privacy.vue',
      'pages/templates/**',
      'pages/terms.vue',
      'pages/third-party-notices.vue',
      'server/api/public/**',
      'server/utils/public-*.ts',
      'server/utils/public*.ts',
      'server/utils/site-i18n.ts',
      'server/utils/site-template.ts',
      'scripts/generate-demo-bundle.ts',
      'scripts/generate-demo-seed.ts',
      'utils/public-*.ts',
      'utils/template-registry.ts'
    ],
    specs: [
      'tests/e2e/public.spec.ts',
      'tests/e2e/public-rendering-sentinel.spec.ts',
      'tests/e2e/seo.spec.ts'
    ]
  },
  {
    id: 'dashboard',
    patterns: [
      'components/dashboard/**',
      'components/workspace/**',
      'composables/dashboardFetch.ts',
      'composables/useDashboard*.ts',
      'composables/useEditor*.ts',
      'layouts/dashboard.vue',
      'layouts/editor.vue',
      'pages/account/**',
      'pages/admin/**',
      'pages/dashboard/**',
      'server/api/account/**',
      'server/api/admin/**',
      'server/api/dashboard/**',
      'server/api/editor/**',
      'server/utils/account-surface.ts',
      'server/utils/admin-*.ts',
      'server/utils/dashboard-*.ts',
      'server/utils/dashboard*.ts'
    ],
    specs: [
      'tests/e2e/dashboard.spec.ts',
      'tests/e2e/dashboard-workflows.spec.ts',
      'tests/e2e/search-command-modal.spec.ts',
      'tests/e2e/universal-cms.spec.ts'
    ]
  },
  {
    id: 'content-cms',
    patterns: [
      'components/workspace/blog/**',
      'components/workspace/content/**',
      'components/workspace/editor/**',
      'server/utils/blog-*.ts',
      'server/utils/content-*.ts',
      'server/utils/markdown-document.ts',
      'server/utils/tenant-pages*.ts',
      'server/utils/site-links.ts'
    ],
    specs: [
      'tests/e2e/blog-lifecycle.spec.ts',
      'tests/e2e/content-lifecycle.spec.ts',
      'tests/e2e/links-page.spec.ts',
      'tests/e2e/universal-cms.spec.ts'
    ]
  },
  {
    id: 'auth-access',
    patterns: [
      'components/auth/**',
      'config/e2e-auth-fixtures.ts',
      'middleware/auth*.ts',
      'pages/accept-invitation/**',
      'pages/forgot-password.vue',
      'pages/login.vue',
      'pages/oauth/**',
      'pages/reset-password.vue',
      'pages/signup.vue',
      'pages/transfer/**',
      'server/api/auth/**',
      'server/api/invitations/**',
      'server/api/site-transfer/**',
      'server/utils/auth*.ts',
      'server/utils/invitations.ts',
      'server/utils/member-access.ts',
      'server/utils/phone-invitations.ts',
      'server/utils/route-access.ts',
      'server/utils/site-transfer*.ts'
    ],
    specs: [
      'tests/e2e/admin-impersonation.spec.ts',
      'tests/e2e/local-access.spec.ts',
      'tests/e2e/oauth-discovery.spec.ts',
      'tests/e2e/role-matrix.spec.ts',
      'tests/e2e/site-transfer.spec.ts'
    ]
  },
  {
    id: 'billing',
    patterns: [
      'components/billing/**',
      'pages/billing.vue',
      'server/api/billing/**',
      'server/utils/better-auth-stripe.ts',
      'server/utils/billing*.ts',
      'server/utils/organization-billing.ts',
      'server/utils/stripe-*.ts',
      'server/utils/stripe*.ts'
    ],
    specs: [
      'tests/e2e/billing.spec.ts',
      'tests/e2e/billing-webhook.spec.ts',
      'tests/e2e/billing-webhook-signed.spec.ts'
    ]
  },
  {
    id: 'mcp-chowbot',
    patterns: [
      'components/chowbot/**',
      'components/conversation/**',
      'components/workspace/dashboard/ChowBot.vue',
      'composables/useChowBot*.ts',
      'composables/useChowbot*.ts',
      'server/api/mcp.post.ts',
      'server/api/mcp/**',
      'server/utils/chowbot-*.ts',
      'server/utils/conversational-*.ts',
      'server/utils/mcp-*.ts',
      'server/utils/mcp*.ts',
      'server/utils/platform-mcp-*.ts',
      'server/utils/platform-mcp*.ts'
    ],
    specs: [
      'tests/e2e/chowbot-tools.spec.ts',
      'tests/e2e/mcp-authorization.spec.ts',
      'tests/e2e/mcp-content.spec.ts',
      'tests/e2e/mcp-media.spec.ts',
      'tests/e2e/mcp-owner-tools.spec.ts',
      'tests/e2e/oauth-discovery.spec.ts'
    ]
  },
  {
    id: 'notifications-inbox',
    patterns: [
      'components/workspace/inbox/**',
      'server/api/email/**',
      'server/api/whatsapp/**',
      'server/emails/**',
      'server/utils/domain-notifications.ts',
      'server/utils/email-*.ts',
      'server/utils/notification*.ts',
      'server/utils/notifications.ts',
      'server/utils/reply-*.ts',
      'server/utils/submission-messages.ts',
      'server/utils/whatsapp*.ts'
    ],
    specs: [
      'tests/e2e/notifications.spec.ts',
      'tests/e2e/reply-threading.spec.ts',
      'tests/e2e/review-contract.spec.ts'
    ]
  },
  {
    id: 'onboarding-sites',
    patterns: [
      'components/workspace/onboarding/**',
      'components/workspace/settings/**',
      'pages/dashboard/onboarding.vue',
      'pages/tenant-setup-*.vue',
      'server/api/sites.post.ts',
      'server/api/sites/**',
      'server/utils/domains.ts',
      'server/utils/onboarding-*.ts',
      'server/utils/site-config.ts',
      'server/utils/site-creation.ts',
      'server/utils/site-settings.ts'
    ],
    specs: [
      'tests/e2e/onboarding-wizard.spec.ts',
      'tests/e2e/site-creation.spec.ts',
      'tests/e2e/site-settings.spec.ts'
    ]
  },
  {
    id: 'media-seo',
    patterns: [
      'components/workspace/media/**',
      'server/middleware/00.r2-media.ts',
      'server/plugins/tenant-sitemap-filter.ts',
      'server/utils/cloudflare-images.ts',
      'server/utils/cloudflare-r2.ts',
      'server/utils/favicon-*.ts',
      'server/utils/media-*.ts',
      'server/utils/og-image/**',
      'server/utils/seo-policy.ts',
      'server/utils/tenant-favicon.ts'
    ],
    specs: [
      'tests/e2e/mcp-media.spec.ts',
      'tests/e2e/og-image.spec.ts',
      'tests/e2e/seo.spec.ts',
      'tests/e2e/tenant-favicons.spec.ts'
    ]
  }
]

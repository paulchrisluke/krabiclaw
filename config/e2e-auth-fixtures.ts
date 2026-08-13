export interface E2eAuthFixture {
  id: string
  name: string
  email: string
  platformRole?: 'user' | 'admin'
  memberships?: Array<{
    organizationId: string
    role: 'owner' | 'admin' | 'editor' | 'member'
  }>
  siteIds?: string[]
}

export const E2E_AUTH_FIXTURES: readonly E2eAuthFixture[] = [
  {
    id: 'user-e2e-demo-owner',
    name: 'E2E Demo Owner',
    email: 'demo-owner@playwright.example',
    memberships: [{ organizationId: 'org-demo', role: 'owner' }],
  },
  {
    id: 'user-e2e-pottery-owner',
    name: 'E2E Pottery Owner',
    email: 'pottery-owner@playwright.example',
    memberships: [{ organizationId: 'org-pottery-house', role: 'owner' }],
  },
  {
    id: 'user-e2e-kikuzuki-owner',
    name: 'E2E Kikuzuki Owner',
    email: 'kikuzuki-owner@playwright.example',
    memberships: [{ organizationId: 'org-kikuzuki', role: 'owner' }],
  },
  {
    id: 'user-e2e-ncls-owner',
    name: 'E2E NCLS Owner',
    email: 'ncls-owner@playwright.example',
    memberships: [{ organizationId: 'org-ncls-blawby', role: 'owner' }],
  },
  {
    id: 'user-e2e-pottery-editor',
    name: 'E2E Pottery Editor',
    email: 'pottery-editor@playwright.example',
    memberships: [{ organizationId: 'org-pottery-house', role: 'editor' }],
    siteIds: ['site-pottery-house'],
  },
  {
    id: 'user-e2e-demo-editor',
    name: 'E2E Demo Editor',
    email: 'demo-editor@playwright.example',
    memberships: [{ organizationId: 'org-demo', role: 'editor' }],
    siteIds: ['site-demo'],
  },
  {
    id: 'user-e2e-platform-admin',
    name: 'E2E Platform Admin',
    email: 'platform-admin@playwright.example',
    platformRole: 'admin',
  },
  {
    id: 'user-e2e-transfer-recipient',
    name: 'E2E Transfer Recipient',
    email: 'transfer-recipient@playwright.example',
    memberships: [{ organizationId: 'org-transfer-recipient', role: 'owner' }],
  },
  {
    id: 'user-e2e-growth-owner',
    name: 'E2E Growth Owner',
    email: 'growth-owner@playwright.example',
    memberships: [{ organizationId: 'org-mcp-growth', role: 'owner' }],
  },
  {
    id: 'user-e2e-growth-service-owner',
    name: 'E2E Growth Service Owner',
    email: 'growth-service-owner@playwright.example',
    memberships: [{ organizationId: 'org-mcp-growth-service', role: 'owner' }],
  },
  {
    id: 'user-e2e-free-owner',
    name: 'E2E Free Owner',
    email: 'free-owner@playwright.example',
    memberships: [{ organizationId: 'org-mcp-free', role: 'owner' }],
  },
  ...[
    'dashboard-contact',
    'dashboard-org-pages',
    'dashboard-outsider',
    'site-creation-vertical',
    'site-creation-multiple',
    'site-creation-professional',
    'site-creation-saya',
    'site-settings',
    'smoke',
    'onboarding',
    'onboarding-professional',
    'onboarding-retry',
    'oauth-cimd',
    'oauth-private-cimd',
    'content-growth',
    'role-owner',
    'mcp-owner-a',
    'mcp-owner-b',
    'mcp-owner-c',
    'chowbot-owner',
    'review-editor',
    'mcp-editor-a',
    'mcp-editor-b',
    'chowbot-admin',
    'chowbot-editor',
    ...[
      'media',
      'visibility',
      'inaccessible',
      'wrong-site',
      'cross-a',
      'cross-b',
      'owner-reply',
      'editor-owner',
    ].map(key => `mcp-fresh-${key}`),
    ...[
      'delete-post',
      'update-settings',
      'location-qa',
      'menu',
      'role-entitlement',
      'locales',
      'shared-tools',
      'page',
    ].map(key => `chowbot-${key}`),
  ].map((key) => ({
    id: `user-e2e-${key}`,
    name: `E2E ${key.replaceAll('-', ' ')}`,
    email: `${key}@playwright.example`,
  })),
  {
    id: 'user-e2e-role-admin',
    name: 'E2E role admin',
    email: 'role-admin@playwright.example',
    memberships: [{ organizationId: 'org-demo', role: 'admin' }],
  },
  {
    id: 'user-e2e-role-editor',
    name: 'E2E role editor',
    email: 'role-editor@playwright.example',
    memberships: [{ organizationId: 'org-demo', role: 'editor' }],
    siteIds: ['site-demo'],
  },
  {
    id: 'user-e2e-role-member',
    name: 'E2E role member',
    email: 'role-member@playwright.example',
    memberships: [{ organizationId: 'org-demo', role: 'member' }],
  },
]

export const DEFAULT_E2E_USER_ID = 'user-e2e-demo-owner'

export function findE2eAuthFixture(userId = DEFAULT_E2E_USER_ID): E2eAuthFixture {
  const fixture = E2E_AUTH_FIXTURES.find(candidate => candidate.id === userId)
  if (!fixture) {
    throw new Error(`No credentialed E2E fixture is registered for user ${userId}`)
  }
  return fixture
}

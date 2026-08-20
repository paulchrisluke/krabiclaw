export interface E2eAuthFixture {
  id: string
  name: string
  email: string
  phoneNumber?: string
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
    id: 'user-e2e-pottery-editor',
    name: 'E2E Pottery Editor',
    email: 'pottery-editor@playwright.example',
    memberships: [{ organizationId: 'org-pottery-house', role: 'editor' }],
    siteIds: ['site-pottery-house'],
  },
  {
    id: 'user-e2e-pottery-owner',
    name: 'E2E Pottery Owner',
    email: 'pottery-owner@playwright.example',
    phoneNumber: '+447464115465',
    memberships: [{ organizationId: 'org-pottery-house', role: 'owner' }],
  },
  {
    id: 'user-e2e-pottery-location-owner',
    name: 'E2E Pottery Location Owner',
    email: 'pottery-location-owner@playwright.example',
    phoneNumber: '+66817794877',
    memberships: [{ organizationId: 'org-pottery-house', role: 'owner' }],
  },
  {
    id: 'user-e2e-kikuzuki-owner',
    name: 'E2E Kikuzuki Owner',
    email: 'kikuzuki-owner@playwright.example',
    phoneNumber: '+66952932112',
    memberships: [{ organizationId: 'org-kikuzuki', role: 'owner' }],
  },
  {
    id: 'user-e2e-ncls-owner',
    name: 'E2E NCLS Owner',
    email: 'ncls-owner@playwright.example',
    memberships: [{ organizationId: 'org-ncls-blawby', role: 'owner' }],
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
    'oauth-cimd',
    'oauth-private-cimd',
    ...[
      'media',
      'inaccessible',
      'wrong-site',
      'cross-a',
      'cross-b',
      'owner-reply',
    ].map(key => `mcp-fresh-${key}`),
  ].map((key) => ({
    id: `user-e2e-${key}`,
    name: `E2E ${key.replaceAll('-', ' ')}`,
    email: `${key}@playwright.example`,
  })),
]

export const DEFAULT_E2E_USER_ID = 'user-e2e-demo-owner'

export function findE2eAuthFixture(userId = DEFAULT_E2E_USER_ID): E2eAuthFixture {
  const fixture = E2E_AUTH_FIXTURES.find(candidate => candidate.id === userId)
  if (!fixture) {
    throw new Error(`No credentialed E2E fixture is registered for user ${userId}`)
  }
  return fixture
}

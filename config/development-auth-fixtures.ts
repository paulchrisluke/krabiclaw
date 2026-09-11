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

// Phone numbers come from Ofcom's reserved drama range (+44 7700 900000-900999),
// which is never assigned to a real subscriber. These were previously real
// customer numbers copied out of production, which collided on user.phoneNumber
// the moment a developer database held real rows.
export const E2E_AUTH_FIXTURES: readonly E2eAuthFixture[] = [
  {
    id: 'user-e2e-platform-admin',
    name: 'E2E Platform Admin',
    email: 'platform-admin@playwright.example',
    platformRole: 'admin',
  },
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
    memberships: [{ organizationId: 'org-user-pottery-house', role: 'editor' }],
    siteIds: ['site-pottery-house'],
  },
  {
    id: 'user-e2e-pottery-owner',
    name: 'E2E Pottery Owner',
    email: 'pottery-owner@playwright.example',
    phoneNumber: '+447700900001',
    memberships: [{ organizationId: 'org-user-pottery-house', role: 'owner' }],
  },
  {
    id: 'user-e2e-pottery-location-owner',
    name: 'E2E Pottery Location Owner',
    email: 'pottery-location-owner@playwright.example',
    phoneNumber: '+447700900002',
    memberships: [{ organizationId: 'org-user-pottery-house', role: 'owner' }],
  },
  {
    id: 'user-e2e-kikuzuki-owner',
    name: 'E2E Kikuzuki Owner',
    email: 'kikuzuki-owner@playwright.example',
    phoneNumber: '+447700900003',
    memberships: [{ organizationId: 'org-bVY8SxxUuG6Ctk2CQnfCk8T2cPsj4jJX', role: 'owner' }],
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
    // Drives the new-site wizard end to end; every run leaves it owning one more
    // organization, which reset-e2e-artifacts sweeps as a non-fixture org.
    'onboarding-wizard',
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

export const LOCAL_DEVELOPER_AUTH_FIXTURE: E2eAuthFixture = {
  id: 'user-local-developer',
  name: 'Local Developer',
  email: 'developer@playwright.example',
  platformRole: 'admin',
  memberships: [
    { organizationId: 'org-demo', role: 'owner' },
    { organizationId: 'org-user-pottery-house', role: 'owner' },
    { organizationId: 'org-bVY8SxxUuG6Ctk2CQnfCk8T2cPsj4jJX', role: 'owner' },
    { organizationId: 'org-ncls-blawby', role: 'owner' },
  ],
}
export const LOCAL_DEVELOPER_LOGIN_URL = `http://localhost:3000/login?email=${encodeURIComponent(LOCAL_DEVELOPER_AUTH_FIXTURE.email)}`

export function findE2eAuthFixture(userId = DEFAULT_E2E_USER_ID): E2eAuthFixture {
  const fixture = E2E_AUTH_FIXTURES.find(candidate => candidate.id === userId)
  if (!fixture) {
    throw new Error(`No credentialed E2E fixture is registered for user ${userId}`)
  }
  return fixture
}

import { expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { findE2eAuthFixture } from '../../../config/e2e-auth-fixtures'
import { dashboardOrgHeaders, devLoginHeaders } from '../test-env'

export async function loginAs(request: APIRequestContext, baseURL: string, userId?: string) {
  const fixture = findE2eAuthFixture(userId)
  const target = new URL(baseURL)
  const isLocal = target.hostname === 'localhost' || target.hostname === '127.0.0.1'
  const password = process.env.E2E_TEST_PASSWORD
  if (!password) throw new Error('E2E_TEST_PASSWORD is required for credential sign-in.')
  const origin = isLocal
    ? target.origin
    : new URL(process.env.NUXT_PUBLIC_PLATFORM_DOMAIN || target.origin).origin
  const res = await request.post(`${baseURL}/api/auth/sign-in/email`, {
    maxRetries: 0,
    timeout: 15_000,
    headers: { origin, ...devLoginHeaders() },
    data: {
      email: fixture.email,
      password,
      rememberMe: false,
    },
  })
  expect(res.status(), await res.text()).toBe(200)

  const activeMembership = fixture.memberships?.[0]
  if (activeMembership) {
    const activeOrganization = await request.post(`${baseURL}/api/auth/organization/set-active`, {
      headers: { origin },
      data: { organizationId: activeMembership.organizationId },
    })
    expect(activeOrganization.status(), await activeOrganization.text()).toBe(200)
  }

  const session = await request.get(`${baseURL}/api/auth/get-session`)
  expect(session.status(), await session.text()).toBe(200)
  await expect(session.json()).resolves.toMatchObject({ user: { id: fixture.id } })
}

export async function loginAsPage(page: Page, baseURL: string, userId?: string) {
  await loginAs(page.request, baseURL, userId)
}

export async function inviteAndAcceptMember(
  request: APIRequestContext,
  baseURL: string,
  input: {
    userId: string
    organizationId: string
    role: 'owner' | 'admin' | 'editor' | 'member'
    siteId?: string
    locationId?: string
  },
) {
  const fixture = findE2eAuthFixture(input.userId)
  const activeOrganization = await request.post(`${baseURL}/api/auth/organization/set-active`, {
    headers: { origin: new URL(baseURL).origin },
    data: { organizationId: input.organizationId },
  })
  expect(activeOrganization.status(), await activeOrganization.text()).toBe(200)

  const contextResponse = await request.get(`${baseURL}/api/dashboard/context`)
  expect(contextResponse.status(), await contextResponse.text()).toBe(200)
  const context = await contextResponse.json() as { organization?: { slug?: string } }
  expect(context.organization?.slug).toEqual(expect.any(String))

  const invitation = await request.post(`${baseURL}/api/dashboard/invitations`, {
    headers: dashboardOrgHeaders(context.organization!.slug!),
    data: {
      email: fixture.email,
      role: input.role,
      siteId: input.siteId,
      locationId: input.locationId,
    },
  })
  expect(invitation.status(), await invitation.text()).toBe(200)
  const invitationBody = await invitation.json() as { invitationId?: string }
  expect(invitationBody.invitationId).toEqual(expect.any(String))

  await loginAs(request, baseURL, fixture.id)
  const query = input.siteId ? `?siteId=${encodeURIComponent(input.siteId)}` : ''
  const accepted = await request.post(`${baseURL}/api/invitations/${invitationBody.invitationId}/accept${query}`)
  expect(accepted.status(), await accepted.text()).toBe(200)
  const acceptedBody = await accepted.json() as { organizationId?: string }
  expect(acceptedBody.organizationId).toEqual(expect.any(String))

  const active = await request.post(`${baseURL}/api/auth/organization/set-active`, {
    headers: { origin: new URL(baseURL).origin },
    data: { organizationId: acceptedBody.organizationId },
  })
  expect(active.status(), await active.text()).toBe(200)
  return fixture
}

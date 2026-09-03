import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { findE2eAuthFixture } from '../../../config/e2e-auth-fixtures'
import { devLoginHeaders } from '../test-env'

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
      headers: { origin, ...devLoginHeaders() },
      data: { organizationId: activeMembership.organizationId },
    })
    expect(activeOrganization.status(), await activeOrganization.text()).toBe(200)
  }

  const session = await request.get(`${baseURL}/api/auth/get-session`)
  expect(session.status(), await session.text()).toBe(200)
  await expect(session.json()).resolves.toMatchObject({ user: { id: fixture.id } })
}

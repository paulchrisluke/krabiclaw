import { expect, test } from '@playwright/test'
import { STAGING_REVIEW_AUTH } from '../../config/staging-review-auth'

test('durable staging-review credentials remain usable for every review tenant', async ({ request, baseURL }) => {
  const password = process.env.STAGING_REVIEW_PASSWORD
  expect(password, 'STAGING_REVIEW_PASSWORD is required for the staging review auth smoke').toBeTruthy()
  if (!password) throw new Error('STAGING_REVIEW_PASSWORD is required for the staging review auth smoke')
  const origin = new URL(baseURL!).origin

  for (const [index, organizationId] of STAGING_REVIEW_AUTH.organizationIds.entries()) {
    const siteId = STAGING_REVIEW_AUTH.siteIds[index]!
    const signIn = await request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { origin },
      data: { email: STAGING_REVIEW_AUTH.email, password, rememberMe: false },
    })
    expect(signIn.status(), await signIn.text()).toBe(200)

    const active = await request.post(`${baseURL}/api/auth/organization/set-active`, {
      headers: { origin },
      data: { organizationId },
    })
    expect(active.status(), await active.text()).toBe(200)

    const context = await request.get(`${baseURL}/api/dashboard/context`)
    expect(context.status(), await context.text()).toBe(200)
    await expect(context.json()).resolves.toMatchObject({ organization: { id: organizationId } })

    const pages = await request.get(`${baseURL}/api/editor/sites/${siteId}/pages`)
    expect(pages.status(), await pages.text()).toBe(200)
  }
})

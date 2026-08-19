import { expect, test } from '@playwright/test'
import { STAGING_REVIEW_AUTH } from '../../config/staging-review-auth'

test('durable staging-review credentials remain usable across repeated sign-in', async ({ request, baseURL }) => {
  const password = process.env.STAGING_REVIEW_PASSWORD
  expect(password, 'STAGING_REVIEW_PASSWORD is required for the staging review auth smoke').toBeTruthy()
  if (!password) throw new Error('STAGING_REVIEW_PASSWORD is required for the staging review auth smoke')
  const organizationId = STAGING_REVIEW_AUTH.organizationIds[0]!

  const origin = new URL(baseURL!).origin
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const signIn = await request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { origin },
      data: {
        email: STAGING_REVIEW_AUTH.email,
        password,
        rememberMe: false,
      },
    })
    expect(signIn.status(), await signIn.text()).toBe(200)

    const active = await request.post(`${baseURL}/api/auth/organization/set-active`, {
      headers: { origin },
      data: { organizationId },
    })
    expect(active.status(), await active.text()).toBe(200)

    const context = await request.get(`${baseURL}/api/dashboard/context`)
    expect(context.status(), await context.text()).toBe(200)
    await expect(context.json()).resolves.toMatchObject({
      organization: { id: organizationId },
    })
  }
})

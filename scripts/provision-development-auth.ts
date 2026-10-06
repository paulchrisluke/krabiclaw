import { request, type FullConfig } from '@playwright/test'
import { E2E_AUTH_FIXTURES } from '../config/development-auth-fixtures.ts'

/** Distinct actors are needed only for buyer, role, tenant and onboarding journeys. */
export default async function provisionTestActors(config: FullConfig) {
  if (process.env.PLAYWRIGHT_PREVIEW_URL) return
  await provisionDevelopmentActors(config.projects[0]?.use.baseURL)
}

async function provisionDevelopmentActors(baseURL: string | undefined) {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) throw new Error('Test actors may be provisioned only in the local Worker.')
  const email = process.env.CANARY_LOGIN_EMAIL
  const password = process.env.CANARY_LOGIN_PASSWORD
  if (!email || !password) throw new Error('Configure CANARY_LOGIN_EMAIL and CANARY_LOGIN_PASSWORD.')
  const admin = await request.newContext({ baseURL, extraHTTPHeaders: { origin: new URL(baseURL).origin } })
  async function call(context: typeof admin, path: string, data?: Record<string, unknown>) {
    const response = data ? await context.post(`/api/auth/${path}`, { data }) : await context.get(`/api/auth/${path}`)
    if (response.status() !== 200) throw new Error(`Better Auth ${path} failed: ${response.status()} ${await response.text()}`)
    return response.json()
  }
  try {
    await call(admin, 'sign-in/email', { email, password, rememberMe: false })
    const principal = await call(admin, 'get-session')
    for (const fixture of E2E_AUTH_FIXTURES) {
      const found = await call(admin, `admin/list-users?searchField=email&searchOperator=contains&searchValue=${encodeURIComponent(fixture.email)}`)
      const existing = found.users.find((user: { email: string }) => user.email === fixture.email)
      if (existing && existing.id !== fixture.id) throw new Error(`Test actor ${fixture.email} has an unexpected ID.`)
      if (!existing) {
        const created = await call(admin, 'admin/create-user', {
          email: fixture.email, name: fixture.name, password, role: fixture.platformRole ?? 'user',
          data: { id: fixture.id, emailVerified: true, ...(fixture.phoneNumber ? { phoneNumber: fixture.phoneNumber, phoneNumberVerified: true } : {}) },
        })
        if (created.user.id !== fixture.id) throw new Error(`Better Auth did not preserve the requested test actor ID for ${fixture.email}.`)
      } else {
        await call(admin, 'admin/set-user-password', { userId: fixture.id, newPassword: password })
      }
      for (const membership of fixture.memberships ?? []) {
        const { members } = await call(admin, `organization/list-members?organizationId=${encodeURIComponent(membership.organizationId)}&limit=100`)
        const member = members.find((candidate: { userId: string }) => candidate.userId === fixture.id)
        if (member) {
          if (member.role !== membership.role) throw new Error(`Test actor ${fixture.email} has an unexpected organization role.`)
          continue
        }
        const owners = members.filter((candidate: { role: string }) => candidate.role.split(',').includes('owner'))
        const owner = owners.find((candidate: { userId: string }) => candidate.userId === principal.user.id) ?? owners[0]
        if (!owner) throw new Error(`Organization ${membership.organizationId} has no owner to invite its test actor.`)
        const inviter = await request.newContext({ baseURL, storageState: await admin.storageState(), extraHTTPHeaders: { origin: new URL(baseURL).origin } })
        const actor = await request.newContext({ baseURL, extraHTTPHeaders: { origin: new URL(baseURL).origin } })
        let impersonated = false
        try {
          if (owner.userId !== principal.user.id) {
            await call(inviter, 'admin/impersonate-user', { userId: owner.userId })
            impersonated = true
          }
          const invitation = await call(inviter, 'organization/invite-member', { organizationId: membership.organizationId, email: fixture.email, role: membership.role, resend: true })
          await call(actor, 'sign-in/email', { email: fixture.email, password, rememberMe: false })
          await call(actor, 'organization/accept-invitation', { invitationId: invitation.id })
          const { members: verified } = await call(actor, `organization/list-members?organizationId=${encodeURIComponent(membership.organizationId)}&filterField=userId&filterOperator=eq&filterValue=${fixture.id}`)
          if (verified.length !== 1 || verified[0].role !== membership.role) throw new Error(`Better Auth did not assign ${fixture.email} its requested role.`)
        } finally {
          try {
            if (impersonated) await call(inviter, 'admin/stop-impersonating', {})
          } finally {
            await Promise.all([actor.dispose(), inviter.dispose()])
          }
        }
      }
    }
  } finally { await admin.dispose() }
}

// `corepack yarn local:actors [base URL]` provisions the same actors against a running local Worker.
if (import.meta.main) await provisionDevelopmentActors(process.argv[2] ?? 'http://localhost:3000')

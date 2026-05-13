import { betterAuth } from 'better-auth'
import { admin, organization, phoneNumber } from 'better-auth/plugins'
import { D1Dialect } from '@atinux/kysely-d1'
import { Kysely } from 'kysely'
import { getHeaders } from 'h3'
import type { H3Event } from 'h3'
import { sendWhatsAppOtp } from '~/server/utils/whatsapp'

export interface CloudflareEnv {
  REVIEWS_DB: any // Using any to avoid D1Database type conflicts
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  [key: string]: unknown
}

// WeakMap keyed on the D1 binding instance — safe for the Worker lifecycle
const authCache = new WeakMap()

export function createAuth(env: CloudflareEnv) {
  const d1 = env.REVIEWS_DB

  if (authCache.has(d1)) return authCache.get(d1)

  const db = new Kysely({ dialect: new D1Dialect({ database: d1 }) })

  const instance = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: {
      db,
      type: 'sqlite'
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const now = new Date().toISOString()
            const orgId = `org-${user.id}`
            // Insert org first, then member. If member insert fails, compensate by
          // removing the org so we don't leave an owner-less organization.
          try {
            await d1.batch([
              d1.prepare(
                `INSERT OR IGNORE INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)`
              ).bind(orgId, user.name ?? user.email ?? 'My Restaurant', orgId, now),
              d1.prepare(
                `INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)`
              ).bind(`member-${orgId}`, orgId, user.id, 'owner', now)
            ])
          } catch (batchErr) {
            console.error('Failed to create org/member on signup, batch rolled back for orgId:', orgId, batchErr)
            throw batchErr
          }
          }
        }
      }
    },
    plugins: [
      organization(),
      admin({
        adminRoles: ['admin'],
        defaultRole: 'user',
        impersonationSessionDuration: 60 * 60,
      }),
      phoneNumber({
        sendOTP: async ({ phoneNumber: phone, code }) => {
          await sendWhatsAppOtp(env, phone, code)
        },
        otpLength: 6,
        expiresIn: 300,
      }),
    ],
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET
      }
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google']
      }
    }
  })

  authCache.set(d1, instance)
  return instance
}

export async function getAuthSession(event: H3Event, env: CloudflareEnv): Promise<any> {
  return await createAuth(env).api.getSession({
    headers: getHeaders(event)
  })
}

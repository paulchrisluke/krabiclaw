import { betterAuth } from 'better-auth'
import { admin, organization, phoneNumber } from 'better-auth/plugins'
import { D1Dialect } from '@atinux/kysely-d1'
import { Kysely } from 'kysely'
import { getHeaders } from 'h3'
import type { H3Event } from 'h3'
import { normalizePhone, sendWhatsAppOtp } from '~/server/utils/whatsapp'

export interface CloudflareEnv {
  REVIEWS_DB: D1Database
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_PRICE_STARTER?: string
  STRIPE_PRICE_GROWTH?: string
  STRIPE_PRICE_PRO?: string
  STRIPE_PRICE_ADDON_LOCATION?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_IMAGES_ACCOUNT_ID?: string
  CLOUDFLARE_IMAGES_API_TOKEN?: string
  CF_STREAM_API_TOKEN?: string
  CF_STREAM_CUSTOMER_SUBDOMAIN?: string
  CF_AIG_TOKEN?: string
  CF_ZONE_ID?: string
  CF_CUSTOM_HOSTNAMES_API_TOKEN?: string
  CF_SAAS_CNAME_TARGET?: string
  NUXT_PUBLIC_FREE_SITE_DOMAIN?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
  WHATSAPP_ACCESS_TOKEN?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_VERIFY_TOKEN?: string
  WHATSAPP_BUSINESS_ACCOUNT_ID?: string
  [key: string]: ApiValue
}

// WeakMap keyed on the D1 binding instance — safe for the Worker lifecycle
const authCache = new WeakMap<D1Database, unknown>()

export function createAuth(env: CloudflareEnv) {
  const d1 = env.REVIEWS_DB

  const cached = authCache.get(d1)
  if (cached) return cached as ReturnType<typeof betterAuth>

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
        phoneNumberValidator: async (phone) => {
          try {
            normalizePhone(phone)
            return true
          } catch {
            return false
          }
        },
        signUpOnVerification: {
          getTempEmail: (phone) => {
            const digits = normalizePhone(phone).replace(/\D/g, '')
            return `phone-${digits}@phone.krabiclaw.local`
          },
          getTempName: (phone) => `WhatsApp ${normalizePhone(phone)}`,
        },
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

export async function getAuthSession(event: H3Event, env: CloudflareEnv): Promise<Awaited<ReturnType<ReturnType<typeof createAuth>['api']['getSession']>>> {
  return createAuth(env).api.getSession({
    headers: getHeaders(event) as HeadersInit
  })
}

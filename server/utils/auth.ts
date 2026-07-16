import { APIError, betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { hashPassword } from 'better-auth/crypto'
import { admin, anonymous, jwt, organization, phoneNumber } from 'better-auth/plugins'
import { oauthProvider } from '@better-auth/oauth-provider'
import { cimd } from '@better-auth/cimd'
import { getHeaders } from 'h3'
import type { H3Event } from 'h3'
import { createDb, execute, schema } from '~/server/db'
import { linkAnonymousCustomerToUser } from '~/server/utils/customers'
import { sendWhatsAppOtp } from '~/server/utils/whatsapp'
import { parsePhoneOrThrow, PHONE_METADATA_VERSION } from '~/utils/phone'
import { notifyNewUserSignup } from '~/server/utils/notification-center'
import { sendPasswordResetEmail, sendVerificationEmail } from '~/server/utils/auth-email'
import { validatePassword } from '~/utils/password-validation'
import { fireSiteEventSafe, resolvePrimarySiteForEvent } from '~/server/utils/site-events'
import type { InferSelectModel } from 'drizzle-orm'
import { organizationAccessControl, organizationRoles } from '~/utils/organization-access'

type MemberRow = InferSelectModel<typeof schema.member>
type InvitationRow = InferSelectModel<typeof schema.invitation>

export interface CloudflareEnv {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  GA4_MEASUREMENT_ID?: string
  GA4_API_SECRET?: string
  AI_SEARCH?: AiSearchNamespace
  AI_SEARCH_INSTANCE_ID?: string
  PLATFORM_SEARCH_REINDEX_SECRET?: string
  CF_ACCOUNT_ID?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_IMAGES_ACCOUNT_ID?: string
  CLOUDFLARE_IMAGES_API_TOKEN?: string
  CF_ZONE_ID?: string
  CF_CUSTOM_HOSTNAMES_API_TOKEN?: string
  CF_ZARAZ_API_TOKEN?: string
  CF_SAAS_CNAME_TARGET?: string
  NUXT_PUBLIC_FREE_SITE_DOMAIN?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
  WHATSAPP_ACCESS_TOKEN?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_VERIFY_TOKEN?: string
  WHATSAPP_BUSINESS_ACCOUNT_ID?: string
  FACEBOOK_APP_ID?: string
  FACEBOOK_APP_SECRET?: string
  FACEBOOK_REDIRECT_URI?: string
  FACEBOOK_CONFIG_ID?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  EMAIL_DELIVERY_MODE?: string
  EMAIL_REPLY_SECRET?: string
  EMAIL_INBOUND_SECRET?: string
  DISCORD_DELIVERY_MODE?: string
  DISCORD_WEBHOOK_URL?: string
  MEDIA_BUCKET?: R2Bucket
  db?: ReturnType<typeof createDb>
  [key: string]: ApiValue
}

// WeakMap keyed on the D1 binding instance — safe for the Worker lifecycle
const authCache = new WeakMap<D1Database, unknown>()

interface CreateAuthOptions {
  waitUntil?: (_task: Promise<unknown>) => void
}

export function createAuth(env: CloudflareEnv, options: CreateAuthOptions = {}) {
  const d1 = env.DB

  // Request-scoped background scheduling must never be captured by a cached auth
  // instance. Auth endpoints get a fresh instance; session reads keep the cache.
  const cached = options.waitUntil ? null : authCache.get(d1)
  if (cached) return cached as ReturnType<typeof betterAuth>

  const db = env.db ?? createDb(d1)
  const authBaseUrl = (env.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')

  const instance = betterAuth({
    baseURL: authBaseUrl,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            if ((user as { isAnonymous?: boolean }).isAnonymous) return
            // Organizations are created on demand — either by site-creation.ts
            // (first site) or by an admin/invitation flow the user is joining.
            // Signup itself must not assume why the user is here: they may be
            // accepting an invitation into an existing org, in which case a
            // personal org here would just be an orphaned, siteless duplicate.
            // Persist the canonical event before the auth hook completes. Delivery failures
            // are recorded by the dispatcher and must never fail account creation.
            await notifyNewUserSignup(db, env, {
              id: user.id,
              email: user.email,
            }, options.waitUntil).catch((err) => console.error('signup_notification_failed', err))
          }
        }
      },
      // Better Auth's org-plugin after-hooks only pass the affected row, not the
      // acting session, so member.update/delete events are attributed to no actor.
      member: {
        update: {
          after: async (member: MemberRow) => {
            const siteId = await resolvePrimarySiteForEvent(db, member.organizationId)
            if (!siteId) return
            await fireSiteEventSafe({
              db,
              organizationId: member.organizationId,
              siteId,
              eventType: 'member.role_changed',
              entityType: 'member',
              entityId: member.id,
              metadata: { userId: member.userId, role: member.role },
            })
          }
        },
        delete: {
          after: async (member: MemberRow) => {
            const siteId = await resolvePrimarySiteForEvent(db, member.organizationId)
            if (!siteId) return
            await fireSiteEventSafe({
              db,
              organizationId: member.organizationId,
              siteId,
              eventType: 'member.removed',
              entityType: 'member',
              entityId: member.id,
              metadata: { userId: member.userId },
            })
          }
        }
      },
      invitation: {
        create: {
          after: async (invitation: InvitationRow) => {
            const siteId = await resolvePrimarySiteForEvent(db, invitation.organizationId)
            if (!siteId) return
            await fireSiteEventSafe({
              db,
              organizationId: invitation.organizationId,
              siteId,
              actorId: invitation.inviterId,
              eventType: 'member.invited',
              entityType: 'invitation',
              entityId: invitation.id,
              metadata: { role: invitation.role ?? null },
            })
          }
        }
      }
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      password: {
        async hash(password: string) {
          const passwordError = validatePassword(password)
          if (passwordError) {
            throw APIError.from('BAD_REQUEST', {
              code: 'INVALID_PASSWORD',
              message: passwordError,
            })
          }
          return hashPassword(password)
        },
      },
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        void sendPasswordResetEmail(env, {
          email: user.email,
          resetUrl: url,
        }).catch((error) => {
          console.error('auth_reset_password_email_failed', {
            email: user.email,
            error,
          })
        })
      },
      onPasswordReset: async ({ user }) => {
        console.info('auth_password_reset_complete', { email: user.email })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        void sendVerificationEmail(env, {
          email: user.email,
          verificationUrl: url,
        }).catch((error) => {
          console.error('auth_verification_email_failed', {
            email: user.email,
            error,
          })
        })
      },
    },
    plugins: [
      jwt({
        jwt: {
          // Explicit issuer so oauthProvider's getOAuthServerConfig advertises the
          // same value as authorization_servers in /.well-known/oauth-protected-resource.
          // Without this, oauth-provider falls back to ctx.context.baseURL
          // (https://krabiclaw.com/api/auth) but jwt() signs with options.baseURL
          // (https://krabiclaw.com) — the mismatch causes ChatGPT to reject the connector.
          issuer: authBaseUrl,
        },
      }),
      anonymous({
        generateRandomEmail: () => `anon-${crypto.randomUUID()}@customers.krabiclaw.local`,
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          const now = new Date().toISOString()
          await linkAnonymousCustomerToUser(db, anonymousUser.user.id, newUser.user.id)
          await execute(db, `
            UPDATE review_requests
            SET user_id = ?, updated_at = ?
            WHERE anonymous_user_id = ?
          `, [newUser.user.id, now, anonymousUser.user.id])
          await execute(db, `
            UPDATE reviews
            SET user_id = ?, updated_at = ?
            WHERE user_id = ?
               OR review_request_id IN (
                 SELECT id
                 FROM review_requests
                 WHERE anonymous_user_id = ?
               )
          `, [newUser.user.id, now, anonymousUser.user.id, anonymousUser.user.id])
        },
      }),
      oauthProvider({
        loginPage: '/oauth/login',
        consentPage: '/oauth/consent',
        allowPublicClientPrelogin: true,
        // Account selection is driven entirely by an explicit prompt=select_account
        // from the client (handled upstream in the provider before this hook runs).
        // shouldRedirect must stay false here — returning true unconditionally
        // re-forces select_account on every authorize call, including the one
        // fired by "Continue as X" on /oauth/login itself, producing an infinite
        // login <-> authorize redirect loop.
        selectAccount: {
          page: '/oauth/login',
          shouldRedirect: async () => false,
        },
        allowDynamicClientRegistration: false,
        allowUnauthenticatedClientRegistration: false,
        enforcePerClientResources: false,
        scopes: ['openid', 'offline_access', 'tenant', 'platform_admin'],
        resources: [
          {
            identifier: `${authBaseUrl}/api/mcp`,
            name: 'KrabiClaw tenant MCP',
            allowedScopes: ['openid', 'offline_access', 'tenant'],
          },
          {
            identifier: `${authBaseUrl}/api/mcp/platform`,
            name: 'KrabiClaw platform MCP',
            allowedScopes: ['openid', 'offline_access', 'platform_admin'],
          },
        ],
        // Well-known metadata is served at /api/auth/.well-known/* by the plugin's
        // onRequest hook. Root-level /.well-known/* are covered by Nitro routes.
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
      }),
      cimd({
        allowLoopback: import.meta.dev,
      }),
      organization({ ac: organizationAccessControl, roles: organizationRoles }),
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
            parsePhoneOrThrow(phone, { defaultCountry: 'TH' })
            return true
          } catch {
            return false
          }
        },
        // Stamp the app-owned user_phone_verification companion table
        // (issue #293 Section D/I) on every successful OTP verification —
        // this table exists specifically to track ownership_verified/
        // format_valid/phone_metadata_version separately from Better Auth's
        // own phoneNumberVerified column, but nothing wrote to it until now.
        callbackOnVerification: async ({ user }) => {
          try {
            const now = new Date().toISOString()
            await execute(d1, `
              INSERT INTO user_phone_verification (id, user_id, format_valid, ownership_verified, phone_metadata_version, created_at, updated_at)
              VALUES (?, ?, 1, 1, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET format_valid = 1, ownership_verified = 1, phone_metadata_version = excluded.phone_metadata_version, updated_at = excluded.updated_at
            `, [crypto.randomUUID(), user.id, PHONE_METADATA_VERSION, now, now])
          } catch (error) {
            console.warn('user_phone_verification_stamp_failed', { userId: user.id, error: error instanceof Error ? error.message : String(error) })
          }
        },
        signUpOnVerification: {
          getTempEmail: (phone) => {
            try {
              const digits = parsePhoneOrThrow(phone, { defaultCountry: 'TH' }).replace(/\D/g, '')
              return `phone-${digits}@phone.krabiclaw.local`
            } catch {
              return 'phone-unknown@phone.krabiclaw.local'
            }
          },
          getTempName: (phone) => {
            try {
              return `WhatsApp ${parsePhoneOrThrow(phone, { defaultCountry: 'TH' })}`
            } catch {
              return 'WhatsApp Unknown'
            }
          },
        },
      }),
    ],
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: 'select_account',
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

  if (!options.waitUntil) authCache.set(d1, instance)
  return instance
}

export async function getAuthSession(event: H3Event, env: CloudflareEnv): Promise<Awaited<ReturnType<ReturnType<typeof createAuth>['api']['getSession']>>> {
  return createAuth(env).api.getSession({
    headers: getHeaders(event) as HeadersInit
  })
}

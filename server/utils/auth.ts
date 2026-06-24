import { APIError, betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { hashPassword } from 'better-auth/crypto'
import { admin, jwt, organization, phoneNumber } from 'better-auth/plugins'
import { oauthProvider } from '@better-auth/oauth-provider'
import { getHeaders } from 'h3'
import type { H3Event } from 'h3'
import { createDb, schema } from '~/server/db'
import { normalizePhone, sendWhatsAppOtp } from '~/server/utils/whatsapp'
import { notifyAdminNewUserSignup } from '~/server/utils/admin-notifications'
import { sendPasswordResetEmail, sendVerificationEmail } from '~/server/utils/auth-email'
import { validatePassword } from '~/utils/password-validation'

export interface CloudflareEnv {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_IMAGES_ACCOUNT_ID?: string
  CLOUDFLARE_IMAGES_API_TOKEN?: string
  CF_ZONE_ID?: string
  CF_CUSTOM_HOSTNAMES_API_TOKEN?: string
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
  MEDIA_BUCKET?: R2Bucket
  db?: ReturnType<typeof createDb>
  [key: string]: ApiValue
}

// WeakMap keyed on the D1 binding instance — safe for the Worker lifecycle
const authCache = new WeakMap<D1Database, unknown>()

export function createAuth(env: CloudflareEnv) {
  const d1 = env.DB

  const cached = authCache.get(d1)
  if (cached) return cached as ReturnType<typeof betterAuth>

  const db = env.db ?? createDb(d1)

  const instance = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
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
            const now = new Date()
            const orgId = `org-${user.id}`
            try {
              await db.batch([
                db.insert(schema.organization).values({
                  id: orgId,
                  name: user.name ?? user.email ?? 'My Restaurant',
                  slug: orgId,
                  createdAt: now,
                }).onConflictDoNothing(),
                db.insert(schema.member).values({
                  id: `member-${orgId}`,
                  organizationId: orgId,
                  userId: user.id,
                  role: 'owner',
                  createdAt: now,
                }).onConflictDoNothing(),
              ])
            } catch (batchErr) {
              console.error('Failed to create org/member on signup, batch rolled back for orgId:', orgId, batchErr)
              throw batchErr
            }
            // Fire-and-forget — must not block or throw into the auth flow
            notifyAdminNewUserSignup(env, {
              id: user.id,
              name: user.name,
              email: user.email,
              createdAt: now.toISOString(),
            }).catch((err) => console.error('admin_signup_notify_failed', err))
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
          issuer: (env.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, ''),
        },
      }),
      oauthProvider({
        loginPage: '/oauth/login',
        consentPage: '/oauth/consent',
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
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        // ChatGPT's MCP connector does dynamic client registration (DCR) without an
        // explicit `scope` in the body, then echoes back whatever this default
        // produces verbatim as the `scope=` param on every later /authorize call —
        // confirmed live: it never falls back to reading the registered client's
        // scopes at /authorize time, so a narrower default here cannot be patched up
        // later. DCR has no signal for which surface (tenant vs platform admin) is
        // registering, since both share this one authorization server, so every
        // dynamically-registered client gets every custom scope by default. The
        // real per-surface authorization boundary is the `aud` claim (bound to the
        // `resource` param, which ChatGPT does set correctly per surface) plus the
        // DB role/membership check in mcp-auth.ts — not which scopes are present.
        scopes: ['openid', 'offline_access', 'tenant', 'platform_admin'],
        validAudiences: [
          ...(env.BETTER_AUTH_URL ? [`${env.BETTER_AUTH_URL}/api/mcp`] : []),
          ...(env.BETTER_AUTH_URL ? [`${env.BETTER_AUTH_URL}/api/mcp/platform`] : []),
          'https://krabiclaw.com/api/mcp',
          'https://krabiclaw.com/api/mcp/platform',
        ],
        // Well-known metadata is served at /api/auth/.well-known/* by the plugin's
        // onRequest hook. Root-level /.well-known/* are covered by Nitro routes.
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
      }),
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
            try {
              const digits = normalizePhone(phone).replace(/\D/g, '')
              return `phone-${digits}@phone.krabiclaw.local`
            } catch {
              return 'phone-unknown@phone.krabiclaw.local'
            }
          },
          getTempName: (phone) => {
            try {
              return `WhatsApp ${normalizePhone(phone)}`
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

  authCache.set(d1, instance)
  return instance
}

export async function getAuthSession(event: H3Event, env: CloudflareEnv): Promise<Awaited<ReturnType<ReturnType<typeof createAuth>['api']['getSession']>>> {
  return createAuth(env).api.getSession({
    headers: getHeaders(event) as HeadersInit
  })
}

import { APIError, betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { hashPassword } from 'better-auth/crypto'
import { admin, anonymous, getOrgAdapter, hasPermission, jwt, organization, phoneNumber } from 'better-auth/plugins'
import { stripe as betterAuthStripe } from '@better-auth/stripe'
import { oauthProvider } from '@better-auth/oauth-provider'
import type { SchemaClient, Scope } from '@better-auth/oauth-provider'
import { cimd } from '@better-auth/cimd'
import type { GenericEndpointContext } from '@better-auth/core'
import { HTTPError, type H3Event } from 'nitro';
import { createDb, execute, schema } from '~/server/db'
import { linkAnonymousCustomerToUser } from '~/server/utils/customers'
import { sendWhatsAppOtp } from '~/server/utils/whatsapp'
import { parsePhoneOrThrow } from '~/utils/phone'
import { notifyNewUserSignup } from '~/server/utils/notification-center'
import { sendPasswordResetEmail, sendVerificationEmail } from '~/server/utils/auth-email'
import { validatePassword } from '~/utils/password-validation'
import { fireSiteEventSafe, resolvePrimarySiteForEvent } from '~/server/utils/site-events'
import type { InferSelectModel } from 'drizzle-orm'
import { organizationAccessControl, organizationRoles } from '~/utils/organization-access'
import { platformAdminAccessControl, platformAdminRoles } from '~/utils/platform-admin-access'
import {
  createStripePlanLoader,
  enqueueStripeEvent,
} from '~/server/utils/better-auth-stripe'
import { processStripeEvent } from '~/server/utils/stripe-event-processing'
import { createStripeClient } from '~/server/utils/stripe-client'
import { unwrapInstrumentedD1 } from '~/server/utils/request-metrics'
import { timingSafeEqualText } from '~/server/utils/dev-route-auth'
import { notifyOrganizationInvited } from '~/server/utils/notifications'

type MemberRow = InferSelectModel<typeof schema.member>
type InvitationRow = InferSelectModel<typeof schema.invitation>

const CIMD_TENANT_SCOPES = ['openid', 'offline_access', 'tenant'] as const

export const OAUTH_SIGNING_POLICY = {
  algorithm: 'RS256',
  resourceSeedMode: 'merge',
} as const

export function oauthSigningConfig(authBaseUrl: string) {
  return {
    resourceSeedMode: OAUTH_SIGNING_POLICY.resourceSeedMode,
    resources: [
      {
        identifier: `${authBaseUrl}/api/mcp`,
        name: 'KrabiClaw tenant MCP',
        allowedScopes: ['openid', 'offline_access', 'tenant'],
        signingAlgorithm: OAUTH_SIGNING_POLICY.algorithm,
      },
      {
        identifier: `${authBaseUrl}/api/mcp/platform`,
        name: 'KrabiClaw platform MCP',
        allowedScopes: ['openid', 'offline_access', 'platform_admin'],
        signingAlgorithm: OAUTH_SIGNING_POLICY.algorithm,
      },
    ],
  }
}

const organizationOptions = {
  ac: organizationAccessControl,
  roles: organizationRoles,
  teams: {
    enabled: true,
    defaultTeam: { enabled: false },
  },
} as const

async function normalizeCimdClientAuthentication(data: {
  client: SchemaClient<Scope[]>
  metadata: Record<string, unknown>
  ctx: GenericEndpointContext
}) {
  const { client, metadata, ctx } = data
  const advertisedMethods = metadata.token_endpoint_auth_methods_supported
  const jwksUri = metadata.jwks_uri
  const supportsPrivateKeyJwt = Array.isArray(advertisedMethods)
    && advertisedMethods.includes('private_key_jwt')
    && typeof jwksUri === 'string'
    && jwksUri.length > 0

  const update: Record<string, unknown> = {}
  if (!Array.isArray(client.scopes) || client.scopes.length === 0) {
    update.scopes = [...CIMD_TENANT_SCOPES]
  }
  if (supportsPrivateKeyJwt) {
    // @better-auth/cimd@1.7.0-beta.10's convertDocToClient only reads the
    // singular doc.token_endpoint_auth_method (node_modules/@better-auth/cimd/
    // dist/index.mjs lines ~106-115, ~298) — it never checks the plural
    // capability field, token_endpoint_auth_methods_supported, that
    // ChatGPT-shaped CIMD documents advertise private_key_jwt through.
    // Confirmed against the installed package source; remove this once a
    // newer @better-auth/cimd release maps that field itself. Covered by
    // tests/e2e/oauth-discovery.spec.ts's "ChatGPT-shaped CIMD uses
    // private_key_jwt" test — removing this hook without an upstream fix
    // breaks that flow.
    update.tokenEndpointAuthMethod = 'private_key_jwt'
    update.public = false
    update.jwksUri = jwksUri
  }

  if (Object.keys(update).length === 0) return
  Object.assign(client, update)
  await ctx.context.adapter.update({
    model: 'oauthClient',
    where: [{ field: 'clientId', value: client.clientId }],
    update,
  })
}

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
  CLOUDFLARE_API_TOKEN?: string
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
  E2E_ALLOW_DEV_ROUTES?: string
  E2E_DEV_ROUTE_SECRET?: string
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
  SITE_CACHE?: KVNamespace
  GUEST_THREAD_COMMANDS?: DurableObjectNamespace
  GUEST_INBOX_HUBS?: DurableObjectNamespace
  GUEST_DELIVERY_QUEUE?: Queue
  db?: ReturnType<typeof createDb>
  [key: string]: ApiValue
}

export function shouldBypassE2eAuthRateLimit(
  env: Pick<CloudflareEnv, 'E2E_ALLOW_DEV_ROUTES' | 'E2E_DEV_ROUTE_SECRET'>,
  request: Request,
): boolean {
  if (env.E2E_ALLOW_DEV_ROUTES !== 'true') return false
  const expectedSecret = env.E2E_DEV_ROUTE_SECRET?.trim() ?? ''
  const providedSecret = request.headers.get('x-dev-route-secret') ?? ''
  return !!expectedSecret
    && !!providedSecret
    && timingSafeEqualText(providedSecret, expectedSecret)
}

// WeakMap keyed on the D1 binding instance — safe for the Worker lifecycle
const authCache = new WeakMap<D1Database, unknown>()

function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/$/, '')
  if (!trimmed) return null
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(withProtocol).origin
  } catch {
    return null
  }
}

function wildcardOrigin(origin: string | null): string | null {
  if (!origin) return null
  const url = new URL(origin)
  return `${url.protocol}//*.${url.host}`
}

export function localDevelopmentOrigin(value: string | undefined): string | null {
  const origin = normalizeOrigin(value)
  if (!origin) return null
  const url = new URL(origin)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null
  return origin
}

function trustedOriginsForAuth(env: CloudflareEnv): string[] | ((_request?: Request) => string[]) {
  const origins = new Set<string>()
  const authOrigin = normalizeOrigin(env.BETTER_AUTH_URL)
  const platformOrigin = normalizeOrigin(env.NUXT_PUBLIC_PLATFORM_DOMAIN)
  const freeSiteOrigin = normalizeOrigin(env.NUXT_PUBLIC_FREE_SITE_DOMAIN)
  for (const origin of [authOrigin, platformOrigin, freeSiteOrigin, wildcardOrigin(freeSiteOrigin)]) {
    if (origin) origins.add(origin)
  }
  if (import.meta.dev || env.E2E_ALLOW_DEV_ROUTES === 'true') {
    const port = env.PORT || '3000'
    if (import.meta.dev) {
      origins.add(`http://localhost:${port}`)
      origins.add(`http://127.0.0.1:${port}`)
      origins.add(`http://*.localhost:${port}`)
    }

    return (request?: Request) => {
      const requestOrigin = request && (import.meta.dev || shouldBypassE2eAuthRateLimit(env, request))
        ? localDevelopmentOrigin(request.headers.get('origin') ?? undefined)
        : null
      return requestOrigin ? [...origins, requestOrigin] : [...origins]
    }
  }
  return [...origins]
}

export function createAuth(env: CloudflareEnv) {
  if (!env?.DB) throw new HTTPError({ statusCode: 503, statusMessage: 'Database unavailable' })
  const d1 = unwrapInstrumentedD1(env.DB)

  const cached = authCache.get(d1)
  if (cached) return cached as ReturnType<typeof betterAuth>

  const db = d1 === env.DB && env.db ? env.db : createDb(d1)
  const configuredOrganizationOptions = {
    ...organizationOptions,
    sendInvitationEmail: async (data: {
      id: string
      role: string
      email: string
      organization: { id: string; name: string }
      inviter: { user: { name: string; email: string } }
    }) => {
      const siteId = await resolvePrimarySiteForEvent(db, data.organization.id)
      if (!siteId) throw new Error('Organization invitation requires a site')
      await notifyOrganizationInvited(env, db, {
        organizationId: data.organization.id,
        siteId,
        invitationId: data.id,
        email: data.email,
        role: data.role,
        organizationName: data.organization.name,
        inviterName: data.inviter.user.name || data.inviter.user.email,
      })
    },
  } as const
  const authBaseUrl = env.BETTER_AUTH_URL?.replace(/\/$/, '')
  if (!authBaseUrl) throw new Error('BETTER_AUTH_URL is required')
  const stripeClient = createStripeClient(env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder')
  const loadStripePlans = createStripePlanLoader(stripeClient, env)

  const instance = betterAuth({
    baseURL: authBaseUrl,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOriginsForAuth(env),
    user: {
      deleteUser: { enabled: true },
    },
    rateLimit: {
      customRules: {
        '/sign-in/*': (request, currentRule) => shouldBypassE2eAuthRateLimit(env, request)
          ? false
          : currentRule,
      },
    },
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
            //
            // This is also the sole source for the platform `new_signups` analytics metric
            // (server/utils/analytics.ts). The catch here is intentional and must stay this
            // way: a signup can never be allowed to fail because this write failed. That
            // means the metric is a best-effort lower bound, not an exact count — see
            // PLATFORM_SIGNUP_LEDGER_START_DATE for the known-gap cutover this implies.
            await notifyNewUserSignup(db, env, {
              id: user.id,
              email: user.email,
            }).catch((err) => console.error('signup_notification_failed', err))
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
        jwks: {
          keyPairConfig: { alg: OAUTH_SIGNING_POLICY.algorithm },
        },
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
        schema: {
          oauthClient: {
            fields: {
              scopes: 'scopesJson',
            },
          },
        },
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
        ...oauthSigningConfig(authBaseUrl),
        // Well-known metadata is served at /api/auth/.well-known/* by the plugin's
        // onRequest hook. Root-level /.well-known/* are covered by Nitro routes.
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
      }),
      cimd({
        allowLoopback: import.meta.dev || env.E2E_ALLOW_DEV_ROUTES === 'true',
        onClientCreated: normalizeCimdClientAuthentication,
        onClientRefreshed: normalizeCimdClientAuthentication,
      }),
      organization(configuredOrganizationOptions),
      betterAuthStripe({
        stripeClient,
        stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
        organization: { enabled: true },
        subscription: {
          enabled: true,
          plans: () => loadStripePlans(),
          requireEmailVerification: true,
          authorizeReference: async ({ user, referenceId }, ctx) => {
            const member = await getOrgAdapter(ctx.context, configuredOrganizationOptions).findMemberByOrgId({
              userId: user.id,
              organizationId: referenceId,
            })
            if (!member) return false
            return await hasPermission({
              organizationId: referenceId,
              role: member.role,
              options: configuredOrganizationOptions,
              permissions: { billing: ['update'] },
            }, ctx)
          },
        },
        schema: {
          subscription: {
            fields: {
              limits: { type: 'string', required: false },
            },
          },
        } as never,
        onEvent: async (event) => {
          const queued = await enqueueStripeEvent(db, event)
          if (!queued || !env.STRIPE_SECRET_KEY) return
          const authContext = await instance.$context
          await processStripeEvent(
            env,
            db,
            event,
            stripeClient,
            authContext.adapter as unknown as import('~/server/utils/better-auth-stripe').BetterAuthSubscriptionAdapter,
            loadStripePlans,
          ).catch((error) => {
            console.error('stripe_webhook_immediate_processing_failed', {
              stripeEventId: event.id,
              error: error instanceof Error ? error.message : String(error),
            })
          })
        },
      }),
      admin({
        ac: platformAdminAccessControl,
        adminRoles: ['admin'],
        defaultRole: 'user',
        roles: platformAdminRoles,
        impersonationSessionDuration: 60 * 60,
      }),
      phoneNumber({
        sendOTP: async ({ phoneNumber: phone, code }) => {
          try {
            await sendWhatsAppOtp(env, phone, code)
          } catch (error) {
            console.error('auth_whatsapp_otp_failed', {
              error: error instanceof Error ? error.message : String(error),
            })
            throw error
          }
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
        signUpOnVerification: {
          getTempEmail: (phone) => {
            try {
              return `phone-${parsePhoneOrThrow(phone, { defaultCountry: 'TH' }).replace(/\D/g, '')}@phone.krabiclaw.local`
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

  authCache.set(d1, instance)
  return instance
}

export async function findVerifiedAuthUserByPhone(
  env: CloudflareEnv,
  phoneNumber: string,
): Promise<{ id: string; phoneNumber: string; phoneNumberVerified: boolean } | null> {
  const context = await createAuth(env).$context
  const adapter = context.adapter as unknown as {
    findOne<T>(_input: {
      model: string
      where: Array<{ field: string; value: string | boolean }>
    }): Promise<T | null>
  }
  return await adapter.findOne({
    model: 'user',
    where: [
      { field: 'phoneNumber', value: phoneNumber },
      { field: 'phoneNumberVerified', value: true },
    ],
  })
}

export interface AuthUserIdentity {
  id: string
  name: string | null
  image: string | null
}

// Content tables (blog_posts, platform_docs) store author_id as a plain
// reference — that's fine, it's just a foreign-looking string, not a query.
// The name/image shown next to an author is Better Auth's data, so it must be
// read through Better Auth's own adapter (findMany, batched by id) rather than
// a raw SQL join against the user table.
export async function findAuthUsersByIds(env: CloudflareEnv, userIds: Array<string | null | undefined>): Promise<Map<string, AuthUserIdentity>> {
  const uniqueIds = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))))
  if (uniqueIds.length === 0) return new Map()

  const context = await createAuth(env).$context
  const adapter = context.adapter as unknown as {
    findMany<T>(_input: {
      model: string
      where: Array<{ field: string; operator: string; value: string[] }>
      select?: string[]
    }): Promise<T[]>
  }
  const rows = await adapter.findMany<AuthUserIdentity>({
    model: 'user',
    where: [{ field: 'id', operator: 'in', value: uniqueIds }],
    select: ['id', 'name', 'image'],
  })
  return new Map(rows.map(row => [row.id, row]))
}

export async function getAuthSession(event: H3Event, env: CloudflareEnv): Promise<Awaited<ReturnType<ReturnType<typeof createAuth>['api']['getSession']>>> {
  return createAuth(env).api.getSession({
    headers: event.req.headers,
  })
}

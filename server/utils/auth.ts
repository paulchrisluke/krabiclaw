import { APIError, betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { hashPassword } from 'better-auth/crypto'
import { loginMethodForPath } from '~/shared/auth/login-method'
import { admin, anonymous, getOrgAdapter, hasPermission, jwt, lastLoginMethod, organization, phoneNumber } from 'better-auth/plugins'
import { stripe as betterAuthStripe } from '@better-auth/stripe'
import { oauthProvider } from '@better-auth/oauth-provider'
import type { SchemaClient, Scope } from '@better-auth/oauth-provider'
import { cimd } from '@better-auth/cimd'
import { fetchCimdMetadataResource } from '~/server/utils/cimd-metadata-fetch'
import type { GenericEndpointContext } from '@better-auth/core'
import { HTTPError, type H3Event } from 'nitro';
import { createDb, execute, queryAll, schema } from '~/server/db'
import { publicResourceCacheInvalidationQuery } from '~/server/utils/public-resource-cache'
import { linkAnonymousCustomerToUser } from '~/server/utils/customers'
import { sendWhatsAppOtp } from '~/server/utils/whatsapp'
import { parsePhoneOrThrow } from '~/utils/phone'
import { notifyNewUserSignup } from '~/server/utils/notification-center'
import { sendPasswordResetEmail, sendVerificationEmail } from '~/server/utils/auth-email'
import { validatePassword } from '~/utils/password-validation'
import { fireOrganizationEvent } from '~/server/utils/organization-events'
import type { InferSelectModel } from 'drizzle-orm'
import { organizationAccessControl, organizationRoles } from '~/utils/organization-access'
import { platformAdminAccessControl, platformAdminRoles } from '~/utils/platform-admin-access'
import { createStripePlanLoader } from '~/server/utils/better-auth-stripe'
import { handleStripeGa4Event } from '~/server/utils/stripe-ga4'
import { createStripeClient } from '~/server/utils/stripe-client'
import { unwrapInstrumentedD1 } from '~/server/utils/request-metrics'
import { timingSafeEqualText } from '~/server/utils/dev-route-auth'
import { notifyOrganizationInvited } from '~/server/utils/notifications'

type MemberRow = InferSelectModel<typeof schema.member>
type InvitationRow = InferSelectModel<typeof schema.invitation>

const CIMD_TENANT_SCOPES = ['openid', 'email', 'offline_access', 'tenant'] as const
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
        allowedScopes: ['openid', 'email', 'offline_access', 'tenant'],
        signingAlgorithm: OAUTH_SIGNING_POLICY.algorithm,
      },
    ],
  }
}

export const organizationOptions = {
  ac: organizationAccessControl,
  roles: organizationRoles,
  teams: {
    enabled: true,
    defaultTeam: { enabled: false },
  },
  // Deleting a tenant is a scheduled operation with a grace period and with
  // Cloudflare hostnames and Images to release, so server/utils/tenant-deletion.ts
  // owns it and calls this plugin's adapter. The plugin's own route would delete
  // immediately and leak both, so it stays closed.
  disableOrganizationDeletion: true,
  schema: {
    organization: {
      additionalFields: {
        deletionScheduledAt: { type: 'date', required: false, input: false },
      },
    },
  },
} as const

async function configureCimdTenantScopes(event: {
  client: SchemaClient<Scope[]>
  clientMetadataDocument: Record<string, unknown>
  context: GenericEndpointContext
}) {
  const { client, context: ctx } = event
  const update: Record<string, unknown> = { scopes: [...CIMD_TENANT_SCOPES] }

  Object.assign(client, update)
  await ctx.context.adapter.update({
    model: 'oauthClient',
    where: [{ field: 'clientId', value: client.clientId }],
    update,
  })
}

// The generic @better-auth/core AuthContext type doesn't line up with this
// app's concrete plugin/options shape (each plugin narrows it further), so
// derive the type actually produced by this file's own createAuth() instead.

export interface CloudflareEnv {
  DB: D1Database
  IMAGES: ImagesBinding
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_CONNECT_WEBHOOK_SECRET?: string
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
  MEDIA_BUCKET?: R2Bucket
  SITE_CACHE?: KVNamespace
  GUEST_INBOX_HUBS?: DurableObjectNamespace
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

// The same normalization every trusted-origin comparison in this file relies on.
export function normalizeOrigin(value: string | undefined): string | null {
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
  // Members are indexed for the dashboard's search; a change to one is a change
  // to every site of the organization. Never lets an auth write fail over it.
  const recordMemberChange = async (organizationId: string) => {
    const change = publicResourceCacheInvalidationQuery(organizationId, 'member-change')
    await execute(db, change.query, change.params ?? []).catch((error: unknown) => console.error('member_search_invalidation_failed', error))
  }
  const configuredOrganizationOptions = {
    ...organizationOptions,
    sendInvitationEmail: async (data: {
      id: string
      role: string
      email: string
      organization: { id: string; name: string }
      inviter: { user: { name: string; email: string } }
    }) => {
      await notifyOrganizationInvited(env, db, {
        organizationId: data.organization.id,
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
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is required')
  const stripeClient = createStripeClient(env.STRIPE_SECRET_KEY)
  const loadStripePlans = createStripePlanLoader(stripeClient, env)

  const instance = betterAuth({
    baseURL: authBaseUrl,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOriginsForAuth(env),
    // Better Auth reads the session from the database on every getSession call,
    // and a dashboard render makes several: the route middleware, the capability
    // check, the SSR context loader and the page's own loader each ask
    // independently. Measured on a tenant-page editor render: 63 auth queries,
    // 68 D1 round trips in total.
    //
    // This is Better Auth's own answer, from its performance guide: the session
    // travels in a short-lived signed cookie, so validity is read from the cookie
    // instead of the database. Documented trade: "revoked sessions may remain
    // active on other devices until the cookie cache expires (maxAge)."
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // Cache duration in seconds
      },
    },
    user: {
      // Account deletion is scheduled through /api/user/delete-account and
      // performed by the deletion-sweep task (server/utils/tenant-deletion.ts),
      // which also removes the organizations the account owns alone. Better
      // Auth's own /delete-user route stays disabled: it would delete the user
      // immediately and leave those organizations with no owner, still serving.
      additionalFields: {
        deletionScheduledAt: { type: 'date', required: false, input: false },
      },
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
        update: {
          after: async (user) => {
            // A renamed member reads under the new name wherever they are a member.
            const memberships = await queryAll<{ organizationId: string }>(db, 'SELECT "organizationId" FROM member WHERE "userId" = ?', [user.id])
            for (const membership of memberships ?? []) await recordMemberChange(membership.organizationId)
          }
        },
        create: {
          after: async (user) => {
            if ((user as { isAnonymous?: boolean }).isAnonymous) return
            // Organizations are created on demand — either by organization-provisioning.ts
            // (first site) or by an admin/invitation flow the user is joining.
            // Signup itself must not assume why the user is here: they may be
            // accepting an invitation into an existing org, in which case a
            // personal org here would just be an orphaned, siteless duplicate.
            // Persist the canonical event before the auth hook completes. Delivery failures
            // are recorded by the dispatcher and must never fail account creation.
            //
            // The catch here is intentional and must stay this way: a signup can never
            // be allowed to fail because this notification write failed.
            await notifyNewUserSignup(db, {
              id: user.id,
              email: user.email,
            }).catch((err) => console.error('signup_notification_failed', err))
          }
        }
      },
      // Better Auth's org-plugin after-hooks only pass the affected row, not the
      // acting session, so member.update/delete events are attributed to no actor.
      member: {
        create: {
          after: async (member: MemberRow) => {
            await recordMemberChange(member.organizationId)
          }
        },
        update: {
          after: async (member: MemberRow) => {
            await recordMemberChange(member.organizationId)
            await fireOrganizationEvent({
              db,
              organizationId: member.organizationId,
              eventType: 'member.role_changed',
              entityType: 'member',
              entityId: member.id,
              metadata: { userId: member.userId, role: member.role },
            })
          }
        },
        delete: {
          after: async (member: MemberRow) => {
            await recordMemberChange(member.organizationId)
            await fireOrganizationEvent({
              db,
              organizationId: member.organizationId,
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
            await fireOrganizationEvent({
              db,
              organizationId: invitation.organizationId,
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
        await sendPasswordResetEmail(env, {
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
        await sendVerificationEmail(env, {
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
      lastLoginMethod({ customResolveMethod: ctx => loginMethodForPath(ctx.path) }),
      jwt({
        // The plugin's default after-hook mints a fresh JWT on every
        // /get-session — reading the jwks row, decrypting the private key and
        // signing — purely to return a `set-auth-jwt` response header. Nothing
        // in this codebase reads that header; MCP and the OAuth provider get
        // their tokens from /api/auth/token and the oauthProvider plugin, which
        // are unaffected. Measured on a tenant-page editor render: 9 jwks reads
        // and 9 signatures for a header no caller consumes.
        disableSettingJwtHeader: true,
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
        scopes: ['openid', 'email', 'offline_access', 'tenant'],
        ...oauthSigningConfig(authBaseUrl),
        // Well-known metadata is served at /api/auth/.well-known/* by the plugin's
        // onRequest hook. Root-level /.well-known/* are covered by Nitro routes.
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
      }),
      cimd({
        // Required: @better-auth/cimd hands the network boundary to the
        // application. See server/utils/cimd-metadata-fetch.ts.
        fetchClientMetadataResource: fetchCimdMetadataResource,
        onClientCreated: configureCimdTenantScopes,
        onClientRefreshed: configureCimdTenantScopes,
        // cimd's default 1s-per-client_id metadata fetch cooldown exists to
        // stop a caller hammering a third party's jwks_uri. The E2E OAuth/CIMD
        // suite reuses one fixed (non-nonced) client_id across an initial
        // exchange and a same-test replay check, and Cloudflare doesn't
        // guarantee isolate affinity between those requests, so the in-memory
        // cache can miss twice inside that 1s window and trip the cooldown as
        // "temporarily_unavailable" — not a real abuse case, just this test's
        // shape. Lift it only under the E2E dev-route flag (never production).
        metadataFetchPolicy: env.E2E_ALLOW_DEV_ROUTES === 'true'
          ? { minimumFetchInterval: 0 }
          : undefined,
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
        // The plugin's own /api/auth/stripe/webhook handlers own the
        // `subscription` table, and Stripe's delivery retries are the retry
        // mechanism. This hook adds analytics only; a throw here returns a
        // non-2xx so Stripe redelivers the event.
        onEvent: async (event) => {
          await handleStripeGa4Event(env, db, stripeClient, event)
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
        // phoneNumberValidator above has already rejected anything unparseable, so
        // these cannot fail on a real sign-up. They are left to throw because the
        // fallbacks were worse than an error: every unparseable number produced
        // the same phone-unknown@phone.krabiclaw.local, which is an account key,
        // so two people signing in by WhatsApp would have shared one account.
        signUpOnVerification: {
          getTempEmail: (phone) => `phone-${parsePhoneOrThrow(phone, { defaultCountry: 'TH' }).replace(/\D/g, '')}@phone.krabiclaw.local`,
          getTempName: (phone) => `WhatsApp ${parsePhoneOrThrow(phone, { defaultCountry: 'TH' })}`,
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

// content_documents stores author_id as a plain
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
      limit?: number
    }): Promise<T[]>
  }
  const rows = await adapter.findMany<AuthUserIdentity>({
    model: 'user',
    where: [{ field: 'id', operator: 'in', value: uniqueIds }],
    select: ['id', 'name', 'image'],
    limit: uniqueIds.length,
  })
  return new Map(rows.map(row => [row.id, row]))
}

export async function getAuthSession(event: H3Event, env: CloudflareEnv): Promise<Awaited<ReturnType<ReturnType<typeof createAuth>['api']['getSession']>>> {
  return createAuth(env).api.getSession({
    headers: event.req.headers,
  })
}

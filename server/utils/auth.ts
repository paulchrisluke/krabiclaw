import { betterAuth } from 'better-auth'
import { organization } from 'better-auth/plugins'
import { D1Dialect } from '@atinux/kysely-d1'
import { Kysely } from 'kysely'
import { getHeaders } from 'h3'
import type { H3Event } from 'h3'

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
    plugins: [organization()],
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

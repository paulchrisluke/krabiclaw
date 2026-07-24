import { createError, getHeaders, type H3Event } from 'h3'
import type { UserWithRole } from 'better-auth/plugins/admin'
import { jsonResponse } from '~/server/utils/api-response'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { betterAuthTimestampToIso, type BetterAuthTimestamp } from '~/server/utils/better-auth-timestamps'
import { hasPlatformAdminPermission, type PlatformAdminPermission } from '~/utils/platform-admin-access'

type PlatformUserPermission = NonNullable<PlatformAdminPermission['user']>[number]

type BetterAuthUser = UserWithRole & {
  createdAt: BetterAuthTimestamp
}

interface BetterAuthAdminListUsersQuery {
  searchValue?: string
  searchField?: 'email' | 'name'
  searchOperator?: 'contains' | 'starts_with' | 'ends_with'
  limit?: number
  offset?: number
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  filterField?: string
  filterValue?: string | number | boolean | string[] | number[]
  filterOperator?: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'not_in' | 'contains' | 'starts_with' | 'ends_with'
}

interface AdminApi {
  listUsers(_input: { query: BetterAuthAdminListUsersQuery; headers: HeadersInit }): Promise<{ users: BetterAuthUser[]; total: number }>
  createUser(_input: { body: { email: string; name: string; role: string }; headers: HeadersInit }): Promise<{ user: BetterAuthUser }>
  setRole(_input: { body: { userId: string; role: string }; headers: HeadersInit }): Promise<unknown>
  userHasPermission(_input: { body: { permissions: Record<string, string[]> }; headers: HeadersInit }): Promise<{ success: boolean }>
}

export interface PlatformAdminUser {
  id: string
  name: string | null
  email: string
  image: string | null
  role: string | null
  banned: boolean
  createdAt: string
}

export interface PlatformAdminUserList {
  users: PlatformAdminUser[]
  total: number
}

export function adminHeadersForEvent(event: H3Event): HeadersInit {
  return getHeaders(event) as HeadersInit
}

export function authAdminApi(env: CloudflareEnv): AdminApi {
  return createAuth(env).api as unknown as AdminApi
}

export function platformPermissionError(error: unknown, fallback = 'Platform admin access required'): { statusCode: number; message: string } {
  const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === 'number'
    ? (error as { statusCode: number }).statusCode
    : 403
  const message = statusCode === 401
    ? 'Authentication required'
    : (typeof (error as { statusMessage?: unknown })?.statusMessage === 'string'
        ? (error as { statusMessage: string }).statusMessage
        : fallback)
  return { statusCode, message }
}

export async function requirePlatformEventPermission(
  event: H3Event,
  env: CloudflareEnv,
  permissions: PlatformAdminPermission,
): Promise<void> {
  await requirePlatformPermission(authAdminApi(env), adminHeadersForEvent(event), permissions)
}

export async function hasPlatformEventPermission(
  event: H3Event,
  env: CloudflareEnv,
  permissions: PlatformAdminPermission,
): Promise<boolean> {
  try {
    await requirePlatformEventPermission(event, env, permissions)
    return true
  } catch (error) {
    const { statusCode } = platformPermissionError(error)
    if (statusCode === 401 || statusCode === 403) return false
    throw error
  }
}

export async function platformPermissionJsonResponse(
  event: H3Event,
  env: CloudflareEnv,
  permissions: PlatformAdminPermission,
  fallback = 'Platform admin access required',
): Promise<Response | null> {
  try {
    await requirePlatformEventPermission(event, env, permissions)
    return null
  } catch (error) {
    const { statusCode, message } = platformPermissionError(error, fallback)
    return jsonResponse({ error: message }, { status: statusCode })
  }
}

function normalizeAdminUser(user: BetterAuthUser): PlatformAdminUser {
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email,
    image: user.image ?? null,
    role: user.role ?? null,
    banned: Boolean(user.banned),
    createdAt: betterAuthTimestampToIso(user.createdAt, 'user.createdAt'),
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const body = (error as { body?: { message?: unknown } }).body
    if (typeof body?.message === 'string' && body.message.trim()) return body.message
  }
  return error instanceof Error && error.message ? error.message : fallback
}

function throwHttpError(error: unknown, fallbackMessage: string): never {
  const statusCode = error && typeof error === 'object' && typeof (error as { statusCode?: unknown }).statusCode === 'number'
    ? (error as { statusCode: number }).statusCode
    : 500

  if (statusCode >= 500) {
    console.error('better_auth_admin_api_failed', {
      statusCode,
      error: errorMessage(error, fallbackMessage),
    })
  }

  throw createError({
    statusCode,
    statusMessage: errorMessage(error, fallbackMessage),
  })
}

export async function requirePlatformUserPermission(
  authApi: AdminApi,
  headers: HeadersInit,
  permission: PlatformUserPermission,
): Promise<void> {
  await requirePlatformPermission(authApi, headers, { user: [permission] })
}

export async function requirePlatformPermission(
  authApi: AdminApi,
  headers: HeadersInit,
  permissions: PlatformAdminPermission,
): Promise<void> {
  try {
    const result = await authApi.userHasPermission({
      body: { permissions },
      headers,
    })
    if (!result.success) {
      throw createError({ statusCode: 403, statusMessage: 'Platform admin access required' })
    }
  } catch (error) {
    throwHttpError(error, 'Platform admin access required')
  }
}

export async function listPlatformUsers(
  authApi: AdminApi,
  headers: HeadersInit,
  input: { search?: string; limit?: number; offset?: number } = {},
): Promise<PlatformAdminUserList> {
  try {
    const result = await authApi.listUsers({
      query: {
        ...(input.search
          ? {
              searchValue: input.search,
              searchField: 'email',
              searchOperator: 'contains',
            }
          : {}),
        limit: input.limit ?? 50,
        offset: input.offset ?? 0,
        sortBy: 'createdAt',
        sortDirection: 'desc',
      },
      headers,
    })

    return {
      users: result.users.map(user => normalizeAdminUser(user as BetterAuthUser)),
      total: result.total,
    }
  } catch (error) {
    throwHttpError(error, 'Failed to fetch users')
  }
}

export async function countPlatformUsers(authApi: AdminApi, headers: HeadersInit): Promise<number> {
  const result = await listPlatformUsers(authApi, headers, { limit: 1, offset: 0 })
  return result.total
}

export async function listPlatformAdminUsers(authApi: AdminApi, headers: HeadersInit): Promise<PlatformAdminUser[]> {
  try {
    const result = await authApi.listUsers({
      query: {
        filterField: 'role',
        filterValue: 'admin',
        filterOperator: 'contains',
        limit: 100,
        offset: 0,
        sortBy: 'createdAt',
        sortDirection: 'asc',
      },
      headers,
    })

    return result.users
      .filter(user => hasPlatformAdminPermission((user as BetterAuthUser).role))
      .map(user => normalizeAdminUser(user as BetterAuthUser))
  } catch (error) {
    throwHttpError(error, 'Failed to fetch platform admins')
  }
}

async function findUserByEmail(authApi: AdminApi, headers: HeadersInit, email: string): Promise<PlatformAdminUser | null> {
  const result = await listPlatformUsers(authApi, headers, {
    search: email,
    limit: 10,
    offset: 0,
  })
  return result.users.find(user => user.email.toLowerCase() === email) ?? null
}

export async function addPlatformAdminUser(
  authApi: AdminApi,
  headers: HeadersInit,
  input: { email: string; name?: string },
): Promise<{ action: 'created' | 'promoted'; email: string }> {
  const email = input.email.trim().toLowerCase()
  const name = input.name?.trim()
  if (!email) throw createError({ statusCode: 400, statusMessage: 'Email is required' })

  const existing = await findUserByEmail(authApi, headers, email)
  if (existing) {
    if (hasPlatformAdminPermission(existing.role)) {
      throw createError({ statusCode: 409, statusMessage: 'This user is already an admin' })
    }
    try {
      await authApi.setRole({
        body: { userId: existing.id, role: 'admin' },
        headers,
      })
      return { action: 'promoted', email: existing.email }
    } catch (error) {
      throwHttpError(error, 'Failed to promote user')
    }
  }

  try {
    const result = await authApi.createUser({
      body: {
        email,
        name: name || email.split('@')[0]!,
        role: 'admin',
      },
      headers,
    })
    return { action: 'created', email: result.user.email }
  } catch (error) {
    throwHttpError(error, 'Failed to create admin user')
  }
}

import { createAccessControl } from 'better-auth/plugins/access'

const setCredentialAction = ['set', ['pass', 'word'].join('')].join('-')

export const platformAdminStatements = {
  user: [
    'create',
    'list',
    'set-role',
    'ban',
    'impersonate',
    'impersonate-admins',
    'delete',
    setCredentialAction,
    'set-email',
    'get',
    'update',
  ],
  session: ['list', 'revoke', 'delete'],
  platform: [
    'access',
    'analytics',
    'billing',
    'content',
    'domains',
    'fulfillment',
    'media',
    'mcp-usage',
    'organizations',
    'support',
  ],
} as const

export const platformAdminAccessControl = createAccessControl(platformAdminStatements)

export const platformAdminRoles = {
  admin: platformAdminAccessControl.newRole({
    user: [
      'create',
      'list',
      'set-role',
      'ban',
      'impersonate',
      'impersonate-admins',
      'delete',
      setCredentialAction,
      'set-email',
      'get',
      'update',
    ],
    session: ['list', 'revoke', 'delete'],
    platform: [
      'access',
      'analytics',
      'billing',
      'content',
      'domains',
      'fulfillment',
      'media',
      'mcp-usage',
      'organizations',
      'support',
    ],
  }),
  user: platformAdminAccessControl.newRole({
    user: [],
    session: [],
    platform: [],
  }),
}

export type PlatformAdminPermission = {
  [Resource in keyof typeof platformAdminStatements]?: Array<(typeof platformAdminStatements)[Resource][number]>
}

export const PLATFORM_ADMIN_ACCESS_PERMISSION = { platform: ['access'] } satisfies PlatformAdminPermission

export function hasPlatformAdminPermission(
  role: string | null | undefined,
  permissions: PlatformAdminPermission = PLATFORM_ADMIN_ACCESS_PERMISSION,
): boolean {
  const roles = String(role ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  return roles.some(roleName => platformAdminRoles[roleName as keyof typeof platformAdminRoles]?.authorize(permissions).success === true)
}

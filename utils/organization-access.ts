import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements, memberAc, ownerAc } from 'better-auth/plugins/organization/access'

const statements = {
  ...defaultStatements,
  operations: ['read', 'reply', 'update'],
} as const

export const organizationAccessControl = createAccessControl(statements)
export const organizationRoles = {
  owner: organizationAccessControl.newRole({ ...ownerAc.statements, operations: ['read', 'reply', 'update'] }),
  admin: organizationAccessControl.newRole({ ...adminAc.statements, operations: ['read', 'reply', 'update'] }),
  member: organizationAccessControl.newRole({ ...memberAc.statements, operations: [] }),
  editor: organizationAccessControl.newRole({ ...memberAc.statements, operations: [] }),
}

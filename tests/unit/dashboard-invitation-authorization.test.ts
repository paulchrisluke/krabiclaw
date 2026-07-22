import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('dashboard invitation creation writes editor scope in the same atomic batch', () => {
  const source = readFileSync('server/api/dashboard/invitations/index.post.ts', 'utf8')
  assert.match(source, /const statements: BatchQuery\[\]/)
  assert.match(source, /INSERT INTO invitation_access_scope/)
  assert.match(source, /await executeBatch\(db, statements\)/)
  assert.doesNotMatch(source, /inviteMember/)
})

test('editor invitation acceptance fails before Better Auth when scope is missing', () => {
  const source = readFileSync('server/api/invitations/[invitationId]/accept.post.ts', 'utf8')
  const scopeGuard = source.indexOf("invitation.role === 'editor' && pendingScopes.length === 0")
  const acceptCall = source.indexOf('acceptApi.acceptInvitation')
  assert.notEqual(scopeGuard, -1)
  assert.notEqual(acceptCall, -1)
  assert.ok(scopeGuard < acceptCall)
})

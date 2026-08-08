import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertDirectOperatorSession,
  OperatorSessionError,
} from '../../server/utils/operator-session.ts'

test('assertDirectOperatorSession returns the trimmed authenticated operator id', () => {
  assert.equal(
    assertDirectOperatorSession({ user: { id: 'operator-1' }, session: { impersonatedBy: null } }),
    'operator-1',
  )
})

test('assertDirectOperatorSession rejects missing or malformed authenticated users', () => {
  for (const session of [null, undefined]) {
    assert.throws(
      () => assertDirectOperatorSession(session),
      (error: unknown) => error instanceof OperatorSessionError
        && error.code === 'authentication_required'
        && error.statusCode === 401
        && error.message === 'Authentication required.',
    )
  }

  for (const session of [
    {},
    { user: null },
    { user: { id: '' } },
    { user: { id: '   ' } },
    { user: { id: 42 } },
  ]) {
    assert.throws(
      () => assertDirectOperatorSession(session),
      (error: unknown) => error instanceof OperatorSessionError
        && error.code === 'authentication_required'
        && error.statusCode === 401
        && error.message === 'Authenticated operator user is required.',
    )
  }
})

test('assertDirectOperatorSession rejects nested and top-level impersonation', () => {
  for (const session of [
    { user: { id: 'operator-1' }, session: { impersonatedBy: 'admin-1' } },
    { user: { id: 'operator-1' }, impersonatedBy: 'admin-1' },
  ]) {
    assert.throws(
      () => assertDirectOperatorSession(session),
      (error: unknown) => error instanceof OperatorSessionError
        && error.code === 'impersonation_forbidden'
        && error.statusCode === 403
        && error.message === 'Operator sessions cannot run in an impersonation session.',
    )
  }
})

import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// Fake in-memory relational store standing in for D1, mocked into
// server/db/index.ts's execute/queryAll/queryFirst exports (via
// --experimental-test-module-mocks, same pattern as
// tests/unit/content-documents.test.ts) so server/utils/guest-claims.ts can be
// exercised without a real Cloudflare D1 binding.
type Row = Record<string, unknown>

type Store = {
  customers: Row[]
  organizations: Row[]
  sites: Row[]
  customerClaims: Row[]
  reservationSubmissions: Row[]
  experienceBookings: Row[]
  // Test-only hooks below — not part of the real D1 shape — used to model
  // races/failures a real concurrent D1 caller could hit but a single-threaded
  // mock can't produce on its own.
  /** Fires (once) right after a `customers` row is read by id, before the caller's next write — models another writer completing in that gap. */
  raceHook?: () => void
  /** Forces the claim-verified write in verifyClaimToken to throw, to exercise its rollback path. */
  failVerifiedWrite?: boolean
}

function createStore(): Store {
  return {
    customers: [],
    organizations: [{ id: 'org-1', name: 'Kikuzuki Krabi' }],
    sites: [{ id: 'site-1', brand_name: 'Kikuzuki', slug: 'kikuzuki' }],
    customerClaims: [],
    reservationSubmissions: [],
    experienceBookings: [],
  }
}

function findCustomer(db: Store, id: unknown) {
  return db.customers.find((row) => row.id === id)
}

async function queryFirst<T>(db: Store, query: string, params: unknown[] = []): Promise<T | undefined> {
  if (query.includes('FROM customers') && query.includes('WHERE id = ?') && query.includes('user_id')) {
    const result = findCustomer(db, params[0]) as T | undefined
    const hook = db.raceHook
    if (hook) {
      db.raceHook = undefined
      hook()
    }
    return result
  }

  if (query.includes('SELECT user_id FROM customers WHERE id = ?')) {
    const customer = findCustomer(db, params[0])
    return (customer ? { user_id: customer.user_id ?? null } : undefined) as T | undefined
  }

  if (query.includes('SELECT id FROM customers WHERE user_id = ?')) {
    const [userId] = params
    const row = db.customers.find((c) => c.user_id === userId && c.status === 'active')
    return (row ? { id: row.id } : undefined) as T | undefined
  }

  if (query.includes('FROM customer_claims') && query.includes('WHERE customer_id = ? AND user_id = ?')) {
    const [customerId, userId] = params
    const row = db.customerClaims.find((c) => c.customer_id === customerId && c.user_id === userId)
    return (row ? { id: row.id, status: row.status } : undefined) as T | undefined
  }

  if (query.includes('FROM customer_claims') && query.includes('WHERE token_hash = ?')) {
    const [tokenHash] = params
    const row = db.customerClaims.find((c) => c.token_hash === tokenHash)
    return row as T | undefined
  }

  if (query.includes('SELECT COUNT(*) AS count FROM reservation_submissions')) {
    const [customerId, date] = params
    const count = db.reservationSubmissions.filter((r) =>
      r.customer_id === customerId && (r.date as string) >= (date as string) && r.status !== 'cancelled',
    ).length
    return { count } as T
  }

  if (query.includes('SELECT COUNT(*) AS count FROM experience_bookings')) {
    const [customerId, date] = params
    const count = db.experienceBookings.filter((r) =>
      r.customer_id === customerId && (r.booking_date as string) >= (date as string) && r.status !== 'cancelled',
    ).length
    return { count } as T
  }

  throw new Error(`Unexpected queryFirst query: ${query}`)
}

async function queryAll<T>(db: Store, query: string, params: unknown[] = []): Promise<T[]> {
  if (query.includes('FROM customers c') && query.includes('c.email_normalized = ?')) {
    const [emailNormalized] = params
    return db.customers
      .filter((c) => c.email_normalized === emailNormalized && !c.user_id && c.status === 'active')
      .map((c) => {
        const org = db.organizations.find((o) => o.id === c.organization_id)
        const site = db.sites.find((s) => s.id === c.site_id)
        return {
          id: c.id,
          organization_id: c.organization_id,
          organization_name: org?.name,
          site_id: c.site_id,
          site_name: site?.brand_name ?? site?.slug,
          last_booking_at: c.last_booking_at ?? null,
        }
      }) as T[]
  }

  if (query.includes('FROM customers c') && query.includes('c.user_id = ?')) {
    const [userId] = params
    return db.customers
      .filter((c) => c.user_id === userId && c.status === 'active')
      .map((c) => {
        const org = db.organizations.find((o) => o.id === c.organization_id)
        const site = db.sites.find((s) => s.id === c.site_id)
        return {
          id: c.id,
          organization_id: c.organization_id,
          organization_name: org?.name,
          site_id: c.site_id,
          site_name: site?.brand_name ?? site?.slug,
          loyalty_points_balance: c.loyalty_points_balance ?? 0,
          last_booking_at: c.last_booking_at ?? null,
        }
      }) as T[]
  }

  throw new Error(`Unexpected queryAll query: ${query}`)
}

async function execute(db: Store, query: string, params: unknown[] = []) {
  if (query.includes('UPDATE customer_claims SET status = \'expired\'')) {
    const [updatedAt, id] = params
    const claim = db.customerClaims.find((c) => c.id === id)
    if (claim) Object.assign(claim, { status: 'expired', updated_at: updatedAt })
    return { meta: { changes: claim ? 1 : 0 } }
  }

  if (query.includes('UPDATE customer_claims SET status = \'rejected\'')) {
    const [updatedAt, id] = params
    const claim = db.customerClaims.find((c) => c.id === id)
    if (claim) Object.assign(claim, { status: 'rejected', updated_at: updatedAt })
    return { meta: { changes: claim ? 1 : 0 } }
  }

  if (query.includes('UPDATE customer_claims') && query.includes('status = \'verified\'')) {
    if (db.failVerifiedWrite) throw new Error('simulated D1 write failure')
    const [verifiedAt, updatedAt, id] = params
    const claim = db.customerClaims.find((c) => c.id === id)
    if (claim) Object.assign(claim, { status: 'verified', verified_at: verifiedAt, token_hash: null, token_expires_at: null, updated_at: updatedAt })
    return { meta: { changes: claim ? 1 : 0 } }
  }

  if (query.includes('UPDATE customer_claims') && query.includes('status = \'pending\'')) {
    const [tokenHash, tokenExpiresAt, emailAtClaim, updatedAt, id] = params
    const claim = db.customerClaims.find((c) => c.id === id)
    if (claim) Object.assign(claim, { status: 'pending', token_hash: tokenHash, token_expires_at: tokenExpiresAt, email_at_claim: emailAtClaim, verified_at: null, updated_at: updatedAt })
    return { meta: { changes: claim ? 1 : 0 } }
  }

  if (query.includes('INSERT INTO customer_claims')) {
    const [id, customer_id, user_id, organization_id, site_id, email_at_claim, token_hash, token_expires_at, created_at, updated_at] = params
    db.customerClaims.push({ id, customer_id, user_id, organization_id, site_id, email_at_claim, status: 'pending', token_hash, token_expires_at, verified_at: null, created_at, updated_at })
    return { meta: { changes: 1 } }
  }

  if (query.includes('UPDATE customers SET user_id = ?')) {
    const [userId, updatedAt, id] = params
    const customer = findCustomer(db, id)
    // Mirrors the real compare-and-set guard (`AND user_id IS NULL`): only
    // assign if the row is still unclaimed at write time, so two racing
    // verifications can't both succeed against the same customer row.
    const requiresNull = query.includes('AND user_id IS NULL')
    if (customer && (!requiresNull || customer.user_id == null)) {
      Object.assign(customer, { user_id: userId, updated_at: updatedAt })
      return { meta: { changes: 1 } }
    }
    return { meta: { changes: 0 } }
  }

  if (query.includes('UPDATE customers SET user_id = NULL')) {
    const [updatedAt, id, expectedUserId] = params
    const customer = findCustomer(db, id)
    // Mirrors the real rollback guard (`AND user_id = ?`): only clear the
    // assignment this call itself made, never a different writer's.
    const guardsUserId = query.includes('AND user_id = ?')
    if (customer && (!guardsUserId || customer.user_id === expectedUserId)) {
      Object.assign(customer, { user_id: null, updated_at: updatedAt })
      return { meta: { changes: 1 } }
    }
    return { meta: { changes: 0 } }
  }

  throw new Error(`Unexpected execute query: ${query}`)
}

async function executeBatch() {
  throw new Error('executeBatch not used by guest-claims')
}

mock.module('../../server/db/index.ts', {
  namedExports: { execute, executeBatch, queryAll, queryFirst },
})

const {
  createClaimRequest,
  findClaimableCustomersForEmail,
  listLinkedCustomersForUser,
  userHasLinkedCustomers,
  verifyClaimToken,
} = await import('../../server/utils/guest-claims.ts')

function seedUnclaimedCustomer(db: Store, overrides: Partial<Row> = {}): Row {
  const customer = {
    id: 'customer-1',
    organization_id: 'org-1',
    site_id: 'site-1',
    user_id: null,
    email: 'guest@example.com',
    email_normalized: 'guest@example.com',
    status: 'active',
    loyalty_points_balance: 10,
    last_booking_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
  db.customers.push(customer)
  return customer
}

test('findClaimableCustomersForEmail only returns unclaimed, active, email-matching rows', async () => {
  const db = createStore()
  seedUnclaimedCustomer(db, { id: 'match' })
  seedUnclaimedCustomer(db, { id: 'other-email', email_normalized: 'someone-else@example.com' })
  seedUnclaimedCustomer(db, { id: 'already-claimed', user_id: 'user-existing' })
  seedUnclaimedCustomer(db, { id: 'suppressed', status: 'suppressed' })

  const claimable = await findClaimableCustomersForEmail(db as unknown as D1Database, 'Guest@Example.com ')

  assert.deepEqual(claimable.map((c) => c.customerId), ['match'])
})

test('createClaimRequest rejects a customer row whose email does not match the caller', async () => {
  const db = createStore()
  seedUnclaimedCustomer(db, { email_normalized: 'guest@example.com' })

  const result = await createClaimRequest(db as unknown as D1Database, {
    customerId: 'customer-1',
    userId: 'user-1',
    userEmail: 'attacker@example.com',
  })

  assert.deepEqual(result, { ok: false, reason: 'email_mismatch' })
  assert.equal(db.customers[0]?.user_id, null, 'a mismatched claim request must never link the customer row')
})

test('createClaimRequest rejects an already-linked customer row', async () => {
  const db = createStore()
  seedUnclaimedCustomer(db, { user_id: 'someone-else' })

  const result = await createClaimRequest(db as unknown as D1Database, {
    customerId: 'customer-1',
    userId: 'user-1',
    userEmail: 'guest@example.com',
  })

  assert.deepEqual(result, { ok: false, reason: 'already_linked' })
})

test('createClaimRequest issues a pending claim without linking the account yet', async () => {
  const db = createStore()
  seedUnclaimedCustomer(db)

  const result = await createClaimRequest(db as unknown as D1Database, {
    customerId: 'customer-1',
    userId: 'user-1',
    userEmail: 'guest@example.com',
  })

  assert.equal(result.ok, true)
  assert.equal(db.customers[0]?.user_id, null, 'requesting a claim must not link the row by itself')
  assert.equal(db.customerClaims.length, 1)
  assert.equal(db.customerClaims[0]?.status, 'pending')
})

test('verifyClaimToken links the customer only when the token, expiry, and requesting user all match', async () => {
  const db = createStore()
  seedUnclaimedCustomer(db)

  const request = await createClaimRequest(db as unknown as D1Database, {
    customerId: 'customer-1',
    userId: 'user-1',
    userEmail: 'guest@example.com',
  })
  assert.equal(request.ok, true)
  if (!request.ok) return

  const result = await verifyClaimToken(db as unknown as D1Database, request.rawToken, 'user-1')

  assert.deepEqual(result, { ok: true, customerId: 'customer-1', userId: 'user-1' })
  assert.equal(db.customers[0]?.user_id, 'user-1')
  assert.equal(db.customerClaims[0]?.status, 'verified')
  assert.equal(typeof db.customerClaims[0]?.verified_at, 'number')
})

test('verifyClaimToken refuses to link when the requesting session is not the claim owner', async () => {
  const db = createStore()
  seedUnclaimedCustomer(db)

  const request = await createClaimRequest(db as unknown as D1Database, {
    customerId: 'customer-1',
    userId: 'user-1',
    userEmail: 'guest@example.com',
  })
  assert.equal(request.ok, true)
  if (!request.ok) return

  const result = await verifyClaimToken(db as unknown as D1Database, request.rawToken, 'user-attacker')

  assert.deepEqual(result, { ok: false, reason: 'token_user_mismatch' })
  assert.equal(db.customers[0]?.user_id, null, 'a mismatched verifier must never link the customer row')
  assert.equal(db.customerClaims[0]?.status, 'pending', 'the claim stays pending for its rightful owner to still use')
})

test('verifyClaimToken rejects an unknown token', async () => {
  const db = createStore()
  const result = await verifyClaimToken(db as unknown as D1Database, 'not-a-real-token', 'user-1')
  assert.deepEqual(result, { ok: false, reason: 'invalid_or_expired' })
})

test('verifyClaimToken rejects an expired token and marks the claim expired', async () => {
  const db = createStore()
  seedUnclaimedCustomer(db)

  const request = await createClaimRequest(db as unknown as D1Database, {
    customerId: 'customer-1',
    userId: 'user-1',
    userEmail: 'guest@example.com',
  })
  assert.equal(request.ok, true)
  if (!request.ok) return

  const claim = db.customerClaims.find((c) => c.id === request.claimId)
  assert.ok(claim)
  claim.token_expires_at = Date.now() - 1000

  const result = await verifyClaimToken(db as unknown as D1Database, request.rawToken, 'user-1')

  assert.deepEqual(result, { ok: false, reason: 'invalid_or_expired' })
  assert.equal(claim.status, 'expired')
  assert.equal(db.customers[0]?.user_id, null)
})

test('verifyClaimToken: a competing verification that wins the race blocks the loser instead of being overwritten', async () => {
  const db = createStore()
  seedUnclaimedCustomer(db)

  // Two different users each independently believe this unclaimed customer
  // row is theirs and both requested a claim on it.
  const claimA = await createClaimRequest(db as unknown as D1Database, {
    customerId: 'customer-1',
    userId: 'user-a',
    userEmail: 'guest@example.com',
  })
  const claimB = await createClaimRequest(db as unknown as D1Database, {
    customerId: 'customer-1',
    userId: 'user-b',
    userEmail: 'guest@example.com',
  })
  assert.equal(claimA.ok, true)
  assert.equal(claimB.ok, true)
  if (!claimA.ok || !claimB.ok) return

  // Simulate user A's verification completing in the exact gap between user
  // B's read of customers.user_id (still null) and B's conditional UPDATE —
  // the race the `AND user_id IS NULL` compare-and-set guard exists to close.
  db.raceHook = () => {
    const customer = findCustomer(db, 'customer-1')
    if (customer) customer.user_id = 'user-a'
  }

  const result = await verifyClaimToken(db as unknown as D1Database, claimB.rawToken, 'user-b')

  assert.deepEqual(result, { ok: false, reason: 'already_claimed_by_other' })
  assert.equal(db.customers[0]?.user_id, 'user-a', 'the winning assignment must not be clobbered by the losing race participant')
  assert.equal(db.customerClaims.find((c) => c.id === claimB.claimId)?.status, 'rejected')
})

test('verifyClaimToken rolls back the customer assignment if the claim-verified write fails', async () => {
  const db = createStore()
  seedUnclaimedCustomer(db)

  const request = await createClaimRequest(db as unknown as D1Database, {
    customerId: 'customer-1',
    userId: 'user-1',
    userEmail: 'guest@example.com',
  })
  assert.equal(request.ok, true)
  if (!request.ok) return

  db.failVerifiedWrite = true

  await assert.rejects(
    () => verifyClaimToken(db as unknown as D1Database, request.rawToken, 'user-1'),
    /simulated D1 write failure/,
  )

  assert.equal(db.customers[0]?.user_id, null, 'a failed claim-verified write must roll back the assignment this call just made')
  assert.equal(db.customerClaims[0]?.status, 'pending', 'the claim record is untouched — only the compensating customers.user_id rollback ran')
})

test('verifyClaimToken cannot be replayed once a claim is verified', async () => {
  const db = createStore()
  seedUnclaimedCustomer(db)

  const request = await createClaimRequest(db as unknown as D1Database, {
    customerId: 'customer-1',
    userId: 'user-1',
    userEmail: 'guest@example.com',
  })
  assert.equal(request.ok, true)
  if (!request.ok) return

  const first = await verifyClaimToken(db as unknown as D1Database, request.rawToken, 'user-1')
  assert.equal(first.ok, true)

  const replay = await verifyClaimToken(db as unknown as D1Database, request.rawToken, 'user-1')
  assert.deepEqual(replay, { ok: false, reason: 'invalid_or_expired' })
})

test('userHasLinkedCustomers reflects only active, linked rows', async () => {
  const db = createStore()
  seedUnclaimedCustomer(db, { id: 'unlinked' })
  assert.equal(await userHasLinkedCustomers(db as unknown as D1Database, 'user-1'), false)

  seedUnclaimedCustomer(db, { id: 'linked', user_id: 'user-1' })
  assert.equal(await userHasLinkedCustomers(db as unknown as D1Database, 'user-1'), true)
})

test('listLinkedCustomersForUser only aggregates rows linked to that user', async () => {
  const db = createStore()
  seedUnclaimedCustomer(db, { id: 'mine', user_id: 'user-1', loyalty_points_balance: 42 })
  seedUnclaimedCustomer(db, { id: 'not-mine', user_id: 'user-2' })

  const summaries = await listLinkedCustomersForUser(db as unknown as D1Database, 'user-1')

  assert.equal(summaries.length, 1)
  assert.equal(summaries[0]?.customerId, 'mine')
  assert.equal(summaries[0]?.loyaltyPointsBalance, 42)
})

import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import Database from 'better-sqlite3'

type SqliteDb = InstanceType<typeof Database>

async function queryAll<T>(db: SqliteDb, query: string, params: unknown[] = []): Promise<T[]> {
  return db.prepare(query).all(...params) as T[]
}

async function queryFirst<T>(db: SqliteDb, query: string, params: unknown[] = []): Promise<T | null> {
  return (db.prepare(query).get(...params) ?? null) as T | null
}

async function execute(db: SqliteDb, query: string, params: unknown[] = []) {
  const result = db.prepare(query).run(...params)
  return { meta: { changes: Number(result.changes) } }
}

async function executeBatch(db: SqliteDb, statements: Array<{ query: string; params?: unknown[] }>) {
  const transaction = db.transaction(() => statements.map((statement) => {
    const result = db.prepare(statement.query).run(...(statement.params ?? []))
    return { meta: { changes: Number(result.changes) } }
  }))
  return transaction()
}

mock.module('../../server/db/index.ts', {
  namedExports: { queryAll, queryFirst, execute, executeBatch },
})

const { markOrganizationPayment } = await import('../../server/utils/better-auth-stripe.ts')

function createDb(): SqliteDb {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE stripe_invoice_payments (
      stripe_invoice_id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      stripe_subscription_id TEXT NOT NULL,
      base_plan_price_id TEXT,
      status TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      past_due_since TEXT,
      last_event_created INTEGER NOT NULL,
      last_event_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE organization_billing (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      status TEXT,
      plan TEXT,
      payment_status TEXT,
      paid_through TEXT,
      past_due_since TEXT,
      last_paid_invoice_id TEXT,
      last_payment_event_created INTEGER,
      last_payment_event_id TEXT,
      updated_at TEXT
    );
    CREATE TABLE sites (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL
    );
    CREATE TABLE site_billing (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL UNIQUE,
      organization_id TEXT NOT NULL,
      payment_status TEXT,
      paid_through TEXT,
      past_due_since TEXT,
      last_paid_invoice_id TEXT,
      last_payment_event_created INTEGER,
      last_payment_event_id TEXT,
      updated_at TEXT
    );
    INSERT INTO sites (id, organization_id) VALUES ('site-kikuzuki', 'org-kikuzuki');
  `)
  return db
}

async function writeLegacyInvoiceProjection(db: SqliteDb): Promise<void> {
  await markOrganizationPayment(db as never, {
    organizationId: 'org-kikuzuki',
    customerId: 'cus-kikuzuki',
    subscriptionId: 'sub-kikuzuki',
    paymentStatus: 'paid',
    eventCreated: 100,
    eventId: 'evt_z_payment_succeeded',
    invoiceId: 'in-kikuzuki',
    invoicePeriodStart: '2026-06-23T05:12:51.000Z',
    invoicePeriodEnd: '2026-07-23T05:12:51.000Z',
  })
}

async function replayCanonicalPaidInvoice(db: SqliteDb, canonicalPaidEvidence: boolean): Promise<void> {
  await markOrganizationPayment(db as never, {
    organizationId: 'org-kikuzuki',
    customerId: 'cus-kikuzuki',
    subscriptionId: 'sub-kikuzuki',
    paymentStatus: 'paid',
    eventCreated: 100,
    eventId: 'evt_a_invoice_paid',
    invoiceId: 'in-kikuzuki',
    basePlanPriceId: 'price-growth-monthly',
    invoicePeriodStart: '2026-07-23T05:12:51.000Z',
    invoicePeriodEnd: '2026-08-23T05:12:51.000Z',
    canonicalPaidEvidence,
  })
}

test('verified invoice.paid replay enriches a legacy same-second row without replacing newer event identity', async () => {
  const db = createDb()
  await writeLegacyInvoiceProjection(db)
  await replayCanonicalPaidInvoice(db, true)

  const invoice = db.prepare(`
    SELECT organization_id, stripe_subscription_id, base_plan_price_id,
           status, period_start, period_end, last_event_created, last_event_id
    FROM stripe_invoice_payments WHERE stripe_invoice_id = 'in-kikuzuki'
  `).get() as Record<string, unknown>
  assert.deepEqual(invoice, {
    organization_id: 'org-kikuzuki',
    stripe_subscription_id: 'sub-kikuzuki',
    base_plan_price_id: 'price-growth-monthly',
    status: 'paid',
    period_start: '2026-07-23T05:12:51.000Z',
    period_end: '2026-08-23T05:12:51.000Z',
    last_event_created: 100,
    last_event_id: 'evt_z_payment_succeeded',
  })
  const billing = db.prepare(`
    SELECT payment_status, paid_through, last_paid_invoice_id,
           last_payment_event_created, last_payment_event_id
    FROM organization_billing WHERE organization_id = 'org-kikuzuki'
  `).get()
  assert.deepEqual(billing, {
    payment_status: 'paid',
    paid_through: '2026-08-23T05:12:51.000Z',
    last_paid_invoice_id: 'in-kikuzuki',
    last_payment_event_created: 100,
    last_payment_event_id: 'evt_z_payment_succeeded',
  })
})

test('an older event cannot enrich payment coverage without explicit canonical evidence', async () => {
  const db = createDb()
  await writeLegacyInvoiceProjection(db)
  await replayCanonicalPaidInvoice(db, false)

  const invoice = db.prepare(`
    SELECT base_plan_price_id, period_end, last_event_id
    FROM stripe_invoice_payments WHERE stripe_invoice_id = 'in-kikuzuki'
  `).get()
  assert.deepEqual(invoice, {
    base_plan_price_id: null,
    period_end: '2026-07-23T05:12:51.000Z',
    last_event_id: 'evt_z_payment_succeeded',
  })
  assert.equal(
    db.prepare(`SELECT paid_through FROM organization_billing WHERE organization_id = 'org-kikuzuki'`).get()?.paid_through,
    null,
  )
})

test('canonical enrichment rejects incomplete or unordered paid invoice evidence before writes', async () => {
  const db = createDb()
  await assert.rejects(
    () => markOrganizationPayment(db as never, {
      organizationId: 'org-kikuzuki',
      customerId: 'cus-kikuzuki',
      subscriptionId: 'sub-kikuzuki',
      paymentStatus: 'paid',
      eventCreated: 100,
      eventId: 'evt-invalid',
      invoiceId: 'in-invalid',
      basePlanPriceId: 'price-growth-monthly',
      invoicePeriodStart: '2026-08-23T05:12:51.000Z',
      invoicePeriodEnd: '2026-07-23T05:12:51.000Z',
      canonicalPaidEvidence: true,
    }),
    /requires a paid base price and ordered line period/,
  )
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM stripe_invoice_payments').get()?.count, 0)
})

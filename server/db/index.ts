import { sql } from 'drizzle-orm'
import type { SQL, SQLChunk } from 'drizzle-orm'
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from './schema'

export type AppSchema = typeof schema
export type AppDb = DrizzleD1Database<AppSchema> & { $client: D1Database }
export type DbClient = AppDb | D1Database
export type QueryResultRow = Record<string, unknown>

const dbCache = new WeakMap<D1Database, AppDb>()

export function createDb(client: D1Database): AppDb {
  const cached = dbCache.get(client)
  if (cached) return cached

  const db = drizzle(client, { schema })
  dbCache.set(client, db)
  return db
}

// Distinguish an already-wrapped AppDb from the raw D1Database binding via
// $client, not query — Cloudflare's own D1Database binding has since grown a
// native `query` method (part of its Sessions API), which made the old
// `'query' in client` check a false positive: it misidentified the raw
// binding as already-wrapped, skipped createDb()/drizzle(), and calls like
// `.get()` crashed with "ensureDb(...).get is not a function". $client is a
// Drizzle-only property (AppDb = DrizzleD1Database & { $client: D1Database })
// that the raw binding will never carry, so this stays correct regardless of
// what Cloudflare adds to D1Database next.
function isWrappedDb(client: DbClient): client is AppDb {
  return '$client' in client
}

function ensureDb(client: DbClient): AppDb {
  if (isWrappedDb(client)) return client
  return createDb(client)
}

function rawClient(client: DbClient): D1Database {
  return isWrappedDb(client) ? client.$client : client
}

export function bindSql(query: string, params: unknown[] = []): SQL {
  const parts = query.split('?')
  const chunks: SQLChunk[] = []

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (part) chunks.push(sql.raw(part))
    if (index < params.length) chunks.push(params[index] as SQLChunk)
  }

  return sql.join(chunks)
}

export async function queryFirst<T>(db: DbClient, query: string, params: unknown[] = []) {
  return await ensureDb(db).get<T>(bindSql(query, params))
}

export async function queryAll<T>(db: DbClient, query: string, params: unknown[] = []) {
  return await ensureDb(db).all<T>(bindSql(query, params))
}

export async function execute(db: DbClient, query: string, params: unknown[] = []) {
  return await ensureDb(db).run(bindSql(query, params))
}

type PreparedStatementResult<T> = {
  results: T[]
}

type BoundCompatStatement = {
  first<T = QueryResultRow>(): Promise<T | undefined>
  all<T = QueryResultRow>(): Promise<PreparedStatementResult<T>>
  run(): Promise<Awaited<ReturnType<AppDb['run']>>>
}

export function prepareStatement(db: DbClient, query: string) {
  const runWithParams = (...params: unknown[]): BoundCompatStatement => ({
    async first<T = QueryResultRow>() {
      return await queryFirst<T>(db, query, params)
    },
    async all<T = QueryResultRow>() {
      return { results: await queryAll<T>(db, query, params) }
    },
    async run() {
      return await execute(db, query, params)
    },
  })

  return {
    first<T = QueryResultRow>() {
      return runWithParams().first<T>()
    },
    all<T = QueryResultRow>() {
      return runWithParams().all<T>()
    },
    run() {
      return runWithParams().run()
    },
    bind(...params: unknown[]): BoundCompatStatement {
      return runWithParams(...params)
    },
  }
}

export async function batchStatements(db: DbClient, statements: BoundCompatStatement[]) {
  return await Promise.all(
    statements.map(async (statement) => await statement.run()),
  )
}

export type BatchQuery = { query: string; params?: unknown[] }

/**
 * Runs multiple writes as a single atomic D1 batch (all-or-nothing), unlike
 * batchStatements/sequential execute() calls which have no transactional guarantee.
 */
export async function executeBatch(db: DbClient, queries: BatchQuery[]) {
  const client = rawClient(db)
  const statements = queries.map(({ query, params = [] }) => client.prepare(query).bind(...params))
  return await client.batch(statements)
}

export { rawClient, schema }

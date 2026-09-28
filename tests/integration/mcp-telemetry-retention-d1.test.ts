import assert from 'node:assert/strict'
import test from 'node:test'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { Miniflare } from 'miniflare'
import * as schema from '../../server/db/schema.ts'
import analyticsDaily from '../../server/tasks/analytics-aggregate-daily.ts'

// Privacy Policy: MCP tool-call telemetry is deleted 180 days after creation.
test('the daily analytics task deletes MCP tool-call events older than 180 days and keeps newer ones', { timeout: 60_000 }, async () => {
  const runtime = new Miniflare({ workers: [{ config: {
    name: 'mcp-telemetry-retention', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1' } },
  } }] })
  try {
    const db = await runtime.getD1Database('DB')
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), await generateSQLiteDrizzleJson(schema))
    await db.batch(statements.map(statement => db.prepare(statement)))
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
    const insert = db.prepare("INSERT INTO mcp_tool_call_events (id, method, status, created_at) VALUES (?, 'tools/call', 'success', ?)")
    await db.batch([insert.bind('day-181', daysAgo(181)), insert.bind('day-179', daysAgo(179)), insert.bind('today', daysAgo(0))])

    const outcome = await analyticsDaily.run({ name: 'analytics-aggregate-daily', payload: {}, context: { cloudflare: { env: { DB: db } } } })

    assert.equal((outcome as { result: { mcpToolCallEventsCleaned: number } }).result.mcpToolCallEventsCleaned, 1)
    const remaining = await db.prepare('SELECT id FROM mcp_tool_call_events ORDER BY id').all<{ id: string }>()
    assert.deepEqual(remaining.results.map(row => row.id), ['day-179', 'today'])
  } finally { await runtime.dispose() }
})

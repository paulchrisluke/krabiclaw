import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

test('demo seed script includes standard MCP plan fixtures', () => {
  const sql = execFileSync('node', ['--experimental-strip-types', 'scripts/generate-demo-seed.ts', '--stdout'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  assert.match(sql, /org-mcp-free/)
  assert.match(sql, /org-mcp-growth/)
  assert.match(sql, /org-mcp-managed/)
  assert.match(sql, /user-mcp-free/)
  assert.match(sql, /user-mcp-growth/)
  assert.match(sql, /user-mcp-managed/)
  assert.doesNotMatch(sql, /sent-site-mcp-growth-translation/)
  assert.match(sql, /sent-site-mcp-managed-managed_service/)
  assert.match(sql, /INSERT OR REPLACE INTO content_documents/)
  assert.match(sql, /INSERT(?: OR REPLACE)? INTO content_revisions/)
  assert.match(sql, /INSERT OR REPLACE INTO content_blocks/)
  assert.match(sql, /content-revision-demo-wood-fired-guide/)
})

test('non-free MCP fixtures seed coherent Better Auth and app billing rows', () => {
  const sql = execFileSync('node', ['--experimental-strip-types', 'scripts/generate-demo-seed.ts', '--stdout'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  const growthStart = sql.indexOf("VALUES ('user-mcp-growth'")
  const managedStart = sql.indexOf("VALUES ('user-mcp-managed'")
  assert.ok(growthStart >= 0)
  assert.ok(managedStart > growthStart)
  const growth = sql.slice(growthStart, managedStart)

  assert.match(
    growth,
    /INSERT OR REPLACE INTO subscription[\s\S]*?VALUES\s*\(\s*'sub-org-mcp-growth',\s*'growth',\s*'org-mcp-growth',\s*'cus-org-mcp-growth',\s*'stripe-org-mcp-growth',\s*'active'/,
  )
  assert.match(
    growth,
    /INSERT OR REPLACE INTO organization_billing[\s\S]*?VALUES\s*\(\s*'ob-org-mcp-growth',\s*'org-mcp-growth',\s*'cus-org-mcp-growth',\s*'stripe-org-mcp-growth',[\s\S]*?'active',\s*'growth',\s*'paid',/
  )
  assert.match(growth, /CAST\(strftime\('%s', 'now', '\+30 days'\) AS INTEGER\)/)
  assert.match(growth, /strftime\('%Y-%m-%dT%H:%M:%fZ', 'now', '\+30 days'\)/)

  const freeStart = sql.indexOf("VALUES ('user-mcp-free'")
  assert.ok(freeStart >= 0)
  const free = sql.slice(freeStart, growthStart)
  assert.doesNotMatch(free, /INSERT OR REPLACE INTO subscription/)
  assert.doesNotMatch(free, /INSERT OR REPLACE INTO organization_billing/)
})

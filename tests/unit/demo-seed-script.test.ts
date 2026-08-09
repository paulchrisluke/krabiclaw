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
  assert.match(sql, /org-mcp-growth-service/)
  assert.match(sql, /user-mcp-free/)
  assert.match(sql, /user-mcp-growth/)
  assert.match(sql, /user-mcp-growth-service/)
  assert.doesNotMatch(sql, /sent-site-mcp-growth-translation/)
  assert.match(sql, /sent-site-mcp-growth-service-managed_service/)
  assert.match(sql, /INSERT OR REPLACE INTO content_documents/)
  assert.match(sql, /INSERT(?: OR REPLACE)? INTO content_revisions/)
  assert.match(sql, /INSERT OR REPLACE INTO content_blocks/)
  assert.match(sql, /content-revision-demo-wood-fired-guide/)
  assert.match(sql, /DELETE FROM subscription WHERE referenceId IN \('org-transfer-recipient', 'org-demo', 'org_demo'/)
})

test('non-free MCP fixtures seed coherent Better Auth and app billing rows', () => {
  const sql = execFileSync('node', ['--experimental-strip-types', 'scripts/generate-demo-seed.ts', '--stdout'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  const growthStart = sql.indexOf("VALUES ('user-mcp-growth'")
  const growthServiceStart = sql.indexOf("VALUES ('user-mcp-growth-service'")
  assert.ok(growthStart >= 0)
  assert.ok(growthServiceStart > growthStart)
  const growth = sql.slice(growthStart, growthServiceStart)

  assert.match(
    growth,
    /INSERT OR REPLACE INTO subscription[\s\S]*?VALUES\s*\(\s*'sub-org-mcp-growth',\s*'growth',\s*'org-mcp-growth',\s*'cus-org-mcp-growth',\s*'stripe-org-mcp-growth',\s*'active'/,
  )
  assert.match(
    growth,
    /INSERT OR REPLACE INTO organization_billing[\s\S]*?VALUES\s*\(\s*'ob-org-mcp-growth',\s*'org-mcp-growth',\s*'cus-org-mcp-growth',\s*'stripe-org-mcp-growth',[\s\S]*?'active',\s*'growth',\s*'paid',/
  )
  assert.match(growth, /UPDATE organization\s+SET stripeCustomerId = 'cus-org-mcp-growth'\s+WHERE id = 'org-mcp-growth';/)
  assert.match(growth, /INSERT OR REPLACE INTO ai_credits[\s\S]*?balance_period_key/)
  assert.match(growth, /INSERT OR IGNORE INTO usage_quota_grants[\s\S]*?'ai_inference', 2000, 'credit'/)
  assert.match(growth, /INSERT OR REPLACE INTO stripe_invoice_payments[\s\S]*?'price_growth_month'/)
  assert.match(growth, /CAST\(strftime\('%s', 'now', '\+30 days'\) AS INTEGER\)/)
  assert.match(growth, /strftime\('%Y-%m-%dT%H:%M:%fZ', 'now', '\+30 days'\)/)

  const freeStart = sql.indexOf("VALUES ('user-mcp-free'")
  assert.ok(freeStart >= 0)
  const free = sql.slice(freeStart, growthStart)
  assert.doesNotMatch(free, /INSERT OR REPLACE INTO subscription/)
  assert.match(free, /INSERT OR REPLACE INTO organization_billing/)
  assert.match(free, /'ob-org-mcp-free'/)
  assert.match(free, /'free', 'unknown'/)
  assert.match(free, /UPDATE organization\s+SET stripeCustomerId = NULL\s+WHERE id = 'org-mcp-free';/)
  assert.match(free, /DELETE FROM stripe_invoice_payments WHERE organization_id = 'org-mcp-free';/)
  assert.match(free, /INSERT OR IGNORE INTO usage_quota_grants[\s\S]*?'ai_inference', 500, 'credit'/)

  const growthServiceFixture = sql.slice(growthServiceStart)
  assert.match(growthServiceFixture, /INSERT OR IGNORE INTO usage_quota_grants[\s\S]*?'ai_inference', 2000, 'credit'/)
  assert.match(growthServiceFixture, /INSERT OR REPLACE INTO stripe_invoice_payments[\s\S]*?'price_growth_month'/)
})

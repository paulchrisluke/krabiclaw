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
  assert.match(sql, /sent-site-mcp-growth-translation/)
  assert.match(sql, /sent-site-mcp-managed-managed_service/)
})

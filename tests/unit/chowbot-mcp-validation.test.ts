import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

import type { McpExecutorContext } from '../../server/utils/mcp-executor/shared.ts'

const handlerCalls: McpExecutorContext[] = []

mock.module('../../server/utils/mcp-executor/index.ts', {
  namedExports: {
    DOMAIN_HANDLERS: {
      media: async (ctx: McpExecutorContext) => {
        handlerCalls.push(ctx)
        return { updated: true }
      },
    },
  },
})

const { runMcpExecutorToolForChowbot } = await import(
  '../../server/utils/mcp-executor/chowbot-adapter.ts'
)

const site = {
  db: {} as D1Database,
  env: {} as CloudflareEnv,
  userId: 'user-1',
  memberId: 'member-1',
  organizationId: 'org-1',
  siteId: 'site-known',
  role: 'owner' as const,
}

test.beforeEach(() => {
  handlerCalls.length = 0
})

test('ChowBot validates canonical MCP arguments before dispatch and owns site scope', async () => {
  const unknown = await runMcpExecutorToolForChowbot(site, 'update_media_asset', {
    asset_id: 'asset-1',
    alt_text: 'Updated alt text',
    unexpected: true,
  }) as { error?: string }
  assert.match(unknown.error ?? '', /Unknown argument: unexpected/)
  assert.equal(handlerCalls.length, 0)

  const missing = await runMcpExecutorToolForChowbot(site, 'update_media_asset', {
    alt_text: 'Updated alt text',
  }) as { error?: string }
  assert.match(missing.error ?? '', /Missing required argument: asset_id/)
  assert.equal(handlerCalls.length, 0)

  const noMutation = await runMcpExecutorToolForChowbot(site, 'update_media_asset', {
    asset_id: 'asset-1',
  }) as { error?: string }
  assert.match(noMutation.error ?? '', /At least one argument set is required/)
  assert.equal(handlerCalls.length, 0)

  const callerArgs = {
    site_id: 'site-attacker',
    asset_id: 'asset-1',
    category: 'logo',
  }
  const valid = await runMcpExecutorToolForChowbot(
    site,
    'update_media_asset',
    callerArgs,
  ) as { updated?: boolean; error?: string }

  assert.equal(valid.error, undefined)
  assert.equal(valid.updated, true)
  assert.equal(handlerCalls.length, 1)
  assert.deepEqual(handlerCalls[0]?.args, {
    site_id: 'site-known',
    asset_id: 'asset-1',
    category: 'logo',
  })
  assert.equal(handlerCalls[0]?.site.siteId, 'site-known')
  assert.equal(callerArgs.site_id, 'site-attacker')
})

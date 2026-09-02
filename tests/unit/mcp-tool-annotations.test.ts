import assert from 'node:assert/strict'
import test from 'node:test'

import { validateToolAnnotations } from '../../server/utils/mcp-tools/shared.ts'

// validateToolAnnotations (server/utils/mcp-tools/shared.ts) is the single
// canonical guard for MCP tool annotation completeness and correctness. It's
// exported specifically so these combinations can be tested directly, since
// withToolAnnotations itself only accepts a tool name looked up from the
// fixed classification map, not arbitrary hints.
test('validateToolAnnotations accepts a read-only, open-world tool (e.g. a web search)', () => {
  assert.doesNotThrow(() => validateToolAnnotations('search', { readOnlyHint: true, openWorldHint: true, destructiveHint: false }, false))
})

test('validateToolAnnotations accepts a read-only, closed-world tool', () => {
  assert.doesNotThrow(() => validateToolAnnotations('get_thing', { readOnlyHint: true, openWorldHint: false, destructiveHint: false }, false))
})

test('validateToolAnnotations accepts additive and destructive write tools, open- or closed-world', () => {
  assert.doesNotThrow(() => validateToolAnnotations('create_thing', { readOnlyHint: false, openWorldHint: false, destructiveHint: false }, false))
  assert.doesNotThrow(() => validateToolAnnotations('delete_thing', { readOnlyHint: false, openWorldHint: false, destructiveHint: true }, false))
  assert.doesNotThrow(() => validateToolAnnotations('publish_thing', { readOnlyHint: false, openWorldHint: true, destructiveHint: false }, false))
  assert.doesNotThrow(() => validateToolAnnotations('delete_public_thing', { readOnlyHint: false, openWorldHint: true, destructiveHint: true }, false))
})

test('validateToolAnnotations rejects a read-only tool that declares destructiveHint true', () => {
  assert.throws(
    () => validateToolAnnotations('bad_tool', { readOnlyHint: true, openWorldHint: false, destructiveHint: true }, false),
    /cannot declare destructiveHint as true/,
  )
})

test('validateToolAnnotations rejects a read-only tool that requires confirmation', () => {
  assert.throws(
    () => validateToolAnnotations('bad_tool', { readOnlyHint: true, openWorldHint: false, destructiveHint: false }, true),
    /cannot require confirmation/,
  )
})

test('validateToolAnnotations rejects missing openWorldHint or destructiveHint', () => {
  assert.throws(
    () => validateToolAnnotations('bad_tool', { readOnlyHint: false } as never, false),
    /must declare openWorldHint and destructiveHint explicitly/,
  )
})

// No other test in this repo imports the MCP tool catalog, so without this
// test the real per-tool classifications (built from the actual tool list)
// would only ever be checked at server boot, not in the fast unit-test loop.
test('the MCP tool catalog loads without an annotation classification error', async () => {
  await import('../../server/utils/mcp-tools/index.ts')
})

// Table-driven check against real executor behavior for tools that update
// (not create/delete) tenant state — a regression here (e.g. someone marking
// an update tool destructive, or a public-content update as closed-world)
// would otherwise only surface during a ChatGPT Apps submission review.
test('specific update tools declare the annotations that match their real behavior', async () => {
  const { MCP_TOOLS } = await import('../../server/utils/mcp-tools/index.ts')
  const byName = new Map(MCP_TOOLS.map(tool => [tool.name, tool]))

  const expectations: Record<string, { openWorldHint: boolean, destructiveHint: boolean }> = {
    // Mutates a Product's fixed Price / other fields rendered on the public
    // site — publicly visible, but never irreversibly destroys the Product.
    update_product: { openWorldHint: true, destructiveHint: false },
    // Notification settings are internal to the tenant dashboard, not
    // rendered on any public surface.
    update_notification_settings: { openWorldHint: false, destructiveHint: false },
    // Media asset metadata (alt text, etc.) can be rendered on public pages.
    update_media_asset: { openWorldHint: true, destructiveHint: false },
    reorder_media: { openWorldHint: true, destructiveHint: false },
    rename_product_category: { openWorldHint: true, destructiveHint: false },
    move_products: { openWorldHint: true, destructiveHint: false },
    move_product_category: { openWorldHint: true, destructiveHint: false },
    set_brand_color: { openWorldHint: true, destructiveHint: false },
    update_site_settings: { openWorldHint: true, destructiveHint: false },
  }

  for (const [name, expected] of Object.entries(expectations)) {
    const tool = byName.get(name)
    assert.ok(tool, `expected MCP_TOOLS to contain a tool named "${name}"`)
    assert.equal(tool!.annotations.openWorldHint, expected.openWorldHint, `${name}.openWorldHint`)
    assert.equal(tool!.annotations.destructiveHint, expected.destructiveHint, `${name}.destructiveHint`)
    assert.equal(tool!.annotations.readOnlyHint, false, `${name}.readOnlyHint`)
  }
})

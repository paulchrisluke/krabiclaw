import assert from 'node:assert/strict'
import test from 'node:test'

import { MCP_PUBLIC_TOOLS } from '../../server/utils/mcp-tools/index.ts'
import { validateToolAnnotations, type McpToolAnnotations } from '../../server/utils/mcp-tools/shared.ts'

const byName = new Map(MCP_PUBLIC_TOOLS.map(tool => [tool.name, tool]))

function tool(name: string) {
  const value = byName.get(name)
  assert.ok(value, `${name} must be a public tool`)
  return value
}

test('MCP hint validation rejects implicit hints, destructive reads and unconfirmed destructive operations', () => {
  assert.doesNotThrow(() => validateToolAnnotations('search', { readOnlyHint: true, openWorldHint: true, destructiveHint: false }, false))
  assert.doesNotThrow(() => validateToolAnnotations('append', { readOnlyHint: false, openWorldHint: false, destructiveHint: false }, false))
  for (const missing of ['readOnlyHint', 'openWorldHint', 'destructiveHint'] as const) {
    const annotations = Object.fromEntries(Object.entries({ readOnlyHint: false, openWorldHint: false, destructiveHint: false }).filter(([name]) => name !== missing))
    assert.throws(() => validateToolAnnotations('implicit', annotations as McpToolAnnotations, false), /must declare/, missing)
  }
  assert.throws(() => validateToolAnnotations('bad_read', { readOnlyHint: true, openWorldHint: false, destructiveHint: true }, false), /cannot declare destructiveHint as true/)
  assert.throws(() => validateToolAnnotations('confirmed_read', { readOnlyHint: true, openWorldHint: false, destructiveHint: false }, true), /cannot require confirmation/)
  assert.throws(() => validateToolAnnotations('quiet_delete', { readOnlyHint: false, openWorldHint: false, destructiveHint: true }, false), /must require confirmation/)

  for (const definition of MCP_PUBLIC_TOOLS) {
    assert.equal(definition.inputSchema.additionalProperties, false, `${definition.name} must reject unknown arguments`)
    assert.doesNotThrow(() => validateToolAnnotations(definition.name, definition.annotations, definition.confirmRequired))
    assert.ok(definition.outputSchema, `${definition.name} must declare outputSchema`)
  }
})

test('all booking operations that can deliver guest email declare the irreversible recipient effect, including optional delivery', () => {
  for (const name of ['create_product_booking', 'confirm_product_booking', 'reject_product_booking', 'cancel_product_booking', 'request_product_booking_change', 'cancel_table_reservation', 'request_table_reservation_change', 'reassign_product_booking']) {
    const definition = tool(name)
    assert.equal(definition.annotations.readOnlyHint, false, name)
    assert.equal(definition.annotations.destructiveHint, true, name)
    assert.equal(definition.annotations.openWorldHint, true, name)
    assert.equal(definition.confirmRequired, true, name)
  }
  assert.ok('guest_acknowledgement' in tool('create_product_booking').inputSchema.properties, 'optional guest email still determines the complete tool classification')
})

test('tools that can remove owned records or replace complete content require approval even for a smaller supported edit', () => {
  for (const name of ['update_product', 'update_blog_post', 'update_organization_settings', 'replace_content_block', 'update_site_page', 'put_resource_localization', 'replace_resource_localizations', 'set_collection_products', 'reconcile_products', 'replace_product_weekly_schedule', 'delete_product', 'delete_collection', 'delete_content_block', 'delete_media_asset']) {
    const definition = tool(name)
    assert.equal(definition.annotations.readOnlyHint, false, name)
    assert.equal(definition.annotations.destructiveHint, true, name)
    assert.equal(definition.confirmRequired, true, name)
  }
})

test('provider hosting does not make reads and edits of a selected account open-world', () => {
  for (const name of ['get_payment', 'get_payment_summary', 'list_payments', 'get_payment_payouts', 'get_payments_usage', 'get_payments_dashboard_link', 'get_social_connections', 'list_channel_posts', 'get_channel_post']) {
    const definition = tool(name)
    assert.equal(definition.annotations.readOnlyHint, true, name)
    assert.equal(definition.annotations.destructiveHint, false, name)
    assert.equal(definition.annotations.openWorldHint, false, name)
    assert.equal(definition.confirmRequired, false, name)
  }
  for (const name of ['set_member_busy_calendars', 'reconcile_post_publication', 'delete_media_asset']) {
    assert.equal(tool(name).annotations.openWorldHint, false, name)
  }
  assert.equal(tool('reconcile_post_publication').annotations.readOnlyHint, false, 'reconciliation persists the provider receipt')
  assert.equal(tool('reconcile_post_publication').annotations.destructiveHint, false, 'reconciliation only records an observed state; it does not publish or delete a provider post')
})

test('public social publication and host attachment download advertise their external destinations', () => {
  for (const name of ['publish_post', 'delete_channel_post']) {
    assert.equal(tool(name).annotations.destructiveHint, true, name)
    assert.equal(tool(name).annotations.openWorldHint, true, name)
  }
  assert.equal(tool('save_media_attachment').annotations.openWorldHint, true)
  assert.equal(tool('save_media_attachment').annotations.readOnlyHint, false)
  for (const name of ['set_media', 'attach_media', 'remove_media', 'reorder_media', 'update_media_asset', 'update_post', 'update_location', 'set_product_publication', 'set_workspace_context']) {
    assert.equal(tool(name).annotations.destructiveHint, false, `${name} retains the underlying asset or record`)
  }
})

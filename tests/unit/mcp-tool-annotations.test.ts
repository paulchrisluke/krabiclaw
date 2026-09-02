import test from 'node:test'

// withToolAnnotations (server/utils/mcp-tools/shared.ts) is the single
// canonical guard for MCP tool annotation completeness and correctness — it
// throws at module load if any tool is missing openWorldHint/destructiveHint
// or if a read-only tool declares either as true. No other test in this repo
// imports the MCP tool catalog, so without this test that guard would only
// ever run at server boot, not in the fast unit-test loop.
test('the MCP tool catalog loads without an annotation classification error', async () => {
  await import('../../server/utils/mcp-tools/index.ts')
})

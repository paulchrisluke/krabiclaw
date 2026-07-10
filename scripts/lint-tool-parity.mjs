#!/usr/bin/env node
/**
 * Tool registry parity guardrails for the MCP and ChowBot conversational
 * surfaces. Each surface keeps its tool name in multiple places by hand
 * (definition array, executor switch, confirm-required set, feature-gate
 * group) and nothing previously checked they stayed in sync — see
 * docs/tool-parity.md for the human-maintained parity doc this complements.
 *
 * Checks:
 * 1. Every MCP_TOOLS definition (server/utils/mcp-tools/) has a matching
 *    case/if branch in executeMcpToolCall (server/utils/mcp-executor/),
 *    and vice versa — except a small known-intentional allowlist of
 *    ChowBot-only tools not yet exposed to MCP (docs/tool-parity.md).
 * 2. Every CHOWBOT_TOOLS definition (server/utils/chowbot-tools/) has a
 *    matching case in executeTool (server/utils/chowbot-agent.ts), and
 *    vice versa.
 * 3. Every name in CHOWBOT_CONFIRM_REQUIRED exists in CHOWBOT_TOOLS.
 * 4. Every tool name in conversational-tool-surface.ts's GROUP_TOOL_NAMES
 *    exists in either MCP_TOOLS or CHOWBOT_TOOLS.
 *
 * Usage:
 *   node scripts/lint-tool-parity.mjs
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.cwd()

const MCP_TOOLS_PATH = join(ROOT, 'server/utils/mcp-tools')
const MCP_EXECUTOR_PATH = join(ROOT, 'server/utils/mcp-executor')
const CHOWBOT_TOOLS_PATH = join(ROOT, 'server/utils/chowbot-tools')
const CHOWBOT_AGENT_PATH = join(ROOT, 'server/utils/chowbot-agent.ts')
const CONVERSATIONAL_SURFACE_PATH = join(ROOT, 'server/utils/conversational-tool-surface.ts')

// Reads a single file verbatim, or concatenates every .ts file in a directory
// (recursively) — lets this script work whether a surface still lives in one
// monolithic file or has been split into domain-scoped files.
async function readSourceConcat(path, { exclude = [] } = {}) {
  const info = await stat(path)
  if (info.isFile()) return readFile(path, 'utf8')

  const parts = []
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.name.endsWith('.ts') && !exclude.includes(entry.name)) parts.push(await readFile(full, 'utf8'))
    }
  }
  await walk(path)
  return parts.join('\n')
}

// ChowBot booking-operation tools that intentionally exist in the executor's
// switch but have no MCP_TOOLS definition yet — not a bug, see
// docs/tool-parity.md "Intentional Differences". Keep this list in sync with
// that doc; if it drifts, this script won't catch it, only humans will.
const MCP_EXECUTOR_ONLY_ALLOWLIST = new Set([
  'get_experience_availability',
  'set_experience_slot_override',
  'list_experience_slot_overrides',
])

// Extracts { name, hasUiResourceUri } for every siteTool/globalTool(...)
// entry in an mcp-tools/<domain>.ts file, by slicing the source between
// consecutive `name: '...'` matches (each tool's fields all appear in that
// slice, since array entries are sequential, non-nested object literals).
function extractMcpToolBlocks(source) {
  const nameRegex = /name: '([a-zA-Z0-9_]+)'/g
  const matches = [...source.matchAll(nameRegex)]
  return matches.map((match, i) => {
    const start = match.index
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length
    const block = source.slice(start, end)
    return { name: match[1], hasUiResourceUri: block.includes('uiResourceUri:') }
  })
}

// Replicates the two derivation-filter shapes actually in use in
// chowbot-tools/*.ts today (see the comment where this is called). Extend
// this — don't bypass it — if a future domain file introduces a new filter.
async function resolveDerivedChowbotToolNames() {
  const files = await readdir(CHOWBOT_TOOLS_PATH)
  const names = new Set()

  for (const file of files) {
    if (!file.endsWith('.ts')) continue
    const filePath = join(CHOWBOT_TOOLS_PATH, file)
    const fileSource = await readFile(filePath, 'utf8')

    const importRegex = /import \{ (\w+) \} from '~\/server\/utils\/mcp-tools\/([\w-]+)'/g
    let importMatch
    while ((importMatch = importRegex.exec(fileSource)) !== null) {
      const [, importedName, mcpDomainFile] = importMatch
      if (!fileSource.includes(`${importedName}.`)) continue // imported but unused for derivation

      const mcpToolsFilePath = join(MCP_TOOLS_PATH, `${mcpDomainFile}.ts`)
      const mcpDomainSource = await readFile(mcpToolsFilePath, 'utf8')
      const blocks = extractMcpToolBlocks(mcpDomainSource)

      const usesUiResourceUriFilter = fileSource.includes('!tool.uiResourceUri')
      const namedSetMatch = fileSource.match(
        new RegExp(`${importedName}\\.filter\\(\\(tool\\) => (\\w+)\\.has\\(tool\\.name\\)\\)`),
      )

      let allowedNames = null
      if (namedSetMatch) {
        const setBlock = sliceFrom(fileSource, `const ${namedSetMatch[1]} = new Set(`, '])')
        allowedNames = extractAll(setBlock, /'([a-zA-Z0-9_]+)'/g)
      }

      for (const block of blocks) {
        if (usesUiResourceUriFilter && block.hasUiResourceUri) continue
        if (allowedNames && !allowedNames.has(block.name)) continue
        names.add(block.name)
      }
    }
  }

  return names
}

function extractAll(content, regex) {
  const names = new Set()
  let match
  while ((match = regex.exec(content)) !== null) {
    names.add(match[1])
  }
  return names
}

function sliceFrom(content, startMarker, endMarker) {
  const startIdx = content.indexOf(startMarker)
  if (startIdx === -1) {
    throw new Error(`Marker not found: "${startMarker}"`)
  }
  const endIdx = endMarker ? content.indexOf(endMarker, startIdx) : content.length
  return content.slice(startIdx, endIdx === -1 ? content.length : endIdx)
}

function diffSets(expected, actual, allowlist = new Set()) {
  const missing = [...expected].filter((name) => !actual.has(name))
  const unexpected = [...actual].filter((name) => !expected.has(name) && !allowlist.has(name))
  return { missing, unexpected }
}

const mcpToolsSource = await readSourceConcat(MCP_TOOLS_PATH)
const mcpExecutorSource = await readSourceConcat(MCP_EXECUTOR_PATH, { exclude: ['shared.ts'] })
const chowbotToolsSource = await readSourceConcat(CHOWBOT_TOOLS_PATH)
const chowbotAgentSource = await readSourceConcat(CHOWBOT_AGENT_PATH)
const conversationalSurfaceSource = await readFile(CONVERSATIONAL_SURFACE_PATH, 'utf8')

// 1. MCP_TOOLS definitions
const mcpDefNames = extractAll(mcpToolsSource, /^\s*name: '([a-zA-Z0-9_]+)',?\s*$/gm)

// 2. mcp-executor/ dispatch — shared.ts is excluded above since it holds an
// unrelated switch(target) (image-upload target routing) whose case labels
// ("logo", "home_hero", ...) aren't tool names.
const mcpExecutorNames = new Set([
  ...extractAll(mcpExecutorSource, /case "([a-zA-Z0-9_]+)":/g),
  ...extractAll(mcpExecutorSource, /if \(toolName === "([a-zA-Z0-9_]+)"\)/g),
])

// 3. CHOWBOT_TOOLS definitions. Some chowbot-tools/*.ts files no longer
// hand-author `name: "..."` literals at all — per-domain migrations (see
// GitHub issue "Consolidate ChowBot onto the MCP tool-executor") instead
// derive an AiTool straight from the corresponding McpToolDefinition via
// `X_TOOLS.map(chowbotToolFromMcp)`, so the two surfaces can't drift on
// argument shape again. A plain regex over chowbot-tools source can't see
// those names (they only exist at runtime, computed from the imported MCP
// array), so resolveDerivedChowbotToolNames replicates the derivation
// statically per-file: find the mcp-tools/<domain>.ts array a file derives
// from, and apply the same .filter(...) that file applies before mapping.
// This does NOT re-implement every possible filter shape in general — only
// the two patterns actually in use today (see its own comments). If a
// future domain file introduces a new filter shape, extend the function
// rather than falling back to a literal name list.
const chowbotDefNames = new Set([
  ...extractAll(chowbotToolsSource, /^\s*name: "([a-zA-Z0-9_]+)",?\s*$/gm),
  ...await resolveDerivedChowbotToolNames(),
])

// 4. CHOWBOT_CONFIRM_REQUIRED
const confirmRequiredBlock = sliceFrom(chowbotToolsSource, 'export const CHOWBOT_CONFIRM_REQUIRED', ']);')
const chowbotConfirmRequiredNames = extractAll(confirmRequiredBlock, /"([a-zA-Z0-9_]+)"/g)

// 5. chowbot-agent.ts executeTool dispatch
const chowbotExecutorBody = sliceFrom(chowbotAgentSource, 'async function executeTool', 'export async function runChowBot')
const chowbotExecutorNames = extractAll(chowbotExecutorBody, /case "([a-zA-Z0-9_]+)":/g)

// 6. conversational-tool-surface.ts GROUP_TOOL_NAMES
const groupToolNamesBlock = sliceFrom(conversationalSurfaceSource, 'const GROUP_TOOL_NAMES', 'const TOOL_GROUP_BY_NAME')
const groupToolNames = extractAll(groupToolNamesBlock, /'([a-zA-Z0-9_]+)'/g)

let totalViolations = 0

function report(label, { missing, unexpected }) {
  for (const name of missing) {
    console.error(`  ✗ ${label}: missing "${name}"`)
    totalViolations++
  }
  for (const name of unexpected) {
    console.error(`  ✗ ${label}: unexpected "${name}" (no matching definition)`)
    totalViolations++
  }
  if (missing.length === 0 && unexpected.length === 0) {
    console.log(`  ✓ ${label}`)
  }
}

report(
  'MCP_TOOLS <-> mcp-executor.ts dispatch',
  diffSets(mcpDefNames, mcpExecutorNames, MCP_EXECUTOR_ONLY_ALLOWLIST),
)

report(
  'CHOWBOT_TOOLS <-> chowbot-agent.ts executeTool dispatch',
  diffSets(chowbotDefNames, chowbotExecutorNames),
)

{
  const orphaned = [...chowbotConfirmRequiredNames].filter((name) => !chowbotDefNames.has(name))
  if (orphaned.length === 0) {
    console.log('  ✓ CHOWBOT_CONFIRM_REQUIRED <-> CHOWBOT_TOOLS')
  } else {
    for (const name of orphaned) {
      console.error(`  ✗ CHOWBOT_CONFIRM_REQUIRED: "${name}" not found in CHOWBOT_TOOLS`)
      totalViolations++
    }
  }
}

{
  const combinedDefs = new Set([...mcpDefNames, ...chowbotDefNames])
  const orphaned = [...groupToolNames].filter((name) => !combinedDefs.has(name))
  if (orphaned.length === 0) {
    console.log('  ✓ GROUP_TOOL_NAMES <-> MCP_TOOLS / CHOWBOT_TOOLS')
  } else {
    for (const name of orphaned) {
      console.error(`  ✗ GROUP_TOOL_NAMES: "${name}" not found in MCP_TOOLS or CHOWBOT_TOOLS`)
      totalViolations++
    }
  }
}

console.log(`\nMCP_TOOLS: ${mcpDefNames.size} definitions, ${mcpExecutorNames.size} executor cases`)
console.log(`CHOWBOT_TOOLS: ${chowbotDefNames.size} definitions, ${chowbotExecutorNames.size} executor cases`)

// ChowBot tools have no per-tool minimum-role field the way MCP's
// McpToolDefinition.minimumRole does (ChowBot instead gates on a single
// ctx.userRole check outside the per-tool definitions). This is a known
// asymmetry, not something this script can verify — flagged here as a
// standing reminder rather than a failure.
console.log('\nNote: ChowBot tools have no per-tool minimumRole field like MCP\'s McpToolDefinition.minimumRole — this is a known asymmetry, not checked by this script.')

console.log(`\nTool parity guardrails finished with ${totalViolations} violation(s).`)

if (totalViolations > 0) {
  process.exit(1)
}

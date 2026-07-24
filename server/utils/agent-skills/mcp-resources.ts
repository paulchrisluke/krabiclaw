import { queryFirst, type DbClient } from '~/server/db'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import { resolveMcpWorkspace } from '~/server/utils/mcp-context'
import { parseAgentSkillTask, resolveAgentGuidance } from './scoped'
import type { AgentSkillScopeType, AgentSkillTask } from './types'

export const AGENT_SKILL_RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'krabiclaw://agent-skills/{version_id}',
    name: 'Agent Skill Version',
    description: 'Read one active Agent Skill version as Markdown.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 'krabiclaw://resolved-guidance/{task}',
    name: 'Resolved Agent Guidance',
    description: 'Read the resolved Agent Skill stack for a task as JSON.',
    mimeType: 'application/json',
  },
]

type AgentSkillVersionResourceRow = {
  version_id: string
  skill_id: string
  scope_type: AgentSkillScopeType
  organization_id: string | null
  site_id: string | null
  task: AgentSkillTask
  slug: string
  name: string
  description: string
  version: number
  priority: number
  content_hash: string
  instructions_markdown: string
  status: string
}

function parseResourceUri(uri: string) {
  const versionMatch = uri.match(/^krabiclaw:\/\/agent-skills\/([^/?#]+)$/)
  if (versionMatch?.[1]) return { kind: 'version' as const, versionId: decodeURIComponent(versionMatch[1]) }
  const guidanceMatch = uri.match(/^krabiclaw:\/\/resolved-guidance\/([^/?#]+)$/)
  if (guidanceMatch?.[1]) return { kind: 'guidance' as const, task: decodeURIComponent(guidanceMatch[1]) }
  throw mcpProtocolError(MCP_ERROR.invalidParams, `Unknown Agent Skill resource: ${uri}`)
}

async function readVersion(db: DbClient, versionId: string) {
  const row = await queryFirst<AgentSkillVersionResourceRow>(db, `
    SELECT v.id AS version_id, s.id AS skill_id, s.scope_type, s.organization_id, s.site_id,
           s.task, s.slug, v.name, v.description, v.version, v.priority, v.content_hash,
           v.instructions_markdown, v.status
    FROM agent_skill_versions v
    JOIN agent_skills s ON s.id = v.skill_id
    WHERE v.id = ?
    LIMIT 1
  `, [versionId])
  if (!row) throw mcpProtocolError(MCP_ERROR.invalidParams, 'Agent Skill version not found.')
  return row
}

function markdownForVersion(row: AgentSkillVersionResourceRow) {
  return [
    '---',
    `skill_id: ${row.skill_id}`,
    `version_id: ${row.version_id}`,
    `scope_type: ${row.scope_type}`,
    `organization_id: ${row.organization_id ?? ''}`,
    `site_id: ${row.site_id ?? ''}`,
    `task: ${row.task}`,
    `slug: ${row.slug}`,
    `name: ${JSON.stringify(row.name)}`,
    `description: ${JSON.stringify(row.description)}`,
    `version: ${row.version}`,
    `priority: ${row.priority}`,
    `content_hash: ${row.content_hash}`,
    '---',
    '',
    row.instructions_markdown,
  ].join('\n')
}

function assertTenantCanReadVersion(row: AgentSkillVersionResourceRow, organizationId: string, siteId: string) {
  if (row.status !== 'active') throw mcpProtocolError(MCP_ERROR.invalidParams, 'Tenant MCP can read active Agent Skill versions only.')
  if (row.scope_type === 'platform') return
  if (row.scope_type === 'organization' && row.organization_id === organizationId) return
  if (row.scope_type === 'site' && row.organization_id === organizationId && row.site_id === siteId) return
  throw mcpProtocolError(MCP_ERROR.invalidParams, 'Agent Skill version is outside the active tenant scope.')
}

export async function readTenantAgentSkillResource(db: D1Database, input: {
  uri: string
  userId: string
  isPlatformAdmin: boolean
}) {
  const parsed = parseResourceUri(input.uri)
  const workspace = await resolveMcpWorkspace(db, input.userId, input.isPlatformAdmin, { requireSite: true })
  if (!workspace.site) throw mcpProtocolError(MCP_ERROR.invalidParams, 'Select an active site before reading Agent Skill resources.')
  if (parsed.kind === 'guidance') {
    const guidance = await resolveAgentGuidance(db, {
      task: parseAgentSkillTask(parsed.task),
      audience: 'tenant',
      siteId: workspace.site.id,
    })
    return { uri: input.uri, mimeType: 'application/json', text: JSON.stringify(guidance, null, 2) }
  }
  const version = await readVersion(db, parsed.versionId)
  assertTenantCanReadVersion(version, workspace.site.organization_id, workspace.site.id)
  return { uri: input.uri, mimeType: 'text/markdown', text: markdownForVersion(version) }
}

export async function readPlatformAgentSkillResource(db: D1Database, uri: string) {
  const parsed = parseResourceUri(uri)
  if (parsed.kind === 'guidance') {
    const guidance = await resolveAgentGuidance(db, {
      task: parseAgentSkillTask(parsed.task),
      audience: 'platform',
    })
    return { uri, mimeType: 'application/json', text: JSON.stringify(guidance, null, 2) }
  }
  const version = await readVersion(db, parsed.versionId)
  if (version.scope_type !== 'platform') {
    throw mcpProtocolError(MCP_ERROR.invalidParams, 'Platform Agent Skill resources expose platform versions only.')
  }
  return { uri, mimeType: 'text/markdown', text: markdownForVersion(version) }
}

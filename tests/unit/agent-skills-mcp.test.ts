import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveAgentGuidance, reviewAgentGuidanceCandidate } from '../../server/utils/agent-skills/scoped.ts'
import { AGENT_GUIDANCE_REVIEW_RESPONSE_SCHEMA, RESOLVED_AGENT_GUIDANCE_SCHEMA } from '../../server/utils/agent-skills/mcp-schema.ts'
import { AGENT_SKILL_TOOLS } from '../../server/utils/mcp-tools/agent-skills.ts'
import { getMcpTool } from '../../server/utils/mcp-tools/index.ts'
import { getPlatformMcpTool, PLATFORM_PUBLIC_MCP_TOOLS } from '../../server/utils/platform-mcp-tools.ts'
import { validateNoUnknownTopLevelArguments } from '../../server/utils/mcp-tool-validation.ts'

type SqlLike = {
  queryChunks?: unknown[]
  value?: string[]
}

const platformImageSkill = {
  skill_id: 'skill_platform_image',
  version_id: 'version_platform_image_1',
  scope_type: 'platform',
  organization_id: null,
  site_id: null,
  task: 'image.generate',
  slug: 'image-baseline',
  name: 'Image baseline',
  description: 'Keep generated media reviewable and provenance-bound.',
  version: 1,
  priority: 10,
  content_hash: 'hash_platform_image_1',
  instructions_markdown: 'Prepare a brief for ChatGPT-native image generation, then save generated media with save_generated_image_file using a file reference. Do not pass base64 or local paths.',
}

const platformBlogSkill = {
  skill_id: 'skill_platform_blog',
  version_id: 'version_platform_blog_1',
  scope_type: 'platform',
  organization_id: null,
  site_id: null,
  task: 'blog.write',
  slug: 'blog-baseline',
  name: 'Blog baseline',
  description: 'Require canonical blog drafts.',
  version: 1,
  priority: 10,
  content_hash: 'hash_platform_blog_1',
  instructions_markdown: 'Blog drafts must include canonical top-level content_blocks.',
}

function sqlText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  const sql = value as SqlLike
  if (Array.isArray(sql.value)) return sql.value.join('')
  if (Array.isArray(sql.queryChunks)) return sql.queryChunks.map(sqlText).join('?')
  return ''
}

function sqlParams(value: unknown): unknown[] {
  if (!value || typeof value !== 'object') return []
  const chunks = (value as SqlLike).queryChunks ?? []
  return chunks.flatMap(chunk => {
    if (chunk && typeof chunk === 'object' && ('queryChunks' in chunk || 'value' in chunk)) return sqlParams(chunk)
    return [chunk]
  }).filter(chunk => typeof chunk !== 'object')
}

function createAgentSkillsDb() {
  const guidanceRuns: unknown[][] = []
  const db = {
    $client: {},
    async get(statement: unknown) {
      const params = sqlParams(statement)
      if (params.includes('site_1')) {
        return { id: 'site_1', organization_id: 'org_1' }
      }
      return undefined
    },
    async all(statement: unknown) {
      const text = sqlText(statement)
      const params = sqlParams(statement)
      if (!/FROM agent_skills s/.test(text)) return []

      const task = params[0]
      if (task === 'image.generate') return [platformImageSkill]
      if (task === 'blog.write') return [platformBlogSkill]
      return []
    },
    async run(statement: unknown) {
      const text = sqlText(statement)
      const params = sqlParams(statement)
      if (/INSERT INTO agent_guidance_runs/.test(text)) guidanceRuns.push(params)
      return { success: true, meta: { changes: 1 } }
    },
    guidanceRuns,
  }
  return db
}

function tenantTool(name: string) {
  const tool = AGENT_SKILL_TOOLS.find(candidate => candidate.name === name)
  assert.ok(tool, `missing tenant tool ${name}`)
  return tool
}

test('tenant and platform expose scoped agent guidance tools with shared schemas', () => {
  assert.ok(getMcpTool('resolve_agent_guidance'))
  assert.ok(getMcpTool('review_agent_guidance_candidate'))
  assert.ok(PLATFORM_PUBLIC_MCP_TOOLS.some(tool => tool.name === 'resolve_platform_agent_guidance'))
  assert.ok(PLATFORM_PUBLIC_MCP_TOOLS.some(tool => tool.name === 'review_platform_agent_guidance_candidate'))

  assert.deepEqual(tenantTool('resolve_agent_guidance').outputSchema, RESOLVED_AGENT_GUIDANCE_SCHEMA)
  assert.deepEqual(getPlatformMcpTool('resolve_platform_agent_guidance')?.outputSchema, RESOLVED_AGENT_GUIDANCE_SCHEMA)
  assert.deepEqual(tenantTool('review_agent_guidance_candidate').outputSchema, AGENT_GUIDANCE_REVIEW_RESPONSE_SCHEMA)
  assert.deepEqual(getPlatformMcpTool('review_platform_agent_guidance_candidate')?.outputSchema, AGENT_GUIDANCE_REVIEW_RESPONSE_SCHEMA)
})

test('tenant scoped resolution includes platform baseline without tenant data in code', async () => {
  const db = createAgentSkillsDb()
  const guidance = await resolveAgentGuidance(db, {
    task: 'image.generate',
    audience: 'tenant',
    siteId: 'site_1',
  })

  assert.equal(guidance.requested_scope.scope_type, 'site')
  assert.deepEqual(guidance.precedence, ['platform', 'organization', 'site'])
  assert.equal(guidance.skills.length, 1)
  assert.equal(guidance.skills[0]?.scope_type, 'platform')
  assert.match(guidance.skills[0]?.instructions_markdown ?? '', /save_generated_image_file/)
  assert.doesNotMatch(guidance.skills[0]?.instructions_markdown ?? '', /NCLS|Pottery House|Kikuzuki/i)
})

test('image guidance review rejects raw base64 transport and local file paths', async () => {
  const db = createAgentSkillsDb()
  const result = await reviewAgentGuidanceCandidate(db, {
    task: 'image.generate',
    candidateType: 'image_brief',
    surface: 'tenant_mcp',
    audience: 'tenant',
    siteId: 'site_1',
    candidate: {
      prompt: 'Warm homepage hero image for a pottery class.',
      intended_use: 'homepage hero',
      alt_text: 'Hands shaping clay on a pottery wheel',
      transport: 'save_generated_image({ image_data_base64: image_generation_call.result }) from /mnt/data/example.png',
    },
  })

  assert.equal(result.review.recommendation, 'revise')
  assert.ok(result.review.findings.some(finding => /file reference/i.test(finding.message)))
  assert.equal(db.guidanceRuns.length, 1)
})

test('blog guidance review passes a minimal canonical content_blocks draft', async () => {
  const db = createAgentSkillsDb()
  const result = await reviewAgentGuidanceCandidate(db, {
    task: 'blog.write',
    candidateType: 'blog_draft',
    surface: 'platform_mcp',
    audience: 'platform',
    candidate: {
      title: 'How Restaurant Websites Turn Searches Into Reservations',
      content_blocks: [
        { type: 'markdown', data: { markdown: 'A useful draft for human review.' } },
      ],
    },
  })

  assert.equal(result.review.recommendation, 'ready')
  assert.equal(result.review.findings.length, 0)
  assert.equal(db.guidanceRuns.length, 1)
})

test('guidance tool schemas are strict at the MCP boundary', () => {
  assert.throws(() => validateNoUnknownTopLevelArguments(
    tenantTool('resolve_agent_guidance').inputSchema,
    { site_id: 'site_1', task: 'blog.write', unexpected: true },
  ), /Unknown argument: unexpected/)

  const platformTool = getPlatformMcpTool('review_platform_agent_guidance_candidate')
  assert.ok(platformTool)
  assert.throws(() => validateNoUnknownTopLevelArguments(
    platformTool.inputSchema,
    { task: 'image.generate', candidate_type: 'image_brief', candidate: {}, raw_base64: 'nope' },
  ), /Unknown argument: raw_base64/)
})

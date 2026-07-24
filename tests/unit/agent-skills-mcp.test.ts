import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveAgentGuidance, reviewAgentGuidanceCandidate } from '../../server/utils/agent-skills/scoped.ts'
import { AGENT_GUIDANCE_REVIEW_RESPONSE_SCHEMA, RESOLVED_AGENT_GUIDANCE_SCHEMA } from '../../server/utils/agent-skills/mcp-schema.ts'
import { AGENT_SKILL_TOOLS } from '../../server/utils/mcp-tools/agent-skills.ts'
import { getMcpTool } from '../../server/utils/mcp-tools/index.ts'
import { getPlatformMcpTool, PLATFORM_PUBLIC_MCP_TOOLS } from '../../server/utils/platform-mcp-tools.ts'
import { validateNoUnknownTopLevelArguments } from '../../server/utils/mcp-tool-validation.ts'

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
  const guidance = await resolveAgentGuidance({
    task: 'image.generate',
    surface: 'tenant_mcp',
    organizationId: 'org_1',
    siteId: 'site_1',
  })

  assert.equal(guidance.requested_scope.scope_type, 'site')
  assert.deepEqual(guidance.scope_order, ['platform', 'organization', 'site'])
  assert.equal(guidance.skills.length, 1)
  assert.equal(guidance.skills[0]?.scope_type, 'platform')
  assert.equal(guidance.skills[0]?.source, 'code_baseline')
  assert.match(guidance.skills[0]?.instructions_markdown ?? '', /save_generated_image_file/)
  assert.doesNotMatch(guidance.skills[0]?.instructions_markdown ?? '', /NCLS|Pottery House|Kikuzuki/i)
})

test('image guidance review rejects raw base64 transport and local file paths', async () => {
  const result = await reviewAgentGuidanceCandidate({
    task: 'image.generate',
    candidateType: 'image_brief',
    surface: 'tenant_mcp',
    organizationId: 'org_1',
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
})

test('blog guidance review passes a minimal canonical content_blocks draft', async () => {
  const result = await reviewAgentGuidanceCandidate({
    task: 'blog.write',
    candidateType: 'blog_draft',
    surface: 'platform_mcp',
    candidate: {
      title: 'How Restaurant Websites Turn Searches Into Reservations',
      content_blocks: [
        { type: 'markdown', data: { markdown: 'A useful draft for human review.' } },
      ],
    },
  })

  assert.equal(result.review.recommendation, 'pass')
  assert.equal(result.review.finding_count, 0)
  assert.equal(result.review.persistence, 'not_persisted')
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

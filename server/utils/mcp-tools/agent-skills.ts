import type { McpToolDefinition } from './shared'
import { siteTool } from './shared'
import {
  AGENT_GUIDANCE_CANDIDATE_TYPE_SCHEMA,
  AGENT_GUIDANCE_REVIEW_RESPONSE_SCHEMA,
  AGENT_SKILL_TASK_SCHEMA,
  RESOLVED_AGENT_GUIDANCE_SCHEMA,
} from '~/server/utils/agent-skills/mcp-schema'

export const AGENT_SKILL_TOOLS: McpToolDefinition[] = [
  siteTool({
    name: 'resolve_agent_guidance',
    description: 'Resolve the reusable scoped Agent Skill guidance for this tenant site and task. Use before drafting blog content or preparing an AI-generated image brief. Returns each applicable source document separately; MCP cannot create, edit, activate, or archive skills.',
    domain: 'agent_skills',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      task: AGENT_SKILL_TASK_SCHEMA,
    },
    required: ['task'],
    strict: true,
    outputSchema: RESOLVED_AGENT_GUIDANCE_SCHEMA,
  }),
  siteTool({
    name: 'review_agent_guidance_candidate',
    description: 'Run a scoped advisory review of a tenant blog draft or image-generation brief against the exact resolved Agent Skill guidance. This scaffold does not persist provenance; use the returned fingerprints as review evidence only.',
    domain: 'agent_skills',
    minimumRole: 'editor',
    confirmRequired: false,
    inputSchema: {
      task: AGENT_SKILL_TASK_SCHEMA,
      candidate_type: AGENT_GUIDANCE_CANDIDATE_TYPE_SCHEMA,
      candidate: {
        type: 'object',
        description: 'The exact draft or image brief being reviewed. For blog.write use { title, content_blocks, ...metadata }. For image.generate use { prompt, intended_use, alt_text, aspect_ratio }. Do not include raw image bytes.',
        additionalProperties: true,
      },
    },
    required: ['task', 'candidate_type', 'candidate'],
    strict: true,
    outputSchema: AGENT_GUIDANCE_REVIEW_RESPONSE_SCHEMA,
  }),
]

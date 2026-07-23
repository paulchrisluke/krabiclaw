import { resolveAgentGuidance, reviewAgentGuidanceCandidate, type AgentGuidanceCandidateType, type AgentSkillTask } from '~/server/utils/agent-skills/scoped'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import type { McpExecutorContext } from './shared'
import { NOT_HANDLED } from './shared'

function requiredTask(args: Record<string, unknown>): AgentSkillTask {
  if (args.task === 'blog.write' || args.task === 'image.generate') return args.task
  throw mcpProtocolError(MCP_ERROR.invalidParams, 'task must be one of: blog.write, image.generate.')
}

function requiredCandidateType(args: Record<string, unknown>): AgentGuidanceCandidateType {
  if (args.candidate_type === 'blog_draft' || args.candidate_type === 'image_brief') return args.candidate_type
  throw mcpProtocolError(MCP_ERROR.invalidParams, 'candidate_type must be one of: blog_draft, image_brief.')
}

function requiredCandidate(args: Record<string, unknown>) {
  if (!args.candidate || typeof args.candidate !== 'object' || Array.isArray(args.candidate)) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, 'candidate must be an object.')
  }
  return args.candidate as Record<string, unknown>
}

function asInvalidParams(error: unknown): never {
  throw mcpProtocolError(
    MCP_ERROR.invalidParams,
    error instanceof Error ? error.message : String(error),
  )
}

export async function handleAgentSkillTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "resolve_agent_guidance":
      return await resolveAgentGuidance({
        task: requiredTask(args),
        surface: 'tenant_mcp',
        organizationId: site.organizationId,
        siteId: site.siteId,
      })
    case "review_agent_guidance_candidate":
      try {
        return await reviewAgentGuidanceCandidate({
          task: requiredTask(args),
          candidateType: requiredCandidateType(args),
          candidate: requiredCandidate(args),
          surface: 'tenant_mcp',
          organizationId: site.organizationId,
          siteId: site.siteId,
        })
      } catch (error) {
        return asInvalidParams(error)
      }
    default:
      return NOT_HANDLED
  }
}

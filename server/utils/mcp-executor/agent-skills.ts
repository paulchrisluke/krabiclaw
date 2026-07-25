import {
  parseAgentGuidanceCandidateType,
  parseAgentSkillTask,
  resolveAgentGuidance,
  reviewAgentGuidanceCandidate,
  type AgentGuidanceCandidateType,
  type AgentSkillTask,
} from '~/server/utils/agent-skills/scoped'
import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'
import type { McpExecutorContext } from './shared'
import { NOT_HANDLED } from './shared'

function requiredTask(args: Record<string, unknown>): AgentSkillTask {
  try {
    return parseAgentSkillTask(args.task)
  } catch (error) {
    return asInvalidParams(error)
  }
}

function requiredCandidateType(args: Record<string, unknown>): AgentGuidanceCandidateType {
  try {
    return parseAgentGuidanceCandidateType(args.candidate_type)
  } catch (error) {
    return asInvalidParams(error)
  }
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
      try {
        return await resolveAgentGuidance({
          task: requiredTask(args),
          surface: 'tenant_mcp',
          organizationId: site.organizationId,
          siteId: site.siteId,
        })
      } catch (error) {
        return asInvalidParams(error)
      }
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

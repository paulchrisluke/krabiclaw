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
    case "get_blog_writing_guidance":
      return await resolveAgentGuidance(site.db, {
        task: 'blog.write',
        audience: 'tenant',
        siteId: site.siteId,
      })
    case "get_image_generation_guidance":
      return await resolveAgentGuidance(site.db, {
        task: 'image.generate',
        audience: 'tenant',
        siteId: site.siteId,
      })
    case "review_blog_draft_against_guidance":
      try {
        return await reviewAgentGuidanceCandidate(site.db, {
          task: 'blog.write',
          candidateType: 'blog_draft',
          candidate: requiredCandidate({ candidate: args.draft }),
          surface: 'tenant_mcp',
          audience: 'tenant',
          siteId: site.siteId,
          createdByUserId: site.userId,
          resolutionFingerprint: typeof args.resolution_fingerprint === 'string' ? args.resolution_fingerprint : null,
        })
      } catch (error) {
        return asInvalidParams(error)
      }
    case "review_image_generation_brief":
      try {
        return await reviewAgentGuidanceCandidate(site.db, {
          task: 'image.generate',
          candidateType: 'image_brief',
          candidate: requiredCandidate({ candidate: args.brief }),
          surface: 'tenant_mcp',
          audience: 'tenant',
          siteId: site.siteId,
          createdByUserId: site.userId,
          resolutionFingerprint: typeof args.resolution_fingerprint === 'string' ? args.resolution_fingerprint : null,
        })
      } catch (error) {
        return asInvalidParams(error)
      }
    case "resolve_agent_guidance":
      return await resolveAgentGuidance(site.db, {
        task: requiredTask(args),
        audience: 'tenant',
        siteId: site.siteId,
      })
    case "review_agent_guidance_candidate":
      try {
        return await reviewAgentGuidanceCandidate(site.db, {
          task: requiredTask(args),
          candidateType: requiredCandidateType(args),
          candidate: requiredCandidate(args),
          surface: 'tenant_mcp',
          audience: 'tenant',
          siteId: site.siteId,
          createdByUserId: site.userId,
          resolutionFingerprint: typeof args.resolution_fingerprint === 'string' ? args.resolution_fingerprint : null,
        })
      } catch (error) {
        return asInvalidParams(error)
      }
    default:
      return NOT_HANDLED
  }
}

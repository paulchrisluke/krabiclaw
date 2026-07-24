export const AGENT_SKILL_TASKS = ['blog.write', 'image.generate'] as const
export const AGENT_SKILL_SCOPES = ['platform', 'organization', 'site'] as const
export const AGENT_SKILL_STATUSES = ['draft', 'active', 'archived'] as const
export const AGENT_GUIDANCE_SURFACES = ['tenant_mcp', 'platform_mcp', 'dashboard_ai', 'internal_api'] as const
export const AGENT_GUIDANCE_CANDIDATE_TYPES = ['blog_draft', 'image_brief'] as const
export const AGENT_GUIDANCE_RECOMMENDATIONS = ['ready', 'revise'] as const

export type AgentSkillTask = typeof AGENT_SKILL_TASKS[number]
export type AgentSkillScopeType = typeof AGENT_SKILL_SCOPES[number]
export type AgentSkillStatus = typeof AGENT_SKILL_STATUSES[number]
export type AgentGuidanceSurface = typeof AGENT_GUIDANCE_SURFACES[number]
export type AgentGuidanceCandidateType = typeof AGENT_GUIDANCE_CANDIDATE_TYPES[number]
export type AgentGuidanceRecommendation = typeof AGENT_GUIDANCE_RECOMMENDATIONS[number]

export interface AgentGuidanceScope {
  scope_type: AgentSkillScopeType
  organization_id: string | null
  site_id: string | null
}

export interface AgentSkillIdentity {
  id: string
  scope_type: AgentSkillScopeType
  organization_id: string | null
  site_id: string | null
  task: AgentSkillTask
  slug: string
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface AgentSkillVersion {
  id: string
  skill_id: string
  version: number
  name: string
  description: string
  instructions_markdown: string
  priority: number
  status: AgentSkillStatus
  content_hash: string
  created_by_user_id: string | null
  approved_by_user_id: string | null
  created_at: string
  updated_at: string
  activated_at: string | null
}

export interface ResolvedAgentSkillVersion {
  skill_id: string
  version_id: string
  scope_type: AgentSkillScopeType
  organization_id: string | null
  site_id: string | null
  task: AgentSkillTask
  slug: string
  name: string
  description: string
  version: number
  priority: number
  status: 'active'
  content_hash: string
  instructions_markdown: string
}

export interface ResolvedAgentGuidance {
  task: AgentSkillTask
  audience: 'tenant' | 'platform'
  requested_scope: AgentGuidanceScope
  precedence: AgentSkillScopeType[]
  conflict_rule: string
  skills: ResolvedAgentSkillVersion[]
  resolution_fingerprint: string
}

export interface AgentGuidanceReviewFinding {
  severity: 'low' | 'medium' | 'high'
  skill_version_id: string | null
  message: string
}

export interface AgentGuidanceReviewRun {
  id: string
  task: AgentSkillTask
  candidate_type: AgentGuidanceCandidateType
  surface: AgentGuidanceSurface
  organization_id: string | null
  site_id: string | null
  resolution_fingerprint: string
  candidate_fingerprint: string
  recommendation: AgentGuidanceRecommendation
  summary: string
  findings: AgentGuidanceReviewFinding[]
  review_model: string
  reviewed_at: string
}

export interface AgentGuidanceReviewResult {
  review: AgentGuidanceReviewRun
  guidance: ResolvedAgentGuidance
}

export interface AgentGuidanceProvenance {
  guidance_run_id: string
  task: AgentSkillTask
  reviewed_at: string
  recommendation: AgentGuidanceRecommendation
  skills: Array<{
    skill_id: string
    version_id: string
    slug: string
    version: number
    scope_type: AgentSkillScopeType
    content_hash: string
  }>
}

export type AgentSkillEventName =
  | 'agent_skill.created'
  | 'agent_skill.version_created'
  | 'agent_skill.version_updated'
  | 'agent_skill.activated'
  | 'agent_skill.archived'
  | 'agent_guidance.resolved'
  | 'agent_guidance.review_completed'
  | 'agent_guidance.review_failed'
  | 'agent_guidance.artifact_linked'
  | 'agent_guidance.stale_resolution_rejected'
  | 'agent_guidance.candidate_mismatch_rejected'

type AgentSkillEventFields = Record<string, string | number | boolean | null | undefined>

// Log identifiers, scope, counts, timings, and review metadata only. Skill
// Markdown, drafts, prompts, image bytes, and findings never enter telemetry.
export function logAgentSkillEvent(name: AgentSkillEventName, fields: AgentSkillEventFields = {}) {
  console.info(name, Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)))
}

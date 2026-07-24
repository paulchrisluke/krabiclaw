import { AGENT_GUIDANCE_CANDIDATE_TYPES, AGENT_SKILL_SCOPES, AGENT_SKILL_TASKS } from './types'

const NULLABLE_STRING = { type: ['string', 'null'] }
const SCOPE_TYPE_SCHEMA = { type: 'string', enum: [...AGENT_SKILL_SCOPES] }

export const AGENT_SKILL_TASK_SCHEMA = {
  type: 'string',
  enum: [...AGENT_SKILL_TASKS],
  description: 'Reusable guidance task to resolve.',
}

export const AGENT_GUIDANCE_CANDIDATE_TYPE_SCHEMA = {
  type: 'string',
  enum: [...AGENT_GUIDANCE_CANDIDATE_TYPES],
}

export const AGENT_GUIDANCE_SKILL_SCHEMA = {
  type: 'object',
  properties: {
    skill_id: { type: 'string' },
    version_id: { type: 'string' },
    scope_type: SCOPE_TYPE_SCHEMA,
    organization_id: NULLABLE_STRING,
    site_id: NULLABLE_STRING,
    task: AGENT_SKILL_TASK_SCHEMA,
    slug: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    version: { type: 'number' },
    priority: { type: 'number' },
    status: { type: 'string', enum: ['active'] },
    content_hash: { type: 'string' },
    instructions_markdown: { type: 'string' },
  },
  required: [
    'skill_id',
    'version_id',
    'scope_type',
    'organization_id',
    'site_id',
    'task',
    'slug',
    'name',
    'description',
    'version',
    'priority',
    'status',
    'content_hash',
    'instructions_markdown',
  ],
  additionalProperties: false,
}

export const AGENT_GUIDANCE_SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    scope_type: SCOPE_TYPE_SCHEMA,
    organization_id: NULLABLE_STRING,
    site_id: NULLABLE_STRING,
  },
  required: ['scope_type', 'organization_id', 'site_id'],
  additionalProperties: false,
}

export const RESOLVED_AGENT_GUIDANCE_SCHEMA = {
  type: 'object',
  properties: {
    task: AGENT_SKILL_TASK_SCHEMA,
    audience: { type: 'string', enum: ['tenant', 'platform'] },
    requested_scope: AGENT_GUIDANCE_SCOPE_SCHEMA,
    precedence: { type: 'array', items: SCOPE_TYPE_SCHEMA },
    conflict_rule: { type: 'string' },
    skills: { type: 'array', items: AGENT_GUIDANCE_SKILL_SCHEMA },
    resolution_fingerprint: { type: 'string' },
  },
  required: ['task', 'audience', 'requested_scope', 'precedence', 'conflict_rule', 'skills', 'resolution_fingerprint'],
  additionalProperties: false,
}

export const AGENT_GUIDANCE_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    task: AGENT_SKILL_TASK_SCHEMA,
    candidate_type: AGENT_GUIDANCE_CANDIDATE_TYPE_SCHEMA,
    surface: { type: 'string', enum: ['tenant_mcp', 'platform_mcp', 'dashboard_ai', 'internal_api'] },
    organization_id: NULLABLE_STRING,
    site_id: NULLABLE_STRING,
    recommendation: { type: 'string', enum: ['ready', 'revise'] },
    summary: { type: 'string' },
    resolution_fingerprint: { type: 'string' },
    candidate_fingerprint: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          skill_version_id: NULLABLE_STRING,
          message: { type: 'string' },
        },
        required: ['severity', 'skill_version_id', 'message'],
        additionalProperties: false,
      },
    },
    review_model: { type: 'string' },
    reviewed_at: { type: 'string' },
  },
  required: ['id', 'task', 'candidate_type', 'surface', 'organization_id', 'site_id', 'recommendation', 'summary', 'resolution_fingerprint', 'candidate_fingerprint', 'findings', 'review_model', 'reviewed_at'],
  additionalProperties: false,
}

export const AGENT_GUIDANCE_REVIEW_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    review: AGENT_GUIDANCE_REVIEW_SCHEMA,
    guidance: RESOLVED_AGENT_GUIDANCE_SCHEMA,
  },
  required: ['review', 'guidance'],
  additionalProperties: false,
}

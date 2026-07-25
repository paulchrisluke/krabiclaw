import { AGENT_GUIDANCE_CANDIDATE_TYPES, AGENT_SKILL_TASKS } from './scoped'

const NULLABLE_STRING = { type: ['string', 'null'] }
const SCOPE_TYPE_SCHEMA = { type: 'string', enum: ['platform', 'organization', 'site'] }

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
    source: { type: 'string', enum: ['code_baseline'] },
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
    'source',
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
    surface: { type: 'string', enum: ['tenant_mcp', 'platform_mcp'] },
    requested_scope: AGENT_GUIDANCE_SCOPE_SCHEMA,
    scope_order: { type: 'array', items: SCOPE_TYPE_SCHEMA },
    precedence: { type: 'string' },
    skills: { type: 'array', items: AGENT_GUIDANCE_SKILL_SCHEMA },
    resolution_fingerprint: { type: 'string' },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['task', 'surface', 'requested_scope', 'scope_order', 'precedence', 'skills', 'resolution_fingerprint', 'notes'],
  additionalProperties: false,
}

export const AGENT_GUIDANCE_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    task: AGENT_SKILL_TASK_SCHEMA,
    candidate_type: AGENT_GUIDANCE_CANDIDATE_TYPE_SCHEMA,
    surface: { type: 'string', enum: ['tenant_mcp', 'platform_mcp'] },
    status: { type: 'string', enum: ['completed'] },
    recommendation: { type: 'string', enum: ['pass', 'revise'] },
    resolution_fingerprint: { type: 'string' },
    candidate_fingerprint: { type: 'string' },
    finding_count: { type: 'number' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          skill_version_id: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['severity', 'skill_version_id', 'message'],
        additionalProperties: false,
      },
    },
    persistence: { type: 'string', enum: ['not_persisted'] },
  },
  required: ['id', 'task', 'candidate_type', 'surface', 'status', 'recommendation', 'resolution_fingerprint', 'candidate_fingerprint', 'finding_count', 'findings', 'persistence'],
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

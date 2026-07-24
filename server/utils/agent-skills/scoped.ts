import { execute, executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { createError } from 'h3'
import type {
  AgentGuidanceCandidateType,
  AgentGuidanceProvenance,
  AgentGuidanceRecommendation,
  AgentGuidanceReviewFinding,
  AgentGuidanceReviewResult,
  AgentGuidanceScope,
  AgentGuidanceSurface,
  AgentSkillIdentity,
  AgentSkillScopeType,
  AgentSkillStatus,
  AgentSkillTask,
  AgentSkillVersion,
  ResolvedAgentGuidance,
  ResolvedAgentSkillVersion,
} from './types'
import {
  AGENT_GUIDANCE_CANDIDATE_TYPES,
  AGENT_GUIDANCE_RECOMMENDATIONS,
  AGENT_GUIDANCE_SURFACES,
  AGENT_SKILL_SCOPES,
  AGENT_SKILL_STATUSES,
  AGENT_SKILL_TASKS,
} from './types'

export {
  AGENT_GUIDANCE_CANDIDATE_TYPES,
  AGENT_GUIDANCE_RECOMMENDATIONS,
  AGENT_GUIDANCE_SURFACES,
  AGENT_SKILL_SCOPES,
  AGENT_SKILL_STATUSES,
  AGENT_SKILL_TASKS,
}

export type {
  AgentGuidanceCandidateType,
  AgentGuidanceProvenance,
  AgentGuidanceReviewFinding,
  AgentGuidanceReviewResult,
  AgentGuidanceScope,
  AgentGuidanceSurface,
  AgentSkillScopeType,
  AgentSkillStatus,
  AgentSkillTask,
  ResolvedAgentGuidance,
  ResolvedAgentSkillVersion,
}

const CONFLICT_RULE = 'Apply every listed skill. When instructions directly conflict, the more-specific scope controls: site over organization over platform. Within one scope, later items in the returned order control only when two instructions directly conflict.'
const REVIEW_MODEL = 'agent-guidance-review-v1'
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function nowIso() {
  return new Date().toISOString()
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

export function normalizeMarkdown(value: string) {
  return value.replace(/\r\n?/g, '\n').trimEnd() + '\n'
}

export function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
}

export async function sha256Hex(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(typeof value === 'string' ? value : stableJson(value))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function agentSkillContentHash(input: {
  name: string
  description: string
  instructions_markdown: string
  priority: number
}) {
  return await sha256Hex({
    name: input.name.trim(),
    description: input.description.trim(),
    instructions_markdown: normalizeMarkdown(input.instructions_markdown),
    priority: input.priority,
  })
}

export function parseAgentSkillTask(value: unknown): AgentSkillTask {
  if (AGENT_SKILL_TASKS.includes(value as AgentSkillTask)) return value as AgentSkillTask
  throw createError({ statusCode: 400, statusMessage: `task must be one of: ${AGENT_SKILL_TASKS.join(', ')}` })
}

export function parseAgentSkillScope(value: unknown): AgentSkillScopeType {
  if (AGENT_SKILL_SCOPES.includes(value as AgentSkillScopeType)) return value as AgentSkillScopeType
  throw createError({ statusCode: 400, statusMessage: `scope_type must be one of: ${AGENT_SKILL_SCOPES.join(', ')}` })
}

export function parseAgentSkillStatus(value: unknown): AgentSkillStatus {
  if (AGENT_SKILL_STATUSES.includes(value as AgentSkillStatus)) return value as AgentSkillStatus
  throw createError({ statusCode: 400, statusMessage: `status must be one of: ${AGENT_SKILL_STATUSES.join(', ')}` })
}

export function parseAgentGuidanceCandidateType(value: unknown): AgentGuidanceCandidateType {
  if (AGENT_GUIDANCE_CANDIDATE_TYPES.includes(value as AgentGuidanceCandidateType)) return value as AgentGuidanceCandidateType
  throw createError({ statusCode: 400, statusMessage: `candidate_type must be one of: ${AGENT_GUIDANCE_CANDIDATE_TYPES.join(', ')}` })
}

export function parseAgentGuidanceSurface(value: unknown): AgentGuidanceSurface {
  if (AGENT_GUIDANCE_SURFACES.includes(value as AgentGuidanceSurface)) return value as AgentGuidanceSurface
  throw createError({ statusCode: 400, statusMessage: `surface must be one of: ${AGENT_GUIDANCE_SURFACES.join(', ')}` })
}

function parseRecommendation(value: unknown): AgentGuidanceRecommendation {
  if (AGENT_GUIDANCE_RECOMMENDATIONS.includes(value as AgentGuidanceRecommendation)) return value as AgentGuidanceRecommendation
  throw createError({ statusCode: 400, statusMessage: `recommendation must be one of: ${AGENT_GUIDANCE_RECOMMENDATIONS.join(', ')}` })
}

function validateSlug(slug: unknown) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'slug must match ^[a-z0-9]+(?:-[a-z0-9]+)*$' })
  }
  return slug
}

function validateText(value: unknown, field: string, max: number) {
  if (typeof value !== 'string') {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a string` })
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be 1-${max} characters` })
  }
  return trimmed
}

function validateInstructions(value: unknown) {
  if (typeof value !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'instructions_markdown must be a string' })
  }
  const normalized = normalizeMarkdown(value)
  const bytes = new TextEncoder().encode(normalized).byteLength
  if (bytes < 1 || bytes > 100_000) {
    throw createError({ statusCode: 400, statusMessage: 'instructions_markdown must be 1-100000 UTF-8 bytes' })
  }
  return normalized
}

function validatePriority(value: unknown) {
  const priority = value === undefined || value === null ? 100 : Number(value)
  if (!Number.isInteger(priority) || priority < 0 || priority > 1000) {
    throw createError({ statusCode: 400, statusMessage: 'priority must be an integer from 0 to 1000' })
  }
  return priority
}

function scopePrecedence(scope: AgentGuidanceScope): AgentSkillScopeType[] {
  if (scope.scope_type === 'site') return ['platform', 'organization', 'site']
  if (scope.scope_type === 'organization') return ['platform', 'organization']
  return ['platform']
}

async function resolveSiteScope(db: DbClient, siteId: string) {
  const site = await queryFirst<{ id: string; organization_id: string }>(db, 'SELECT id, organization_id FROM sites WHERE id = ? LIMIT 1', [siteId])
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  return { siteId: site.id, organizationId: site.organization_id }
}

async function assertOrganizationExists(db: DbClient, organizationId: string) {
  const org = await queryFirst<{ id: string }>(db, 'SELECT id FROM organization WHERE id = ? LIMIT 1', [organizationId])
  if (!org) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
  return org
}

async function validateScopeTarget(db: DbClient, input: {
  scopeType: AgentSkillScopeType
  organizationId?: string | null
  siteId?: string | null
}) {
  if (input.scopeType === 'platform') {
    return { organizationId: null, siteId: null }
  }
  if (input.scopeType === 'organization') {
    if (!input.organizationId) throw createError({ statusCode: 400, statusMessage: 'organization_id is required for organization scope' })
    await assertOrganizationExists(db, input.organizationId)
    return { organizationId: input.organizationId, siteId: null }
  }
  if (!input.siteId) throw createError({ statusCode: 400, statusMessage: 'site_id is required for site scope' })
  const site = await resolveSiteScope(db, input.siteId)
  if (input.organizationId && input.organizationId !== site.organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'site_id does not belong to organization_id' })
  }
  return { organizationId: site.organizationId, siteId: site.siteId }
}

export async function createAgentSkillWithDraft(db: DbClient, input: {
  scope_type: AgentSkillScopeType
  organization_id?: string | null
  site_id?: string | null
  task: AgentSkillTask
  slug: string
  name: string
  description: string
  instructions_markdown: string
  priority?: number | null
  created_by_user_id?: string | null
}) {
  const scopeType = parseAgentSkillScope(input.scope_type)
  const task = parseAgentSkillTask(input.task)
  const slug = validateSlug(input.slug)
  const scope = await validateScopeTarget(db, { scopeType, organizationId: input.organization_id, siteId: input.site_id })
  const name = validateText(input.name, 'name', 160)
  const description = validateText(input.description, 'description', 1000)
  const instructions = validateInstructions(input.instructions_markdown)
  const priority = validatePriority(input.priority)
  const hash = await agentSkillContentHash({ name, description, instructions_markdown: instructions, priority })
  const now = nowIso()
  const skillId = newId('agent_skill')
  const versionId = newId('agent_skill_version')

  await executeBatch(db, [
    {
      query: `INSERT INTO agent_skills (id, scope_type, organization_id, site_id, task, slug, created_by_user_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [skillId, scopeType, scope.organizationId, scope.siteId, task, slug, input.created_by_user_id ?? null, now, now],
    },
    {
      query: `INSERT INTO agent_skill_versions (id, skill_id, version, name, description, instructions_markdown, priority, status, content_hash, created_by_user_id, created_at, updated_at)
              VALUES (?, ?, 1, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      params: [versionId, skillId, name, description, instructions, priority, hash, input.created_by_user_id ?? null, now, now],
    },
  ])
  return await getAgentSkill(db, skillId)
}

export async function listAgentSkills(db: DbClient, input: {
  scope_type?: AgentSkillScopeType
  organization_id?: string | null
  site_id?: string | null
  task?: AgentSkillTask | null
}) {
  const clauses: string[] = []
  const params: unknown[] = []
  if (input.scope_type) {
    clauses.push('s.scope_type = ?')
    params.push(parseAgentSkillScope(input.scope_type))
  }
  if (input.organization_id !== undefined) {
    clauses.push(input.organization_id === null ? 's.organization_id IS NULL' : 's.organization_id = ?')
    if (input.organization_id !== null) params.push(input.organization_id)
  }
  if (input.site_id !== undefined) {
    clauses.push(input.site_id === null ? 's.site_id IS NULL' : 's.site_id = ?')
    if (input.site_id !== null) params.push(input.site_id)
  }
  if (input.task) {
    clauses.push('s.task = ?')
    params.push(parseAgentSkillTask(input.task))
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return await queryAll<AgentSkillIdentity & {
    active_version_id: string | null
    draft_version_id: string | null
    latest_version: number | null
    active_version: number | null
  }>(db, `
    SELECT s.*,
           active.id AS active_version_id,
           draft.id AS draft_version_id,
           MAX(v.version) AS latest_version,
           active.version AS active_version
    FROM agent_skills s
    LEFT JOIN agent_skill_versions v ON v.skill_id = s.id
    LEFT JOIN agent_skill_versions active ON active.skill_id = s.id AND active.status = 'active'
    LEFT JOIN agent_skill_versions draft ON draft.skill_id = s.id AND draft.status = 'draft'
    ${where}
    GROUP BY s.id
    ORDER BY CASE s.scope_type WHEN 'platform' THEN 0 WHEN 'organization' THEN 1 ELSE 2 END, s.task, s.slug
  `, params)
}

export async function getAgentSkill(db: DbClient, skillId: string) {
  const skill = await queryFirst<AgentSkillIdentity>(db, 'SELECT * FROM agent_skills WHERE id = ? LIMIT 1', [skillId])
  if (!skill) throw createError({ statusCode: 404, statusMessage: 'Agent skill not found' })
  const versions = await queryAll<AgentSkillVersion>(db, 'SELECT * FROM agent_skill_versions WHERE skill_id = ? ORDER BY version DESC', [skillId])
  return { skill, versions }
}

export async function getAgentSkillVersion(db: DbClient, versionId: string) {
  const version = await queryFirst<AgentSkillVersion & AgentSkillIdentity>(db, `
    SELECT v.*, s.id AS skill_identity_id, s.scope_type, s.organization_id, s.site_id, s.task, s.slug, s.created_by_user_id AS skill_created_by_user_id
    FROM agent_skill_versions v
    JOIN agent_skills s ON s.id = v.skill_id
    WHERE v.id = ?
    LIMIT 1
  `, [versionId])
  if (!version) throw createError({ statusCode: 404, statusMessage: 'Agent skill version not found' })
  return version
}

export async function createNextDraftVersion(db: DbClient, skillId: string, userId?: string | null) {
  const current = await queryFirst<AgentSkillVersion>(db, `
    SELECT * FROM agent_skill_versions
    WHERE skill_id = ?
    ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, version DESC
    LIMIT 1
  `, [skillId])
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Agent skill has no versions' })
  const existingDraft = await queryFirst<{ id: string }>(db, 'SELECT id FROM agent_skill_versions WHERE skill_id = ? AND status = ? LIMIT 1', [skillId, 'draft'])
  if (existingDraft) throw createError({ statusCode: 409, statusMessage: 'A draft version already exists for this skill' })
  const max = await queryFirst<{ max_version: number }>(db, 'SELECT MAX(version) AS max_version FROM agent_skill_versions WHERE skill_id = ?', [skillId])
  const now = nowIso()
  const versionId = newId('agent_skill_version')
  await executeBatch(db, [
    {
      query: `INSERT INTO agent_skill_versions (id, skill_id, version, name, description, instructions_markdown, priority, status, content_hash, created_by_user_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      params: [versionId, skillId, Number(max?.max_version ?? 0) + 1, current.name, current.description, current.instructions_markdown, current.priority, current.content_hash, userId ?? null, now, now],
    },
    { query: 'UPDATE agent_skills SET updated_at = ? WHERE id = ?', params: [now, skillId] },
  ])
  return await getAgentSkill(db, skillId)
}

export async function updateDraftVersion(db: DbClient, versionId: string, input: {
  name?: unknown
  description?: unknown
  instructions_markdown?: unknown
  priority?: unknown
}) {
  const current = await queryFirst<AgentSkillVersion>(db, 'SELECT * FROM agent_skill_versions WHERE id = ? LIMIT 1', [versionId])
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Agent skill version not found' })
  if (current.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Only draft versions can be edited' })
  const name = input.name === undefined ? current.name : validateText(input.name, 'name', 160)
  const description = input.description === undefined ? current.description : validateText(input.description, 'description', 1000)
  const instructions = input.instructions_markdown === undefined ? current.instructions_markdown : validateInstructions(input.instructions_markdown)
  const priority = input.priority === undefined ? current.priority : validatePriority(input.priority)
  const hash = await agentSkillContentHash({ name, description, instructions_markdown: instructions, priority })
  const now = nowIso()
  await executeBatch(db, [
    {
      query: `UPDATE agent_skill_versions
              SET name = ?, description = ?, instructions_markdown = ?, priority = ?, content_hash = ?, updated_at = ?
              WHERE id = ? AND status = 'draft'`,
      params: [name, description, instructions, priority, hash, now, versionId],
    },
    { query: 'UPDATE agent_skills SET updated_at = ? WHERE id = ?', params: [now, current.skill_id] },
  ])
  return await getAgentSkill(db, current.skill_id)
}

export async function activateDraftVersion(db: DbClient, versionId: string, approvedByUserId?: string | null) {
  const target = await queryFirst<AgentSkillVersion>(db, 'SELECT * FROM agent_skill_versions WHERE id = ? LIMIT 1', [versionId])
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Agent skill version not found' })
  if (target.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Only draft versions can be activated' })
  const now = nowIso()
  await executeBatch(db, [
    { query: `UPDATE agent_skill_versions SET status = 'archived', updated_at = ? WHERE skill_id = ? AND status = 'active'`, params: [now, target.skill_id] },
    { query: `UPDATE agent_skill_versions SET status = 'active', approved_by_user_id = ?, activated_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'`, params: [approvedByUserId ?? null, now, now, versionId] },
    { query: 'UPDATE agent_skills SET updated_at = ? WHERE id = ?', params: [now, target.skill_id] },
  ])
  return await getAgentSkill(db, target.skill_id)
}

export async function archiveActiveVersion(db: DbClient, versionId: string) {
  const target = await queryFirst<AgentSkillVersion>(db, 'SELECT * FROM agent_skill_versions WHERE id = ? LIMIT 1', [versionId])
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Agent skill version not found' })
  if (target.status !== 'active') throw createError({ statusCode: 409, statusMessage: 'Only active versions can be archived' })
  const now = nowIso()
  await executeBatch(db, [
    { query: `UPDATE agent_skill_versions SET status = 'archived', updated_at = ? WHERE id = ? AND status = 'active'`, params: [now, versionId] },
    { query: 'UPDATE agent_skills SET updated_at = ? WHERE id = ?', params: [now, target.skill_id] },
  ])
  return await getAgentSkill(db, target.skill_id)
}

type ResolvedSkillRow = {
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
  content_hash: string
  instructions_markdown: string
}

function toResolvedSkill(row: ResolvedSkillRow): ResolvedAgentSkillVersion {
  return {
    skill_id: row.skill_id,
    version_id: row.version_id,
    scope_type: row.scope_type,
    organization_id: row.organization_id,
    site_id: row.site_id,
    task: row.task,
    slug: row.slug,
    name: row.name,
    description: row.description,
    version: row.version,
    priority: row.priority,
    status: 'active',
    content_hash: row.content_hash,
    instructions_markdown: row.instructions_markdown,
  }
}

export async function resolveAgentGuidance(db: DbClient, input: {
  task: AgentSkillTask
  audience: 'tenant' | 'platform'
  siteId?: string | null
}): Promise<ResolvedAgentGuidance> {
  const task = parseAgentSkillTask(input.task)
  let scope: AgentGuidanceScope
  let rows: ResolvedSkillRow[]

  if (input.audience === 'platform') {
    scope = { scope_type: 'platform', organization_id: null, site_id: null }
    rows = await queryAll<ResolvedSkillRow>(db, `
      SELECT s.id AS skill_id, v.id AS version_id, s.scope_type, s.organization_id, s.site_id,
             s.task, s.slug, v.name, v.description, v.version, v.priority, v.content_hash, v.instructions_markdown
      FROM agent_skills s
      JOIN agent_skill_versions v ON v.skill_id = s.id AND v.status = 'active'
      WHERE s.task = ? AND s.scope_type = 'platform'
      ORDER BY v.priority ASC, s.slug ASC
    `, [task])
  } else {
    if (!input.siteId) throw createError({ statusCode: 400, statusMessage: 'site_id is required for tenant guidance resolution' })
    const site = await resolveSiteScope(db, input.siteId)
    scope = { scope_type: 'site', organization_id: site.organizationId, site_id: site.siteId }
    rows = await queryAll<ResolvedSkillRow>(db, `
      SELECT s.id AS skill_id, v.id AS version_id, s.scope_type, s.organization_id, s.site_id,
             s.task, s.slug, v.name, v.description, v.version, v.priority, v.content_hash, v.instructions_markdown
      FROM agent_skills s
      JOIN agent_skill_versions v ON v.skill_id = s.id AND v.status = 'active'
      WHERE s.task = ?
        AND (
          s.scope_type = 'platform'
          OR (s.scope_type = 'organization' AND s.organization_id = ?)
          OR (s.scope_type = 'site' AND s.organization_id = ? AND s.site_id = ?)
        )
      ORDER BY CASE s.scope_type WHEN 'platform' THEN 0 WHEN 'organization' THEN 1 ELSE 2 END,
               v.priority ASC,
               s.slug ASC
    `, [task, site.organizationId, site.organizationId, site.siteId])
  }

  const skills = rows.map(toResolvedSkill)
  const precedence = scopePrecedence(scope)
  const resolution_fingerprint = await sha256Hex({
    task,
    audience: input.audience,
    organization_id: scope.organization_id,
    site_id: scope.site_id,
    versions: skills.map(skill => ({
      skill_id: skill.skill_id,
      version_id: skill.version_id,
      content_hash: skill.content_hash,
      scope_type: skill.scope_type,
      priority: skill.priority,
    })),
  })
  return { task, audience: input.audience, requested_scope: scope, precedence, conflict_rule: CONFLICT_RULE, skills, resolution_fingerprint }
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') output.push(value)
  else if (Array.isArray(value)) value.forEach(item => collectStrings(item, output))
  else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(item => collectStrings(item, output))
  return output
}

function normalizeBlogCandidate(candidate: unknown) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw createError({ statusCode: 400, statusMessage: 'blog draft candidate must be an object' })
  }
  const record = candidate as Record<string, unknown>
  return {
    title: typeof record.title === 'string' ? record.title.trim() : '',
    excerpt: typeof record.excerpt === 'string' ? record.excerpt.trim() : null,
    category: typeof record.category === 'string' ? record.category.trim() : null,
    tags: Array.isArray(record.tags) ? record.tags.map(String).map(v => v.trim()).filter(Boolean) : [],
    seo_title: typeof record.seo_title === 'string' ? record.seo_title.trim() : null,
    seo_description: typeof record.seo_description === 'string' ? record.seo_description.trim() : null,
    content_blocks: Array.isArray(record.content_blocks) ? record.content_blocks : [],
  }
}

function normalizeImageBrief(candidate: unknown) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw createError({ statusCode: 400, statusMessage: 'image brief candidate must be an object' })
  }
  const record = candidate as Record<string, unknown>
  return {
    prompt: typeof record.prompt === 'string' ? record.prompt.trim() : '',
    intended_use: typeof record.intended_use === 'string' ? record.intended_use.trim() : '',
    alt_text: typeof record.alt_text === 'string' ? record.alt_text.trim() : '',
    aspect_ratio: typeof record.aspect_ratio === 'string' ? record.aspect_ratio.trim() : '',
  }
}

export function expectedCandidateTypeForTask(task: AgentSkillTask): AgentGuidanceCandidateType {
  return task === 'blog.write' ? 'blog_draft' : 'image_brief'
}

export async function fingerprintGuidanceCandidate(task: AgentSkillTask, candidate: unknown) {
  return await sha256Hex(task === 'blog.write' ? normalizeBlogCandidate(candidate) : normalizeImageBrief(candidate))
}

function reviewCandidate(task: AgentSkillTask, candidate: unknown, guidance: ResolvedAgentGuidance) {
  const findings: AgentGuidanceReviewFinding[] = []
  const fallbackVersionId = guidance.skills[0]?.version_id ?? null
  const strings = collectStrings(candidate).join('\n')
  if (/data:image\/|;base64,|image_generation_call\.result|\/mnt\/data\/|file:\/\//i.test(strings)) {
    findings.push({ severity: 'high', skill_version_id: fallbackVersionId, message: 'Generated image workflow must use a reviewed file reference and save_generated_image_file; do not pass raw base64, data URLs, or local paths.' })
  }

  if (task === 'blog.write') {
    const normalized = normalizeBlogCandidate(candidate)
    if (!normalized.title) findings.push({ severity: 'medium', skill_version_id: fallbackVersionId, message: 'Blog draft should include a non-empty title.' })
    if (!normalized.content_blocks.length) findings.push({ severity: 'high', skill_version_id: fallbackVersionId, message: 'Blog draft must include canonical top-level content_blocks.' })
  } else {
    const normalized = normalizeImageBrief(candidate)
    if (!normalized.prompt) findings.push({ severity: 'high', skill_version_id: fallbackVersionId, message: 'Image brief must include a non-empty prompt.' })
    if (!normalized.intended_use) findings.push({ severity: 'medium', skill_version_id: fallbackVersionId, message: 'Image brief should include intended_use.' })
    if (!normalized.alt_text) findings.push({ severity: 'medium', skill_version_id: fallbackVersionId, message: 'Image brief should include alt_text for the saved media asset.' })
    if (!normalized.aspect_ratio) findings.push({ severity: 'medium', skill_version_id: fallbackVersionId, message: 'Image brief should include aspect_ratio.' })
  }

  const recommendation: AgentGuidanceRecommendation = findings.some(finding => finding.severity === 'high') ? 'revise' : 'ready'
  return {
    recommendation,
    findings,
    summary: recommendation === 'ready' ? 'Candidate is ready against resolved guidance.' : 'Candidate should be revised against resolved guidance before persistence.',
  }
}

export async function reviewAgentGuidanceCandidate(db: DbClient, input: {
  task: AgentSkillTask
  candidateType: AgentGuidanceCandidateType
  candidate: Record<string, unknown>
  surface: AgentGuidanceSurface
  audience: 'tenant' | 'platform'
  siteId?: string | null
  createdByUserId?: string | null
  resolutionFingerprint?: string | null
}): Promise<AgentGuidanceReviewResult> {
  const task = parseAgentSkillTask(input.task)
  const candidateType = parseAgentGuidanceCandidateType(input.candidateType)
  if (candidateType !== expectedCandidateTypeForTask(task)) {
    throw createError({ statusCode: 400, statusMessage: `${candidateType} does not match ${task}` })
  }
  const surface = parseAgentGuidanceSurface(input.surface)
  const guidance = await resolveAgentGuidance(db, { task, audience: input.audience, siteId: input.siteId })
  if (input.resolutionFingerprint && input.resolutionFingerprint !== guidance.resolution_fingerprint) {
    throw createError({ statusCode: 409, statusMessage: 'Resolved guidance changed; resolve again before review' })
  }
  const candidateFingerprint = await fingerprintGuidanceCandidate(task, input.candidate)
  const reviewed = reviewCandidate(task, input.candidate, guidance)
  const id = newId('agent_guidance_run')
  const reviewedAt = nowIso()
  await execute(db, `
    INSERT INTO agent_guidance_runs (
      id, task, candidate_type, surface, organization_id, site_id,
      resolution_fingerprint, resolved_skills_json, candidate_fingerprint,
      recommendation, findings_json, review_model, created_by_user_id, created_at, reviewed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    task,
    candidateType,
    surface,
    guidance.requested_scope.organization_id,
    guidance.requested_scope.site_id,
    guidance.resolution_fingerprint,
    JSON.stringify(guidance.skills.map(skill => ({
      skill_id: skill.skill_id,
      version_id: skill.version_id,
      scope_type: skill.scope_type,
      slug: skill.slug,
      version: skill.version,
      priority: skill.priority,
      content_hash: skill.content_hash,
    }))),
    candidateFingerprint,
    reviewed.recommendation,
    JSON.stringify({ summary: reviewed.summary, findings: reviewed.findings }),
    REVIEW_MODEL,
    input.createdByUserId ?? null,
    reviewedAt,
    reviewedAt,
  ])

  return {
    review: {
      id,
      task,
      candidate_type: candidateType,
      surface,
      organization_id: guidance.requested_scope.organization_id,
      site_id: guidance.requested_scope.site_id,
      resolution_fingerprint: guidance.resolution_fingerprint,
      candidate_fingerprint: candidateFingerprint,
      recommendation: reviewed.recommendation,
      summary: reviewed.summary,
      findings: reviewed.findings,
      review_model: REVIEW_MODEL,
      reviewed_at: reviewedAt,
    },
    guidance,
  }
}

export async function getGuidanceRun(db: DbClient, runId: string) {
  return await queryFirst<{
    id: string
    task: AgentSkillTask
    candidate_type: AgentGuidanceCandidateType
    surface: AgentGuidanceSurface
    organization_id: string | null
    site_id: string | null
    resolution_fingerprint: string
    resolved_skills_json: string
    candidate_fingerprint: string
    recommendation: AgentGuidanceRecommendation
    findings_json: string
    review_model: string
    reviewed_at: string
  }>(db, 'SELECT * FROM agent_guidance_runs WHERE id = ? LIMIT 1', [runId])
}

export async function assertGuidanceRunMatchesCandidate(db: DbClient, input: {
  guidanceRunId: string
  task: AgentSkillTask
  organizationId?: string | null
  siteId?: string | null
  candidate: unknown
}) {
  const run = await getGuidanceRun(db, input.guidanceRunId)
  if (!run) throw createError({ statusCode: 400, statusMessage: 'guidance_run_id was not found' })
  if (run.task !== input.task) throw createError({ statusCode: 400, statusMessage: 'guidance_run_id task mismatch' })
  if (input.organizationId !== undefined && run.organization_id !== input.organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'guidance_run_id organization scope mismatch' })
  }
  if (input.siteId !== undefined && run.site_id !== input.siteId) {
    throw createError({ statusCode: 400, statusMessage: 'guidance_run_id site scope mismatch' })
  }
  const candidateFingerprint = await fingerprintGuidanceCandidate(input.task, input.candidate)
  if (candidateFingerprint !== run.candidate_fingerprint) {
    throw createError({ statusCode: 409, statusMessage: 'guidance_run_id candidate fingerprint mismatch' })
  }
  return run
}

export async function linkGuidanceArtifact(db: DbClient, input: {
  guidanceRunId: string
  artifactType: 'content_revision' | 'media_asset'
  artifactId: string
}) {
  const query = guidanceArtifactInsertQuery(input)
  await execute(db, query.query, query.params)
}

export function guidanceArtifactInsertQuery(input: {
  guidanceRunId: string
  artifactType: 'content_revision' | 'media_asset'
  artifactId: string
}): BatchQuery {
  return {
    query: `
      INSERT OR IGNORE INTO agent_guidance_artifacts (id, guidance_run_id, artifact_type, artifact_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    params: [newId('agent_guidance_artifact'), input.guidanceRunId, input.artifactType, input.artifactId, nowIso()],
  }
}

export async function getGuidanceProvenanceForArtifact(db: DbClient, input: {
  artifactType: 'content_revision' | 'media_asset'
  artifactId: string
}): Promise<AgentGuidanceProvenance | null> {
  const row = await queryFirst<{
    guidance_run_id: string
    task: AgentSkillTask
    reviewed_at: string
    recommendation: AgentGuidanceRecommendation
    resolved_skills_json: string
  }>(db, `
    SELECT r.id AS guidance_run_id, r.task, r.reviewed_at, r.recommendation, r.resolved_skills_json
    FROM agent_guidance_artifacts a
    JOIN agent_guidance_runs r ON r.id = a.guidance_run_id
    WHERE a.artifact_type = ? AND a.artifact_id = ?
    ORDER BY a.created_at DESC
    LIMIT 1
  `, [input.artifactType, input.artifactId])
  if (!row) return null
  return {
    guidance_run_id: row.guidance_run_id,
    task: row.task,
    reviewed_at: row.reviewed_at,
    recommendation: parseRecommendation(row.recommendation),
    skills: JSON.parse(row.resolved_skills_json) as AgentGuidanceProvenance['skills'],
  }
}

export async function importAgentSkillMarkdown(db: DbClient, input: {
  scope_type: AgentSkillScopeType
  organization_id?: string | null
  site_id?: string | null
  task: AgentSkillTask
  slug: string
  markdown: string
  name?: string | null
  description?: string | null
  priority?: number | null
  activate?: boolean
  created_by_user_id?: string | null
}) {
  const name = input.name?.trim() || input.slug.split('-').map(part => part.slice(0, 1).toUpperCase() + part.slice(1)).join(' ')
  const description = input.description?.trim() || `Use when ${input.task === 'blog.write' ? 'drafting or revising blog content' : 'preparing image-generation briefs'}.`
  const created = await createAgentSkillWithDraft(db, {
    scope_type: input.scope_type,
    organization_id: input.organization_id,
    site_id: input.site_id,
    task: input.task,
    slug: input.slug,
    name,
    description,
    instructions_markdown: input.markdown,
    priority: input.priority,
    created_by_user_id: input.created_by_user_id,
  })
  const draft = created.versions.find(version => version.status === 'draft')
  if (input.activate && draft) return await activateDraftVersion(db, draft.id, input.created_by_user_id)
  return created
}

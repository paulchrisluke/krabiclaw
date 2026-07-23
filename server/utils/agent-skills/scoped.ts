export const AGENT_SKILL_TASKS = ['blog.write', 'image.generate'] as const
export type AgentSkillTask = typeof AGENT_SKILL_TASKS[number]

export const AGENT_GUIDANCE_CANDIDATE_TYPES = ['blog_draft', 'image_brief'] as const
export type AgentGuidanceCandidateType = typeof AGENT_GUIDANCE_CANDIDATE_TYPES[number]

export type AgentGuidanceSurface = 'tenant_mcp' | 'platform_mcp'
export type AgentSkillScopeType = 'platform' | 'organization' | 'site'

export interface AgentGuidanceScope {
  scope_type: AgentSkillScopeType
  organization_id: string | null
  site_id: string | null
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
  source: 'code_baseline'
  instructions_markdown: string
}

export interface ResolvedAgentGuidance {
  task: AgentSkillTask
  surface: AgentGuidanceSurface
  requested_scope: AgentGuidanceScope
  scope_order: AgentSkillScopeType[]
  precedence: string
  skills: ResolvedAgentSkillVersion[]
  resolution_fingerprint: string
  notes: string[]
}

export interface AgentGuidanceReviewFinding {
  severity: 'low' | 'medium' | 'high'
  skill_version_id: string
  message: string
}

export interface AgentGuidanceReviewResult {
  review: {
    id: string
    task: AgentSkillTask
    candidate_type: AgentGuidanceCandidateType
    surface: AgentGuidanceSurface
    status: 'completed'
    recommendation: 'pass' | 'revise'
    resolution_fingerprint: string
    candidate_fingerprint: string
    finding_count: number
    findings: AgentGuidanceReviewFinding[]
    persistence: 'not_persisted'
  }
  guidance: ResolvedAgentGuidance
}

const BLOG_WRITE_BASELINE = `# Blog Writing Baseline

Use this skill when drafting or revising long-form, evergreen blog content for a tenant site or the KrabiClaw platform.

## Workflow

- Resolve scoped guidance before drafting.
- Treat platform, organization, and site guidance as separate source documents.
- When guidance conflicts, prefer the more specific scope: site, then organization, then platform.
- Draft for human review before publishing.
- Preserve KrabiClaw's canonical content_blocks authoring model; do not invent body/component shadow shapes.

## Quality Bar

- Ground claims in facts from the current site, platform context, approved user input, or existing content.
- Keep tenant facts isolated to the active organization/site. Do not borrow examples, voice, offers, locations, or media from another tenant.
- Write useful headings, concise prose, an excerpt, search metadata, and structured FAQ/How-To blocks only when they genuinely help the reader.
- Avoid publishing instructions, scheduling policy, authorization assumptions, concurrency-token handling, or tool schemas in the article itself.
`

const IMAGE_GENERATE_BASELINE = `# Image Generation Baseline

Use this skill when preparing an AI-generated image brief for tenant or platform content.

## Required Transport Contract

- Generate images with ChatGPT's native image_generation Responses API tool using gpt-image-1 or gpt-image-2.
- For tenant MCP generated images, immediately persist the generated file with save_generated_image_file({ site_id, attachment_id: <file reference>, prompt }).
- Pass the generated image as a file reference. Never pass raw image_generation_call.result base64 to MCP tools.
- After saving tenant generated images, use show_generated_images with the returned assetId and publicUrl before assigning the asset.

## Briefing Rules

- Include intended placement, aspect ratio, subject, setting, style, lighting, brand constraints, and alt-text intent.
- Keep tenant visual details isolated to the active organization/site. Do not reuse another tenant's venue, people, products, logos, or image motifs.
- Do not use stock-photo assumptions when real client media or approved brand direction exists.
- Code and tool contracts own storage, allowed aspect ratios, safety, media assignment, and provider upload behavior. Skill text supplies creative and editorial guidance only.
`

const BASELINE_BY_TASK: Record<AgentSkillTask, { slug: string; name: string; description: string; instructions: string }> = {
  'blog.write': {
    slug: 'blog-writing-baseline',
    name: 'Blog Writing Baseline',
    description: 'Default reusable guidance for long-form blog drafting and revision across tenant and platform MCP surfaces.',
    instructions: BLOG_WRITE_BASELINE,
  },
  'image.generate': {
    slug: 'image-generation-baseline',
    name: 'Image Generation Baseline',
    description: 'Default reusable guidance for AI image briefs, tenant isolation, and ChatGPT native image-generation transport.',
    instructions: IMAGE_GENERATE_BASELINE,
  },
}

export function parseAgentSkillTask(value: unknown): AgentSkillTask {
  if (AGENT_SKILL_TASKS.includes(value as AgentSkillTask)) return value as AgentSkillTask
  throw new Error(`task must be one of: ${AGENT_SKILL_TASKS.join(', ')}`)
}

export function parseAgentGuidanceCandidateType(value: unknown): AgentGuidanceCandidateType {
  if (AGENT_GUIDANCE_CANDIDATE_TYPES.includes(value as AgentGuidanceCandidateType)) {
    return value as AgentGuidanceCandidateType
  }
  throw new Error(`candidate_type must be one of: ${AGENT_GUIDANCE_CANDIDATE_TYPES.join(', ')}`)
}

function normalizeMarkdown(value: string) {
  return value.replace(/\r\n?/g, '\n').trimEnd() + '\n'
}

function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
}

async function sha256Hex(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(stableJson(value))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function taskCandidateType(task: AgentSkillTask): AgentGuidanceCandidateType {
  return task === 'blog.write' ? 'blog_draft' : 'image_brief'
}

function requestedScope(input: {
  surface: AgentGuidanceSurface
  organizationId?: string | null
  siteId?: string | null
}): AgentGuidanceScope {
  if (input.siteId) {
    return {
      scope_type: 'site',
      organization_id: input.organizationId ?? null,
      site_id: input.siteId,
    }
  }
  if (input.organizationId) {
    return {
      scope_type: 'organization',
      organization_id: input.organizationId,
      site_id: null,
    }
  }
  return {
    scope_type: 'platform',
    organization_id: null,
    site_id: null,
  }
}

function scopeOrder(scope: AgentGuidanceScope): AgentSkillScopeType[] {
  if (scope.scope_type === 'site') return ['platform', 'organization', 'site']
  if (scope.scope_type === 'organization') return ['platform', 'organization']
  return ['platform']
}

export async function resolveAgentGuidance(input: {
  task: AgentSkillTask
  surface: AgentGuidanceSurface
  organizationId?: string | null
  siteId?: string | null
}): Promise<ResolvedAgentGuidance> {
  const baseline = BASELINE_BY_TASK[input.task]
  const instructions = normalizeMarkdown(baseline.instructions)
  const contentHash = await sha256Hex({
    name: baseline.name,
    description: baseline.description,
    instructions_markdown: instructions,
    priority: 100,
  })
  const scope = requestedScope(input)
  const version: ResolvedAgentSkillVersion = {
    skill_id: `agent-skill:platform:${input.task}:${baseline.slug}`,
    version_id: `agent-skill-version:platform:${input.task}:${baseline.slug}:1`,
    scope_type: 'platform',
    organization_id: null,
    site_id: null,
    task: input.task,
    slug: baseline.slug,
    name: baseline.name,
    description: baseline.description,
    version: 1,
    priority: 100,
    status: 'active',
    content_hash: contentHash,
    source: 'code_baseline',
    instructions_markdown: instructions,
  }
  const order = scopeOrder(scope)
  const fingerprint = await sha256Hex({
    task: input.task,
    surface: input.surface,
    requested_scope: scope,
    skills: [version].map(skill => ({
      version_id: skill.version_id,
      scope_type: skill.scope_type,
      priority: skill.priority,
      slug: skill.slug,
      content_hash: skill.content_hash,
    })),
  })

  return {
    task: input.task,
    surface: input.surface,
    requested_scope: scope,
    scope_order: order,
    precedence: 'Direct conflicts resolve by scope specificity: site overrides organization, organization overrides platform. Within a scope, lower priority sorts first, then slug ascending.',
    skills: [version],
    resolution_fingerprint: fingerprint,
    notes: [
      'MCP exposes read/review guidance only; skill creation, editing, activation, and archival remain CMS/admin responsibilities.',
      'This scaffold includes reusable platform baselines and keeps tenant-specific organization/site guidance out of code until the CMS-backed lifecycle tables are added.',
    ],
  }
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') output.push(value)
  else if (Array.isArray(value)) value.forEach(item => collectStrings(item, output))
  else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(item => collectStrings(item, output))
  return output
}

function hasContentBlocks(candidate: unknown) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
  const blocks = (candidate as Record<string, unknown>).content_blocks
  return Array.isArray(blocks) && blocks.length > 0
}

function hasMeaningfulString(candidate: unknown, keys: string[]) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
  const record = candidate as Record<string, unknown>
  return keys.some(key => typeof record[key] === 'string' && record[key].trim().length > 0)
}

export async function reviewAgentGuidanceCandidate(input: {
  task: AgentSkillTask
  candidateType: AgentGuidanceCandidateType
  candidate: unknown
  surface: AgentGuidanceSurface
  organizationId?: string | null
  siteId?: string | null
}): Promise<AgentGuidanceReviewResult> {
  const expectedType = taskCandidateType(input.task)
  if (input.candidateType !== expectedType) {
    throw new Error(`${input.task} requires candidate_type=${expectedType}`)
  }

  const guidance = await resolveAgentGuidance(input)
  const baselineVersionId = guidance.skills[0]?.version_id ?? ''
  const findings: AgentGuidanceReviewFinding[] = []
  const strings = collectStrings(input.candidate)
  const joined = strings.join('\n')

  if (input.task === 'blog.write') {
    if (!hasMeaningfulString(input.candidate, ['title'])) {
      findings.push({ severity: 'medium', skill_version_id: baselineVersionId, message: 'Blog draft should include a non-empty title for review.' })
    }
    if (!hasContentBlocks(input.candidate) && !hasMeaningfulString(input.candidate, ['markdown', 'body'])) {
      findings.push({ severity: 'high', skill_version_id: baselineVersionId, message: 'Blog draft should include canonical content_blocks or reviewable markdown content.' })
    }
  }

  if (input.task === 'image.generate') {
    if (!hasMeaningfulString(input.candidate, ['prompt', 'brief'])) {
      findings.push({ severity: 'high', skill_version_id: baselineVersionId, message: 'Image brief should include the generation prompt or creative brief before image_generation is called.' })
    }
    if (!hasMeaningfulString(input.candidate, ['intended_use', 'placement'])) {
      findings.push({ severity: 'medium', skill_version_id: baselineVersionId, message: 'Image brief should state the intended placement or use.' })
    }
    if (!hasMeaningfulString(input.candidate, ['alt_text', 'alt'])) {
      findings.push({ severity: 'medium', skill_version_id: baselineVersionId, message: 'Image brief should include alt-text intent so saved media does not fall back to the prompt.' })
    }
    if (/image_data_base64|data:image\/|image_generation_call\.result|\/mnt\/data\//i.test(joined)) {
      findings.push({ severity: 'high', skill_version_id: baselineVersionId, message: 'Image workflow must pass a generated file reference to save_generated_image_file, not raw base64 or local file paths.' })
    }
  }

  const candidateFingerprint = await sha256Hex({
    task: input.task,
    candidate_type: input.candidateType,
    candidate: input.candidate,
  })
  const reviewId = `agent-guidance-review:${candidateFingerprint.slice(0, 16)}`

  return {
    review: {
      id: reviewId,
      task: input.task,
      candidate_type: input.candidateType,
      surface: input.surface,
      status: 'completed',
      recommendation: findings.some(finding => finding.severity === 'high' || finding.severity === 'medium') ? 'revise' : 'pass',
      resolution_fingerprint: guidance.resolution_fingerprint,
      candidate_fingerprint: candidateFingerprint,
      finding_count: findings.length,
      findings,
      persistence: 'not_persisted',
    },
    guidance,
  }
}

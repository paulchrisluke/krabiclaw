#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { parse as parseYaml } from 'yaml'

const TASKS = new Set(['blog.write', 'image.generate'])
const SCOPES = new Set(['platform', 'organization', 'site'])
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function usage() {
  console.log(`Usage:
  node scripts/import-agent-skill.mjs \
    --scope site \
    --site-id <id> \
    --task blog.write \
    --slug blog-writing \
    --file ./blog-writing.md \
    [--activate] [--dry-run]

Options:
  --scope platform|organization|site
  --organization-id <id>  Required for organization scope; optional for site scope
  --site-id <id>         Required for site scope
  --task blog.write|image.generate
  --slug <slug>           Lowercase skill identity slug
  --file <path>           Markdown file with optional YAML frontmatter
  --name <name>           Override frontmatter name
  --description <text>    Override frontmatter description
  --priority <integer>    Override frontmatter priority
  --activate              Activate the imported version explicitly
  --dry-run               Read current state and print the planned import
  --base-url <url>        Defaults to AGENT_SKILLS_BASE_URL or http://localhost:3000
  --cookie <value>        Defaults to AGENT_SKILLS_SESSION_COOKIE
`)
}

function parseArgs(argv) {
  const values = {}
  const flags = new Set()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      usage()
      process.exit(0)
    }
    if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`)
    const key = arg.slice(2).replaceAll('-', '_')
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      flags.add(key)
      continue
    }
    values[key] = next
    index += 1
  }
  return { values, flags }
}

function required(values, key) {
  const value = values[key]?.trim()
  if (!value) throw new Error(`--${key.replaceAll('_', '-')} is required`)
  return value
}

function normalizeMarkdown(value) {
  return value.replace(/\r\n?/g, '\n').trimEnd() + '\n'
}

function parseMarkdownDocument(source) {
  const normalized = source.replace(/\r\n?/g, '\n')
  if (!normalized.startsWith('---\n')) return { frontmatter: {}, markdown: normalizeMarkdown(normalized) }
  const end = normalized.indexOf('\n---', 4)
  if (end === -1) throw new Error('Markdown frontmatter starts with --- but has no closing ---')
  const raw = normalized.slice(4, end)
  const frontmatter = parseYaml(raw) ?? {}
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new Error('Markdown frontmatter must be a YAML object')
  }
  return { frontmatter, markdown: normalizeMarkdown(normalized.slice(end + 4).replace(/^\n+/, '')) }
}

function text(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function number(value, fallback) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) throw new Error('--priority must be an integer from 0 to 1000')
  return parsed
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function endpointFor(scope, values) {
  if (scope === 'platform') return '/api/admin/agent-skills'
  if (scope === 'organization') return `/api/organizations/${encodeURIComponent(required(values, 'organization_id'))}/agent-skills`
  return `/api/sites/${encodeURIComponent(required(values, 'site_id'))}/agent-skills`
}

let sessionCookie = process.env.AGENT_SKILLS_SESSION_COOKIE ?? ''

async function requestJson(baseUrl, path, options = {}) {
  const headers = { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) }
  if (sessionCookie) headers.cookie = sessionCookie
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers ?? {}) } })
  const textBody = await response.text()
  let body
  try { body = textBody ? JSON.parse(textBody) : null } catch { body = textBody }
  if (!response.ok) throw new Error(`${response.status} ${body?.error ?? (textBody || response.statusText)}`)
  return body
}

const { values, flags } = parseArgs(process.argv.slice(2))
const scope = required(values, 'scope')
const task = required(values, 'task')
const slug = required(values, 'slug')
const file = required(values, 'file')
sessionCookie = values.cookie ?? sessionCookie
if (!SCOPES.has(scope)) throw new Error(`--scope must be one of: ${[...SCOPES].join(', ')}`)
if (!TASKS.has(task)) throw new Error(`--task must be one of: ${[...TASKS].join(', ')}`)
if (!SLUG_RE.test(slug)) throw new Error('--slug must match ^[a-z0-9]+(?:-[a-z0-9]+)*$')
if (scope === 'organization') required(values, 'organization_id')
if (scope === 'site') required(values, 'site_id')

const source = await readFile(file, 'utf8')
const document = parseMarkdownDocument(source)
const frontmatter = document.frontmatter
const name = text(values.name, text(frontmatter.name, slug.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join(' ')))
const description = text(values.description, text(frontmatter.description, task === 'blog.write' ? 'Guidance for drafting or revising blog content.' : 'Guidance for preparing image-generation briefs.'))
const priority = number(values.priority ?? frontmatter.priority, 100)
const baseUrl = (values.base_url ?? process.env.AGENT_SKILLS_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const endpoint = endpointFor(scope, values)
const list = await requestJson(baseUrl, `${endpoint}?task=${encodeURIComponent(task)}`)
const existing = list.skills.find((skill) => skill.slug === slug && skill.task === task)
let detail = null
if (existing) detail = await requestJson(baseUrl, `/api/agent-skills/${encodeURIComponent(existing.id)}`)
const nextVersion = detail ? Math.max(...detail.versions.map((version) => version.version), 0) + 1 : 1
const planned = {
  scope,
  organization_id: values.organization_id ?? null,
  site_id: values.site_id ?? null,
  task,
  slug,
  name,
  priority,
  version: nextVersion,
  content_hash: sha256(JSON.stringify({ name, description, instructions_markdown: document.markdown, priority })),
  byte_count: Buffer.byteLength(document.markdown),
  activate: flags.has('activate'),
  would_archive_active: Boolean(flags.has('activate') && detail?.versions.some((version) => version.status === 'active')),
}

if (flags.has('dry_run')) {
  console.log(JSON.stringify(planned, null, 2))
  process.exit(0)
}

const result = await requestJson(baseUrl, '/api/agent-skills/import-markdown', {
  method: 'POST',
  body: JSON.stringify({
    scope_type: scope,
    organization_id: values.organization_id ?? null,
    site_id: values.site_id ?? null,
    task,
    slug,
    name,
    description,
    priority,
    markdown: document.markdown,
    activate: flags.has('activate'),
  }),
})
console.log(JSON.stringify({ ...planned, imported_skill_id: result.skill?.id ?? null, imported_version_id: result.versions?.[0]?.id ?? null }, null, 2))

import type { H3Event } from 'h3'
import { createError } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isOrganizationWideRole } from '~/server/utils/member-access'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { loadMemberSiteRow, requireSiteAccess } from '~/server/utils/location-access'
import { queryFirst, type DbClient } from '~/server/db'
import type { AgentSkillIdentity, AgentSkillScopeType } from './types'

export function agentSkillErrorResponse(error: unknown, fallback = 'Agent skill request failed') {
  const statusCode = error && typeof error === 'object' && 'statusCode' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number'
    ? (error as { statusCode: number }).statusCode
    : 500
  const message = error instanceof Error ? error.message : fallback
  return jsonResponse({ error: message }, { status: statusCode })
}

export async function requirePlatformAgentSkillAccess(event: H3Event) {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  if (!isPlatformAdmin(session.user, env)) throw createError({ statusCode: 403, statusMessage: 'Platform admin access required' })
  return { env, db, session }
}

export async function requireOrganizationAgentSkillAccess(event: H3Event, organizationId: string, mode: 'read' | 'write') {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  const member = await queryFirst<{ id: string; role: string }>(db, `
    SELECT id, role FROM member
    WHERE organizationId = ? AND userId = ?
    LIMIT 1
  `, [organizationId, session.user.id])
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Organization not found or access denied' })
  if (mode === 'write' && !isOrganizationWideRole(member.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Organization admin access required' })
  }
  return { env, db, session, member }
}

export async function requireSiteAgentSkillAccess(event: H3Event, siteId: string, mode: 'read' | 'write') {
  const access = await requireSiteAccess(event, siteId, mode === 'write' ? 'site-wide' : 'context')
  if (mode === 'write' && !isOrganizationWideRole(access.site.member_role)) {
    throw createError({ statusCode: 403, statusMessage: 'Site admin access required' })
  }
  return access
}

export async function requireAgentSkillIdentityAccess(event: H3Event, skillId: string, mode: 'read' | 'write') {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  const skill = await queryFirst<AgentSkillIdentity>(db, 'SELECT * FROM agent_skills WHERE id = ? LIMIT 1', [skillId])
  if (!skill) throw createError({ statusCode: 404, statusMessage: 'Agent skill not found' })
  return await requireAgentSkillScopeAccess(event, db, skill.scope_type, skill.organization_id, skill.site_id, mode, skill)
}

export async function requireAgentSkillVersionAccess(event: H3Event, versionId: string, mode: 'read' | 'write') {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  const skill = await queryFirst<AgentSkillIdentity>(db, `
    SELECT s.*
    FROM agent_skill_versions v
    JOIN agent_skills s ON s.id = v.skill_id
    WHERE v.id = ?
    LIMIT 1
  `, [versionId])
  if (!skill) throw createError({ statusCode: 404, statusMessage: 'Agent skill version not found' })
  return await requireAgentSkillScopeAccess(event, db, skill.scope_type, skill.organization_id, skill.site_id, mode, skill)
}

async function requireAgentSkillScopeAccess(
  event: H3Event,
  db: DbClient,
  scopeType: AgentSkillScopeType,
  organizationId: string | null,
  siteId: string | null,
  mode: 'read' | 'write',
  skill: AgentSkillIdentity,
) {
  if (scopeType === 'platform') {
    const access = await requirePlatformAgentSkillAccess(event)
    return { ...access, skill }
  }
  if (scopeType === 'organization') {
    if (!organizationId) throw createError({ statusCode: 500, statusMessage: 'Invalid organization skill scope' })
    const access = await requireOrganizationAgentSkillAccess(event, organizationId, mode)
    return { ...access, skill }
  }
  if (!siteId) throw createError({ statusCode: 500, statusMessage: 'Invalid site skill scope' })
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  const site = await loadMemberSiteRow(db, siteId, session.user.id)
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found or access denied' })
  await requireSiteAgentSkillAccess(event, siteId, mode)
  return { env, db, session, site, skill }
}

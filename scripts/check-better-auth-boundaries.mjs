#!/usr/bin/env node
/**
 * Better Auth architecture boundary guard for issue #386.
 *
 * This first guard intentionally does not migrate runtime behavior. It freezes
 * the current known-debt surface so new auth drift cannot spread while the
 * Better Auth Admin/Organization/Teams/OAuth migration lands in child PRs.
 *
 * Every entry in EXISTING_DEBT_ALLOWLIST is expected to disappear as its
 * migration child deletes that legacy path.
 */

import { execFileSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.cwd()

const ALWAYS_ALLOWED_PREFIXES = [
  'migrations/',
  'migrations/meta/',
]

const ALWAYS_ALLOWED_FILES = new Set([
  'docs/adr/0021-better-auth-authorization-target.md',
  'scripts/check-better-auth-boundaries.mjs',
  'server/db/schema.ts',
])

const EXISTING_DEBT_ALLOWLIST = {
  member_access_scope: new Set([
    'docs/audits/0341-workstream-a-authorization.md',
    'pages/dashboard/[orgSlug]/settings/members.vue',
    'scripts/backfill-whatsapp-members.mjs',
    'server/api/dashboard/invitations/[invitationId]/retry.post.ts',
    'server/api/dashboard/locations/index.get.ts',
    'server/api/dashboard/organizations/members/[memberId]/remove.post.ts',
    'server/api/invitations/[invitationId]/accept.post.ts',
    'server/api/whatsapp/webhook.post.ts',
    'server/utils/chowbot-conversations.ts',
    'server/utils/dashboard-context.ts',
    'server/utils/dashboard-home.ts',
    'server/utils/dev-test-members.ts',
    'server/utils/mcp-auth.ts',
    'server/utils/member-access.ts',
    'server/utils/notification-access.ts',
    'server/utils/whatsapp-access.ts',
    'server/utils/whatsapp-revocation.ts',
    'tests/unit/editor-scope-migration.test.ts',
    'tests/unit/guest-threads.test.ts',
    'tests/unit/member-access.test.ts',
    'tests/unit/notification-access.test.ts',
    'tests/unit/whatsapp-backfill-script.test.ts',
    'tests/unit/whatsapp-revocation.test.ts',
  ]),

  admin_impersonation_proxy: new Set([
    'tests/unit/dashboard-ia.test.ts',
  ]),

  isPlatformAdmin: new Set([
    'scripts/capture-docs-screenshots.mjs',
    'server/api/admin/ai/generate.post.ts',
    'server/api/admin/analytics.get.ts',
    'server/api/admin/blog/backfill-structured.post.ts',
    'server/api/admin/blog/posts.get.ts',
    'server/api/admin/blog/posts.post.ts',
    'server/api/admin/blog/posts/[postId].delete.ts',
    'server/api/admin/blog/posts/[postId].get.ts',
    'server/api/admin/blog/posts/[postId].patch.ts',
    'server/api/admin/clients.get.ts',
    'server/api/admin/content/[page].delete.ts',
    'server/api/admin/content/[page].get.ts',
    'server/api/admin/content/[page].post.ts',
    'server/api/admin/docs.get.ts',
    'server/api/admin/docs.post.ts',
    'server/api/admin/docs/[docId].delete.ts',
    'server/api/admin/docs/[docId].get.ts',
    'server/api/admin/docs/[docId].patch.ts',
    'server/api/admin/domains.get.ts',
    'server/api/admin/domains/reconcile.post.ts',
    'server/api/admin/domains/[domainId]/sync.post.ts',
    'server/api/admin/feature-flags.get.ts',
    'server/api/admin/fulfillment.get.ts',
    'server/api/admin/fulfillment/[id]/done.post.ts',
    'server/api/admin/invite/client.post.ts',
    'server/api/admin/invite/team.post.ts',
    'server/api/admin/mcp-usage.get.ts',
    'server/api/admin/members.get.ts',
    'server/api/admin/organizations.get.ts',
    'server/api/admin/organizations/[orgId]/billing.get.ts',
    'server/api/admin/organizations/[orgId]/billing/cash-payment.post.ts',
    'server/api/admin/platform/media.get.ts',
    'server/api/admin/platform/media.post.ts',
    'server/api/admin/sites/[siteId]/billing/mark-paid.post.ts',
    'server/api/admin/sites/[siteId]/members/invite.post.ts',
    'server/api/admin/sites/[siteId]/transfer.delete.ts',
    'server/api/admin/sites/[siteId]/transfer.get.ts',
    'server/api/admin/sites/[siteId]/transfer.post.ts',
    'server/api/admin/sites/[siteId]/transfer/force-accept.post.ts',
    'server/api/admin/users.get.ts',
    'server/api/admin/work-requests.get.ts',
    'server/api/admin/work-requests/[id].patch.ts',
    'server/api/post-login.get.ts',
    'server/api/site-transfer/[token]/accept.post.ts',
    'server/utils/mcp-auth.ts',
    'server/utils/notification-access.ts',
    'server/utils/platform-auth.ts',
    'server/utils/route-access.ts',
    'tests/unit/platform-auth.test.ts',
  ]),

  direct_platform_role_sql: new Set([
    'scripts/capture-docs-screenshots.mjs',
    'scripts/promote-platform-admin.mjs',
    'server/api/admin/invite/team.post.ts',
  ]),

  direct_oauth_token_sql: new Set([
    'server/utils/mcp-auth.ts',
  ]),

  dashboard_context_headers: new Set([
    'PRODUCT.md',
    'composables/useDashboardSite.ts',
    'pages/dashboard/[orgSlug]/activity.vue',
    'pages/dashboard/[orgSlug]/sites/[siteSlug]/index.vue',
    'plugins/dashboard-site-header.client.ts',
    'server/api/dashboard/locations/[id].get.ts',
    'server/api/dashboard/locations/[id].patch.ts',
    'server/utils/dashboard-context.ts',
    'tests/e2e/dashboard.spec.ts',
    'tests/e2e/helpers/ensure-site.ts',
    'tests/e2e/local-access.spec.ts',
    'tests/e2e/onboarding-wizard.spec.ts',
    'tests/e2e/test-env.ts',
    'tests/unit/dashboard-org-resolution.test.ts',
  ]),

  jwks_verification: new Set([
    'docs/local-mcp-harness.md',
    'server/api/auth/oauth2/test-private-client-metadata.get.ts',
    'server/utils/auth.ts',
    'server/utils/mcp-auth.ts',
    'tests/e2e/oauth-discovery.spec.ts',
  ]),
}

const FORBIDDEN_PATTERNS = [
  {
    id: 'member_access_scope',
    description: 'shadow tenant membership/scope table',
    regex: /\bmember_access_scope\b/g,
  },
  {
    id: 'admin_impersonation_proxy',
    description: 'custom admin impersonation proxy route',
    regex: /(?:\/api\/admin\/impersonation\/(?:start|stop)|server\/api\/admin\/impersonation\/(?:start|stop)\.post\.ts)/g,
  },
  {
    id: 'isPlatformAdmin',
    description: 'custom platform role parser/check',
    regex: /\bisPlatformAdmin\s*\(/g,
  },
  {
    id: 'direct_platform_role_sql',
    description: 'direct SQL mutation of Better Auth user role',
    regex: /\bUPDATE\s+user\s+SET\s+role\b/gi,
  },
  {
    id: 'direct_oauth_token_sql',
    description: 'direct SQL against Better Auth OAuth token/client tables',
    regex: /\bFROM\s+(?:oauthAccessToken|oauthClient|jwks)\b/gi,
  },
  {
    id: 'dashboard_context_headers',
    description: 'hidden dashboard context headers',
    regex: /\bx-dashboard-(?:org|site)-slug\b/g,
  },
  {
    id: 'jwks_verification',
    description: 'manual JWKS/JWT verification plumbing',
    regex: /\b(?:jwtVerify|createLocalJWKSet)\b/g,
  },
]

function gitFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT })
  return output.toString('utf8').split('\0').filter(Boolean)
}

function isAlwaysAllowed(file) {
  return ALWAYS_ALLOWED_FILES.has(file) || ALWAYS_ALLOWED_PREFIXES.some(prefix => file.startsWith(prefix))
}

function isAllowed(file, patternId) {
  return isAlwaysAllowed(file) || EXISTING_DEBT_ALLOWLIST[patternId]?.has(file)
}

function lineNumberForIndex(content, index) {
  let line = 1
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++
  }
  return line
}

async function checkForbiddenPatterns() {
  const violations = []
  const files = gitFiles()

  for (const forbiddenFile of [
    'server/api/admin/impersonation/start.post.ts',
    'server/api/admin/impersonation/stop.post.ts',
  ]) {
    if (files.includes(forbiddenFile)) {
      violations.push({
        file: forbiddenFile,
        line: 1,
        pattern: 'admin_impersonation_proxy',
        description: 'custom admin impersonation proxy route',
        match: forbiddenFile,
      })
    }
  }

  for (const file of files) {
    if (isAlwaysAllowed(file)) continue
    const info = await stat(join(ROOT, file))
    if (!info.isFile()) continue
    const content = await readFile(file, 'utf8')

    for (const pattern of FORBIDDEN_PATTERNS) {
      pattern.regex.lastIndex = 0
      let match
      while ((match = pattern.regex.exec(content)) !== null) {
        if (!isAllowed(file, pattern.id)) {
          violations.push({
            file,
            line: lineNumberForIndex(content, match.index),
            pattern: pattern.id,
            description: pattern.description,
            match: match[0].replace(/\s+/g, ' ').slice(0, 160),
          })
        }
      }
    }
  }

  return violations
}

async function assertContains(file, expected, label) {
  const content = await readFile(file, 'utf8')
  if (!content.includes(expected)) {
    return `${file}: missing ${label}: ${expected}`
  }
  return null
}

async function checkMcpResourceBoundary() {
  const failures = []

  for (const [file, expected, label] of [
    ['server/api/mcp.post.ts', "audiences: [`${baseUrl}/api/mcp`]", 'tenant MCP audience'],
    ['server/api/mcp.post.ts', 'requiredScopes: ["tenant"]', 'tenant MCP scope'],
    ['server/api/mcp/platform.post.ts', "audiences: [`${baseUrl}/api/mcp/platform`]", 'platform MCP audience'],
    ['server/api/mcp/platform.post.ts', "requiredScopes: ['platform_admin']", 'platform MCP scope'],
    ['server/api/mcp/platform.post.ts', 'requirePlatformAdmin: true', 'platform MCP admin gate'],
    ['server/routes/.well-known/oauth-protected-resource.get.ts', 'resource: `${baseUrl}/api/mcp`', 'tenant protected resource metadata'],
    ['server/routes/.well-known/oauth-protected-resource.get.ts', "scopes_supported: ['openid', 'offline_access', 'tenant']", 'tenant protected resource scopes'],
    ['server/routes/.well-known/oauth-protected-resource/platform-mcp.get.ts', 'resource: `${baseUrl}/api/mcp/platform`', 'platform protected resource metadata'],
    ['server/routes/.well-known/oauth-protected-resource/platform-mcp.get.ts', "scopes_supported: ['openid', 'offline_access', 'platform_admin']", 'platform protected resource scopes'],
    ['server/utils/auth.ts', "identifier: `${authBaseUrl}/api/mcp`", 'tenant OAuth resource registration'],
    ['server/utils/auth.ts', "allowedScopes: ['openid', 'offline_access', 'tenant']", 'tenant OAuth resource scopes'],
    ['server/utils/auth.ts', "identifier: `${authBaseUrl}/api/mcp/platform`", 'platform OAuth resource registration'],
    ['server/utils/auth.ts', "allowedScopes: ['openid', 'offline_access', 'platform_admin']", 'platform OAuth resource scopes'],
  ]) {
    const failure = await assertContains(file, expected, label)
    if (failure) failures.push(failure)
  }

  return failures
}

const [forbiddenViolations, mcpBoundaryFailures] = await Promise.all([
  checkForbiddenPatterns(),
  checkMcpResourceBoundary(),
])

if (forbiddenViolations.length || mcpBoundaryFailures.length) {
  console.error('Better Auth boundary check failed.')

  for (const violation of forbiddenViolations) {
    console.error(`  ${violation.file}:${violation.line} ${violation.pattern} (${violation.description}) -> ${violation.match}`)
  }

  for (const failure of mcpBoundaryFailures) {
    console.error(`  ${failure}`)
  }

  console.error('\nUse documented Better Auth Admin, Organization/Teams, impersonation, and OAuth resource-server APIs. If this is intentional legacy debt, add it to issue #386 and keep the allowlist entry narrowly scoped to the file being migrated.')
  process.exit(1)
}

console.log('Better Auth boundary check passed.')

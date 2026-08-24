#!/usr/bin/env node

import { execFileSync } from 'node:child_process'

const query = `SELECT
  (SELECT COUNT(*) FROM posts WHERE status IN ('draft', 'archived')) AS posts,
  (SELECT COUNT(*) FROM post_channel_jobs WHERE post_id IN (SELECT id FROM posts WHERE status IN ('draft', 'archived'))) AS post_channel_jobs,
  (SELECT COUNT(*) FROM post_media WHERE post_id IN (SELECT id FROM posts WHERE status IN ('draft', 'archived'))) AS post_media,
  (SELECT COUNT(*) FROM blog_posts WHERE status IN ('draft', 'archived')) AS blogs,
  (SELECT COUNT(*) FROM content_documents WHERE owner_type IN ('tenant_blog', 'platform_blog') AND owner_id IN (SELECT id FROM blog_posts WHERE status IN ('draft', 'archived'))) AS blog_documents,
  (SELECT COUNT(*) FROM content_blocks WHERE document_id IN (SELECT id FROM content_documents WHERE owner_type IN ('tenant_blog', 'platform_blog') AND owner_id IN (SELECT id FROM blog_posts WHERE status IN ('draft', 'archived')))) AS blog_blocks,
  (SELECT COUNT(*) FROM platform_docs WHERE status != 'published') AS platform_docs,
  (SELECT COUNT(*) FROM platform_content_components WHERE content_type = 'doc' AND content_id IN (SELECT id FROM platform_docs WHERE status != 'published')) AS platform_doc_components,
  (SELECT COUNT(*) FROM content_documents WHERE owner_type = 'platform_doc') AS duplicate_platform_doc_documents,
  (SELECT COUNT(*) FROM content_blocks WHERE document_id IN (SELECT id FROM content_documents WHERE owner_type = 'platform_doc')) AS duplicate_platform_doc_blocks,
  (SELECT COUNT(*) FROM site_locales WHERE status = 'draft') AS locales,
  (SELECT COUNT(*) FROM tenant_page_variants WHERE EXISTS (SELECT 1 FROM site_locales WHERE site_locales.organization_id = tenant_page_variants.organization_id AND site_locales.site_id = tenant_page_variants.site_id AND site_locales.locale = tenant_page_variants.locale AND site_locales.status = 'draft')) AS locale_variants,
  (SELECT COUNT(*) FROM content_documents WHERE owner_type = 'tenant_page' AND owner_id IN (SELECT tenant_page_variants.id FROM tenant_page_variants JOIN site_locales ON site_locales.organization_id = tenant_page_variants.organization_id AND site_locales.site_id = tenant_page_variants.site_id AND site_locales.locale = tenant_page_variants.locale WHERE site_locales.status = 'draft')) AS locale_documents,
  (SELECT COUNT(*) FROM content_blocks WHERE document_id IN (SELECT content_documents.id FROM content_documents JOIN tenant_page_variants ON content_documents.owner_type = 'tenant_page' AND content_documents.owner_id = tenant_page_variants.id JOIN site_locales ON site_locales.organization_id = tenant_page_variants.organization_id AND site_locales.site_id = tenant_page_variants.site_id AND site_locales.locale = tenant_page_variants.locale WHERE site_locales.status = 'draft')) AS locale_blocks,
  (SELECT COUNT(*) FROM tenant_redirects WHERE EXISTS (SELECT 1 FROM site_locales WHERE site_locales.organization_id = tenant_redirects.organization_id AND site_locales.site_id = tenant_redirects.site_id AND site_locales.locale = tenant_redirects.locale AND site_locales.status = 'draft')) AS locale_redirects;`

const targets = process.argv.slice(2)
const selected = targets.length ? targets : ['local', 'preview', 'staging', 'production']

for (const target of selected) {
  if (!['local', 'preview', 'staging', 'production'].includes(target)) {
    throw new Error(`Unsupported environment: ${target}`)
  }
  const args = ['wrangler', 'd1', 'execute', 'DB']
  if (target === 'local') args.push('--local')
  else {
    if (target !== 'production') args.push('--env', target)
    args.push('--remote')
  }
  args.push('--command', query, '--json')
  const raw = execFileSync('npx', args, {
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_LOG_PATH: '/tmp/krabiclaw-publication-cleanup-report.log' },
  })
  const parsed = JSON.parse(raw)
  const result = parsed[0]?.results?.[0] ?? parsed[0]?.result?.[0] ?? null
  console.log(JSON.stringify({ environment: target, affected: result }, null, 2))
}

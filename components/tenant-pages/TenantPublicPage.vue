<template>
  <!--
    One renderer per template, chosen here. Every Blawby page is a Blawby page:
    the practice areas were the only ones an allowlist of seven paths left out,
    so they rendered in the Saya markup on a Blawby site. KrabiClaw's own pages
    are KrabiClaw pages for the same reason — rendered through the Saya block
    loop they lost every section the marketing site had (#903).
  -->
  <template v-if="page">
    <BlawbyCanonicalPage v-if="isBlawby" :page="page" />
    <TenantPageRenderer v-else :page="page" />
  </template>
</template>

<script setup lang="ts">
import { publicApiRequest, isRecord } from '~/utils/api-clients'
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'
import type { PublicBlawbyIdentity, PublicCompliance } from '~/types/blawby'
import { normalizeRobotsIntent } from '~/shared/robots-directive'
import { normalizeTenantPagePath } from '~/utils/tenant-page-blocks'

const props = defineProps<{ path: string; locale?: string | null }>()
const { siteId, isPlatform, previewAuthorized, site } = useTenantSite()
const { isBlawby } = usePublicTemplate()
const { locale: i18nLocale } = useI18n()
// Page ownership is a resolved site, not a tenant type. KrabiClaw's own site is
// a site row with page documents like any other, and requiring `isTenant` here
// is what forced its marketing pages to be hardcoded components (#903).
if (!siteId) throw createError({ statusCode: 404, statusMessage: 'Site context is unavailable' })

// Preview authorization belongs to the site, resolved once from the preview
// cookie by tenant resolution; the client's API call carries the same cookie.
const preview = previewAuthorized
const activeLocale = computed(() => {
  if (props.locale?.trim()) return props.locale.trim()
  return i18nLocale.value
})
/**
 * The path this instance is showing, normalized by the same function that
 * normalizes it on the way into the database
 * (`normalizeTenantPagePath`, utils/tenant-page-blocks.ts).
 *
 * A computed rather than a constant so the fetch key follows the prop: this
 * component is a child of one catch-all route that serves every page path, and
 * the key is the only thing that distinguishes one page's read from another's.
 */
const pagePath = computed(() => normalizeTenantPagePath(props.path))
const key = computed(() => `tenant-page-${siteId}-${activeLocale.value}-${pagePath.value}-${preview ? 'preview' : 'published'}`)
const isPageResponse = (value: unknown): value is { success: true; page: PublicTenantPage } =>
  isRecord(value) && value.success === true && isRecord(value.page) && typeof value.page.path === 'string' && Array.isArray(value.page.blocks)

const requestEvent = useRequestEvent()
const { data, error, status, execute } = await useAsyncData(key, async () => {
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const [{ cloudflareEnv }, { getPublicTenantPageForPath }] = await Promise.all([
      import('~/server/utils/api-response'),
      import('~/server/utils/public-tenant-pages'),
    ])
    const env = cloudflareEnv(requestEvent)
    const db = env.db
    if (!db) throw createError({ statusCode: 503, statusMessage: 'Database not available' })
    const page = await getPublicTenantPageForPath(env, db, siteId, pagePath.value, { locale: activeLocale.value, preview })
    if (!page) throw createError({ statusCode: 404, statusMessage: 'Tenant page not found' })
    return { success: true as const, page }
  }
  const query: Record<string, string> = { path: pagePath.value }
  const endpoint = activeLocale.value === 'en'
    ? `/api/public/sites/${encodeURIComponent(siteId)}/pages`
    : `/api/public/sites/${encodeURIComponent(siteId)}/localized-pages/${encodeURIComponent(activeLocale.value)}`
  return await publicApiRequest<{ success: true; page: PublicTenantPage }>(endpoint, {
    query,
    validate: isPageResponse,
    coalesceKey: key.value,
  })
}, {
  server: true,
  lazy: false,
  getCachedData(cacheKey) {
    return useNuxtApp().payload.data[cacheKey] as { success: true; page: PublicTenantPage } | undefined
  },
})

// Nuxt can defer a child request until mount while the previous route is
// still hydrating. Await that same request before requiring its document.
if (status.value === 'idle' || status.value === 'pending') await execute({ dedupe: 'defer' })
if (error.value) throw error.value
// A client navigation can tear this instance down while its request is still in
// flight: Nuxt drops the async data and the awaited call returns empty with no
// error. That is not a page that failed to load, it is a page nobody is looking
// at any more, and turning it into a 500 put an uncaught error on every visitor
// who clicked twice quickly. Only a settled request with no page is a failure.
if (!data.value?.page && status.value === 'success') {
  throw createError({ statusCode: 500, statusMessage: 'Tenant page data was not returned' })
}

const page = computed(() => data.value?.page ?? null)

// The locale representations of the page this instance is showing, written the
// way every other public route writes them (pages/blog/[slug].vue,
// pages/posts/[slug].vue, pages/links.vue, layouts/blawby.vue): once, in setup.
//
// Not a watcher, and above all not a `watchEffect`: calling `useState` inside
// the effect read the payload entry the effect then wrote, so the effect was
// its own dependency and re-triggered forever. Vue's own guidance is the
// reason -- "watchEffect ... automatically tracks every reactive property
// accessed during its synchronous execution", while `watch` "won't track
// anything accessed inside the callback"
// (https://vuejs.org/guide/essentials/watchers, "watch vs. watchEffect").
// In the production build that warning is compiled out, so the only symptom
// was a pegged tab with an empty console.
//
// Setup is enough because Nuxt keys <NuxtPage> by the matched route path with
// its params interpolated (nuxt/dist/pages/runtime/utils.js:9), so a hop
// between two paths this catch-all serves mounts a new instance.
//
// Guarded by the same abandoned-instance condition as the check above: a page
// nobody is looking at any more has nothing to announce.
if (data.value?.page) {
  if (!data.value.page.localeRepresentations) {
    throw createError({ statusCode: 500, statusMessage: 'Tenant page locale representations were not returned' })
  }
  useState<PublicLocaleRepresentation[]>('public-locale-representations', () => []).value = data.value.page.localeRepresentations
}

const schemaContext = inject<{ identity: ComputedRef<PublicBlawbyIdentity>; compliance: ComputedRef<PublicCompliance | null> } | null>('blawby-schema-context', null)
const schemaOrg = useBlawbyOrgIdentity(() => schemaContext?.identity.value, () => schemaContext?.compliance.value)
const supportedSchemaRecipes = new Set(['home', 'about', 'contact', 'pricing', 'donate', 'schedule'])
const schemaRecipe = computed<'home' | 'about' | 'contact' | 'pricing' | 'donate' | 'schedule' | 'tenant-page'>(() => {
  if (!page.value) return 'tenant-page'
  if (page.value.recipe && supportedSchemaRecipes.has(page.value.recipe)) return page.value.recipe as 'home' | 'about' | 'contact' | 'pricing' | 'donate' | 'schedule'
  const pathRecipes = new Map([
    ['/', 'home'],
    ['/about', 'about'],
    ['/contact', 'contact'],
    ['/pricing', 'pricing'],
    ['/donate', 'donate'],
    ['/schedule', 'schedule'],
  ])
  return (pathRecipes.get(page.value.path) || 'tenant-page') as 'home' | 'about' | 'contact' | 'pricing' | 'donate' | 'schedule' | 'tenant-page'
})

useProfessionalServiceSchema(() => {
  if (!page.value || !isBlawby.value || !schemaContext) return null
  const faqBlock = page.value.blocks.find(block => block.type === 'faq')
  // The services this page lists are pages, and the page renders them from its
  // page_grid. Reading a product_grid here described a block these pages do not
  // carry, so the schema listed no services at all.
  const servicesBlock = page.value.blocks.find(block => block.type === 'page_grid' && block.data.section === 'services')
  const donationBlock = page.value.blocks.find(block => block.type === 'donation_choices')
  const faqItems = Array.isArray(faqBlock?.data.items)
    ? faqBlock.data.items.filter(item => item && typeof item === 'object' && !Array.isArray(item)).map(item => {
        const record = item as Record<string, unknown>
        return { question: typeof record.title === 'string' ? record.title : null, answer: typeof record.description === 'string' ? record.description : null }
      })
    : []
  const serviceItems = Array.isArray(servicesBlock?.data.items)
    ? servicesBlock.data.items.filter(item => item && typeof item === 'object' && !Array.isArray(item)).map(item => {
        const record = item as Record<string, unknown>
        return {
          name: typeof record.title === 'string' ? record.title : '',
          url: typeof record.url === 'string' ? record.url : '',
          description: typeof record.description === 'string' ? record.description : null,
        }
      }).filter(item => item.name && item.url)
    : []
  const donationUrl = typeof donationBlock?.data.destination === 'string' ? donationBlock.data.destination : null
  return {
    recipe: schemaRecipe.value,
    org: schemaOrg.value,
    pageUrl: page.value.path,
    pageTitle: page.value.title,
    pageDescription: page.value.seo_description || page.value.summary,
    faqs: faqItems,
    items: serviceItems,
    donationUrl,
  }
})
useSocialMetadata(() => page.value && ({
  path: page.value.canonical_url || page.value.path,
  title: page.value.seo_title || `${page.value.title} | ${site?.brand_name || ''}`,
  description: page.value.seo_description || page.value.summary || '',
  robots: normalizeRobotsIntent(page.value.robots),
  // KrabiClaw's own brand name is the platform name, which useSocialMetadata
  // already states once for every platform surface; a tenant states its own.
  ...(isPlatform ? {} : { brand: { siteName: site?.brand_name || '' } }),
  socialImage: page.value.social_image,
}))
</script>

<template>
  <!--
    One renderer per template, chosen here. Every Blawby page is a Blawby page:
    the practice areas were the only ones an allowlist of seven paths left out,
    so they rendered in the Saya markup on a Blawby site.
  -->
  <BlawbyCanonicalPage v-if="isBlawby" :page="page" />
  <TenantPageRenderer v-else :page="page" template="saya" />
</template>

<script setup lang="ts">
import { publicApiRequest, isRecord } from '~/utils/api-clients'
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'
import type { PublicBlawbyIdentity, PublicCompliance } from '~/types/blawby'
import { normalizeRobotsIntent } from '~/shared/robots-directive'

const props = defineProps<{ path: string; locale?: string | null }>()
const { siteId, isTenant, previewAuthorized, site } = useTenantSite()
const { isBlawby } = usePublicTemplate()
const { locale: i18nLocale } = useI18n()
if (!isTenant || !siteId) throw createError({ statusCode: 404, statusMessage: 'Tenant site context is unavailable' })

// Preview authorization belongs to the site, resolved once from the preview
// cookie by tenant resolution; the client's API call carries the same cookie.
const preview = previewAuthorized
const activeLocale = computed(() => {
  if (props.locale?.trim()) return props.locale.trim()
  return i18nLocale.value
})
const pagePath = props.path === '/' ? '/' : props.path.replace(/\/+$/, '')
const key = computed(() => `tenant-page-${siteId}-${activeLocale.value}-${pagePath}-${preview ? 'preview' : 'published'}`)
const isPageResponse = (value: unknown): value is { success: true; page: PublicTenantPage } =>
  isRecord(value) && value.success === true && isRecord(value.page) && typeof value.page.path === 'string' && Array.isArray(value.page.blocks)

const requestEvent = useRequestEvent()
const { data, error } = await useAsyncData(key, async () => {
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const [{ cloudflareEnv }, { getPublicTenantPageForPath }] = await Promise.all([
      import('~/server/utils/api-response'),
      import('~/server/utils/public-tenant-pages'),
    ])
    const env = cloudflareEnv(requestEvent)
    const db = env.db
    if (!db) throw createError({ statusCode: 503, statusMessage: 'Database not available' })
    const page = await getPublicTenantPageForPath(db, siteId, pagePath, { locale: activeLocale.value, preview })
    if (!page) throw createError({ statusCode: 404, statusMessage: 'Tenant page not found' })
    return { success: true as const, page }
  }
  const query: Record<string, string> = { path: pagePath }
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

if (error.value) throw error.value
if (!data.value?.page) throw createError({ statusCode: 500, statusMessage: 'Tenant page data was not returned' })

const page = computed(() => data.value!.page)
if (!page.value.localeRepresentations) {
  throw createError({ statusCode: 500, statusMessage: 'Tenant page locale representations were not returned' })
}
useState<PublicLocaleRepresentation[]>('public-locale-representations', () => []).value = page.value.localeRepresentations
const schemaContext = inject<{ identity: ComputedRef<PublicBlawbyIdentity>; compliance: ComputedRef<PublicCompliance | null> } | null>('blawby-schema-context', null)
const schemaOrg = useBlawbyOrgIdentity(() => schemaContext?.identity.value, () => schemaContext?.compliance.value)
const supportedSchemaRecipes = new Set(['home', 'about', 'contact', 'pricing', 'donate', 'schedule'])
const schemaRecipe = computed<'home' | 'about' | 'contact' | 'pricing' | 'donate' | 'schedule' | 'tenant-page'>(() => {
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
  if (!isBlawby.value || !schemaContext) return null
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
useSocialMetadata(() => ({
  path: page.value.canonical_url || page.value.path,
  title: page.value.seo_title || `${page.value.title} | ${site?.brand_name || ''}`,
  description: page.value.seo_description || page.value.summary || '',
  robots: normalizeRobotsIntent(page.value.robots),
  brand: {
    siteName: site?.brand_name || '',
  },
  socialImage: page.value.social_image,
}))
</script>

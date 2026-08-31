<template>
  <TenantPageRenderer :page="page" :template="template" />
</template>

<script setup lang="ts">
import { publicApiRequest, isRecord } from '~/utils/api-clients'
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { PublicBlawbyIdentity, PublicCompliance } from '~/types/blawby'

const props = defineProps<{ path: string; previewToken?: string | null; locale?: string | null }>()
const { siteId, isTenant, site } = useTenantSite()
const { isBlawby } = usePublicTemplate()
const { locale: i18nLocale } = useI18n()
if (!isTenant || !siteId) throw createError({ statusCode: 404, statusMessage: 'Tenant site context is unavailable' })

const preview = Boolean(props.previewToken)
const activeLocale = computed(() => {
  if (props.locale?.trim()) return props.locale.trim()
  return i18nLocale.value
})
const pagePath = props.path === '/' ? '/' : props.path.replace(/\/+$/, '')
const key = computed(() => `tenant-page-${siteId}-${activeLocale.value}-${pagePath}-${preview ? 'preview' : 'published'}-${props.previewToken || ''}`)
const isPageResponse = (value: unknown): value is { success: true; page: PublicTenantPage } =>
  isRecord(value) && value.success === true && isRecord(value.page) && typeof value.page.path === 'string' && Array.isArray(value.page.blocks)

const requestEvent = useRequestEvent()
const { data, error } = await useAsyncData(key, async () => {
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const [{ cloudflareEnv }, { verifyPreviewToken }, { getPublicTenantPageForPath }] = await Promise.all([
      import('~/server/utils/api-response'),
      import('~/server/utils/preview-token'),
      import('~/server/utils/public-tenant-pages'),
    ])
    const env = cloudflareEnv(requestEvent)
    if (preview && (!props.previewToken || !env.PREVIEW_SECRET || !(await verifyPreviewToken(String(env.PREVIEW_SECRET), siteId, props.previewToken)))) {
      throw createError({ statusCode: 401, statusMessage: 'Preview authorization is required' })
    }
    const db = env.db
    if (!db) throw createError({ statusCode: 503, statusMessage: 'Database not available' })
    const page = await getPublicTenantPageForPath(db, siteId, pagePath, { locale: activeLocale.value, preview })
    if (!page) throw createError({ statusCode: 404, statusMessage: 'Tenant page not found' })
    return { success: true as const, page }
  }
  const query: Record<string, string> = { path: pagePath }
  if (preview && props.previewToken) {
    query.preview = 'true'
    query.token = props.previewToken
  }
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
const template = computed<'saya' | 'blawby'>(() => isBlawby.value ? 'blawby' : 'saya')
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
  const offeringBlock = page.value.blocks.find(block => block.type === 'offering_grid')
  const donationBlock = page.value.blocks.find(block => block.type === 'donation_choices')
  const faqItems = Array.isArray(faqBlock?.data.items)
    ? faqBlock.data.items.filter(item => item && typeof item === 'object' && !Array.isArray(item)).map(item => {
        const record = item as Record<string, unknown>
        return { question: typeof record.title === 'string' ? record.title : null, answer: typeof record.description === 'string' ? record.description : null }
      })
    : []
  const offeringItems = Array.isArray(offeringBlock?.data.items)
    ? offeringBlock.data.items.filter(item => item && typeof item === 'object' && !Array.isArray(item)).map(item => {
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
    items: offeringItems,
    donationUrl,
  }
})
useSocialMetadata(() => ({
  path: page.value.canonical_url || page.value.path,
  title: page.value.seo_title || `${page.value.title} | ${site?.brand_name || ''}`,
  description: page.value.seo_description || page.value.summary || '',
  robots: page.value.robots,
  brand: {
    siteName: site?.brand_name || '',
  },
  socialImage: page.value.social_image,
}))
</script>

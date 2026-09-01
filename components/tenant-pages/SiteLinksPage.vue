<template>
  <section v-if="linksPage" :class="templateClass">
    <div :class="shellClass">
      <div :class="identityClass">
        <img
          v-if="profileImageUrl"
          :src="profileImageUrl"
          :alt="`${brandName} profile image`"
          :class="profileImageClass"
        >
        <p v-if="isBlawby" class="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--blawby-token-accent-strong)]">Links</p>
        <h1 :class="headingClass">{{ linksPage.page.title }}</h1>
      </div>

      <nav id="featured-links" aria-label="Featured links" class="mt-8">
        <ol class="space-y-3">
          <li v-for="item in linksPage.items" :key="item.id">
            <a
              :href="item.destination"
              :target="externalTarget(item.destination)"
              :rel="externalRel(item.destination)"
              :class="linkClass"
              :data-link-item-id="item.id"
              @click="trackLinkClick(item)"
            >
              <span class="min-w-0 flex-1">
                <span :class="labelClass">{{ item.label }}</span>
              </span>
            </a>
          </li>
        </ol>
      </nav>
    </div>
  </section>
</template>

<script setup lang="ts">
// Shared by pages/links.vue (English, matched directly by Nuxt's file
// router - it supplies its own <NuxtLayout>) and the locale-prefixed
// catch-all (pages/[...tenantPath].vue, representation.kind === 'resource'
// with resource_type 'site_link_page' - the catch-all already provides
// <NuxtLayout>, so this component renders only the inner content). See
// components/tenant-pages/LocationQaPage.vue for why this can't be a route
// alias instead.
import { TENANT_TYPES } from '~/utils/tenant-routing'
import { ApiClientError, publicApiRequest } from '~/utils/api-clients'
import { isPublicLinksPayload, isPublicLinksResponse, type PublicLinksItem, type PublicLinksPayload } from '~/utils/public-links-contract'

const tenantState = useTenantSite()
const requestEvent = useRequestEvent()
const siteId = import.meta.server
  ? (requestEvent?.context.siteId as string | null | undefined) ?? tenantState.siteId
  : tenantState.siteId
const isTenant = import.meta.server
  ? requestEvent?.context.tenantType === TENANT_TYPES.TENANT || tenantState.isTenant
  : tenantState.isTenant
if (!isTenant || !siteId) {
  throw createError({ statusCode: 404, statusMessage: 'Links page not found' })
}

const locale = useState<string>('public-locale', () => 'en')

const { data, error } = await useAsyncData<PublicLinksPayload | null>(
  `public-links-page-${siteId}-${locale.value}`,
  async (_nuxtApp, { signal }) => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const [{ cloudflareEnv }, { getPublicLinksPage }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/site-links'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      const response = await getPublicLinksPage(db, siteId, locale.value)
      if (response !== null && !isPublicLinksPayload(response)) {
        throw new ApiClientError('Public links response did not match its contract', 502, 'INVALID_PUBLIC_LINKS_RESPONSE', null)
      }
      return response
    }
    return await publicApiRequest(`/api/public/sites/${encodeURIComponent(siteId)}/links-page`, {
      signal,
      query: locale.value !== 'en' ? { locale: locale.value } : undefined,
      coalesceKey: `public-links-page-${siteId}-${locale.value}`,
      validate: isPublicLinksResponse,
    })
  },
  { server: true, lazy: false },
)

if (error.value) throw error.value
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Links page not found' })

const linksPage = computed(() => data.value)
const isBlawby = computed(() => linksPage.value?.site.template === 'blawby')
const brandName = computed(() => linksPage.value?.site.brand_name || linksPage.value?.page.title || 'Links')
const profileImageUrl = computed(() => linksPage.value?.site.media.find(item => item.slot === 'logo')?.public_url || null)
const { trackLinkClick: recordLinkClick } = useSiteConversionTracking()

const templateClass = computed(() => isBlawby.value
  ? 'min-h-[calc(100vh-8rem)] bg-[color:var(--blawby-token-bg)] px-4 py-10 sm:px-6 sm:py-14'
  : 'min-h-[calc(100vh-8rem)] bg-default px-4 py-10 sm:px-6 sm:py-14')
const shellClass = computed(() => isBlawby.value
  ? 'mx-auto max-w-md'
  : 'mx-auto max-w-md')
const identityClass = computed(() => isBlawby.value
  ? 'text-center'
  : 'text-center')
const profileImageClass = computed(() => isBlawby.value
  ? 'mx-auto size-18 rounded-full object-cover shadow-sm'
  : 'mx-auto size-18 rounded-full object-cover shadow-sm')
const headingClass = computed(() => isBlawby.value
  ? 'mt-5 text-3xl font-semibold tracking-normal text-[color:var(--blawby-token-primary-dark)]'
  : 'saya-display-md mt-5 text-default')
const linkClass = computed(() => isBlawby.value
  ? 'group flex min-h-14 items-center rounded-lg border border-[color:var(--blawby-token-border)] bg-white px-5 py-4 text-center text-[color:var(--blawby-token-primary-dark)] no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-[color:var(--blawby-token-accent)] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--blawby-token-accent)]'
  : 'group flex min-h-14 items-center rounded-full border border-(--brand-color)/25 bg-(--brand-color)/8 px-5 py-4 text-center text-default no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-(--brand-color)/12 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--brand-color)')
const labelClass = computed(() => isBlawby.value
  ? 'block truncate text-base font-semibold'
  : 'block truncate text-base font-semibold')

function isHttpDestination(destination: string) {
  return /^https?:\/\//i.test(destination)
}

function externalTarget(destination: string) {
  return isHttpDestination(destination) ? '_blank' : undefined
}

function externalRel(destination: string) {
  return isHttpDestination(destination) ? 'noopener noreferrer' : undefined
}

function trackLinkClick(item: PublicLinksItem) {
  if (!import.meta.client) return
  recordLinkClick(item.id)
}

useSocialMetadata(() => ({
  path: '/links',
  title: linksPage.value?.page.seo_title || `${brandName.value} Links`,
  description: linksPage.value?.page.seo_description || linksPage.value?.site.brand_description || '',
  robots: linksPage.value?.page.robots || 'noindex,follow',
  brand: { siteName: brandName.value, logoUrl: linksPage.value?.site.media.find(item => item.slot === 'logo')?.public_url || null },
  heroImage: profileImageUrl.value ? { url: profileImageUrl.value } : null,
}))
</script>

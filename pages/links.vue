<template>
  <NuxtLayout :name="layoutName">
    <section v-if="linksPage" :class="templateClass">
      <div :class="shellClass">
        <div :class="identityClass">
          <img
            v-if="profileImageUrl"
            :src="profileImageUrl"
            :alt="`${brandName} profile image`"
            :class="profileImageClass"
          >
          <div v-else :class="profileFallbackClass" aria-hidden="true">
            {{ brandInitial }}
          </div>
          <p v-if="isBlawby" class="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--blawby-token-accent-strong)]">Links</p>
          <h1 :class="headingClass">{{ linksPage.page.title }}</h1>
          <p v-if="linksPage.page.bio" :class="bioClass">{{ linksPage.page.bio }}</p>
        </div>

        <nav id="featured-links" aria-label="Featured links" class="mt-8">
          <ol class="space-y-3">
            <li v-for="(item, index) in linksPage.items" :key="item.id">
              <a
                :href="item.destination"
                :target="externalTarget(item.destination)"
                :rel="externalRel(item.destination)"
                :class="linkClass"
                :data-link-item-id="item.id"
                @click="trackLinkClick(item)"
              >
                <span :class="iconClass" aria-hidden="true">
                  <img
                    v-if="item.image_url"
                    :src="item.image_url"
                    alt=""
                    class="size-full rounded-full object-cover"
                    loading="lazy"
                  >
                  <span v-else>{{ iconGlyph(item.icon) }}</span>
                </span>
                <span class="min-w-0 flex-1">
                  <span :class="labelClass">{{ item.label }}</span>
                  <span v-if="item.description" :class="descriptionClass">{{ item.description }}</span>
                </span>
                <span class="text-xs font-semibold text-current opacity-50">{{ String(index + 1).padStart(2, '0') }}</span>
              </a>
            </li>
          </ol>
        </nav>
      </div>
    </section>
  </NuxtLayout>
</template>

<script setup lang="ts">
type LinkItemIcon = 'calendar' | 'menu' | 'shopping-bag' | 'ticket' | 'mail' | 'phone' | 'map-pin' | 'star' | 'heart' | 'globe' | 'message-circle' | 'external-link'
interface PublicLinksItem {
  id: string
  label: string
  destination: string
  description: string | null
  icon: LinkItemIcon | null
  image_url: string | null
}
interface PublicSiteLinksPayload {
  site: {
    id: string
    organization_id: string
    brand_name: string | null
    brand_description: string | null
    logo_url: string | null
    template: 'saya' | 'blawby'
  }
  page: {
    title: string
    bio: string | null
    profile_image_url: string | null
    robots: string
    seo_title: string | null
    seo_description: string | null
  }
  items: PublicLinksItem[]
}

definePageMeta({ layout: false })

const { siteId, isTenant } = useTenantSite()
if (!isTenant || !siteId) throw createError({ statusCode: 404, statusMessage: 'Links page not found' })

const { data, error } = await useAsyncData<PublicSiteLinksPayload | null>(
  `public-links-page-${siteId}`,
  async () => {
    if (import.meta.server) {
      const requestEvent = useRequestEvent()
      if (!requestEvent) return null
      const [{ cloudflareEnv }, { getPublicLinksPage }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/site-links'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      return await getPublicLinksPage(db, siteId)
    }
    const response = await $fetch<{ success: boolean } & PublicSiteLinksPayload>(`/api/public/sites/${siteId}/links-page`)
    return response
  },
  { server: true, lazy: false },
)

if (error.value) throw error.value
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Links page not found' })

const linksPage = computed(() => data.value)
const isBlawby = computed(() => linksPage.value?.site.template === 'blawby')
const layoutName = computed(() => isBlawby.value ? 'blawby' : 'saya')
const brandName = computed(() => linksPage.value?.site.brand_name || linksPage.value?.page.title || 'Links')
const brandInitial = computed(() => brandName.value.trim().charAt(0).toUpperCase() || 'L')
const profileImageUrl = computed(() => linksPage.value?.page.profile_image_url || linksPage.value?.site.logo_url || null)

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
  ? 'mx-auto size-24 rounded-full border-4 border-[color:var(--blawby-token-accent-200)] object-cover shadow-sm'
  : 'mx-auto size-24 rounded-full border-4 border-(--brand-color)/20 object-cover shadow-sm')
const profileFallbackClass = computed(() => isBlawby.value
  ? 'mx-auto flex size-24 items-center justify-center rounded-full border-4 border-[color:var(--blawby-token-accent-200)] bg-[color:var(--blawby-token-surface)] text-4xl font-semibold text-[color:var(--blawby-token-primary)] shadow-sm'
  : 'mx-auto flex size-24 items-center justify-center rounded-full border-4 border-(--brand-color)/20 bg-(--brand-color)/10 text-4xl font-semibold text-(--brand-color) shadow-sm')
const headingClass = computed(() => isBlawby.value
  ? 'mt-4 text-3xl font-semibold tracking-normal text-[color:var(--blawby-token-primary-dark)]'
  : 'saya-display-md mt-4 text-default')
const bioClass = computed(() => isBlawby.value
  ? 'mx-auto mt-3 max-w-sm text-base leading-7 text-gray-700'
  : 'mx-auto mt-3 max-w-sm text-base leading-7 text-muted')
const linkClass = computed(() => isBlawby.value
  ? 'group flex min-h-16 items-center gap-3 rounded-lg border border-[color:var(--blawby-token-border)] bg-white px-4 py-3 text-left text-[color:var(--blawby-token-primary-dark)] no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-[color:var(--blawby-token-accent)] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--blawby-token-accent)]'
  : 'group flex min-h-16 items-center gap-3 rounded-full border border-(--brand-color)/25 bg-(--brand-color)/8 px-4 py-3 text-left text-default no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-(--brand-color)/12 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--brand-color)')
const iconClass = computed(() => isBlawby.value
  ? 'flex size-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--blawby-token-accent-100)] text-base font-semibold text-[color:var(--blawby-token-accent-strong)]'
  : 'flex size-10 shrink-0 items-center justify-center rounded-full bg-(--brand-color) text-base font-semibold text-(--brand-color-foreground)')
const labelClass = computed(() => isBlawby.value
  ? 'block truncate text-base font-semibold'
  : 'block truncate text-base font-semibold')
const descriptionClass = computed(() => isBlawby.value
  ? 'mt-0.5 block text-sm leading-5 text-gray-600'
  : 'mt-0.5 block text-sm leading-5 text-muted')

function isHttpDestination(destination: string) {
  return /^https?:\/\//i.test(destination)
}

function externalTarget(destination: string) {
  return isHttpDestination(destination) ? '_blank' : undefined
}

function externalRel(destination: string) {
  return isHttpDestination(destination) ? 'noopener noreferrer' : undefined
}

function iconGlyph(icon: PublicLinksItem['icon']) {
  const glyphs: Record<string, string> = {
    calendar: 'Cal',
    menu: 'Menu',
    'shopping-bag': 'Shop',
    ticket: 'Tix',
    mail: '@',
    phone: 'Tel',
    'map-pin': 'Map',
    star: '*',
    heart: '+',
    globe: 'Web',
    'message-circle': 'Msg',
    'external-link': 'Go',
  }
  return icon ? glyphs[icon] : 'Go'
}

function trackLinkClick(item: PublicLinksItem) {
  if (!import.meta.client || !siteId) return
  const payload = {
    event_name: 'link_click',
    page_type: 'links',
    page_path: '/links',
    cta_destination: item.destination,
    metadata: { link_item_id: item.id },
  }
  fetch(`/api/public/sites/${siteId}/conversion-events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {})
}

const canonicalUrl = useSeoUrl('/links')
useSeoMeta({
  title: computed(() => linksPage.value?.page.seo_title || `${brandName.value} Links`),
  description: computed(() => linksPage.value?.page.seo_description || linksPage.value?.page.bio || linksPage.value?.site.brand_description || ''),
  robots: computed(() => linksPage.value?.page.robots || 'noindex,follow'),
  ogTitle: computed(() => linksPage.value?.page.seo_title || `${brandName.value} Links`),
  ogDescription: computed(() => linksPage.value?.page.seo_description || linksPage.value?.page.bio || linksPage.value?.site.brand_description || ''),
  ogImage: computed(() => profileImageUrl.value || undefined),
  ogUrl: canonicalUrl,
})
useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
}))
</script>

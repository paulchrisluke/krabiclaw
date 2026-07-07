<template>
  <div class="min-h-screen bg-default text-default">

    <template v-if="location">
      <!-- Sub-nav (Level 2) -->
      <SayaSubNav 
        :location-slug="slug" 
        active="menu" 
      />

      <!-- Compact Page header -->
      <header class="mx-auto max-w-7xl px-4 pt-12 pb-10 sm:px-6 lg:px-8 text-center">
        <NuxtLink :to="`/locations/${slug}`" class="saya-kicker mb-8 inline-block text-muted no-underline hover:text-default">
          ← {{ $t('saya.location.back_to', { title: location?.title }) }}
        </NuxtLink>
        
        <div class="flex flex-col gap-2">
          <h1 class="saya-display-md text-default">{{ location?.title }}</h1>
          <p class="text-sm text-muted">
            {{ $t('saya.menu_page.updated', { date: menuUpdated }) }}
          </p>
        </div>
      </header>
    </template>

    <!-- Loading -->
    <div v-if="menuLoading" class="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <p class="text-muted">{{ $t('saya.menu_page.loading') }}</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="!hasMenu" class="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <div class="saya-display saya-italic text-3xl text-default mb-4">{{ $t('saya.menu_page.coming_soon_title') }}</div>
      <p class="text-sm text-muted mb-6">{{ $t('saya.menu_page.coming_soon_desc', { location: location?.title }) }}</p>
      <SayaButton v-if="hasExperiences" to="/experiences">
        {{ $t('saya.menu_page.view_experiences') }}
      </SayaButton>
    </div>

    <!-- Sticky category tab bar -->
    <div v-else>
      <SayaFilterTabs
        v-model="activeCategory"
        :tabs="categoryTabs"
        :enable-scroll-detection="true"
        @height="categoryNavHeight = $event"
      />

      <!-- Menu body -->
      <div class="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <section
          v-for="cat in categories"
          :id="`cat-${cat.id}`"
          :key="cat.id"
          class="mb-24"
          :style="{ scrollMarginTop: `${categoryNavHeight}px` }"
        >
          <!-- Category header -->
          <div class="mb-8 border-b border-default pb-6">
            <h2 class="saya-display saya-italic text-5xl text-default">{{ cat.name }}</h2>
          </div>

          <!-- Items -->
          <div class="flex flex-col gap-7">
            <article
              v-for="item in menuItemsBySection[cat.name]"
              :key="item.id"
              class="flex items-start gap-5"
            >
              <!-- Thumbnail left (images only) -->
              <NuxtLink
                v-if="item.public_url && item.kind === 'image' && item.available"
                :to="`/menu/${itemSlug(item)}`"
                :class="['shrink-0', !item.available && 'opacity-50 grayscale']"
              >
                <img
                  :src="item.public_url"
                  :alt="item.name"
                  class="size-24 rounded-xl object-cover bg-muted"
                  loading="lazy"
                />
              </NuxtLink>
              <div
                v-else-if="item.public_url && item.kind === 'image'"
                class="shrink-0 opacity-50 grayscale"
              >
                <img
                  :src="item.public_url"
                  :alt="item.name"
                  class="size-24 rounded-xl object-cover bg-muted"
                  loading="lazy"
                />
              </div>

              <!-- Text -->
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2">
                  <div class="flex items-baseline gap-2 text-base font-medium text-default">
                    <NuxtLink
                      v-if="item.available"
                      :to="`/menu/${itemSlug(item)}`"
                      :class="['text-default no-underline hover:underline underline-offset-2', !item.available && 'opacity-50']"
                    >{{ item.name }}</NuxtLink>
                    <span v-else class="text-default opacity-50">{{ item.name }}</span>
                    <SayaBadgeUnavailable v-if="!item.available" :text="$t('saya.menu_page.unavailable')" />
                    <span
                      v-for="tag in getDietaryTags(item)"
                      :key="tag"
                      class="inline-flex shrink-0 items-center rounded-full border border-default px-2 py-0.5 text-xs font-medium text-muted"
                    >{{ tag }}</span>
                  </div>
                  <div class="saya-dotted-leader" />
                  <div class="shrink-0 flex items-baseline gap-1.5 tabular-nums text-base text-default">
                    <span v-if="isSaleActive(item)" class="text-sm text-muted line-through">{{ formatMenuPrice(item.compare_at_price_amount) }}</span>
                    <span>{{ formatMenuPrice(item.price_amount, '—') }}</span>
                  </div>
                </div>
                <p v-if="item.description" class="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
                  {{ item.description }}
                </p>
              </div>
            </article>
          </div>
        </section>

        <!-- Allergens footer -->
        <section class="border-t border-default pt-12">
          <p class="saya-kicker mb-4">{{ $t('saya.menu_page.allergens_title') }}</p>
          <p class="text-sm leading-relaxed text-muted">
            <strong class="font-semibold text-default">V</strong> vegetarian ·
            <strong class="font-semibold text-default">VG</strong> vegan ·
            <strong class="font-semibold text-default">GF</strong> gluten-free.
            {{ $t('saya.menu_page.allergens_desc') }}
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatMoneyAmount, isSaleActive } from '~/shared/money'

definePageMeta({ layout: 'saya' })

const route = useRoute()
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as ApiValue)?.brand_name || 'KrabiClaw')

const { location, menu: bootstrapMenu, menuItemsBySection, pending: menuLoading, config: bootstrapConfig, hasExperiences } = useBootstrap()
const { formatDate } = useLocaleDate()
const hasMenu = computed(() => ((bootstrapMenu.value as { items?: unknown[] } | null)?.items?.length ?? 0) > 0)

const menuUpdated = computed(() => {
  const d = bootstrapMenu.value?.updated_at
  if (!d) return 'recently'
  return formatDate(d)
})

function slugifyCategory(input: string): string {
  return String(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section'
}

const categories = computed(() => {
  const seen: Record<string, number> = {}
  return Object.keys(menuItemsBySection.value).map(name => {
    const base = slugifyCategory(name)
    const count = seen[base] ?? 0
    seen[base] = count + 1
    const id = count === 0 ? base : `${base}-${count}`
    return { id, name }
  })
})

const categoryTabs = computed(() =>
  categories.value.map(cat => ({
    key: cat.id,
    label: cat.name,
    sectionId: `cat-${cat.id}`
  }))
)

const userSelectedCategory = ref('')
const activeCategory = computed({
  get() {
    return userSelectedCategory.value || categories.value[0]?.id || ''
  },
  set(val) {
    userSelectedCategory.value = val
  }
})
const categoryNavHeight = ref(44)
watch(categories, () => {
  userSelectedCategory.value = ''
})

function itemSlug(item: ApiValue): string {
  return item.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function getDietaryTags(item: ApiValue): string[] {
  const tags: string[] = []
  // D1 items: boolean flags (future); static items: dietaryNotes array
  const notes = Array.isArray(item.dietaryNotes) ? item.dietaryNotes : []
  if (item.is_vegetarian || notes.includes('V')) tags.push('V')
  if (item.is_vegan || notes.includes('VG')) tags.push('VG')
  if (item.is_gluten_free || notes.includes('GF')) tags.push('GF')
  return tags
}


const seoTitle = () => `Menu · ${location.value?.title || slug.value}`
const seoDescription = () => `Full menu for ${location.value?.title || slug.value} at ${siteName.value}.`

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  ogSiteName: () => siteName.value,
  twitterTitle: seoTitle,
  twitterDescription: seoDescription,
  ogImage: useSharedOgImage(),
  ogUrl: useSeoUrl(() => `/locations/${slug.value}/menu`)
})

const locationCurrency = computed(() => {
  const loc = location.value as ApiValue
  if (loc?.currency && typeof loc.currency === 'string') return loc.currency
  const currency = (bootstrapConfig.value as Record<string, string> | undefined)?.default_currency
  if (currency) return currency
  return 'THB'
})

const formatMenuPrice = (amount: unknown, emptyLabel = 'TBD') => formatMoneyAmount(amount, locationCurrency.value, emptyLabel)

useSchemaOrg([
  computed(() => ({
    '@type': 'Menu',
    name: `${location.value?.title ?? ''} Menu`,
    hasMenuSection: categories.value.map((cat: { id: string; name: string }) => ({
      '@type': 'MenuSection',
      name: cat.name,
      hasMenuItem: (menuItemsBySection.value[cat.name] ?? []).map((item: ApiValue) => {
        const menuItem: ApiValue = {
          '@type': 'MenuItem',
          name: item.name,
          description: item.description
        }
        // Only include offers if price is valid
        if (item.price_amount !== null && item.price_amount !== undefined && item.price_amount !== '') {
          menuItem.offers = { '@type': 'Offer', price: item.price_amount, priceCurrency: locationCurrency.value }
        }
        return menuItem
      })
    }))
  })),
  computed(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName.value, item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Locations', item: `${siteUrl}/locations` },
      { '@type': 'ListItem', position: 3, name: location.value?.title ?? slug.value, item: `${siteUrl}/locations/${slug.value}` },
      { '@type': 'ListItem', position: 4, name: 'Menu', item: `${siteUrl}/locations/${slug.value}/menu` }
    ]
  }))
])
</script>

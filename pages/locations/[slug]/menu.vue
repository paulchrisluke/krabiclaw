<template>
  <div class="min-h-screen bg-default text-default">

    <!-- Breadcrumb -->
    <nav class="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <UBreadcrumb :items="breadcrumb" />
    </nav>

    <!-- Page header -->
    <header class="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">{{ location?.title }} · Menu</p>
      <h1 class="saya-display-lg text-default"><em class="saya-italic">The full menu</em></h1>
      <p class="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted">
        Updated {{ menuUpdated }}. Some items vary by season — your server will know.
      </p>
    </header>

    <!-- Sub-nav -->
    <SayaSubNav :location-slug="slug" active="menu" :review-count="location?.review_count" />

    <!-- Loading -->
    <div v-if="menuLoading" class="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <p class="text-muted">Loading menu…</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="!hasMenu" class="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <div class="saya-display saya-italic text-3xl text-default mb-4">Menu coming soon.</div>
      <p class="text-sm text-muted">Our menu for {{ location?.title }} is being prepared.</p>
    </div>

    <!-- Sticky category tab bar -->
    <div v-else>
      <div class="sticky top-16 z-30 border-b border-default border-t bg-default/92 backdrop-blur-md">
        <div class="mx-auto flex max-w-7xl gap-8 overflow-x-auto px-4 sm:px-6 lg:px-8">
          <a
            v-for="cat in categories"
            :key="cat.id"
            :href="`#cat-${cat.id}`"
            :class="[
              'shrink-0 border-b-2 py-4 text-xs font-medium uppercase tracking-widest transition-colors',
              activeCategory === cat.id
                ? 'border-primary text-default'
                : 'border-transparent text-muted hover:text-default'
            ]"
            @click.prevent="scrollToCategory(cat.id)"
          >
            {{ cat.name }}
          </a>
        </div>
      </div>

      <!-- Menu body -->
      <div class="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <section
          v-for="cat in categories"
          :id="`cat-${cat.id}`"
          :key="cat.id"
          class="mb-24"
        >
          <!-- Category header -->
          <div class="mb-8 border-b border-default pb-6">
            <h2 class="saya-display saya-italic text-5xl text-default">{{ cat.name }}</h2>
            <p v-if="cat.note" class="mt-3 text-sm leading-relaxed text-muted">{{ cat.note }}</p>
          </div>

          <!-- Items -->
          <div class="flex flex-col gap-7">
            <article v-for="item in menuItemsBySection[cat.name]" :key="item.id">
              <div class="flex items-baseline gap-2">
                <div class="flex items-baseline gap-2 text-base font-medium text-default">
                  <NuxtLink
                    :to="`/menu/${itemSlug(item)}`"
                    class="text-default no-underline hover:underline underline-offset-2"
                  >{{ item.name }}</NuxtLink>
                  <UBadge
                    v-for="tag in getDietaryTags(item)"
                    :key="tag"
                    variant="outline"
                    size="xs"
                    class="shrink-0 font-medium"
                  >{{ tag }}</UBadge>
                </div>
                <div class="saya-dotted-leader" />
                <div class="shrink-0 tabular-nums text-base text-default">{{ item.price || '—' }}</div>
              </div>
              <p v-if="item.description" class="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
                {{ item.description }}
              </p>
            </article>
          </div>
        </section>

        <!-- Allergens footer -->
        <section class="border-t border-default pt-12">
          <p class="saya-kicker mb-4">Allergens & diet</p>
          <p class="text-sm leading-relaxed text-muted">
            <strong class="font-semibold text-default">V</strong> vegetarian ·
            <strong class="font-semibold text-default">VG</strong> vegan ·
            <strong class="font-semibold text-default">GF</strong> gluten-free.
            Please tell your server about any allergies — we adjust most dishes.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const route = useRoute()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as any)?.value?.name || (site as any)?.name || 'Saya')

const { data: locData } = await useFetch(
  () => `/api/public/sites/${siteId}/locations/${slug.value}`,
  { key: () => `loc-menu-${siteId}-${slug.value}`, default: () => ({ location: null }) }
)
const location = computed(() => (locData as any).value?.location ?? null)

if (!location.value) throw createError({ statusCode: 404 })

const { menu, loading: menuLoading, hasMenu, menuItemsBySection } = usePublicMenu(siteId, location.value?.id)

const menuUpdated = computed(() => {
  const d = menu.value?.updated_at
  if (!d) return 'recently'
  return new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
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

const activeCategory = ref('')
watch(categories, (cats: { id: string; name: string }[]) => {
  if (cats.length && !activeCategory.value) activeCategory.value = cats[0]?.id ?? ''
}, { immediate: true })

function scrollToCategory(id: string) {
  activeCategory.value = id
  document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function itemSlug(item: any): string {
  return item.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function getDietaryTags(item: any): string[] {
  const tags: string[] = []
  // D1 items: boolean flags (future); static items: dietaryNotes array
  const notes = Array.isArray(item.dietaryNotes) ? item.dietaryNotes : []
  if (item.is_vegetarian || notes.includes('V')) tags.push('V')
  if (item.is_vegan || notes.includes('VG')) tags.push('VG')
  if (item.is_gluten_free || notes.includes('GF')) tags.push('GF')
  return tags
}

const breadcrumb = computed(() => [
  { label: siteName.value, to: '/' },
  { label: 'Locations', to: '/locations' },
  { label: location.value?.title || slug.value, to: `/locations/${slug.value}` },
  { label: 'Menu' }
])

useSeoMeta({
  title: () => `Menu · ${location.value?.title || slug.value}`,
  description: () => `Full menu for ${location.value?.title} at ${siteName.value}.`,
  ogUrl: () => {
    const config = useRuntimeConfig()
    const origin = config.public.siteUrl
    return `${origin}/locations/${slug.value}/menu`
  }
})

const locationCurrency = computed(() => {
  const loc = location.value as any
  if (loc?.currency && typeof loc.currency === 'string') return loc.currency

  const country = String(loc?.country || loc?.country_code || '').toUpperCase()
  if (country === 'TH' || country === 'THA') return 'THB'
  if (country === 'US' || country === 'USA') return 'USD'
  if (country === 'GB' || country === 'GBR') return 'GBP'

  return 'THB'
})

useSchemaOrg([
  computed(() => ({
    '@type': 'Menu',
    name: `${location.value?.title ?? ''} Menu`,
    hasMenuSection: categories.value.map((cat: { id: string; name: string }) => ({
      '@type': 'MenuSection',
      name: cat.name,
      hasMenuItem: (menuItemsBySection.value[cat.name] ?? []).map((item: any) => {
        const menuItem: any = {
          '@type': 'MenuItem',
          name: item.name,
          description: item.description
        }
        // Only include offers if price is valid
        if (item.price !== null && item.price !== undefined && item.price !== '') {
          menuItem.offers = { '@type': 'Offer', price: item.price, priceCurrency: locationCurrency.value }
        }
        return menuItem
      })
    }))
  })),
  computed(() => {
    const config = useRuntimeConfig()
    const siteUrl = config.public.siteUrl
    return {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: siteName.value, item: `${siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Locations', item: `${siteUrl}/locations` },
        { '@type': 'ListItem', position: 3, name: location.value?.title ?? slug.value, item: `${siteUrl}/locations/${slug.value}` },
        { '@type': 'ListItem', position: 4, name: 'Menu', item: `${siteUrl}/locations/${slug.value}/menu` }
      ]
    }
  })
])
</script>

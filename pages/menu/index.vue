<template>
  <div class="min-h-screen bg-default text-default">

    <!-- Loading -->
    <div v-if="pending" class="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <p class="text-muted">Loading menu…</p>
    </div>

    <template v-else>
      <!-- Page header -->
      <header class="mx-auto max-w-7xl px-4 pt-12 pb-10 sm:px-6 lg:px-8 text-center">
        <p class="saya-kicker mb-4">Menu</p>
        <h1 class="saya-display-md text-default">{{ restaurantName }}</h1>

        <!-- Multi-location pills -->
        <div v-if="locations.length > 1" class="mt-8 flex flex-wrap justify-center gap-3">
          <NuxtLink
            v-for="loc in locations"
            :key="loc.id"
            :to="`/locations/${loc.slug}/menu`"
            class="inline-flex items-center gap-2 rounded-full border border-default px-5 py-2.5 text-sm text-muted no-underline transition hover:bg-muted hover:text-default"
          >
            <SayaIcon name="map-pin" class="size-3.5 opacity-70" />
            {{ loc.title }}
          </NuxtLink>
        </div>
      </header>

      <!-- Empty state -->
      <div v-if="!hasMenu" class="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
        <div class="saya-display saya-italic text-3xl text-default mb-4">Menu coming soon.</div>
        <p class="text-sm text-muted mb-6">Our menu is being prepared. Check back soon.</p>
        <SayaButton v-if="hasExperiences" to="/experiences">
          View experiences
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
                <!-- Thumbnail -->
                <NuxtLink
                  v-if="item.public_url && item.kind === 'image' && item.available"
                  :to="`/menu/${itemSlug(item)}`"
                  class="shrink-0"
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
                        class="text-default no-underline hover:underline underline-offset-2"
                      >{{ item.name }}</NuxtLink>
                      <span v-else class="text-default opacity-50">{{ item.name }}</span>
                      <span v-if="!item.available" class="inline-flex shrink-0 items-center rounded-full border border-default px-2 py-0.5 text-xs font-medium text-muted">Unavailable</span>
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { formatMoneyAmount, isSaleActive } from '~/shared/money'

definePageMeta({ layout: 'saya' })

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const restaurantName = computed(() => (site as ApiValue)?.brand_name || (site as ApiValue)?.title || 'Menu')

const { menu: bootstrapMenu, menuItemsBySection, pending, locations, config: bootstrapConfig, hasExperiences } = useBootstrap()

const hasMenu = computed(() => ((bootstrapMenu.value as { items?: unknown[] } | null)?.items?.length ?? 0) > 0)

function slugifyCategory(input: string): string {
  return String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
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
  get() { return userSelectedCategory.value || categories.value[0]?.id || '' },
  set(val) { userSelectedCategory.value = val }
})
const categoryNavHeight = ref(44)
watch(categories, () => { userSelectedCategory.value = '' })

function itemSlug(item: ApiValue): string {
  const slug = item.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug || `item-${item.id || 'unknown'}`
}

function getDietaryTags(item: ApiValue): string[] {
  const tags: string[] = []
  const notes = Array.isArray(item.dietaryNotes) ? item.dietaryNotes : []
  if (item.is_vegetarian || notes.includes('V')) tags.push('V')
  if (item.is_vegan || notes.includes('VG')) tags.push('VG')
  if (item.is_gluten_free || notes.includes('GF')) tags.push('GF')
  return tags
}

const defaultCurrency = computed(() => {
  const currency = (bootstrapConfig.value as Record<string, string> | undefined)?.default_currency
  return currency || 'THB'
})

const formatMenuPrice = (amount: unknown, emptyLabel = 'TBD') =>
  formatMoneyAmount(amount, defaultCurrency.value, emptyLabel)

useSeoMeta({
  title: () => `Menu · ${restaurantName.value}`,
  description: () => `Full menu at ${restaurantName.value}.`,
  ogTitle: () => `Menu · ${restaurantName.value}`,
  ogDescription: () => `Full menu at ${restaurantName.value}.`,
  ogSiteName: () => restaurantName.value,
  twitterTitle: () => `Menu · ${restaurantName.value}`,
  twitterDescription: () => `Full menu at ${restaurantName.value}.`,
  ogImage: useTenantOgImage(),
  ogUrl: useSeoUrl('/menu')
})
</script>

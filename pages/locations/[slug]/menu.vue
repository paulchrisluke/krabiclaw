<template>
  <div class="min-h-screen bg-(--ui-bg)">
    <SayaHero :title="getField('hero.title', `${location?.title || 'Location'} Menu`)" :subtitle="getField('hero.subtitle', 'Location-specific menu')" size="page" />
    <AppSection v-if="getField('description', '')" bg="alt" padding="default">
      <div v-html="getField('description', '')" class="prose prose-lg max-w-3xl mx-auto text-center text-(--ui-text)" />
    </AppSection>
    
    <!-- Loading state -->
    <AppSection v-if="menuLoading" bg="white" padding="default">
      <div class="text-center py-8">
        <p class="text-(--ui-text-muted)">Loading menu...</p>
      </div>
    </AppSection>
    
    <!-- Error state -->
    <AppSection v-else-if="menuError" bg="white" padding="default">
      <div class="text-center py-8">
        <p class="text-red-600">{{ menuError }}</p>
      </div>
    </AppSection>
    
    <!-- Brand menu notice -->
    <AppSection v-else-if="isUsingBrandMenu && hasMenu" bg="alt" padding="default">
      <div class="text-center">
        <p class="text-(--ui-text)">Showing the brand menu while this location-specific menu is being prepared.</p>
      </div>
    </AppSection>
    
    <!-- Database menu -->
    <template v-else-if="hasMenu">
      <MenuCategoryNav :categories="menuSections" :active="activeSection" @select="activeSection = $event" />
      <AppSection v-for="(items, section) in menuItemsBySection" :key="section" :id="section" bg="white" padding="default">
        <h2 class="text-2xl font-bold text-(--ui-text-highlighted) mb-2">{{ section }}</h2>
        <div class="divide-y divide-gray-100">
          <MenuItemCard v-for="item in items" :key="item.id" :item="item" />
        </div>
      </AppSection>
    </template>
    
    <!-- Empty state -->
    <AppSection v-else bg="white" padding="default">
      <div class="py-12">
        <div class="mx-auto mb-10 max-w-2xl text-center">
          <h3 class="mb-2 text-xl font-semibold text-(--ui-text-highlighted)">Menu Coming Soon</h3>
          <p class="text-(--ui-text-muted)">Our menu for {{ location?.title || 'this location' }} is being prepared.</p>
        </div>
        <div class="mx-auto mb-8 max-w-3xl divide-y divide-gray-100 rounded-lg border border-(--ui-border-muted) bg-(--ui-bg)">
          <div v-for="i in 4" :key="`location-menu-skeleton-${i}`" class="flex items-start justify-between gap-6 p-6">
            <div class="flex-1 space-y-3">
              <div class="h-5 w-40 animate-pulse rounded bg-stone-200" />
              <div class="h-3 w-full animate-pulse rounded bg-stone-200" />
              <div class="h-3 w-2/3 animate-pulse rounded bg-stone-200" />
            </div>
            <div class="h-5 w-16 animate-pulse rounded bg-stone-200" />
          </div>
        </div>
        
        <!-- CTA for authenticated users -->
        <div v-if="isAuthenticated" class="space-y-3 text-center">
          <UButton
            :to="`/dashboard/sites/${tenant.siteId}/menu`"
            color="neutral"
            variant="solid"
            class="rounded-full"
          >
            Create Location Menu
          </UButton>
          <p class="text-sm text-(--ui-text-muted)">
            As an administrator, you can create a menu specifically for this location
          </p>
        </div>
        
        <!-- Public visitor message -->
        <div v-else class="text-center">
          <p class="text-sm text-(--ui-text-muted)">
            Contact us directly for current menu information
          </p>
        </div>
      </div>
    </AppSection>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'tenant' })
import { usePageContent } from '~/composables/usePageContent'
import { usePublicMenu } from '~/composables/usePublicMenu'
import { useTenantSite } from '~/composables/useTenantSite'

const route = useRoute()
const { getField } = usePageContent('locations-menu')
const tenant = await useTenantSite()

// Validate tenant context before making API calls
if (!tenant.siteId || tenant.isPlatform) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Tenant site not found'
  })
}

// Get location from slug (tenant-scoped)
const { data: location } = await $fetch(`/api/public/sites/${tenant.siteId}/locations/${route.params.slug}`).catch(() => ({ data: null }))

// Check if location exists, else 404
if (!location?.id) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Location not found'
  })
}

// Check if user is authenticated
const { isAuthenticated } = useAuth()

// Get location-specific menu
const { 
  menu, 
  loading: menuLoading, 
  error: menuError, 
  hasMenu, 
  menuItemsBySection 
} = usePublicMenu(tenant.siteId, location?.id || null)

// Check if using brand menu as fallback
const isUsingBrandMenu = computed(() => {
  return menu.value?.location_id == null && !!location?.id
})

// Convert menu sections to format expected by MenuCategoryNav
const menuSections = computed(() => {
  if (!menu.value) return []
  return Object.keys(menuItemsBySection.value).map(section => ({
    id: section,
    name: section
  }))
})

const activeSection = ref(menuSections.value[0]?.id ?? '')

// Safe domain computation for ogUrl
const canonicalDomain = computed(() => {
  if (tenant.site?.domain) {
    return tenant.site.domain
  }
  
  if (tenant.site?.subdomain) {
    const freeSiteDomain = useRuntimeConfig().public.freeSiteDomain
    if (freeSiteDomain && typeof freeSiteDomain === 'string') {
      const baseDomain = freeSiteDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
      if (baseDomain) {
        return `${tenant.site.subdomain}.${baseDomain}`
      }
    }
  }
  
  return 'krabiclaw.com'
})

// SEO
useSeoMeta({
  title: `${location?.title || 'Menu'} | ${tenant.site?.title || 'Restaurant'}`,
  description: `View the menu for ${location?.title || 'this location'} at ${tenant.site?.title || 'our restaurant'}.`,
  ogImage: '/og-image.jpg',
  ogUrl: `https://${canonicalDomain.value}/locations/${route.params.slug}/menu`
})
</script>

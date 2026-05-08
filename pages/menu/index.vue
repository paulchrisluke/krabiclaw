<template>
  <div class="min-h-screen bg-white">
    <SayaHero :title="getField('hero.title', 'Our Menu')" :subtitle="getField('hero.subtitle', 'Authentic Japanese Robatayaki Izakaya')" size="page" :establishment-year="googleBusiness?.business?.establishmentYear" />
    <AppSection v-if="getField('description', '')" bg="alt" padding="default">
      <div v-html="getField('description', '')" class="prose prose-lg max-w-3xl mx-auto text-center text-gray-700" />
    </AppSection>
    
    <!-- Loading state -->
    <AppSection v-if="menuLoading" bg="white" padding="default">
      <div class="text-center py-8">
        <p class="text-gray-600">Loading menu...</p>
      </div>
    </AppSection>
    
    <!-- Error state -->
    <AppSection v-else-if="menuError" bg="white" padding="default">
      <div class="text-center py-8">
        <p class="text-red-600">{{ menuError }}</p>
      </div>
    </AppSection>
    
        
    <!-- Database menu -->
    <template v-else-if="hasMenu">
      <MenuCategoryNav :categories="menuSections" :active="activeSection" @select="activeSection = $event" />
      <AppSection v-for="(items, section) in menuItemsBySection" :key="section" :id="section" bg="white" padding="default">
        <h2 class="text-2xl font-bold text-gray-900 mb-4">{{ section }}</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <MenuItemCard v-for="item in items" :key="item.id" :item="item" />
        </div>
      </AppSection>
    </template>
    
    <!-- Empty state -->
    <AppSection v-else bg="white" padding="default">
      <!-- Skeleton category nav -->
      <div class="flex gap-3 mb-10 overflow-x-auto pb-2">
        <div v-for="i in 4" :key="i" 
          class="h-9 w-28 rounded-full bg-(--ui-bg-elevated) animate-pulse shrink-0" />
      </div>

      <!-- Skeleton sections matching real category layout -->
      <div v-for="section in skeletonSections" :key="section.name" class="mb-12">
        <!-- Section heading -->
        <div class="h-7 w-40 rounded bg-(--ui-bg-elevated) animate-pulse mb-6" />
        
        <!-- Grid matching real MenuItemCard grid -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div v-for="i in section.count" :key="i" class="group">
            <div class="aspect-square w-full rounded-2xl bg-(--ui-bg-elevated) animate-pulse" />
            <div class="mt-3 space-y-2 px-1">
              <div class="h-4 w-3/4 rounded bg-(--ui-bg-elevated) animate-pulse" />
              <div class="h-3 w-full rounded bg-(--ui-bg-elevated) animate-pulse" />
              <div class="h-3 w-2/3 rounded bg-(--ui-bg-elevated) animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div class="text-center pt-4">
        <UButton 
          v-if="isAuthenticated"
          :to="`/dashboard/sites/${siteId}/menu`"
          color="neutral" 
          variant="solid"
          class="rounded-full"
        >
          Create Menu
        </UButton>
      </div>
    </AppSection>
  </div>
</template>
<script setup>
definePageMeta({ layout: 'tenant' })
import { usePageContent } from '~/composables/usePageContent'
import { usePublicMenu } from '~/composables/usePublicMenu'
import { useTenantSite } from '~/composables/useTenantSite'

const { getField } = usePageContent('menu')

const { siteId } = await useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { data: googleBusiness } = await useFetch(`/api/public/sites/${siteId}/google-business`, {
  key: `menu-google-business-${siteId}`,
  default: () => ({ business: null, media: [] })
})

// Check if user is authenticated
const { isAuthenticated } = useAuth()

// Get brand menu (locationId = null for brand page)
const { 
  menu, 
  loading: menuLoading, 
  error: menuError, 
  hasMenu, 
  menuItemsBySection 
} = usePublicMenu(siteId, null)

// Convert menu sections to format expected by MenuCategoryNav
const menuSections = computed(() => {
  if (!menu.value) return []
  return Object.keys(menuItemsBySection.value).map(section => ({
    id: section,
    name: section
  }))
})

const activeSection = ref(menuSections.value[0]?.id ?? '')

const skeletonSections = [
  { name: 'Category 1', count: 4 },
  { name: 'Category 2', count: 3 },
  { name: 'Category 3', count: 4 },
]

const { site } = await useTenantSite()
useSeoMeta({ 
  title: `Menu | ${site?.title || 'Restaurant'}`, 
  description: `Explore the ${site?.title || 'restaurant'} menu, featuring our signature dishes and culinary offerings.`, 
  ogImage: '/og-image.jpg', 
  ogUrl: '/menu' 
})
</script>

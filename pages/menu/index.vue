<template>
  <div class="min-h-screen bg-white">
    <AppHero :title="getField('hero.title', 'Our Menu')" :subtitle="getField('hero.subtitle', 'Authentic Japanese Robatayaki Izakaya')" size="page" :establishment-year="googleBusiness.value?.business?.establishmentYear" />
    <AppSection v-if="getField('description', '')" bg="gray" padding="default">
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
        <h2 class="text-2xl font-bold text-gray-900 mb-2">{{ section }}</h2>
        <div class="divide-y divide-gray-100">
          <MenuItemCard v-for="item in items" :key="item.id" :item="item" />
        </div>
      </AppSection>
    </template>
    
    <!-- Empty state -->
    <AppSection v-else bg="white" padding="default">
      <div class="text-center py-12">
        <div class="mb-6">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h3 class="text-xl font-semibold text-gray-900 mb-2">Menu Coming Soon</h3>
          <p class="text-gray-600 mb-6">Our delicious menu is being prepared. Check back soon!</p>
        </div>
        
        <!-- CTA for authenticated users -->
        <div v-if="isAuthenticated" class="space-y-3">
          <NuxtLink 
            :to="`/dashboard/sites/${tenant.siteId}/menu`"
            class="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Create Menu
          </NuxtLink>
          <p class="text-sm text-gray-500">
            As an administrator, you can create and manage your restaurant menu
          </p>
        </div>
        
        <!-- Public visitor message -->
        <div v-else>
          <p class="text-sm text-gray-500">
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

const { getField } = usePageContent('menu')
const tenant = await useTenantSite()

// Validate tenant context before making API calls
if (!tenant.siteId || tenant.isPlatform) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Tenant site not found'
  })
}

// Check if user is authenticated
const { data: session } = await useFetch('/api/auth/get-session')
const isAuthenticated = computed(() => !!session.value?.user?.id)

// Get brand menu (locationId = null for brand page)
const { 
  menu, 
  loading: menuLoading, 
  error: menuError, 
  hasMenu, 
  menuItemsBySection 
} = usePublicMenu(tenant.siteId, null)

// Convert menu sections to format expected by MenuCategoryNav
const menuSections = computed(() => {
  if (!menu.value) return []
  return Object.keys(menuItemsBySection.value).map(section => ({
    id: section,
    name: section
  }))
})

const activeSection = ref(menuSections.value[0]?.id ?? '')

useSeoMeta({ title: 'Menu | Restaurant Website', description: 'Explore our complete menu at your restaurant.', ogImage: '/og-image.jpg', ogUrl: '/menu' })
</script>

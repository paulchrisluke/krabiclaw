<template>
  <UFooter class="bg-(--ui-bg-inverted) text-(--ui-text-inverted) border-t border-(--ui-border)">
    <template #top>
      <UContainer class="py-16">
        <!-- Social Links -->
        <div class="flex justify-center mb-16">
          <div class="flex items-center gap-8 md:gap-12">
            <UButton variant="ghost" color="neutral" size="lg" square class="text-(--ui-text-inverted)">
              <Icon name="i-simple-icons-facebook" />
            </UButton>
            <UButton variant="ghost" color="neutral" size="lg" square class="text-(--ui-text-inverted)">
              <Icon name="i-simple-icons-instagram" />
            </UButton>
            <UButton variant="ghost" color="neutral" size="lg" square class="text-(--ui-text-inverted)">
              <Icon name="i-simple-icons-tiktok" />
            </UButton>
          </div>
        </div>

        <!-- Main Footer Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-12 border-t border-(--ui-border) pt-16">
          <!-- Brand & Address -->
          <div class="md:col-span-1">
            <NuxtLink to="/" class="inline-block mb-6">
              <span class="text-xl font-bold tracking-tight">{{ restaurantName }}</span>
            </NuxtLink>
            <p class="text-(--ui-text-inverted) text-sm max-w-xs mb-8 leading-relaxed font-light opacity-50">
              Authentic dining experience. 
              Crafted with passion, served with tradition.
            </p>
            <div class="space-y-4">
              <div class="flex items-start gap-3 text-sm text-(--ui-text-inverted) opacity-70">
                <Icon name="i-heroicons-map-pin" class="w-5 h-5 opacity-50" />
                <p>{{ businessAddress || 'Location coming soon' }}</p>
              </div>
              <div v-if="businessPhone" class="flex items-start gap-3 text-sm text-(--ui-text-inverted) opacity-70">
                <Icon name="i-heroicons-phone" class="w-5 h-5 opacity-50" />
                <a :href="'tel:' + businessPhone" class="transition-colors hover:opacity-100">{{ businessPhone }}</a>
              </div>
            </div>
          </div>

          <!-- Experience Links -->
          <div class="flex flex-col">
            <h4 class="font-bold text-xs mb-8 uppercase tracking-[0.2em] text-(--ui-text-inverted) opacity-60">Experience</h4>
            <ul class="space-y-4 text-sm text-(--ui-text-inverted) opacity-80">
              <li><NuxtLink to="/menu" class="transition-colors hover:opacity-100">Menu</NuxtLink></li>
              <li><NuxtLink to="/reservations" class="transition-colors hover:opacity-100">Reservations</NuxtLink></li>
              <li><NuxtLink to="/photos" class="transition-colors hover:opacity-100">Gallery</NuxtLink></li>
              <li><NuxtLink to="/about" class="transition-colors hover:opacity-100">Our Story</NuxtLink></li>
            </ul>
          </div>

          <!-- Discover Links -->
          <div class="flex flex-col">
            <h4 class="font-bold text-xs mb-8 uppercase tracking-[0.2em] text-(--ui-text-inverted) opacity-60">Discover</h4>
            <ul class="space-y-4 text-sm text-(--ui-text-inverted) opacity-80">
              <li><NuxtLink to="/reviews" class="transition-colors hover:opacity-100">Reviews</NuxtLink></li>
              <li><NuxtLink to="/posts" class="transition-colors hover:opacity-100">Latest Updates</NuxtLink></li>
              <li><NuxtLink to="/qa" class="transition-colors hover:opacity-100">Q&A</NuxtLink></li>
            </ul>
          </div>

          <!-- Connect Links -->
          <div class="flex flex-col">
            <h4 class="font-bold text-xs mb-8 uppercase tracking-[0.2em] text-(--ui-text-inverted) opacity-60">Connect</h4>
            <ul class="space-y-4 text-sm text-(--ui-text-inverted) opacity-80">
              <li><NuxtLink to="/location" class="transition-colors hover:opacity-100">Find Us</NuxtLink></li>
              <li><NuxtLink to="/contact" class="transition-colors hover:opacity-100">Contact Us</NuxtLink></li>
            </ul>
          </div>
        </div>
      </UContainer>
    </template>
    
    <template #bottom>
      <UContainer class="py-8 border-t border-(--ui-border)">
        <div class="flex flex-col items-center text-[9px] uppercase tracking-[0.25em] text-(--ui-text-inverted) font-medium opacity-40">
          <div class="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-4">
            <NuxtLink to="/privacy-policy" class="transition-colors hover:opacity-100">Privacy Policy</NuxtLink>
            <NuxtLink to="/terms-and-conditions" class="transition-colors hover:opacity-100">Terms & Conditions</NuxtLink>
          </div>
          <div class="text-center opacity-60">
            © {{ new Date().getFullYear() }} {{ restaurantName }}. ALL RIGHTS RESERVED.
          </div>
          <div class="mt-4 opacity-40">
            Powered by <NuxtLink to="https://krabiclaw.com" class="transition-colors hover:opacity-100">KrabiClaw</NuxtLink>
          </div>
        </div>
      </UContainer>
    </template>
  </UFooter>
</template>

<script setup>
const { isPlatform, siteId, site } = await useTenantSite()

// Fetch tenant business data ONLY if not on platform
const { data: googleBusiness } = !isPlatform && siteId
  ? await useFetch(`/api/public/sites/${siteId}/google-business`, {
      key: `footer-google-business-${siteId}`,
      default: () => ({ business: null })
    })
  : { data: ref({ business: null }) }

const businessAddress = computed(() => {
  const addr = googleBusiness.value?.business?.storefrontAddress
  if (!addr) return ''
  return `${addr.addressLines?.[0] || ''}, ${addr.locality || ''}, ${addr.administrativeArea || ''} ${addr.postalCode || ''}`.replace(/^,\s*/, '')
})

const businessPhone = computed(() => googleBusiness.value?.business?.phoneNumbers?.[0]?.phoneNumber || '')
const restaurantName = computed(() => site?.name || 'Saya Kitchen')
</script>

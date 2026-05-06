<template>
  <UFooter class="bg-black text-white border-t border-white/5">
    <template #top>
      <UContainer class="py-16">
        <!-- Social Links -->
        <div class="flex justify-center mb-16">
          <div class="flex items-center gap-8 md:gap-12">
            <UButton variant="ghost" color="neutral" size="lg" square class="text-white hover:bg-white/10">
              <Icon name="i-simple-icons-facebook" />
            </UButton>
            <UButton variant="ghost" color="neutral" size="lg" square class="text-white hover:bg-white/10">
              <Icon name="i-simple-icons-instagram" />
            </UButton>
            <UButton variant="ghost" color="neutral" size="lg" square class="text-white hover:bg-white/10">
              <Icon name="i-simple-icons-tiktok" />
            </UButton>
          </div>
        </div>

        <!-- Main Footer Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-12 border-t border-white/5 pt-16">
          <!-- Brand & Address -->
          <div class="md:col-span-1">
            <NuxtLink to="/" class="inline-block mb-6">
              <span class="text-xl font-bold tracking-tight">{{ restaurantName }}</span>
            </NuxtLink>
            <p class="text-white/50 text-sm max-w-xs mb-8 leading-relaxed font-light">
              Authentic dining experience. 
              Crafted with passion, served with tradition.
            </p>
            <div class="space-y-4">
              <div class="flex items-start gap-3 text-sm text-white/70">
                <Icon name="i-heroicons-map-pin" class="w-5 h-5 opacity-50" />
                <p>{{ businessAddress || 'Location coming soon' }}</p>
              </div>
              <div v-if="businessPhone" class="flex items-start gap-3 text-sm text-white/70">
                <Icon name="i-heroicons-phone" class="w-5 h-5 opacity-50" />
                <a :href="'tel:' + businessPhone" class="hover:text-white transition-colors">{{ businessPhone }}</a>
              </div>
            </div>
          </div>

          <!-- Experience Links -->
          <div class="flex flex-col">
            <h4 class="font-bold text-xs mb-8 uppercase tracking-[0.2em] text-white/60">Experience</h4>
            <ul class="space-y-4 text-sm text-white/80">
              <li><NuxtLink to="/menu" class="hover:text-white transition-colors">Menu</NuxtLink></li>
              <li><NuxtLink to="/reservations" class="hover:text-white transition-colors">Reservations</NuxtLink></li>
              <li><NuxtLink to="/photos" class="hover:text-white transition-colors">Gallery</NuxtLink></li>
              <li><NuxtLink to="/about" class="hover:text-white transition-colors">Our Story</NuxtLink></li>
            </ul>
          </div>

          <!-- Discover Links -->
          <div class="flex flex-col">
            <h4 class="font-bold text-xs mb-8 uppercase tracking-[0.2em] text-white/60">Discover</h4>
            <ul class="space-y-4 text-sm text-white/80">
              <li><NuxtLink to="/reviews" class="hover:text-white transition-colors">Reviews</NuxtLink></li>
              <li><NuxtLink to="/posts" class="hover:text-white transition-colors">Latest Updates</NuxtLink></li>
              <li><NuxtLink to="/qa" class="hover:text-white transition-colors">Q&A</NuxtLink></li>
            </ul>
          </div>

          <!-- Connect Links -->
          <div class="flex flex-col">
            <h4 class="font-bold text-xs mb-8 uppercase tracking-[0.2em] text-white/60">Connect</h4>
            <ul class="space-y-4 text-sm text-white/80">
              <li><NuxtLink to="/location" class="hover:text-white transition-colors">Find Us</NuxtLink></li>
              <li><NuxtLink to="/contact" class="hover:text-white transition-colors">Contact Us</NuxtLink></li>
            </ul>
          </div>
        </div>
      </UContainer>
    </template>
    
    <template #bottom>
      <UContainer class="py-8 border-t border-white/5">
        <div class="flex flex-col items-center text-[9px] uppercase tracking-[0.25em] text-white/40 font-medium">
          <div class="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-4">
            <NuxtLink to="/privacy-policy" class="hover:text-white transition-colors">Privacy Policy</NuxtLink>
            <NuxtLink to="/terms-and-conditions" class="hover:text-white transition-colors">Terms & Conditions</NuxtLink>
          </div>
          <div class="text-center opacity-60">
            © {{ new Date().getFullYear() }} {{ restaurantName }}. ALL RIGHTS RESERVED.
          </div>
          <div class="mt-4 opacity-40">
            Powered by <NuxtLink to="https://krabiclaw.com" class="hover:text-white transition-colors">KrabiClaw</NuxtLink>
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
const restaurantName = computed(() => site?.name || 'Your Restaurant')
</script>

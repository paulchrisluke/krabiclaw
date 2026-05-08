<template>
  <UFooter class="bg-(--ui-bg-inverted) text-(--ui-text-inverted)">
    <template #left>
      <div class="flex flex-col">
        <NuxtLink to="/" class="inline-block mb-4">
          <span class="text-xl font-bold tracking-tight">{{ restaurantName }}</span>
        </NuxtLink>
        <p class="text-(--ui-text-inverted) text-sm max-w-xs leading-relaxed font-light opacity-60 mb-4">
          Authentic dining experience.
          Crafted with passion, served with tradition.
        </p>
        <div class="text-xs text-(--ui-text-inverted) opacity-40">
          <div class="flex flex-wrap gap-x-4 gap-y-2 mb-2">
            <NuxtLink to="/privacy-policy" class="transition-colors hover:opacity-100">Privacy Policy</NuxtLink>
            <NuxtLink to="/terms-and-conditions" class="transition-colors hover:opacity-100">Terms & Conditions</NuxtLink>
          </div>
          <div>
            © {{ new Date().getFullYear() }} {{ restaurantName }}. All rights reserved.
          </div>
          <div class="mt-1">
            Powered by <a href="https://krabiclaw.com" target="_blank" rel="noopener noreferrer" class="transition-colors hover:opacity-100">KrabiClaw</a>
          </div>
        </div>
      </div>
    </template>

    <div class="grid grid-cols-2 sm:grid-cols-3 gap-8">
      <div class="flex flex-col">
        <h4 class="font-bold text-xs mb-4 uppercase tracking-[0.2em] text-(--ui-text-inverted) opacity-80">Experience</h4>
        <ul class="space-y-3 text-sm text-(--ui-text-inverted) opacity-90">
          <li><NuxtLink to="/menu" class="transition-colors hover:opacity-100">Menu</NuxtLink></li>
          <li><NuxtLink to="/reservations" class="transition-colors hover:opacity-100">Reservations</NuxtLink></li>
          <li><NuxtLink to="/photos" class="transition-colors hover:opacity-100">Gallery</NuxtLink></li>
          <li><NuxtLink to="/about" class="transition-colors hover:opacity-100">Our Story</NuxtLink></li>
        </ul>
      </div>
      <div class="flex flex-col">
        <h4 class="font-bold text-xs mb-4 uppercase tracking-[0.2em] text-(--ui-text-inverted) opacity-80">Discover</h4>
        <ul class="space-y-3 text-sm text-(--ui-text-inverted) opacity-90">
          <li><NuxtLink to="/reviews" class="transition-colors hover:opacity-100">Reviews</NuxtLink></li>
          <li><NuxtLink to="/posts" class="transition-colors hover:opacity-100">Latest Updates</NuxtLink></li>
          <li><NuxtLink to="/qa" class="transition-colors hover:opacity-100">Q&A</NuxtLink></li>
        </ul>
      </div>
      <div class="flex flex-col">
        <h4 class="font-bold text-xs mb-4 uppercase tracking-[0.2em] text-(--ui-text-inverted) opacity-80">Connect</h4>
        <ul class="space-y-3 text-sm text-(--ui-text-inverted) opacity-90">
          <li><NuxtLink to="/location" class="transition-colors hover:opacity-100">Find Us</NuxtLink></li>
          <li><NuxtLink to="/contact" class="transition-colors hover:opacity-100">Contact Us</NuxtLink></li>
        </ul>
      </div>
    </div>

    <template #right>
      <div class="flex flex-col items-center lg:items-end gap-4">
        <div class="space-y-3 text-sm text-(--ui-text-inverted) opacity-80 text-center lg:text-right">
          <div class="flex items-center gap-4 justify-center lg:justify-end">
            <Icon name="i-heroicons-map-pin" class="w-6 h-6 opacity-60" />
            <p>{{ businessAddress || 'Location coming soon' }}</p>
          </div>
          <div v-if="businessPhone" class="flex items-center gap-4 justify-center lg:justify-end">
            <Icon name="i-heroicons-phone" class="w-6 h-6 opacity-60" />
            <a :href="'tel:' + businessPhone" class="transition-colors hover:opacity-100">{{ businessPhone }}</a>
          </div>
        </div>
        <div class="flex items-center gap-4 mt-4">
          <UButton
            v-if="facebookUrl"
            icon="i-simple-icons-facebook"
            color="neutral"
            variant="ghost"
            size="xl"
            square
            class="text-(--ui-text-inverted)"
            :to="facebookUrl"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit our Facebook"
          />
          <UButton
            v-else
            icon="i-simple-icons-facebook"
            color="neutral"
            variant="ghost"
            size="xl"
            square
            class="text-(--ui-text-inverted) opacity-40"
            aria-label="Facebook placeholder"
          />
          <UButton
            v-if="instagramUrl"
            icon="i-simple-icons-instagram"
            color="neutral"
            variant="ghost"
            size="xl"
            square
            class="text-(--ui-text-inverted)"
            :to="instagramUrl"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit our Instagram"
          />
          <UButton
            v-else
            icon="i-simple-icons-instagram"
            color="neutral"
            variant="ghost"
            size="xl"
            square
            class="text-(--ui-text-inverted) opacity-40"
            aria-label="Instagram placeholder"
          />
          <UButton
            v-if="tiktokUrl"
            icon="i-simple-icons-tiktok"
            color="neutral"
            variant="ghost"
            size="xl"
            square
            class="text-(--ui-text-inverted)"
            :to="tiktokUrl"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit our TikTok"
          />
          <UButton
            v-else
            icon="i-simple-icons-tiktok"
            color="neutral"
            variant="ghost"
            size="xl"
            square
            class="text-(--ui-text-inverted) opacity-40"
            aria-label="TikTok placeholder"
          />
        </div>
      </div>
    </template>
  </UFooter>
</template>

<script setup>
import { usePageContent } from '~/composables/usePageContent'
import { DEFAULT_RESTAURANT_NAME } from '~/config/constants'

const { isPlatform, siteId, site } = await useTenantSite()

// Fetch social links from contact page content
const { getField } = usePageContent('contact')

const facebookUrl = computed(() => getField('social.facebook', ''))
const instagramUrl = computed(() => getField('social.instagram', ''))
const tiktokUrl = computed(() => getField('social.tiktok', ''))

// Always invoke useFetch, but enable only when not on platform and siteId is present
const { data: googleBusiness } = await useFetch(
  () => `/api/public/sites/${siteId}/google-business`,
  {
    key: () => `footer-google-business-${siteId}`,
    default: () => ({ business: null }),
    enabled: () => !isPlatform && !!siteId
  }
)

const businessAddress = computed(() => {
  const addr = googleBusiness.value?.business?.storefrontAddress
  if (!addr) return ''
  const parts = [
    addr.addressLines?.[0],
    addr.locality,
    [addr.administrativeArea, addr.postalCode].filter(Boolean).join(' ')
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : ''
})

const businessPhone = computed(() => googleBusiness.value?.business?.phoneNumbers?.[0]?.phoneNumber || '')
const restaurantName = computed(() => site?.value?.name || DEFAULT_RESTAURANT_NAME)
</script>

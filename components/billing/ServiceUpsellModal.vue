<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-lg' }">
    <template #content>
      <div class="p-6">
        <!-- Team strip -->
        <div class="flex items-center gap-3 mb-5">
          <div class="flex -space-x-2">
            <img
              :src="PAUL_PHOTO_URL"
              alt="Paul"
              class="w-9 h-9 rounded-full ring-2 ring-white dark:ring-gray-900 object-cover bg-gray-100"
            />
            <img
              :src="JULIA_PHOTO_URL"
              alt="Julia"
              class="w-9 h-9 rounded-full ring-2 ring-white dark:ring-gray-900 object-cover bg-gray-100"
            />
          </div>
          <div>
            <p class="text-xs font-semibold text-muted uppercase tracking-wide">From Paul & Julia</p>
            <p class="text-xs text-dimmed">Your KrabiClaw team</p>
          </div>
          <UButton
            icon="i-heroicons-x-mark"
            color="neutral"
            variant="ghost"
            size="sm"
            class="ml-auto"
            aria-label="Close"
            @click="close"
          />
        </div>

        <!-- Headline -->
        <h2 class="text-xl font-bold text-highlighted leading-snug mb-1">
          {{ content.headline }}
        </h2>
        <p class="text-sm text-muted leading-relaxed mb-5">
          {{ content.subheading }}
        </p>

        <!-- Bullets -->
        <ul class="space-y-2 mb-6">
          <li v-for="bullet in content.bullets" :key="bullet" class="flex items-start gap-2 text-sm text-default">
            <UIcon name="i-heroicons-check-circle" class="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{{ bullet }}</span>
          </li>
        </ul>

        <!-- Price callout -->
        <div v-if="content.price" class="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 mb-5 flex items-baseline gap-2">
          <span class="text-2xl font-extrabold text-primary">{{ content.price }}</span>
          <span class="text-sm text-muted">{{ content.priceNote }}</span>
        </div>

        <!-- CTAs -->
        <div class="flex flex-col gap-2">
          <UButton
            color="primary"
            block
            size="lg"
            :loading="loading"
            class="font-semibold"
            @click="handleCta"
          >
            {{ content.cta }}
          </UButton>
          <a
            :href="whatsappLink"
            target="_blank"
            rel="noopener noreferrer"
            class="text-center text-sm text-muted hover:text-default transition-colors py-1"
          >
            Questions? WhatsApp us first →
          </a>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { UpsellType } from '~/composables/useServiceUpsell'

// --- Team photo URLs ---
const PAUL_PHOTO_URL = 'https://res.cloudinary.com/pcl-labs/image/upload/v1714697364/PCL-Labs/1_qjKv1vv3WC6ckf3eTM0hZQ_1_nf3uuk.png'
const JULIA_PHOTO_URL = 'https://res.cloudinary.com/pcl-labs/image/upload/v1714706641/PCL-Labs/1682091954266_vrcx3n.webp'
// Paul's WhatsApp number (international format, no +)
const config = useRuntimeConfig()
const rawWhatsapp = config.public?.whatsappNumber
const WHATSAPP_NUMBER = typeof rawWhatsapp === 'string' && /^[1-9]\d{1,14}$/.test(rawWhatsapp.replace(/[\s\-\+\(\)]/g, ''))
  ? rawWhatsapp.replace(/[\s\-\+\(\)]/g, '')
  : '16197200000'
// ---

const { isOpen, type, close } = useServiceUpsell()
const toast = useToast()
const loading = ref(false)

interface UpsellContent {
  headline: string
  subheading: string
  bullets: string[]
  price: string
  priceNote: string
  cta: string
}

const contentMap: Record<UpsellType, UpsellContent> = {
  growth: {
    headline: 'Let us handle translations & updates',
    subheading: 'You focus on the food — we keep your site accurate, translated, and found by tourists.',
    bullets: [
      'One language translation (English, Chinese, or German)',
      'Menu updates via WhatsApp — just send us a message',
      'Monthly traffic & performance snapshot',
      'Google Business profile basics included',
    ],
    price: '$49',
    priceNote: '/ month',
    cta: 'Get Growth — $49/mo',
  },
  managed: {
    headline: 'We run your restaurant online, end to end',
    subheading: 'Send us a voice note on WhatsApp. We handle menu updates, translations, posts, and your Google presence.',
    bullets: [
      'Unlimited language translations',
      'Menu, posts & seasonal content managed for you',
      'Full Google Business profile management',
      'Custom domain + free SSL',
      'Priority WhatsApp support — we respond fast',
    ],
    price: '$149',
    priceNote: '/ month',
    cta: 'Get Managed — $149/mo',
  },
  seo_accelerator: {
    headline: "Julia's SEO playbook — applied to your restaurant",
    subheading: "Julia grew tiffycooks.com to 1M active impressions/day. We apply that same strategy to get tourists finding you first.",
    bullets: [
      'Local & travel keyword targeting for your area',
      'Google Maps authority building',
      'Monthly content cadence — blog, photos, posts',
      'Competitive analysis & monthly reporting',
      'Everything in Managed included',
    ],
    price: '$349',
    priceNote: '/ month',
    cta: 'Get SEO Accelerator — $349/mo',
  },
  translation: {
    headline: 'Add another language to your site',
    subheading: 'We translate your full menu, pages, and descriptions into a new language — one-time, done right.',
    bullets: [
      'Full site translation by a native speaker + AI',
      'Menu items, descriptions, and allergen notes',
      'Ready within 3–5 business days',
    ],
    price: '$45',
    priceNote: 'one-time per language',
    cta: 'Add Translation — $45',
  },
  seasonal: {
    headline: 'Seasonal relaunch package',
    subheading: 'Fresh photos, updated menu, and a promotion post — all set before your next busy season.',
    bullets: [
      'Menu refresh with seasonal items',
      'Updated promotional content & featured photos',
      'Google Business post announcing the update',
    ],
    price: '$99',
    priceNote: 'one-time',
    cta: 'Get Seasonal Relaunch — $99',
  },
  gbp_setup: {
    headline: 'Google Business optimization',
    subheading: "We audit and optimize your Google Business profile so you show up when tourists search nearby restaurants.",
    bullets: [
      'Full profile audit & keyword optimization',
      'Category, attributes, and hours review',
      'Photo uploads and Q&A setup',
    ],
    price: '$49',
    priceNote: 'one-time',
    cta: 'Get Google Business Setup — $49',
  },
}

const content = computed<UpsellContent>(() => contentMap[type.value ?? 'growth'])

const whatsappLink = computed(() => {
  const planName = content.value.headline
  const msg = encodeURIComponent(`Hi Paul & Julia, I'm interested in: ${planName}`)
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`
})

const RECURRING_TYPES: UpsellType[] = ['growth', 'managed', 'seo_accelerator']

async function handleCta() {
  if (!type.value) return
  loading.value = true
  try {
    if (RECURRING_TYPES.includes(type.value)) {
      const res = await $fetch<{ checkoutUrl: string }>('/api/billing/checkout', {
        method: 'POST',
        body: { plan: type.value, interval: 'month' },
      })
      if (res.checkoutUrl) {
        close()
        await navigateTo(res.checkoutUrl, { external: true })
      } else {
        throw new Error('Missing checkoutUrl')
      }
    } else {
      const res = await $fetch<{ checkoutUrl: string }>('/api/billing/service-addon', {
        method: 'POST',
        body: { addonType: type.value },
      })
      if (res.checkoutUrl) {
        close()
        await navigateTo(res.checkoutUrl, { external: true })
      } else {
        throw new Error('Missing checkoutUrl')
      }
    }
  } catch (err) {
    console.error('Checkout error:', err)
    toast.add({ title: 'Something went wrong', description: 'Please try WhatsApp instead.', color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

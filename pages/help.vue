<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-4xl font-bold text-default mb-4">Help Center</h1>
      <p class="text-lg text-muted mb-10">Find answers to common questions about KrabiClaw</p>

      <UInput v-model="searchQuery" placeholder="Search questions…" size="lg" icon="i-heroicons-magnifying-glass" class="mb-12" />

      <div v-for="section in filteredSections" :key="section.title" class="mb-12">
        <h2 class="text-xl font-bold text-default mb-4 pb-2 border-b border-default">{{ section.title }}</h2>
        <div class="space-y-2">
          <div
            v-for="faq in section.faqs"
            :key="faq.q"
            class="border border-default rounded-xl overflow-hidden"
          >
            <button
              class="w-full text-left px-6 py-4 flex items-center justify-between gap-4 hover:bg-elevated transition-colors"
              :aria-expanded="open === faq.q"
              :aria-controls="panelId(section.title, faq.q)"
              @click="toggle(faq.q)"
            >
              <span class="font-medium text-default">{{ faq.q }}</span>
              <UIcon
                :name="open === faq.q ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                class="shrink-0 w-5 h-5 text-muted"
              />
            </button>
            <div
              v-if="open === faq.q"
              :id="panelId(section.title, faq.q)"
              class="px-6 py-4 bg-elevated text-muted border-t border-default"
              role="region"
            >
              <p>{{ faq.a }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="filteredSections.length === 0" class="text-center py-12 text-muted">
        No results for "{{ searchQuery }}". Try a different search or contact us below.
      </div>

      <div class="mt-12 bg-elevated rounded-2xl p-8 text-center border border-default">
        <p class="text-default font-semibold mb-2">Still need help?</p>
        <p class="text-muted mb-6">Our fully distributed team operates across global timezones and replies within one business day.</p>
        <UButton color="primary" to="/contact">Contact Support</UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'platform' })

import { useBreadcrumbSchema } from '~/composables/useSchemaOrg'

const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

useBreadcrumbSchema([
  { name: 'Home', url: `${siteUrl}/` },
  { name: 'Help Center', url: `${siteUrl}/help` }
])

const searchQuery = ref('')
const open = ref<string | null>(null)

function toggle(q: string) {
  open.value = open.value === q ? null : q
}

function panelId(sectionTitle: string, question: string) {
  const slug = `${sectionTitle}-${question}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `faq-panel-${slug}`
}

// FAQ answers are rendered as plain text and should only be sourced from trusted app content.
const sections = [
  {
    title: 'Getting Started',
    faqs: [
      {
        q: 'Do I need technical skills to use KrabiClaw?',
        a: 'No. KrabiClaw is designed for restaurant owners, not developers. If you can fill out a form, you can build a professional website. The whole setup takes about 10 minutes.'
      },
      {
        q: 'How do I create my first website?',
        a: 'Sign up at krabiclaw.com, enter your restaurant name, and choose a subdomain. Your site is live immediately — you can then add your menu, photos, and content from the dashboard.'
      },
      {
        q: 'Can I use KrabiClaw without a Google Business Profile?',
        a: "Connect your Google Business Profile under Dashboard → Integrations for the easiest setup. But it's entirely optional — you can enter your menu, hours, photos, and location details manually. Connecting later will auto-fill anything you haven't added yet."
      },
      {
        q: 'What languages does KrabiClaw support?',
        a: 'The platform interface supports English and Thai. Your restaurant website can display content in any language — just type it in.'
      }
    ]
  },
  {
    title: 'Menu & Content',
    faqs: [
      {
        q: 'How do I add menu items?',
        a: 'Go to Dashboard → Menu. Add categories and items manually, or use AI menu extraction: take a photo of your printed menu and ChowBot will read it and import the items automatically.'
      },
      {
        q: 'Can I upload photos of my dishes?',
        a: 'Yes. Each menu item supports a photo. You can also upload a general photo gallery for your location — photos from Google Business sync automatically on Pro plans.'
      },
      {
        q: 'How do I update my opening hours?',
        a: 'Go to Dashboard → Locations → select your location → Hours. If you have connected Google Business, your hours sync automatically and can also be updated there.'
      },
      {
        q: 'What is the draft/publish workflow?',
        a: 'Every page has a draft state. Changes you make in the editor are saved as a draft and only visible to you in preview. Click Publish to make them live — so you can edit freely without showing unfinished content to customers.'
      }
    ]
  },
  {
    title: 'Domain & Hosting',
    faqs: [
      {
        q: 'What domain do I get on the free plan?',
        a: 'On the free plan you get a subdomain: <strong>your-restaurant.krabiclaw.com</strong>. It is fully live, indexed by Google, and shareable with customers from day one.'
      },
      {
        q: 'How do I connect my own domain?',
        a: 'Upgrade to Pro, then go to Dashboard → Settings → Domain. Enter your domain, then add the two DNS records we provide in your domain registrar. It goes live within minutes.'
      },
      {
        q: 'Is SSL included?',
        a: 'Yes. All KrabiClaw sites — free and paid — get an automatic SSL certificate. Your site always loads over HTTPS at no extra cost.'
      },
      {
        q: 'Where are my files hosted?',
        a: "KrabiClaw runs on Cloudflare's global network with servers in over 300 cities including Bangkok, Singapore, and Tokyo. Your site loads fast for customers anywhere in the world."
      }
    ]
  },
  {
    title: 'Google Business',
    faqs: [
      {
        q: 'How does Google Business sync work?',
        a: 'Connect under Integrations to pull name, address, hours, photos, reviews.'
      },
      {
        q: 'Will my Google reviews show on my site?',
        a: 'Yes. Once connected, your reviews display on your site\'s Reviews page and in the homepage summary. New reviews appear automatically — no manual import needed.'
      },
      {
        q: 'Can I reply to reviews from KrabiClaw?',
        a: 'Not yet — reply directly from your Google Business dashboard. Your reply syncs to your KrabiClaw site automatically.'
      }
    ]
  },
  {
    title: 'Billing & Plans',
    faqs: [
      {
        q: 'Can I change plans anytime?',
        a: 'Yes. Upgrade or downgrade at any time from Dashboard → Billing. Upgrades take effect immediately. Downgrades apply at the end of your current billing period.'
      },
      {
        q: 'Do you offer refunds?',
        a: 'We offer a 30-day money-back guarantee on all paid plans. Contact hello@krabiclaw.com within 30 days of your first payment and we will issue a full refund, no questions asked.'
      },
      {
        q: 'What payment methods do you accept?',
        a: 'All major credit and debit cards (Visa, Mastercard, Amex) via Stripe. Enterprise plans can be invoiced by bank transfer.'
      },
      {
        q: 'What are AI credits?',
        a: 'AI credits power features like menu extraction from photos and content generation. Free plans include 500 credits per month. Pro plans include 5,000. Credits reset on your billing anniversary. Additional credits can be purchased from Dashboard → Billing.'
      }
    ]
  }
]

const filteredSections = computed(() => {
  if (!searchQuery.value.trim()) return sections
  const q = searchQuery.value.toLowerCase()
  return sections
    .map(section => ({
      ...section,
      faqs: section.faqs.filter(
        faq => faq.q.toLowerCase().includes(q) || faq.a.toLowerCase().includes(q)
      )
    }))
    .filter(section => section.faqs.length > 0)
})

useSeoMeta({
  title: 'Help Center | KrabiClaw',
  description: 'Answers to common questions about KrabiClaw — the premium AI-powered restaurant website builder.',
  ogImage: useSharedOgImage(),
  ogUrl: `${siteUrl}/help`
})
</script>

<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'saya'">

    <!-- ── TENANT: Restaurant contact page ───────────────── -->
    <div v-if="!isPlatform">
      <SayaHero
        :title="getField('contact.hero.title', 'Contact Us')"
        :subtitle="getField('contact.hero.subtitle', 'We\'d love to hear from you')"
        size="page"
      />
      <div class="max-w-6xl mx-auto px-4 py-12">
        <div class="grid md:grid-cols-2 gap-12">
          <!-- Contact form -->
          <div>
            <h2 class="text-2xl font-bold text-(--ui-text) mb-6">Send a Message</h2>
            <UCard class="rounded-lg bg-(--ui-bg-muted)">
              <UForm :state="tenantForm" :validate="validateTenantContact" class="space-y-5" @submit="handleTenantContact">
                <UFormField label="Name" name="name" required>
                  <UInput v-model="tenantForm.name" size="lg" placeholder="Your name" class="w-full" />
                </UFormField>
                <UFormField label="Email" name="email" required>
                  <UInput v-model="tenantForm.email" type="email" size="lg" placeholder="you@example.com" class="w-full" />
                </UFormField>
                <UFormField label="Message" name="message" required>
                  <UTextarea v-model="tenantForm.message" size="lg" :rows="5" placeholder="How can we help?" class="w-full" />
                </UFormField>
                <UButton type="submit" color="neutral" variant="solid" size="xl" block :loading="tenantSubmitting" :disabled="tenantSubmitted">
                  {{ tenantSubmitted ? 'Message sent!' : 'Send Message' }}
                </UButton>
              </UForm>
            </UCard>
          </div>

          <!-- Contact info -->
          <div class="space-y-6">
            <h2 class="text-2xl font-bold text-(--ui-text) mb-6">Get in Touch</h2>
            <UCard class="rounded-lg bg-(--ui-bg-muted)">
              <div class="space-y-4">
                <div v-if="contactPhone">
                  <p class="text-xs font-bold uppercase tracking-widest text-(--ui-text-dimmed) mb-1">Phone</p>
                  <a :href="`tel:${contactPhone.replace(/\s/g, '')}`" class="text-(--ui-text) hover:underline">{{ contactPhone }}</a>
                </div>
                <div v-if="contactEmail">
                  <p class="text-xs font-bold uppercase tracking-widest text-(--ui-text-dimmed) mb-1">Email</p>
                  <a :href="`mailto:${contactEmail}`" class="text-(--ui-text) hover:underline">{{ contactEmail }}</a>
                </div>
                <div v-if="contactAddress">
                  <p class="text-xs font-bold uppercase tracking-widest text-(--ui-text-dimmed) mb-1">Address</p>
                  <p class="text-(--ui-text-muted)">{{ contactAddress }}</p>
                </div>
              </div>
            </UCard>
            <div class="space-y-3">
              <UButton v-if="contactPhone" :to="`tel:${contactPhone.replace(/\s/g, '')}`" color="neutral" variant="outline" class="w-full">
                Call {{ contactPhone }}
              </UButton>
              <UButton to="/reservations" color="neutral" variant="outline" class="w-full">
                Make a Reservation
              </UButton>
              <UButton to="/menu" color="neutral" variant="outline" class="w-full">
                View Menu
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── PLATFORM: KrabiClaw contact page ──────────────── -->
    <div v-else class="container mx-auto px-4 py-16">
      <div class="max-w-3xl mx-auto">
        <h1 class="text-4xl font-bold text-(--ui-text) mb-6">Contact Us</h1>
        <p class="text-lg text-(--ui-text-muted) mb-12">Get in touch with the KrabiClaw team</p>
        <div class="grid md:grid-cols-2 gap-12 mb-12">
          <div>
            <h2 class="text-2xl font-bold text-(--ui-text) mb-6">Get in Touch</h2>
            <div class="space-y-4">
              <div>
                <h3 class="font-semibold text-(--ui-text) mb-1">Email</h3>
                <p class="text-(--ui-text-muted)">hello@krabiclaw.com</p>
              </div>
              <div>
                <h3 class="font-semibold text-(--ui-text) mb-1">Location</h3>
                <p class="text-(--ui-text-muted)">Krabi, Thailand 🦀</p>
              </div>
              <div>
                <h3 class="font-semibold text-(--ui-text) mb-1">Support</h3>
                <p class="text-(--ui-text-muted)">support@krabiclaw.com</p>
              </div>
            </div>
          </div>
          <div>
            <h2 class="text-2xl font-bold text-(--ui-text) mb-6">Send a Message</h2>
            <UCard>
              <UForm :state="platformForm" :validate="validatePlatformContact" class="space-y-4" @submit="handlePlatformContact">
                <UFormField label="Name" name="name" required>
                  <UInput v-model="platformForm.name" size="lg" placeholder="Your name" />
                </UFormField>
                <UFormField label="Email" name="email" required>
                  <UInput v-model="platformForm.email" type="email" size="lg" placeholder="you@example.com" />
                </UFormField>
                <UFormField label="Message" name="message" required>
                  <UTextarea v-model="platformForm.message" size="lg" :rows="4" placeholder="How can we help?" />
                </UFormField>
                <UButton type="submit" color="primary" size="lg" block :loading="platformSubmitting" :disabled="platformSubmitted">
                  {{ platformSubmitted ? 'Message sent!' : 'Send Message' }}
                </UButton>
              </UForm>
            </UCard>
          </div>
        </div>
      </div>
    </div>

  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false })

import { useOrganizationSchema, useBreadcrumbSchema } from '~/composables/useSchemaOrg'
import { usePageContent } from '~/composables/usePageContent'

const { isPlatform, siteId } = useTenantSite()
const { getField } = usePageContent('contact')
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl
const route = useRoute()
const requestURL = useRequestURL()
const toast = useToast()
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Tenant contact info ──────────────────────────────────
const contactPhone = computed(() => getField('contact.phone', ''))
const contactEmail = computed(() => getField('contact.email', ''))
const contactAddress = computed(() => getField('contact.address', ''))

const tenantForm = ref({ name: '', email: '', message: '' })
const tenantSubmitting = ref(false)
const tenantSubmitted = ref(false)

const validateTenantContact = (state) => {
  const errors = []
  if (!state.name) errors.push({ name: 'name', message: 'Please enter your name.' })
  if (!state.email) errors.push({ name: 'email', message: 'Please enter your email.' })
  else if (!emailPattern.test(state.email)) errors.push({ name: 'email', message: 'Please enter a valid email.' })
  if (!state.message) errors.push({ name: 'message', message: 'Please enter a message.' })
  return errors
}

const handleTenantContact = async () => {
  tenantSubmitting.value = true
  try {
    await $fetch(`/api/public/sites/${siteId}/contact`, {
      method: 'POST',
      body: tenantForm.value
    })
    tenantSubmitted.value = true
    tenantForm.value = { name: '', email: '', message: '' }
    toast.add({ description: 'Message sent! We\'ll be in touch soon.', color: 'success' })
  } catch {
    toast.add({ description: 'Failed to send message. Please try again.', color: 'error' })
  } finally {
    tenantSubmitting.value = false
  }
}

// ── Platform contact ─────────────────────────────────────
const platformForm = ref({ name: '', email: '', message: '' })
const platformSubmitting = ref(false)
const platformSubmitted = ref(false)

const validatePlatformContact = (state) => {
  const errors = []
  if (!state.name) errors.push({ name: 'name', message: 'Please enter your name.' })
  if (!state.email) errors.push({ name: 'email', message: 'Please enter your email.' })
  else if (!emailPattern.test(state.email)) errors.push({ name: 'email', message: 'Please enter a valid email.' })
  if (!state.message) errors.push({ name: 'message', message: 'Please enter a message.' })
  return errors
}

const handlePlatformContact = async () => {
  platformSubmitting.value = true
  try {
    await $fetch('/api/contact', { method: 'POST', body: platformForm.value })
    platformSubmitted.value = true
    platformForm.value = { name: '', email: '', message: '' }
    toast.add({ description: 'Message sent! We\'ll be in touch soon.', color: 'success' })
    setTimeout(() => { platformSubmitted.value = false }, 3000)
  } catch {
    toast.add({ description: 'Failed to send message. Please try again.', color: 'error' })
  } finally {
    platformSubmitting.value = false
  }
}

// ── SEO ──────────────────────────────────────────────────
if (isPlatform) {
  useOrganizationSchema()
  useBreadcrumbSchema([
    { name: 'Home', url: `${siteUrl}/` },
    { name: 'Contact', url: `${siteUrl}/contact` }
  ])
}

useSeoMeta(isPlatform
  ? {
      title: 'Contact | KrabiClaw',
      description: 'Contact the KrabiClaw team for support, questions, or partnership inquiries.',
      ogUrl: `${siteUrl}/contact`
    }
  : {
      title: computed(() => `Contact | ${getField('restaurant.name', 'Our Restaurant')}`),
      description: 'Get in touch with our restaurant.',
      ogUrl: computed(() => new URL(route.path, requestURL.origin).toString())
    }
)
</script>

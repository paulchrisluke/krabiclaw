<template>
  <div>
    <SayaHero
      :title="getField('hero.title', 'Contact Us')"
      :subtitle="getField('hero.subtitle', 'Get in Touch with Saya Kitchen')"
      size="page"
      :establishment-year="googleBusiness?.business?.establishmentYear"
    />
    <UContainer class="py-12">
      <UCard class="mb-12">
        <div
          v-html="sanitizedIntro"
          class="prose prose-lg max-w-none text-(--ui-text-muted) [--tw-prose-body:var(--ui-text-muted)] [--tw-prose-bold:var(--ui-text)]"
        />
      </UCard>

      <div class="grid md:grid-cols-2 gap-12">
        <!-- Contact Details -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-(--ui-text) mb-6">Contact Information</h2>
          <div class="space-y-6">
            <div v-if="businessName">
              <h3 class="font-semibold text-(--ui-text) mb-1 uppercase tracking-wider text-xs">Restaurant</h3>
              <p class="text-(--ui-text-muted)">{{ businessName }}</p>
            </div>
            <div v-if="businessAddress">
              <h3 class="font-semibold text-(--ui-text) mb-1 uppercase tracking-wider text-xs">Address</h3>
              <p class="text-(--ui-text-muted)">{{ businessAddress }}</p>
            </div>
            <div v-if="businessPhone">
              <h3 class="font-semibold text-(--ui-text) mb-1 uppercase tracking-wider text-xs">Phone</h3>
              <p class="text-(--ui-text-muted)">{{ businessPhone }}</p>
            </div>
            <div v-if="businessHours">
              <h3 class="font-semibold text-(--ui-text) mb-1 uppercase tracking-wider text-xs">Opening Hours</h3>
              <p class="text-(--ui-text-muted)">{{ businessHours }}</p>
            </div>
          </div>
          <div class="mt-8">
            <h3 class="font-semibold text-(--ui-text) mb-4">Follow Us</h3>
            <div class="flex space-x-4">
              <a :href="getField('social.facebook', '#')" target="_blank" rel="noopener noreferrer" class="text-(--ui-text-muted) hover:text-(--ui-text)">Facebook</a>
              <a :href="getField('social.instagram', '#')" target="_blank" rel="noopener noreferrer" class="text-(--ui-text-muted) hover:text-(--ui-text)">Instagram</a>
            </div>
          </div>
        </div>

          <!-- Contact Form -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-(--ui-text) mb-6">Send Us a Message</h2>
          <UCard>
            <UForm :state="contactForm" :validate="validateContact" class="space-y-6" @submit="handleContact">
              <div class="grid gap-5 md:grid-cols-2">
                <UFormField label="Name" name="name" required>
                  <UInput id="name" v-model="contactForm.name" class="w-full" size="lg" type="text" placeholder="Your name" />
                </UFormField>
                <UFormField label="Email" name="email" required>
                  <UInput id="email" v-model="contactForm.email" class="w-full" size="lg" type="email" placeholder="you@example.com" />
                </UFormField>
              </div>
              <UFormField
                label="Message"
                name="message"
                description="Questions about reservations, private dining, allergies, or directions are all welcome."
                required
              >
                <UTextarea
                  id="message"
                  v-model="contactForm.message"
                  class="w-full"
                  size="lg"
                  :rows="6"
                  placeholder="How can we help?"
                />
              </UFormField>
              <UButton type="submit" color="neutral" size="xl" block :loading="submitting">
                Send Message
              </UButton>
            </UForm>
          </UCard>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="mt-12 grid md:grid-cols-2 gap-6">
        <UCard to="/reservations" class="hover:shadow-md transition-shadow cursor-pointer">
          <h3 class="text-lg font-semibold text-(--ui-text) mb-2">Make a Reservation</h3>
          <p class="text-(--ui-text-muted)">Book your table online or call us directly</p>
        </UCard>
        <UCard to="/location" class="hover:shadow-md transition-shadow cursor-pointer">
          <h3 class="text-lg font-semibold text-(--ui-text) mb-2">Find Us</h3>
          <p class="text-(--ui-text-muted)">Get directions and view our location on Google Maps</p>
        </UCard>
      </div>
    </UContainer>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })
import DOMPurify from 'isomorphic-dompurify'
import { getTodayGoogleHours } from '~/utils/formatters'
import { usePageContent } from '~/composables/usePageContent'
import { useTenantSite } from '~/composables/useTenantSite'

const { getField } = usePageContent('contact')

const { siteId } = await useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { data: googleBusiness } = await useFetch(`/api/public/sites/${siteId}/google-business`, {
  key: `contact-google-business-${siteId}`,
  default: () => ({ business: null, media: [] })
})

const businessName = computed(() => googleBusiness.value?.business?.title || '')
const businessAddress = computed(() => {
  const a = googleBusiness.value?.business?.storefrontAddress
  return a ? `${a.addressLines?.[0] || ''}, ${a.locality || ''}, ${a.administrativeArea || ''} ${a.postalCode || ''}` : ''
})
const businessPhone = computed(() => googleBusiness.value?.business?.phoneNumbers?.[0]?.phoneNumber || '')
const businessHours = computed(() => getTodayGoogleHours(googleBusiness.value?.business?.regularHours))

// Default moved to computed to avoid inline quote escaping issues
const introBody = computed(() => getField('intro.body',
  '<p class="mb-4 leading-relaxed">For an unparalleled culinary experience, our restaurant beckons you to transcend the virtual and savor the exquisite reality. Our website offers a glimpse of the gastronomic symphony that awaits—robust grills and artful creations.</p>' +
  '<p class="mb-4 leading-relaxed">Contact us to transform your online curiosity into a reservation, immersing yourself in the warm ambiance, skilled craftsmanship, and tantalizing flavors.</p>' +
  '<p class="font-semibold leading-relaxed">Elevate your senses; contact us for an unforgettable dining adventure.</p>'
))

DOMPurify.addHook('uponSanitizeAttribute', (_, data) => {
  if (data.attrName?.toLowerCase().startsWith('on')) {
    data.keepAttr = false
  }

  const value = String(data.attrValue || '').trim().toLowerCase()
  if (value.startsWith('data:')) {
    data.keepAttr = false
  }
})

// Sanitize HTML to prevent XSS
const sanitizedIntro = computed(() => {
  if (!introBody.value) return ''
  return DOMPurify.sanitize(introBody.value, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'a', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'style'],
    FORBID_ATTR: ['style'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
  })
})

const contactForm = ref({
  name: '',
  email: '',
  message: ''
})

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const validateContact = (state) => {
  const errors = []
  if (!state.name) errors.push({ name: 'name', message: 'Please enter your name.' })
  if (!state.email) {
    errors.push({ name: 'email', message: 'Please enter your email.' })
  } else if (!emailPattern.test(state.email)) {
    errors.push({ name: 'email', message: 'Please enter a valid email address.' })
  }
  if (!state.message) {
    errors.push({ name: 'message', message: 'Please enter a message.' })
  } else if (state.message.length < 10) {
    errors.push({ name: 'message', message: 'Please write at least 10 characters.' })
  }
  return errors
}

const toast = useToast()
const submitting = ref(false)

const handleContact = async () => {
  if (submitting.value) return
  submitting.value = true
  try {
    await $fetch(`/api/public/sites/${siteId}/contact`, {
      method: 'POST',
      body: contactForm.value,
    })
    contactForm.value = { name: '', email: '', message: '' }
    toast.add({ description: 'Message sent! We\'ll be in touch soon.', color: 'success' })
  } catch (err) {
    toast.add({ description: err?.data?.error ?? 'Failed to send message. Please try again.', color: 'error' })
  } finally {
    submitting.value = false
  }
}

const restaurantName = computed(() => getField('restaurant.name', businessName.value || ''))
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

useSeoMeta({
  title: computed(() => restaurantName.value ? `Contact | ${restaurantName.value}` : 'Contact Us'),
  description: computed(() => getField('seo.description', `Contact ${restaurantName.value || 'us'} for reservations, location details, hours, and guest questions.`)),
  ogImage: computed(() => getField('seo.ogImage', `${siteUrl}/og-image.jpg`)),
  ogUrl: computed(() => `${siteUrl}/contact`)
})
</script>

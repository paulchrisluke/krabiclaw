<template>
  <div class="container mx-auto px-4 py-16">
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
            <UForm :state="contactForm" :validate="validateContact" class="space-y-4" @submit="handleContact">
              <UFormField label="Name" name="name" required>
                <UInput v-model="contactForm.name" size="lg" placeholder="Your name" />
              </UFormField>
              <UFormField label="Email" name="email" required>
                <UInput v-model="contactForm.email" type="email" size="lg" placeholder="you@example.com" />
              </UFormField>
              <UFormField label="Message" name="message" required>
                <UTextarea v-model="contactForm.message" size="lg" :rows="4" placeholder="How can we help?" />
              </UFormField>
              <UButton type="submit" color="primary" size="lg" block :loading="submitting" :disabled="submitted">
                {{ submitted ? 'Message sent!' : 'Send Message' }}
              </UButton>
            </UForm>
          </UCard>
        </div>
      </div>

      <div class="bg-(--ui-bg-elevated) rounded-2xl shadow-sm border border-(--ui-border) p-8">
        <h2 class="text-2xl font-bold text-(--ui-text) mb-4">Frequently Asked Questions</h2>
        <div class="space-y-4">
          <div>
            <h3 class="font-semibold text-(--ui-text) mb-2">How do I get started?</h3>
            <p class="text-(--ui-text-muted)">Sign up for a free account and follow our guided setup process. You can have your restaurant website live in minutes.</p>
          </div>
          <div>
            <h3 class="font-semibold text-(--ui-text) mb-2">Is there a free trial?</h3>
            <p class="text-(--ui-text-muted)">Yes! We offer a free forever plan with basic features. Upgrade anytime for more advanced features.</p>
          </div>
          <div>
            <h3 class="font-semibold text-(--ui-text) mb-2">Can I use my own domain?</h3>
            <p class="text-(--ui-text-muted)">Yes, on paid plans you can connect your custom domain for a professional branded experience.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'platform' })

import { useOrganizationSchema, useBreadcrumbSchema } from '~/composables/useSchemaOrg'

const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

useOrganizationSchema()
useBreadcrumbSchema([
  { name: 'Home', url: `${siteUrl}/` },
  { name: 'Contact', url: `${siteUrl}/contact` }
])

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
  }
  return errors
}

const toast = useToast()
const submitting = ref(false)
const submitted = ref(false)

const handleContact = async () => {
  submitting.value = true
  try {
    await $fetch('/api/contact', {
      method: 'POST',
      body: contactForm.value
    })
    submitted.value = true
    contactForm.value = { name: '', email: '', message: '' }
    toast.add({ description: 'Message sent! We\'ll be in touch soon.', color: 'success' })
    setTimeout(() => {
      submitted.value = false
    }, 3000)
  } catch (err) {
    toast.add({ description: 'Failed to send message. Please try again.', color: 'error' })
  } finally {
    submitting.value = false
  }
}

useSeoMeta({
  title: 'Contact | KrabiClaw',
  description: 'Contact the KrabiClaw team for support, questions, or partnership inquiries.',
  ogImage: `${siteUrl}/og-image.jpg`,
  ogUrl: `${siteUrl}/contact`
})
</script>

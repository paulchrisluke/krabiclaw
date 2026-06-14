<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-4xl font-bold text-default mb-6">Terms and Conditions</h1>
      <p class="text-lg text-muted mb-12">Our agreement with you</p>

      <article class="prose prose-lg max-w-none text-default">
        <p><strong>Effective Date:</strong> June 14, 2026</p>

        <p>By accessing or using KrabiClaw ("the Service"), you agree to these Terms and Conditions.</p>

        <h2>1. Account Responsibilities</h2>
        <p>You must be at least 18 years old. You are responsible for maintaining the security of your account credentials and for all activities that occur under your account.</p>

        <h2>2. Acceptable Use</h2>
        <p>You agree not to use the Service for any unlawful activities, to distribute malware, to send spam, or to host prohibited content. We reserve the right to suspend or terminate accounts that violate these terms.</p>

        <h2>3. Content Ownership</h2>
        <p>You retain all rights to the content you create and upload. By using the Service, you grant us a license to host, display, and distribute your content solely as necessary to provide the Service.</p>
        
        <h2>4. Our Intellectual Property</h2>
        <p>KrabiClaw retains all rights to the platform, website builder, templates, and underlying technology. You may not copy, modify, or resell our software.</p>

        <h2>5. Payments and Subscriptions</h2>
        <p>Fees are billed in advance. Payments are non-refundable except as required by law. We may change pricing with prior notice.</p>

        <h2>6. Disclaimer of Warranties</h2>
        <p>The Service is provided "AS IS" without warranties of any kind. We do not guarantee uninterrupted or error-free operation.</p>

        <h2>7. Limitation of Liability</h2>
        <p>To the maximum extent permitted by law, KrabiClaw shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>

        <h2>8. Contact Us</h2>
        <p>For legal inquiries, contact us at <strong>legal@krabiclaw.com</strong>.</p>
      </article>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'platform'
})

const config = useRuntimeConfig()
const requestURL = useRequestURL()
const configuredSiteUrl = config.public.siteUrl
const siteOrigin = (() => {
  if (!configuredSiteUrl) return requestURL.origin

  try {
    return new URL(configuredSiteUrl).origin
  } catch {
    return requestURL.origin
  }
})()

useSeoMeta({
  title: 'Terms and Conditions | KrabiClaw',
  description: 'Terms and Conditions for KrabiClaw website builder platform. Read our terms of service for using our SaaS platform.',
  ogTitle: 'Terms and Conditions | KrabiClaw',
  ogDescription: 'Our terms of service for the website builder platform.',
  ogImage: `${siteOrigin}/og-image.png`,
  ogUrl: `${siteOrigin}/terms`,
  ogType: 'website',
  twitterCard: 'summary',
  twitterTitle: 'Terms and Conditions - KrabiClaw',
  twitterDescription: 'Terms of service for our website builder platform.',
  twitterImage: `${siteOrigin}/og-image.png`
})
</script>
<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-4xl font-bold text-default mb-6">Privacy Policy</h1>
      <p class="text-lg text-muted mb-12">How we protect your data</p>

      <article class="prose prose-lg max-w-none text-default">
        <p><strong>Effective Date:</strong> October 21, 2024</p>

        <p>This Privacy Policy describes how KrabiClaw ("we," "our," or "us") collects, uses, and shares your information when you use our website builder platform.</p>

        <h2>1. Information We Collect</h2>
        <ul>
            <li><strong>Account Data:</strong> Name, email address, and authentication credentials.</li>
            <li><strong>Service Data:</strong> Content and data you upload to build your websites.</li>
            <li><strong>Payment Data:</strong> Processed securely by our payment provider (Stripe). We do not store full credit card details.</li>
            <li><strong>Usage Data:</strong> IP addresses, browser types, and interaction metrics to improve our service.</li>
            <li><strong>Cookies:</strong> Essential cookies for authentication and platform functionality.</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>We use your data solely to provide, maintain, and improve our services, process payments, and communicate with you regarding your account.</p>

        <h2>3. Information Sharing</h2>
        <p>We do not sell your personal data. We share information only with essential third-party service providers (e.g., hosting, analytics, and payment processors) or when required by law.</p>

        <h2>4. Your Rights</h2>
        <p>You may request to access, update, or delete your personal information by contacting us. We comply with applicable data protection laws (e.g., GDPR, CCPA).</p>

        <h2>5. Contact Us</h2>
        <p>For privacy inquiries, please contact us at <strong>privacy@krabiclaw.com</strong>.</p>
      </article>
    </div>
  </div>
</template>

<script setup>

definePageMeta({
  layout: 'platform'
})

const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

useSeoMeta({
  title: 'Privacy Policy | KrabiClaw',
  description: 'Privacy Policy for KrabiClaw website builder platform. Learn how we collect, use, and protect your personal information.',
  ogTitle: 'Privacy Policy | KrabiClaw',
  ogDescription: 'Our commitment to protecting your privacy and personal data.',
  ogImage: `${siteUrl}/og-image.png`,
  ogUrl: `${siteUrl}/privacy`,
  ogType: 'website',
  twitterCard: 'summary',
  twitterTitle: 'Privacy Policy - KrabiClaw',
  twitterDescription: 'How we protect your privacy and personal information.',
  twitterImage: `${siteUrl}/og-image.png`
})
</script>
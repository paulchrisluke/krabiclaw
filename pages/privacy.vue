<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-4xl font-bold text-(--ui-text) mb-6">Privacy Policy</h1>
      <p class="text-lg text-(--ui-text-muted) mb-12">How we protect your data</p>

      <article class="prose prose-lg max-w-none text-(--ui-text)">
        <p><strong>Effective Date:</strong> October 21, 2024</p>

        <p>At <strong>KrabiClaw</strong>, your privacy is our priority. This Privacy Policy explains how we collect, use, disclose, and protect your personal information when you interact with our website builder platform and services.</p>

        <h2>1. Information We Collect</h2>
        <p>We may collect the following types of information:</p>

        <h3>A. Personal Information:</h3>
        <ul>
            <li>Name and email address</li>
            <li>Account credentials</li>
            <li>Organization and site information</li>
            <li>Payment information (processed through secure payment providers)</li>
        </ul>

        <h3>B. Non-Personal Information:</h3>
        <ul>
            <li>IP address</li>
            <li>Device type and browser</li>
            <li>Usage data (e.g., page visits, interaction patterns)</li>
            <li>Cookies and tracking data</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul>
            <li>Provide and maintain our website builder platform</li>
            <li>Process account registrations and subscriptions</li>
            <li>Communicate service updates and support</li>
            <li>Improve our platform and enhance user experience</li>
            <li>Analyze trends and platform performance</li>
            <li>Ensure compliance with legal obligations</li>
        </ul>

        <h2>3. How We Share Your Information</h2>
        <p>We do not sell your personal information. We may share information with:</p>
        <ul>
            <li>Third-party service providers (e.g., hosting providers, analytics providers)</li>
            <li>Legal authorities if required by law or to protect the rights, safety, or property of KrabiClaw.</li>
        </ul>

        <h2>4. Your Rights and Choices</h2>
        <p>You have the following rights under GDPR and CCPA:</p>
        <ul>
            <li><strong>Data Portability:</strong> Request a copy of your personal data in a structured, machine-readable format.</li>
            <li><strong>Right to Erasure (Right to be Forgotten):</strong> Request deletion of your personal data, subject to legal and business retention requirements.</li>
            <li><strong>Right to Restrict Processing:</strong> Limit how we use your personal data in certain circumstances.</li>
            <li><strong>Right to Object:</strong> Object to processing of your personal data for direct marketing or other legitimate interests.</li>
        </ul>
        <p><strong>How to Exercise Your Rights:</strong> To exercise any of these rights, email us at privacy@krabiclaw.com with your request and verification details. We will respond within 30 days of receiving your request. For data portability requests, we will provide your data in a commonly used format (JSON or CSV).</p>
        <p><strong>Data Retention:</strong> We retain your personal data only as long as necessary to provide our services, comply with legal obligations, resolve disputes, and enforce our agreements. Account data is retained for 3 years after account closure, and payment records are retained for 7 years as required by tax regulations.</p>

        <h2>5. Security of Your Information</h2>
        <p>We implement industry-standard security measures to protect your information from unauthorized access, loss, or misuse.</p>

        <h2>6. Contact Us</h2>
        <p>If you have any questions or concerns about this Privacy Policy, please contact us at:</p>
        <p><strong>KrabiClaw</strong><br>
            Email: privacy@krabiclaw.com <br>
        </p>
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
  ogImage: `${siteUrl}/og-image.jpg`,
  ogUrl: `${siteUrl}/privacy`,
  ogType: 'website',
  twitterCard: 'summary',
  twitterTitle: 'Privacy Policy - KrabiClaw',
  twitterDescription: 'How we protect your privacy and personal information.',
  twitterImage: `${siteUrl}/og-image.jpg`
})
</script>
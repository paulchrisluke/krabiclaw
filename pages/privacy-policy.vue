<template>
  <div>
    <SayaHero
      title="Privacy Policy"
      subtitle="How we protect your data"
      size="compact"
    />
    <article class="mx-auto prose lg:prose-xl py-12 px-8">
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
      <p>You have the right to access, correct, or delete your personal information. You can manage cookies through your browser settings.</p>

      <h2>5. Security of Your Information</h2>
      <p>We implement industry-standard security measures to protect your information from unauthorized access, loss, or misuse.</p>

      <h2>6. Contact Us</h2>
      <p>If you have any questions or concerns about this Privacy Policy, please contact us at:</p>
      <p><strong>KrabiClaw</strong><br>
          Email: privacy@krabiclaw.com <br>
      </p>
    </article>
  </div>
</template>

<script setup>

definePageMeta({
  layout: 'platform'
})

useSeoMeta({
  title: 'Privacy Policy | KrabiClaw',
  description: 'Privacy Policy for KrabiClaw website builder platform. Learn how we collect, use, and protect your personal information.',
  ogTitle: 'Privacy Policy | KrabiClaw',
  ogDescription: 'Our commitment to protecting your privacy and personal data.',
  ogImage: '/og-image.jpg',
  ogUrl: '/privacy-policy',
  ogType: 'website',
  twitterCard: 'summary',
  twitterTitle: 'Privacy Policy - KrabiClaw',
  twitterDescription: 'How we protect your privacy and personal information.',
  twitterImage: '/og-image.jpg'
})
</script>
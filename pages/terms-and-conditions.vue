<template>
  <div>
    <SayaHero
      title="Terms and Conditions"
      subtitle="Our agreement with you"
      size="compact"
    />
    <article class="mx-auto prose lg:prose-xl py-12 px-8">
      <p><strong>Effective Date:</strong> October 21, 2024</p>

      <p>Welcome to <strong>KrabiClaw</strong>. By accessing or using our website builder platform and services, you agree to be bound by the following terms and conditions. Please read them carefully.</p>

      <h2>1. Use of Our Services</h2>
      <ul>
          <li>You must be at least 18 years old or have permission from a legal guardian to use our services.</li>
          <li>You agree to use our website builder platform only for lawful purposes.</li>
          <li>We reserve the right to refuse service to anyone for any reason at any time.</li>
      </ul>

      <h2>2. Account Responsibilities</h2>
      <ul>
          <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
          <li>You are responsible for all activities that occur under your account.</li>
          <li>You must notify us immediately of any unauthorized use of your account.</li>
      </ul>

      <h2>3. Intellectual Property</h2>
      <ul>
          <li>All content on this website, including text, graphics, logos, and images, is the property of KrabiClaw or its licensors.</li>
          <li>You may not reproduce, distribute, or use any content without express permission.</li>
          <li>You retain ownership of content you create using our platform.</li>
      </ul>

      <h2>4. Limitation of Liability</h2>
      <p>KrabiClaw will not be held liable for any indirect, incidental, or consequential damages resulting from the use of our services.</p>

      <h2>5. Governing Law</h2>
      <p>These Terms and Conditions are governed by and construed in accordance with the laws of Thailand.</p>

      <h2>6. Contact Us</h2>
      <p>If you have any questions about these Terms and Conditions, please contact us at:</p>
      <p><strong>KrabiClaw</strong><br>
          Email: legal@krabiclaw.com <br>
      </p>
    </article>
  </div>
</template>

<script setup>

definePageMeta({
  layout: 'platform'
})

useSeoMeta({
  title: 'Terms and Conditions | KrabiClaw',
  description: 'Terms and Conditions for KrabiClaw website builder platform. Read our terms of service for using our SaaS platform.',
  ogTitle: 'Terms and Conditions | KrabiClaw',
  ogDescription: 'Our terms of service for the website builder platform.',
  ogImage: '/og-image.jpg',
  ogUrl: '/terms-and-conditions',
  ogType: 'website',
  twitterCard: 'summary',
  twitterTitle: 'Terms and Conditions - KrabiClaw',
  twitterDescription: 'Terms of service for our website builder platform.',
  twitterImage: '/og-image.jpg'
})
</script>
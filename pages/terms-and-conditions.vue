<template>
  <div>
    <AppHero
      title="Terms and Conditions"
      subtitle="Our agreement with you"
      size="compact"
    />
    <article class="mx-auto prose lg:prose-xl py-12 px-8">
      <p><strong>Effective Date:</strong> October 21, 2024</p>

      <p>Welcome to <strong>Take Me Away by KIKUZUKI</strong>. By accessing or using our website or services, you agree to be bound by the following terms and conditions. Please read them carefully.</p>

      <h2>1. Use of Our Services</h2>
      <ul>
          <li>You must be at least 18 years old or have permission from a legal guardian to use our services.</li>
          <li>You agree to use our website and services only for lawful purposes.</li>
          <li>We reserve the right to refuse service to anyone for any reason at any time.</li>
      </ul>

      <h2>2. Reservations</h2>
      <ul>
          <li>All reservations are subject to availability.</li>
          <li>We reserve the right to cancel or adjust reservations if necessary.</li>
          <li>Please arrive on time. Reservations are held for 15 minutes.</li>
      </ul>

      <h2>3. Intellectual Property</h2>
      <ul>
          <li>All content on this website, including text, graphics, logos, and images, is the property of Take Me Away by KIKUZUKI or its licensors.</li>
          <li>You may not reproduce, distribute, or use any content without express permission.</li>
      </ul>

      <h2>4. Limitation of Liability</h2>
      <p>Take Me Away by KIKUZUKI will not be held liable for any indirect, incidental, or consequential damages resulting from the use of our services.</p>

      <h2>5. Governing Law</h2>
      <p>These Terms and Conditions are governed by and construed in accordance with the laws of Thailand.</p>

      <h2>6. Contact Us</h2>
      <p>If you have any questions about these Terms and Conditions, please contact us at:</p>
      <p><strong>Take Me Away by KIKUZUKI</strong><br>
          117, Nong Thale, Krabi, 81000, Thailand<br>
          Email: info@kikuzuki-thailand.com <br>
      </p>
    </article>
  </div>
</template>

<script setup>
import AppHero from '~/components/ui/AppHero.vue'

useSeoMeta({
  title: 'Terms and Conditions | Take Me Away by KIKUZUKI',
  description: 'Terms and Conditions for Take Me Away by KIKUZUKI. Read our terms of service for dining and using our website.',
  ogTitle: 'Terms and Conditions | Take Me Away by KIKUZUKI',
  ogDescription: 'Our terms of service for dining and online interaction.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/terms-and-conditions',
  ogType: 'website',
  twitterCard: 'summary',
  twitterTitle: 'Terms and Conditions - Take Me Away by KIKUZUKI',
  twitterDescription: 'Terms of service for our Japanese restaurant.',
  twitterImage: '/og-image.jpg'
})
</script>
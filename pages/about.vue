<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-4xl font-bold text-(--ui-text) mb-6">About KrabiClaw</h1>
      <p class="text-lg text-(--ui-text-muted) mb-12">The Shopify for restaurants, built in Krabi, Thailand</p>

      <article class="prose prose-lg max-w-none text-(--ui-text)">
        <p>KrabiClaw is an AI-powered restaurant website builder that helps restaurants create beautiful, professional websites in minutes. Our platform is designed specifically for the restaurant industry, with features tailored to help you attract more customers and grow your business.</p>

        <h2>Our Mission</h2>
        <p>To democratize restaurant technology and make it easy for every restaurant to have a stunning online presence that drives real business results.</p>

        <h2>Why KrabiClaw?</h2>
        <ul>
          <li><strong>AI-Powered:</strong> Our AI helps you generate content, menus, and marketing materials</li>
          <li><strong>Restaurant-Focused:</strong> Built specifically for restaurants, not generic websites</li>
          <li><strong>Fast Setup:</strong> Get your website live in minutes, not days</li>
          <li><strong>Beautiful Themes:</strong> Professional, conversion-optimized themes designed for restaurants</li>
          <li><strong>Integrated Tools:</strong> Menu management, reservations, and more in one platform</li>
        </ul>

        <h2>Our Story</h2>
        <p>KrabiClaw was born in Krabi, Thailand, a beautiful coastal province known for its incredible seafood and vibrant restaurant scene. We saw how challenging it was for local restaurants to establish a strong online presence, and we set out to change that.</p>

        <p>Today, we're helping restaurants around the world build their digital presence and connect with more customers online.</p>

        <h2>Contact Us</h2>
        <p>Have questions? We'd love to hear from you.</p>
        <p><strong>Email:</strong> hello@krabiclaw.com<br>
        <strong>Location:</strong> Krabi, Thailand 🦀</p>
      </article>
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
  { name: 'About', url: `${siteUrl}/about` }
])

useSeoMeta({
  title: 'About | KrabiClaw',
  description: 'Learn about KrabiClaw - the AI-powered restaurant website builder built in Krabi, Thailand.',
  ogImage: '/og-image.jpg',
  ogUrl: '/about'
})
</script>

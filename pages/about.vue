<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-3xl mx-auto">

      <!-- Hero -->
      <div class="mb-16">
        <h1 class="text-4xl font-bold text-(--ui-text) mb-4">About KrabiClaw</h1>
        <p class="text-xl text-(--ui-text-muted)">
          A restaurant website builder born in Krabi, Thailand — built by someone who's spent 15 years helping
          businesses get found online, and got tired of watching great restaurants stay invisible.
        </p>
      </div>

      <!-- Story -->
      <article class="prose prose-lg max-w-none text-(--ui-text) space-y-8">

        <section>
          <h2 class="text-2xl font-bold text-(--ui-text) mb-4">The Problem We Kept Seeing</h2>
          <p class="text-(--ui-text-muted)">
            The best meal I had in Krabi in 2024 was at a tiny robatayaki restaurant tucked behind a mango farm.
            No website. A blurry photo on Google Maps. Reviews that said "great food" but no address, no hours,
            no menu. Half the tables were empty every night.
          </p>
          <p class="text-(--ui-text-muted)">
            That restaurant was KIKUZUKI — and it became the first site built on what is now KrabiClaw.
          </p>
        </section>

        <section>
          <h2 class="text-2xl font-bold text-(--ui-text) mb-4">Who Built This</h2>
          <p class="text-(--ui-text-muted)">
            I'm Paul Chris Luke — half Chinese, half American, originally from Chattanooga, Tennessee. I've spent
            over 15 years in eCommerce, conversion rate optimization, and digital marketing. I'm a Google Certified
            CRO specialist, a Shopify Plus partner, and I've managed millions of dollars in ad spend across Google
            and Meta.
          </p>
          <p class="text-(--ui-text-muted)">
            A few years ago I moved to Southeast Asia — not for the lifestyle arbitrage that word implies, but
            because I wanted my work to matter in places where a single well-built website can be the difference
            between a family business surviving or not. I run
            <a href="https://whynotearth.com" class="underline hover:no-underline" target="_blank" rel="noopener">Why Not Earth</a>,
            a marketing agency that charges commercial clients for high-quality work and uses that revenue to
            provide the same services free to nonprofits working on trafficking prevention, job creation, and
            rural internet access in Cambodia and Thailand.
          </p>
          <p class="text-(--ui-text-muted)">
            KrabiClaw is a product of that same philosophy: use technical skill to close a gap that the market
            isn't closing on its own.
          </p>
        </section>

        <section>
          <h2 class="text-2xl font-bold text-(--ui-text) mb-4">Why Not Just Use Squarespace?</h2>
          <p class="text-(--ui-text-muted)">
            We tried. Generic website builders don't understand restaurants. They don't know what a menu section
            is, they don't sync to Google Business Profile, they don't handle multiple locations under one brand,
            and they're built for an English-speaking small business owner in San Francisco — not a Thai restaurant
            owner in Krabi who needs the site in Thai and English and wants customers to see accurate hours without
            logging into three different systems.
          </p>
          <p class="text-(--ui-text-muted)">
            KrabiClaw is built specifically for restaurants. Every feature — the menu builder, the Google Business
            sync, the AI menu extraction, the draft/publish workflow — came from a real problem we hit building
            real restaurant sites.
          </p>
        </section>

        <section>
          <h2 class="text-2xl font-bold text-(--ui-text) mb-4">What We're Building Toward</h2>
          <p class="text-(--ui-text-muted)">
            Right now KrabiClaw serves restaurants in Krabi and across Southeast Asia. The goal is to be the
            simplest, most complete restaurant website platform in the region — one where a restaurant owner
            can go from signup to a live, SEO-optimized, Google-connected website in under 15 minutes, without
            touching a line of code or paying a web designer.
          </p>
          <p class="text-(--ui-text-muted)">
            We're also open source where we can be. Democratizing access to restaurant technology isn't just a
            tagline — it's how we make decisions about what to build and what to charge.
          </p>
        </section>

        <section>
          <h2 class="text-2xl font-bold text-(--ui-text) mb-4">Get in Touch</h2>
          <p class="text-(--ui-text-muted)">
            Questions, partnership ideas, or just want to talk restaurants and technology — we'd love to hear
            from you.
          </p>
          <div class="not-prose flex flex-col sm:flex-row gap-4 mt-6">
            <UButton to="/contact" color="primary" size="lg">Contact Us</UButton>
            <UButton
              href="https://x.com/paulchrisluke"
              target="_blank"
              rel="noopener"
              variant="outline"
              color="neutral"
              size="lg"
            >
              Follow on X
            </UButton>
          </div>
        </section>

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
  description: 'KrabiClaw is an AI-powered restaurant website builder built in Krabi, Thailand by Paul Chris Luke — eCommerce veteran and founder of Why Not Earth.',
  ogImage: '/og-image.jpg',
  ogUrl: `${siteUrl}/about`
})
</script>

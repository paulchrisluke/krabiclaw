<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-4xl font-bold text-(--ui-text) mb-6">Help Center</h1>
      <p class="text-lg text-(--ui-text-muted) mb-12">Find answers to common questions about KrabiClaw</p>

      <div class="mb-8">
        <UInput v-model="searchQuery" placeholder="Search for help articles..." size="lg" icon="i-heroicons-magnifying-glass" />
      </div>

      <div class="grid md:grid-cols-3 gap-6 mb-12">
        <UCard
          class="hover:shadow-md transition-shadow cursor-pointer"
          tabindex="0"
          role="button"
          :aria-label="'Getting Started help articles'"
          @click="navigateToCategory('Getting Started')"
          @keydown="(e) => handleCardKeydown(e, 'Getting Started')"
        >
          <div class="text-4xl mb-4">🚀</div>
          <h3 class="text-xl font-bold text-(--ui-text) mb-2">Getting Started</h3>
          <p class="text-(--ui-text-muted) mb-4">Learn how to set up your restaurant website</p>
          <UButton variant="outline" color="neutral" size="sm">View Articles</UButton>
        </UCard>

        <UCard
          class="hover:shadow-md transition-shadow cursor-pointer"
          tabindex="0"
          role="button"
          :aria-label="'Menu Management help articles'"
          @click="navigateToCategory('Menu Management')"
          @keydown="(e) => handleCardKeydown(e, 'Menu Management')"
        >
          <div class="text-4xl mb-4">📝</div>
          <h3 class="text-xl font-bold text-(--ui-text) mb-2">Menu Management</h3>
          <p class="text-(--ui-text-muted) mb-4">Add and manage your restaurant menu</p>
          <UButton variant="outline" color="neutral" size="sm">View Articles</UButton>
        </UCard>

        <UCard
          class="hover:shadow-md transition-shadow cursor-pointer"
          tabindex="0"
          role="button"
          :aria-label="'Theme Customization help articles'"
          @click="navigateToCategory('Theme Customization')"
          @keydown="(e) => handleCardKeydown(e, 'Theme Customization')"
        >
          <div class="text-4xl mb-4">🎨</div>
          <h3 class="text-xl font-bold text-(--ui-text) mb-2">Theme Customization</h3>
          <p class="text-(--ui-text-muted) mb-4">Customize colors, fonts, and layout</p>
          <UButton variant="outline" color="neutral" size="sm">View Articles</UButton>
        </UCard>
      </div>

      <div class="mb-12">
        <h2 class="text-2xl font-bold text-(--ui-text) mb-6">Popular Articles</h2>
        <div class="space-y-4">
          <UCard
            class="hover:shadow-md transition-shadow cursor-pointer"
            tabindex="0"
            role="button"
            :aria-label="'How to create my first website article'"
            @click="navigateToArticle('How to create my first website?')"
            @keydown="(e) => handleArticleKeydown(e, 'How to create my first website?')"
          >
            <h3 class="font-semibold text-(--ui-text) mb-1">How to create my first website?</h3>
            <p class="text-sm text-(--ui-text-muted)">Step-by-step guide to getting started with KrabiClaw</p>
          </UCard>
          <UCard
            class="hover:shadow-md transition-shadow cursor-pointer"
            tabindex="0"
            role="button"
            :aria-label="'How to add menu items article'"
            @click="navigateToArticle('How to add menu items?')"
            @keydown="(e) => handleArticleKeydown(e, 'How to add menu items?')"
          >
            <h3 class="font-semibold text-(--ui-text) mb-1">How to add menu items?</h3>
            <p class="text-sm text-(--ui-text-muted)">Learn to add, edit, and organize your menu</p>
          </UCard>
          <UCard
            class="hover:shadow-md transition-shadow cursor-pointer"
            tabindex="0"
            role="button"
            :aria-label="'How to connect my domain article'"
            @click="navigateToArticle('How to connect my domain?')"
            @keydown="(e) => handleArticleKeydown(e, 'How to connect my domain?')"
          >
            <h3 class="font-semibold text-(--ui-text) mb-1">How to connect my domain?</h3>
            <p class="text-sm text-(--ui-text-muted)">Setup your custom domain for your restaurant</p>
          </UCard>
        </div>
      </div>

      <div class="mt-12 text-center">
        <p class="text-(--ui-text-muted) mb-4">Still need help?</p>
        <UButton color="primary" to="/contact">Contact Support</UButton>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'platform' })

import { useBreadcrumbSchema } from '~/composables/useSchemaOrg'

const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

useBreadcrumbSchema([
  { name: 'Home', url: `${siteUrl}/` },
  { name: 'Help Center', url: `${siteUrl}/help` }
])

const searchQuery = ref('')

function navigateToCategory(category) {
  navigateTo(`/help/category/${category.toLowerCase()}`)
}

function handleCardKeydown(event, category) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    navigateToCategory(category)
  }
}

function navigateToArticle(article) {
  navigateTo(`/help/article/${article.toLowerCase().replace(/\?/g, '').replace(/\s+/g, '-')}`)
}

function handleArticleKeydown(event, article) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    navigateToArticle(article)
  }
}

useSeoMeta({
  title: 'Help Center | KrabiClaw',
  description: 'Help center for KrabiClaw restaurant website builder. Find answers to common questions.',
  ogImage: `${siteUrl}/og-image.jpg`,
  ogUrl: `${siteUrl}/help`
})
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg-muted)">
    <div class="container mx-auto px-4 py-16">
      <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="text-center mb-16">
          <h1 class="text-5xl font-bold text-(--ui-text-highlighted) mb-6">Restaurant Blog</h1>
          <p class="text-xl text-(--ui-text-muted) max-w-2xl mx-auto">
            Tips, insights, and stories to help your restaurant thrive in the digital age.
          </p>
        </div>

        <!-- Featured Post -->
        <div class="bg-(--ui-bg) rounded-2xl shadow-lg overflow-hidden mb-12">
          <div class="h-64 bg-linear-to-br from-stone-100 to-stone-200"></div>
          <div class="p-8">
            <div class="flex items-center gap-4 mb-4">
              <span class="bg-black text-white px-3 py-1 rounded-full text-sm font-medium">Featured</span>
              <span class="text-stone-500 text-sm">May 7, 2026</span>
            </div>
            <h2 class="text-3xl font-bold text-(--ui-text-highlighted) mb-4">
              How to Optimize Your Restaurant Website for Google Search
            </h2>
            <p class="text-(--ui-text-muted) mb-6 text-lg">
              Learn the essential SEO strategies that will help your restaurant rank higher in local search results 
              and attract more customers online.
            </p>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-stone-300 rounded-full"></div>
                <div>
                  <p class="font-semibold text-(--ui-text-highlighted)">KrabiClaw Team</p>
                  <p class="text-stone-500 text-sm">5 min read</p>
                </div>
              </div>
              <UButton variant="outline" color="neutral">Read More</UButton>
            </div>
          </div>
        </div>

        <!-- Recent Posts -->
        <div class="mb-12">
          <h2 class="text-3xl font-bold text-(--ui-text-highlighted) mb-8">Recent Posts</h2>
          <div class="grid md:grid-cols-2 gap-8">
            <!-- Post 1 -->
            <div class="bg-(--ui-bg) rounded-xl shadow-sm border border-(--ui-border) overflow-hidden">
              <div class="h-48 bg-linear-to-br from-amber-50 to-amber-100"></div>
              <div class="p-6">
                <div class="flex items-center gap-3 mb-3">
                  <span class="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-medium">Marketing</span>
                  <span class="text-stone-500 text-sm">May 5, 2026</span>
                </div>
                <h3 class="text-xl font-bold text-(--ui-text-highlighted) mb-3">
                  5 Ways to Use Instagram to Promote Your Restaurant
                </h3>
                <p class="text-(--ui-text-muted) mb-4">
                  Discover proven Instagram strategies that restaurants use to attract customers and build brand awareness.
                </p>
                <UButton variant="ghost" color="neutral" class="p-0 h-auto font-semibold">Read More →</UButton>
              </div>
            </div>

            <!-- Post 2 -->
            <div class="bg-(--ui-bg) rounded-xl shadow-sm border border-(--ui-border) overflow-hidden">
              <div class="h-48 bg-linear-to-br from-emerald-50 to-emerald-100"></div>
              <div class="p-6">
                <div class="flex items-center gap-3 mb-3">
                  <span class="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-medium">Technology</span>
                  <span class="text-stone-500 text-sm">May 3, 2026</span>
                </div>
                <h3 class="text-xl font-bold text-(--ui-text-highlighted) mb-3">
                  The Future of Restaurant Websites: AI and Automation
                </h3>
                <p class="text-(--ui-text-muted) mb-4">
                  Explore how artificial intelligence is revolutionizing the way restaurants manage their online presence.
                </p>
                <UButton variant="ghost" color="neutral" class="p-0 h-auto font-semibold">Read More →</UButton>
              </div>
            </div>

            <!-- Post 3 -->
            <div class="bg-(--ui-bg) rounded-xl shadow-sm border border-(--ui-border) overflow-hidden">
              <div class="h-48 bg-linear-to-br from-indigo-50 to-indigo-100"></div>
              <div class="p-6">
                <div class="flex items-center gap-3 mb-3">
                  <span class="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs font-medium">Design</span>
                  <span class="text-stone-500 text-sm">May 1, 2026</span>
                </div>
                <h3 class="text-xl font-bold text-(--ui-text-highlighted) mb-3">
                  Essential Elements of a High-Converting Restaurant Menu Page
                </h3>
                <p class="text-(--ui-text-muted) mb-4">
                  Learn how to design a menu page that not only looks great but also drives more orders.
                </p>
                <UButton variant="ghost" color="neutral" class="p-0 h-auto font-semibold">Read More →</UButton>
              </div>
            </div>

            <!-- Post 4 -->
            <div class="bg-(--ui-bg) rounded-xl shadow-sm border border-(--ui-border) overflow-hidden">
              <div class="h-48 bg-linear-to-br from-rose-50 to-rose-100"></div>
              <div class="p-6">
                <div class="flex items-center gap-3 mb-3">
                  <span class="bg-rose-100 text-rose-800 px-2 py-1 rounded text-xs font-medium">Business</span>
                  <span class="text-stone-500 text-sm">April 28, 2026</span>
                </div>
                <h3 class="text-xl font-bold text-(--ui-text-highlighted) mb-3">
                  Customer Reviews: How to Get More and Manage Them Effectively
                </h3>
                <p class="text-(--ui-text-muted) mb-4">
                  A complete guide to generating positive reviews and handling customer feedback professionally.
                </p>
                <UButton variant="ghost" color="neutral" class="p-0 h-auto font-semibold">Read More →</UButton>
              </div>
            </div>
          </div>
        </div>

        <!-- Newsletter Signup -->
        <div class="bg-black text-white rounded-2xl p-8 text-center">
          <h2 class="text-3xl font-bold mb-4">Stay Updated</h2>
          <p class="text-stone-300 mb-6 max-w-2xl mx-auto">
            Get the latest restaurant marketing tips and industry insights delivered to your inbox.
          </p>
          <div class="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
            <input
              id="newsletter-email"
              type="email"
              placeholder="Enter your email"
              class="flex-1 px-4 py-3 rounded-lg text-(--ui-text-highlighted)"
              aria-label="Enter your email for the newsletter"
            >
            <UButton color="neutral" variant="outline">Subscribe</UButton>
          </div>
        </div>

        <!-- Categories -->
        <div class="mt-16">
          <h2 class="text-2xl font-bold text-(--ui-text-highlighted) mb-8">Browse by Category</h2>
          <div class="flex flex-wrap gap-3">
            <UButton variant="outline" color="neutral">Marketing</UButton>
            <UButton variant="outline" color="neutral">Technology</UButton>
            <UButton variant="outline" color="neutral">Design</UButton>
            <UButton variant="outline" color="neutral">Business</UButton>
            <UButton variant="outline" color="neutral">SEO</UButton>
            <UButton variant="outline" color="neutral">Social Media</UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
useSeoMeta({
  title: 'Blog | KrabiClaw',
  description: 'Restaurant marketing tips, industry insights, and strategies to help your restaurant succeed online.'
})
</script>

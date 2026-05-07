<template>
  <div class="min-h-screen bg-stone-50">
    <div class="container mx-auto px-4 py-16">
      <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <div class="text-center mb-16">
          <h1 class="text-5xl font-bold text-stone-900 mb-6">Beautiful Restaurant Themes</h1>
          <p class="text-xl text-stone-600 max-w-3xl mx-auto">
            Professional, conversion-optimized themes designed specifically for restaurants. 
            Each theme is fully responsive and SEO-ready.
          </p>
        </div>

        <!-- Featured Theme -->
        <div class="mb-16">
          <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div class="md:flex">
              <div class="md:w-1/2">
                <div class="h-96 bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center">
                  <div class="text-center">
                    <div class="w-24 h-24 bg-black rounded-2xl mx-auto mb-4 flex items-center justify-center">
                      <span class="text-white text-3xl font-bold">S</span>
                    </div>
                    <h3 class="text-2xl font-bold text-stone-900">Saya Theme</h3>
                    <p class="text-stone-600 mt-2">Elegant & Minimal</p>
                  </div>
                </div>
              </div>
              <div class="md:w-1/2 p-8">
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-3xl font-bold text-stone-900">Saya</h2>
                  <span class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">Included</span>
                </div>
                <p class="text-stone-600 mb-6">
                  Our flagship theme designed for modern restaurants. Features clean typography, 
                  elegant layouts, and seamless integration with Google Business data.
                </p>
                <div class="space-y-3 mb-8">
                  <div class="flex items-center">
                    <svg class="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span class="text-stone-700">Mobile-first responsive design</span>
                  </div>
                  <div class="flex items-center">
                    <svg class="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span class="text-stone-700">Google Business integration</span>
                  </div>
                  <div class="flex items-center">
                    <svg class="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span class="text-stone-700">Visual content editor</span>
                  </div>
                  <div class="flex items-center">
                    <svg class="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span class="text-stone-700">SEO optimized</span>
                  </div>
                </div>
                <UButton color="neutral" size="lg" class="bg-black text-white hover:bg-stone-800">
                  Use Saya Theme
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <!-- Coming Soon Themes -->
        <div>
          <h2 class="text-3xl font-bold text-stone-900 text-center mb-12">Coming Soon</h2>
          <div class="grid md:grid-cols-3 gap-8">
            <!-- Theme 2 -->
            <div class="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
              <div class="h-48 bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center">
                <div class="text-center">
                  <div class="w-16 h-16 bg-amber-600 rounded-xl mx-auto mb-2 flex items-center justify-center">
                    <span class="text-white text-2xl font-bold">M</span>
                  </div>
                  <h3 class="text-lg font-bold text-stone-900">Modern</h3>
                </div>
              </div>
              <div class="p-6">
                <h3 class="text-xl font-bold text-stone-900 mb-2">Modern Theme</h3>
                <p class="text-stone-600 mb-4">
                  Bold design with vibrant colors and dynamic layouts perfect for contemporary restaurants.
                </p>
                <div class="flex items-center justify-between">
                  <span class="text-stone-500 text-sm">Coming Q2 2026</span>
                  <UButton variant="outline" size="sm" disabled>Notify Me</UButton>
                </div>
              </div>
            </div>

            <!-- Theme 3 -->
            <div class="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
              <div class="h-48 bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center">
                <div class="text-center">
                  <div class="w-16 h-16 bg-emerald-600 rounded-xl mx-auto mb-2 flex items-center justify-center">
                    <span class="text-white text-2xl font-bold">R</span>
                  </div>
                  <h3 class="text-lg font-bold text-stone-900">Rustic</h3>
                </div>
              </div>
              <div class="p-6">
                <h3 class="text-xl font-bold text-stone-900 mb-2">Rustic Theme</h3>
                <p class="text-stone-600 mb-4">
                  Warm, traditional design perfect for farm-to-table and family-style restaurants.
                </p>
                <div class="flex items-center justify-between">
                  <span class="text-stone-500 text-sm">Coming Q3 2026</span>
                  <UButton variant="outline" size="sm" disabled>Notify Me</UButton>
                </div>
              </div>
            </div>

            <!-- Theme 4 -->
            <div class="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
              <div class="h-48 bg-gradient-to-br from-indigo-50 to-indigo-100 flex items-center justify-center">
                <div class="text-center">
                  <div class="w-16 h-16 bg-indigo-600 rounded-xl mx-auto mb-2 flex items-center justify-center">
                    <span class="text-white text-2xl font-bold">F</span>
                  </div>
                  <h3 class="text-lg font-bold text-stone-900">Fusion</h3>
                </div>
              </div>
              <div class="p-6">
                <h3 class="text-xl font-bold text-stone-900 mb-2">Fusion Theme</h3>
                <p class="text-stone-600 mb-4">
                  Contemporary design blending Eastern and Western aesthetics for fusion cuisine.
                </p>
                <div class="flex items-center justify-between">
                  <span class="text-stone-500 text-sm">Coming Q4 2026</span>
                  <UButton variant="outline" size="sm" disabled>Notify Me</UButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Features -->
        <div class="mt-20 bg-white rounded-2xl p-8">
          <h2 class="text-3xl font-bold text-stone-900 text-center mb-12">All Themes Include</h2>
          <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div class="text-center">
              <div class="w-12 h-12 bg-black rounded-xl mx-auto mb-4 flex items-center justify-center">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 class="font-semibold text-stone-900 mb-2">Mobile Responsive</h3>
              <p class="text-stone-600 text-sm">Looks perfect on all devices</p>
            </div>
            <div class="text-center">
              <div class="w-12 h-12 bg-black rounded-xl mx-auto mb-4 flex items-center justify-center">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 class="font-semibold text-stone-900 mb-2">Visual Editor</h3>
              <p class="text-stone-600 text-sm">Easy drag-and-drop editing</p>
            </div>
            <div class="text-center">
              <div class="w-12 h-12 bg-black rounded-xl mx-auto mb-4 flex items-center justify-center">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </div>
              <h3 class="font-semibold text-stone-900 mb-2">SEO Optimized</h3>
              <p class="text-stone-600 text-sm">Built for search engines</p>
            </div>
            <div class="text-center">
              <div class="w-12 h-12 bg-black rounded-xl mx-auto mb-4 flex items-center justify-center">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 class="font-semibold text-stone-900 mb-2">Fast Loading</h3>
              <p class="text-stone-600 text-sm">Optimized for speed</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
useSeoMeta({
  title: 'Templates | KrabiClaw',
  description: 'Beautiful, professional restaurant themes. Mobile-responsive, SEO-optimized, and easy to customize.'
})
</script>

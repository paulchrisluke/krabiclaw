<template>
  <footer class="bg-inverted text-inverted">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">

      <!-- Main grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12 mb-12">

        <!-- Brand col -->
        <div class="col-span-2 md:col-span-1">
          <NuxtLink to="/" class="inline-flex items-center gap-2.5 mb-4 no-underline group">
            <img src="/krabi-claw-logo.png" alt="KrabiClaw" class="w-8.5 h-8.5 rounded-[9px] group-hover:rotate-12 transition-transform duration-200" />
            <span class="kc-wordmark text-[19px]">
              <span class="text-inverted">krabi</span><span class="kc-wordmark__claw">claw</span><span class="text-inverted" style="font-size: 0.55em; vertical-align: top; margin-left: 1px">.com</span>
            </span>
          </NuxtLink>
          <p class="text-[13px] leading-relaxed text-inverted/60 max-w-75">
            The ChatGPT-powered website builder for local businesses. Empowering independent businesses globally. 🦀
          </p>
        </div>

        <!-- Product -->
        <div>
          <div class="kc-eyebrow text-inverted/50 mb-4">Product</div>
          <ul class="space-y-2.5">
            <li v-for="link in productLinks" :key="link.label">
              <NuxtLink :to="link.to" class="text-[14px] text-inverted/80 hover:text-inverted transition-colors no-underline">
                {{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Company -->
        <div>
          <div class="kc-eyebrow text-inverted/50 mb-4">Company</div>
          <ul class="space-y-2.5">
            <li v-for="link in companyLinks" :key="link.label">
              <NuxtLink :to="link.to" class="text-[14px] text-inverted/80 hover:text-inverted transition-colors no-underline">
                {{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Resources -->
        <div>
          <div class="kc-eyebrow text-inverted/50 mb-4">Resources</div>
          <ul class="space-y-2.5">
            <li v-for="link in resourceLinks" :key="link.label">
              <NuxtLink :to="link.to" class="text-[14px] text-inverted/80 hover:text-inverted transition-colors no-underline">
                {{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom bar -->
      <div class="border-t border-inverted/10 pt-6 text-center text-[12px] text-inverted/50">
        &copy; {{ new Date().getFullYear() }} KrabiClaw. All rights reserved. Built for independent businesses globally.
      </div>
    </div>
  </footer>
</template>

<script setup>
const productLinks = [
  { label: 'Features', to: '/features' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Templates', to: '/templates' },
  { label: 'Changelog', to: '/changelog' },
]
const companyLinks = [
  { label: 'About', to: '/about' },
  { label: 'Blog', to: '/blog' },
  { label: 'Contact', to: '/contact' },
]
const resourceLinks = [
  { label: 'Docs', to: '/docs' },
  { label: 'Help center', to: '/help' },
  { label: 'Privacy policy', to: '/privacy' },
  { label: 'Terms', to: '/terms' }
]
</script>

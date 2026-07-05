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
          <p class="text-[13px] leading-relaxed text-inverted/60 max-w-75 mb-6">
            The ChatGPT-powered website builder for local businesses. Empowering independent businesses globally. 🦀
          </p>
          <div class="flex items-center gap-4 text-inverted/50">
            <a href="https://github.com/paulchrisluke/krabiclaw/" target="_blank" rel="noopener noreferrer" class="hover:text-inverted transition-colors">
              <span class="sr-only">GitHub</span>
              <svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            </a>
          </div>
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
]
const resourceLinks = [
  { label: 'Docs', to: '/docs' },
  { label: 'Help center', to: '/help' },
  { label: 'Privacy policy', to: '/privacy' },
  { label: 'Terms', to: '/terms' }
]
</script>

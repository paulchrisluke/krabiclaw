<template>
  <NuxtLayout name="platform">
    <div class="relative bg-default min-h-screen pb-24">
      <!-- Header Section -->
      <div class="max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-12">
        <div class="flex flex-col md:flex-row items-start md:items-center gap-6 justify-between">
          <div class="flex items-center gap-6">
            <div class="relative group shrink-0">
              <div class="absolute inset-0 rounded-[28px] blur-xl opacity-40 group-hover:opacity-60 transition-opacity duration-500" style="background: linear-gradient(135deg, var(--kc-coral), var(--kc-teal));"></div>
              <img
                src="/web-app-manifest-192x192.png"
                alt="KrabiClaw app icon"
                class="relative w-[100px] h-[100px] rounded-[28px] shadow-lg border border-default/20 transform group-hover:-translate-y-1 transition-transform duration-300 object-cover"
              >
            </div>
            <div>
              <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight text-default m-0 mb-2">
                KrabiClaw for ChatGPT
              </h1>
              <p class="text-lg text-muted m-0">
                Build, edit, and manage your restaurant website entirely through conversation
              </p>
            </div>
          </div>
          
          <div class="mt-4 md:mt-0">
            <NuxtLink
              to="/signup"
              class="inline-flex items-center justify-center gap-2 font-bold text-[15px] px-8 py-3.5 rounded-full transition-all no-underline text-white hover:opacity-90 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              style="background: var(--kc-navy);"
            >
              Connect
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Widget Mockups Gallery -->
      <div class="max-w-[1200px] mx-auto px-4 sm:px-6 mb-20">
        <!-- ChatGPT Dark Mode Background for Gallery -->
        <div class="bg-[#212121] rounded-[32px] p-6 md:p-10 shadow-2xl border border-white/5 overflow-hidden">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <!-- Mockup 1: Image Carousel Widget -->
            <div class="flex flex-col h-full bg-[#2F2F2F] rounded-2xl overflow-hidden border border-white/5">
              <div class="h-28 relative" style="background: linear-gradient(135deg, rgba(251,116,97,0.8) 0%, rgba(43,181,181,0.8) 100%);">
                <!-- Chat Prompt Bubble -->
                <div class="absolute top-6 left-1/2 -translate-x-1/2 w-11/12 max-w-[240px] bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-800 shadow-md">
                  <span class="font-bold text-[--kc-coral-600]">@KrabiClaw</span> generate hero images of a sunset beach dinner
                </div>
              </div>
              <div class="p-4 flex-1 flex flex-col justify-end relative">
                <!-- Widget UI (Simulated) -->
                <div class="bg-white rounded-xl overflow-hidden shadow-sm relative -mt-8 z-10 p-3">
                  <div class="w-full aspect-[3/2] bg-gray-100 rounded-lg overflow-hidden relative mb-3">
                    <img src="/krabi-claw-free.png" class="w-full h-full object-cover" alt="Generated preview" />
                  </div>
                  <div class="flex gap-2">
                    <div class="flex-1 h-9 rounded-md border border-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">Try again</div>
                    <div class="flex-1 h-9 rounded-md bg-[--kc-coral-600] flex items-center justify-center text-xs font-bold text-white">Use this image</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Mockup 2: Photo Upload Widget -->
            <div class="flex flex-col h-full bg-[#2F2F2F] rounded-2xl overflow-hidden border border-white/5">
              <div class="h-28 relative" style="background: linear-gradient(135deg, rgba(43,181,181,0.8) 0%, rgba(31,37,71,0.8) 100%);">
                <div class="absolute top-6 left-1/2 -translate-x-1/2 w-11/12 max-w-[240px] bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-800 shadow-md">
                  <span class="font-bold text-[--kc-teal-600]">@KrabiClaw</span> upload a new menu photo
                </div>
              </div>
              <div class="p-4 flex-1 flex flex-col justify-end relative">
                <div class="bg-white rounded-xl overflow-hidden shadow-sm relative -mt-8 z-10 p-4">
                  <div class="border-2 border-dashed border-gray-200 rounded-xl h-36 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 hover:border-[--kc-teal] hover:bg-[--kc-teal]/5 transition-colors cursor-pointer">
                    <div class="text-2xl mb-1">🖼️</div>
                    <div class="text-xs font-medium text-gray-500">Click to choose a photo</div>
                    <div class="text-[10px]">or drag and drop here</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Mockup 3: Capabilities List (Simulated Text Output) -->
            <div class="flex flex-col h-full bg-[#2F2F2F] rounded-2xl overflow-hidden border border-white/5">
              <div class="h-28 relative" style="background: linear-gradient(135deg, rgba(31,37,71,0.8) 0%, rgba(251,116,97,0.8) 100%);">
                <div class="absolute top-6 left-1/2 -translate-x-1/2 w-11/12 max-w-[240px] bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-800 shadow-md">
                  <span class="font-bold text-[--kc-navy]">@KrabiClaw</span> what can you do?
                </div>
              </div>
              <div class="p-4 flex-1 flex flex-col relative">
                <div class="bg-white rounded-xl overflow-hidden shadow-sm relative -mt-8 z-10 p-5 h-full">
                  <p class="text-xs text-gray-600 mb-3 leading-relaxed">Here are <strong>all the tools available</strong> for your restaurant:</p>
                  <ul class="text-[11px] text-gray-600 space-y-2 pl-4 list-disc marker:text-gray-300">
                    <li>Create multi-language menus</li>
                    <li>Change hero text and styling</li>
                    <li>Upload or generate photos</li>
                    <li>Publish posts to your blog</li>
                    <li>Check your GA4 visitor analytics</li>
                    <li>Map custom domain names</li>
                    <li>Generate SEO-optimized copy</li>
                  </ul>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- Description & Information Table Area -->
      <div class="max-w-4xl mx-auto px-4 sm:px-6 mb-24">
        <p class="text-default text-[15px] leading-relaxed mb-12">
          KrabiClaw for ChatGPT makes managing your restaurant or experience website simple and free for everyone. Just describe the changes you want and transform your site in seconds. Type to add menu items, translate pages, upload photos, or tweak your design. Custom UI widgets help you bring your vision to life without ever touching a dashboard. From hero images to SEO settings, manage it all just by chatting.
        </p>

        <h3 class="text-xl font-bold text-default mb-6">Information</h3>
        <div class="border border-default rounded-2xl overflow-hidden bg-elevated/50">
          <dl class="divide-y divide-default">
            <div class="px-6 py-4 grid grid-cols-3 sm:grid-cols-4 gap-4">
              <dt class="text-sm font-medium text-muted">Category</dt>
              <dd class="text-sm text-default col-span-2 sm:col-span-3">Website Builder, Productivity</dd>
            </div>
            <div class="px-6 py-4 grid grid-cols-3 sm:grid-cols-4 gap-4">
              <dt class="text-sm font-medium text-muted">Capabilities</dt>
              <dd class="text-sm text-default col-span-2 sm:col-span-3">Interactive, Writes, Reads</dd>
            </div>
            <div class="px-6 py-4 grid grid-cols-3 sm:grid-cols-4 gap-4">
              <dt class="text-sm font-medium text-muted">Developer</dt>
              <dd class="text-sm text-default col-span-2 sm:col-span-3">KrabiClaw</dd>
            </div>
            <div class="px-6 py-4 grid grid-cols-3 sm:grid-cols-4 gap-4">
              <dt class="text-sm font-medium text-muted">Website</dt>
              <dd class="text-sm text-default col-span-2 sm:col-span-3">
                <a href="https://krabiclaw.com" class="text-primary hover:underline" target="_blank" rel="noopener noreferrer">krabiclaw.com</a>
              </dd>
            </div>
            <div class="px-6 py-4 grid grid-cols-3 sm:grid-cols-4 gap-4">
              <dt class="text-sm font-medium text-muted">Version</dt>
              <dd class="text-sm text-default col-span-2 sm:col-span-3">1.0.0</dd>
            </div>
            <div class="px-6 py-4 grid grid-cols-3 sm:grid-cols-4 gap-4">
              <dt class="text-sm font-medium text-muted">Privacy Policy</dt>
              <dd class="text-sm text-default col-span-2 sm:col-span-3">
                <NuxtLink to="/privacy" class="text-primary hover:underline">View Policy</NuxtLink>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Setup Guide / How to connect -->
      <div class="max-w-4xl mx-auto px-4 sm:px-6 mb-20 pt-10 border-t border-default/50">
        <div class="mb-10 text-center">
          <h2 class="text-3xl font-extrabold text-default m-0 mb-3">How to connect</h2>
          <p class="text-muted m-0">Takes about 2 minutes. You'll need a KrabiClaw account first.</p>
          <div class="mt-4 flex flex-col items-center gap-3">
            <p class="text-sm text-muted leading-relaxed max-w-lg mx-auto">
              <strong>Beta Note:</strong> This developer setup is temporary. Once approved for the ChatGPT App Store, it will be a simple one-click install.
            </p>
            <div class="flex items-center justify-center gap-3">
              <a href="/web-app-manifest-192x192.png" download class="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline bg-primary/10 px-3 py-1.5 rounded-lg transition-colors">
                <UIcon name="i-heroicons-arrow-down-tray" class="size-4" /> Download App Icon
              </a>
              <a href="/install-krabiclaw-chatgpt-plugin.png" target="_blank" class="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline bg-primary/10 px-3 py-1.5 rounded-lg transition-colors">
                <UIcon name="i-heroicons-photo" class="size-4" /> View Setup Screenshot
              </a>
            </div>
          </div>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <!-- Step 1 -->
          <div class="group relative flex flex-col gap-4 rounded-2xl border border-default bg-elevated p-6 hover:border-(--kc-coral)/30 transition-all duration-300">
            <div class="flex size-10 items-center justify-center rounded-xl text-white font-bold text-lg" style="background: linear-gradient(135deg, var(--kc-navy) 0%, var(--kc-navy-700) 100%);">
              1
            </div>
            <div>
              <p class="font-bold text-default text-[15px] mb-2 m-0">Enable Developer Mode</p>
              <p class="text-sm text-muted m-0 leading-relaxed">Go to <strong>ChatGPT Settings → Connectors → Advanced</strong>, enable Developer mode, and click <strong>Create an App</strong>.</p>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="group relative flex flex-col gap-4 rounded-2xl border border-default bg-elevated p-6 hover:border-(--kc-teal)/40 transition-all duration-300">
            <div class="flex size-10 items-center justify-center rounded-xl text-white font-bold text-lg" style="background: linear-gradient(135deg, var(--kc-teal) 0%, var(--kc-teal-600) 100%);">
              2
            </div>
            <div>
              <p class="font-bold text-default text-[15px] mb-2 m-0">Configure App Details</p>
              <p class="text-sm text-muted mb-3 m-0 leading-relaxed">Set Title to <strong>KrabiClaw</strong>, upload our app icon, and check the consent box. Under Authentication, select <strong>OAuth</strong> and paste this URL:</p>
              <div class="flex items-center gap-2 bg-muted/50 border border-default rounded-xl px-3 py-2 font-mono text-[12px] text-highlighted">
                <span class="truncate">https://krabiclaw.com/api/mcp</span>
                <button class="ml-auto flex items-center justify-center w-6 h-6 rounded bg-white border border-default text-muted hover:text-default transition-all cursor-pointer shadow-sm" aria-label="Copy server URL" @click="copyUrl">
                  <UIcon :name="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard'" class="size-3.5" :class="copied ? 'text-green-500' : ''" />
                </button>
              </div>
            </div>
          </div>

          <!-- Step 3 -->
          <div class="group relative flex flex-col gap-4 rounded-2xl border border-default bg-elevated p-6 hover:border-(--kc-coral)/30 transition-all duration-300">
            <div class="flex size-10 items-center justify-center rounded-xl text-white font-bold text-lg" style="background: linear-gradient(135deg, var(--kc-coral) 0%, #e0524c 100%);">
              3
            </div>
            <div>
              <p class="font-bold text-default text-[15px] mb-2 m-0">Connect & Start Chatting</p>
              <p class="text-sm text-muted m-0 leading-relaxed">Click <strong>Create</strong>, then hit <strong>Connect</strong>. Start a new chat, add the KrabiClaw app, and try asking an example prompt!</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const copied = ref(false)

async function copyUrl() {
  try {
    await navigator.clipboard.writeText('https://krabiclaw.com/api/mcp')
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (err) {
    console.error('Failed to copy text: ', err)
  }
}

useSeoMeta({
  title: 'Get the KrabiClaw App for ChatGPT',
  description: 'Add KrabiClaw to ChatGPT and manage your restaurant website entirely through conversation.',
})
</script>

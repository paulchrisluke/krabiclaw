<template>
  <header class="bg-black text-white sticky top-0 z-50">
    <div class="container mx-auto px-4">
      <nav class="flex justify-between items-center h-16">
        <!-- Logo -->
        <NuxtLink to="/" class="inline-flex items-center">
          <img src="~/assets/images/brand.svg" alt="Take Me Away by KIKUZUKI" class="h-8" />
        </NuxtLink>

        <!-- Desktop Navigation -->
        <div class="hidden md:flex items-center gap-8">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="text-white/80 hover:text-white transition-colors font-medium"
            active-class="text-white"
          >
            {{ link.label }}
          </NuxtLink>
        </div>

        <!-- Right side: language switcher + reserve CTA -->
        <div class="hidden md:flex items-center gap-4">
          <!-- Language switcher dropdown -->
          <div class="relative" @click.stop>
            <button
              @click="languageDropdownOpen = !languageDropdownOpen"
              class="flex items-center gap-2 text-xs font-medium text-white/80 hover:text-white transition-colors px-2 py-1 rounded"
            >
              <span>{{ getCurrentLocaleFlag() }}</span>
              <span>{{ currentLocale.toUpperCase() }}</span>
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            <!-- Dropdown menu -->
            <Transition
              enter-active-class="transition-all duration-200 ease-out"
              enter-from-class="opacity-0 scale-95"
              enter-to-class="opacity-100 scale-100"
              leave-active-class="transition-all duration-150 ease-in"
              leave-from-class="opacity-100 scale-100"
              leave-to-class="opacity-0 scale-95"
            >
              <div
                v-if="languageDropdownOpen"
                class="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 py-2 min-w-[120px]"
                @click.stop
              >
                <button
                  v-for="locale in availableLocales"
                  :key="locale.code"
                  @click="switchLocale(locale.code); languageDropdownOpen = false"
                  class="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  :class="{ 'bg-gray-100': currentLocale === locale.code }"
                >
                  <span>{{ getLocaleFlag(locale.code) }}</span>
                  <span>{{ locale.name }}</span>
                </button>
              </div>
            </Transition>
          </div>
          <!-- Reserve CTA -->
          <NuxtLink
            to="/reservations"
            class="text-sm font-semibold text-black bg-white px-6 h-10 flex items-center rounded-full hover:bg-white/90 transition-colors"
          >
            Reserve
          </NuxtLink>
        </div>

        <!-- Mobile hamburger -->
        <button
          @click="mobileOpen = !mobileOpen"
          class="md:hidden flex flex-col gap-1.5 p-2"
          :aria-expanded="mobileOpen"
          aria-label="Toggle navigation"
        >
          <span
            v-for="i in 3"
            :key="i"
            class="block w-6 h-0.5 bg-white transition-all duration-300"
            :class="{
              'translate-y-2 rotate-45': i === 1 && mobileOpen,
              'opacity-0': i === 2 && mobileOpen,
              '-translate-y-2 -rotate-45': i === 3 && mobileOpen
            }"
          />
        </button>
      </nav>

      <!-- Mobile menu -->
      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div v-if="mobileOpen" class="md:hidden bg-black border-t border-white/10">
          <nav class="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6" aria-label="Mobile navigation">
            <NuxtLink
              v-for="link in navLinks"
              :key="link.to"
              :to="link.to"
              class="text-lg font-medium text-white/80 hover:text-white transition-colors"
              active-class="text-white"
              @click="mobileOpen = false"
            >
              {{ link.label }}
            </NuxtLink>
            <!-- Language switcher mobile -->
            <div class="pt-2 border-t border-white/10">
              <div class="space-y-2">
                <button
                  v-for="locale in availableLocales"
                  :key="locale.code"
                  @click="switchLocale(locale.code); mobileOpen = false"
                  class="flex items-center gap-3 w-full text-sm font-medium transition-colors p-2 rounded"
                  :class="[
                    currentLocale === locale.code ? 'text-white bg-white/10' : 'text-white/70 hover:text-white'
                  ]"
                >
                  <span class="text-lg">{{ getLocaleFlag(locale.code) }}</span>
                  <span>{{ locale.name }}</span>
                  <span v-if="currentLocale === locale.code" class="ml-auto text-xs">✓</span>
                </button>
              </div>
            </div>
            <!-- Reserve CTA mobile -->
            <NuxtLink
              to="/reservations"
              class="text-center text-sm font-semibold text-black bg-white px-6 py-3 rounded-full hover:bg-white/90 transition-colors"
              @click="mobileOpen = false"
            >
              Reserve
            </NuxtLink>
          </nav>
        </div>
      </Transition>
    </div>
  </header>

  <!-- Spacer to prevent content sitting behind fixed header -->
  <div class="h-16" />
</template>

<script setup>
const { locale, locales, setLocale } = useI18n()

const mobileOpen = ref(false)
const languageDropdownOpen = ref(false)

const currentLocale = computed(() => locale.value)

const availableLocales = computed(() =>
  locales.value.map(l => ({ code: l.code, name: l.name }))
)

const switchLocale = (code) => {
  setLocale(code)
}

// Flag emoji functions
const getLocaleFlag = (code) => {
  const flags = {
    'en': '🇺🇸', // English (US)
    'th': '🇹🇭', // Thai
    'ja': '🇯🇵', // Japanese
    'ar': '🇸🇦', // Arabic (Saudi Arabia)
  }
  return flags[code] || '🌐'
}

const getCurrentLocaleFlag = () => {
  return getLocaleFlag(currentLocale.value)
}

// Close dropdown when clicking outside
onMounted(() => {
  const handleClickOutside = (event) => {
    if (!event.target.closest('.relative')) {
      languageDropdownOpen.value = false
    }
  }
  document.addEventListener('click', handleClickOutside)
  
  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
  })
})

const navLinks = [
  { to: '/menu', label: 'Menu' },
  { to: '/location', label: 'Location' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

// Close mobile menu on route change
const route = useRoute()
watch(() => route.path, () => {
  mobileOpen.value = false
})
</script>
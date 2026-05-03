<template>
  <footer class="bg-black pt-16 pb-8 px-4">
    <div class="xl:max-w-[1170px] max-w-full mx-auto w-full md:px-5 px-0">
      <div class="text-center pb-[79px]">
        <ul class=" md:space-x-5 flex items-center justify-center gap-6 w-3/4 md:w-3/5 xl:w-4/5 mx-auto">
          <li><a href="https://www.facebook.com/kikuzuki-thailand"><img class="w-20" src="~/assets/images/facebook.svg" alt="Facebook"></a></li>
          <li><a href="https://www.instagram.com/kikuzuki-thailand"><img class="w-20" src="~/assets/images/insta.svg" alt="Instagram"></a></li>
          <li><a href="#"><img class="w-20" src="~/assets/images/tiktok.svg" alt="TikTok"></a></li>
          <li><a href="#"><img class="w-20" src="~/assets/images/youtube.svg" alt="Youtube"></a></li>
        </ul>
        <a href="/" class="inline-flex my-[52px] mx-0">
          <img src="~/assets/images/ftr-brand.svg" alt="Take Me Away by KIKUZUKI" class="md:h-auto h-[130px] object-cover object-center">
        </a>
        <div class="text-center flex items-center flex-col">
          <img src="~/assets/images/location-icon.svg" alt="Location Icon" class="mb-2">
          <p class="text-sm text-white text-center font-normal max-w-[250px] w-full mx-auto leading-relaxed">
            {{ businessAddress || 'Krabi Province, Southern Thailand 81000' }}<br>
            <span v-if="businessPhone" class="mt-2 block opacity-75">{{ businessPhone }}</span>
          </p>
        </div>
      </div>
      <div class="footer-bottom">
        <ul class="flex items-center justify-between md:flex-row flex-col">
          <li class="md:mb-0 mb-3.5 md:w-1/4 text-sm font-normal">
            <NuxtLink to="/privacy-policy" class="text-white hover:text-amber-400 transition-colors">Privacy Policy</NuxtLink> 
          </li>
          <li class="md:mb-0 mb-3.5 md:w-1/2 text-sm text-center text-white font-normal opacity-50">
            © {{ new Date().getFullYear() }} Take Me Away by KIKUZUKI. All rights reserved.
          </li>
          <li class="md:mb-0 text-right md:w-1/4 text-sm font-normal">
            <NuxtLink to="/terms-and-conditions" class="text-white hover:text-amber-400 transition-colors">Terms and Conditions</NuxtLink>
          </li>
        </ul>
      </div>
    </div>
  </footer>
</template>

<script setup>
const { data: googleBusiness } = await useFetch('/api/google-business/public', {
  default: () => ({ business: null })
})

const businessAddress = computed(() => {
  const addr = googleBusiness.value?.business?.storefrontAddress
  if (!addr) return ''
  return `${addr.addressLines?.[0] || ''}, ${addr.locality || ''}, ${addr.administrativeArea || ''} ${addr.postalCode || ''}`
})

const businessPhone = computed(() => googleBusiness.value?.business?.phoneNumbers?.[0]?.phoneNumber || '')
</script>

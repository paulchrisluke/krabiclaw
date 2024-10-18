<template>
    <footer class="bg-black pt-16 pb-8">
      <div class="xl:max-w-[1170px] max-w-full mx-auto w-full md:px-5 px-0">
        <div class="text-center pb-[79px]">
          <ul class="flex items-center justify-center gap-6">
            <li><a href="#"><img src="~/assets/images/tiktok.svg" alt=""></a></li>
            <li><a href="#"><img src="~/assets/images/insta.svg" alt=""></a></li>
            <li><a href="#"><img src="~/assets/images/twitter.svg" alt=""></a></li>
          </ul>
          <a href="#" class="inline-flex my-[52px] mx-0"><img src="~/assets/images/ftr-brand.svg" alt=""
              class="md:h-auto h-[130px] object-cover object-center"></a>
          <div class="text-center flex items-center flex-col">
            <img src="~/assets/images/location-icon.svg" alt="" class="mb-2">
            <p class="text-sm text-white text-center font-normal max-w-[208px] w-full mx-auto">6608 Telegraph Rd,
              Bloomfield Hills, MI 48301</p>
          </div>
        </div>
        <div class="footer-bottom">
          <ul class="flex items-center justify-between md:flex-row flex-col">
            <li class="md:mb-0 mb-3.5 md:w-1/4 text-sm font-normal"><NuxtLink to="/privacy-policy" class="text-white">Privacy policy</NuxtLink>
            </li>
            <li class="md:mb-0 mb-3.5 md:w-1/2 text-sm text-center text-white font-normal">© 2024 all rights reserved
            </li>
            <li class="md:mb-0 text-right md:w-1/4 text-sm font-normal"><NuxtLink to="/terms-and-conditions" class="text-white">Terms and
                Conditions </NuxtLink></li>
          </ul>
        </div>
      </div>
    </footer>
</template>


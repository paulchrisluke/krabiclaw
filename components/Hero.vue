<template>
  <section class="relative">
      <div class="md:h-auto h-[732px]">
        <div
          class="absolute top-0 left-1/2 transform -translate-x-1/2 z-10 flex flex-col justify-between items-center h-full md:pt-[45px] pt-8 md:pb-[75px] pb-[35px]">
          <a href="#" class="brand inline-flex items-center"><img src="~/assets/images/brand.svg" alt=""></a>
          <button
      @click="showOrderModal = true"
      class="text-base text-black bg-white font-semibold py-0 px-8 h-[50px] leading-[18px] hover:bg-transparent hover:border-white hover:text-white flex items-center justify-center border border-solid border-transparent rounded-[48px]"
    >
      Order Now
    </button>
        </div>
        <video autoplay muted loop playsinline class="w-full h-full object-cover" preload="auto" poster="~/assets/images/video-poster.jpg">
          <source src="~/assets/videos/hero-video.webm" type="video/webm">
          <source src="~/assets/videos/hero-video.mp4" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      </div>
      <OrderNowModal :show="showOrderModal" @close="showOrderModal = false" />
    </section>
</template>
<script setup>
import { ref } from 'vue';

// State to control modal visibility
const showOrderModal = ref(false);
</script>
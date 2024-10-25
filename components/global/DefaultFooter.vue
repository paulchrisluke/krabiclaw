<template>
  <div>
    <footer ref="footerRef" class="bg-black pt-16 pb-8 px-4">
      <div class="xl:max-w-[1170px] max-w-full mx-auto w-full md:px-5 px-0">
        <div class="text-center pb-[79px]">
          <ul class=" md:space-x-5 flex items-center justify-center gap-6 w-3/4 md:w-3/5 xl:w-4/5 mx-auto">
            <li><a href="https://www.tiktok.com/@officialsand_o?_t=8qlt2EbO554&_r=1"><img class="w-20" src="~/assets/images/tiktok.svg" alt="TikTok"></a></li>
            <li><a href="https://www.instagram.com/officialsand_o/"><img class="w-20" src="~/assets/images/insta.svg" alt="Instagram"></a></li>
            <li><a href="https://x.com/officialsand_o"><img class="w-20" src="~/assets/images/twitter.svg" alt="Twitter"></a></li>
            <li><a href="https://www.youtube.com/@OFFICIALSAND-O"><img class="w-20" src="~/assets/images/youtube.svg" alt="Youtube"></a></li>
            <li><a href="#"><img class="w-20" src="~/assets/images/facebook.svg" alt="Facebook"></a></li>
            <li><a href="#"><img class="w-20" src="~/assets/images/linkedin.svg" alt="Linkedin"></a></li>
            <li><a href="https://www.pinterest.com/officialsand_o/"><img class="w-20" src="~/assets/images/pinterest.svg" alt="Pinterest"></a></li>
          </ul>
          <a href="#" class="inline-flex my-[52px] mx-0">
            <img src="~/assets/images/ftr-brand.svg" alt="Brand" class="md:h-auto h-[130px] object-cover object-center">
          </a>
          <div class="text-center flex items-center flex-col">
            <img src="~/assets/images/location-icon.svg" alt="Location Icon" class="mb-2">
            <p class="text-sm text-white text-center font-normal max-w-[208px] w-full mx-auto">
            915 E Maple Rd, Birmingham, MI 48009
            </p>
            <NuxtLink to="/bred-to-rise" class="text-white text-sm font-medium mt-2 hover:underline">Bred to Rise</NuxtLink>
          </div>
        </div>
        <div class="footer-bottom">
          <ul class="flex items-center justify-between md:flex-row flex-col">
            <li class="md:mb-0 mb-3.5 md:w-1/4 text-sm font-normal">
              <NuxtLink to="/privacy-policy" class="text-white">Privacy Policy</NuxtLink> 
            </li>
            <li class="md:mb-0 mb-3.5 md:w-1/2 text-sm text-center text-white font-normal">
              © 2024 All rights reserved
            </li>
            <li class="md:mb-0 text-right md:w-1/4 text-sm font-normal">
              <NuxtLink to="/terms-and-conditions" class="text-white">Terms and Conditions</NuxtLink>
            </li>
          </ul>
        </div>
      </div>
    </footer>
   
    <!-- Conditionally render the component -->
    <not-the-best-agency v-if="showNotBestAgency" />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

// Reference to the footer element
const footerRef = ref(null);

// Reactive state to control the visibility of the component
const showNotBestAgency = ref(false);

// Counter for the number of times the user has scrolled past the footer
const scrollPastCount = ref(0);

// Maximum number of scrolls required to show the component
const MAX_SCROLL_PAST = 3;

// Create a flag to prevent multiple increments during a single scroll past
let hasScrolledPast = false;

// Callback for Intersection Observer
const handleIntersection = (entries) => {
  const entry = entries[0];
  if (!entry.isIntersecting && !hasScrolledPast) {
    // User has scrolled past the footer
    hasScrolledPast = true;
    scrollPastCount.value += 1;

    // Check if the required number of scrolls has been reached
    if (scrollPastCount.value >= MAX_SCROLL_PAST) {
      showNotBestAgency.value = true;
      // Optionally, disconnect the observer if no longer needed
      if (observer) {
        observer.disconnect();
      }
    }
  } else if (entry.isIntersecting && hasScrolledPast) {
    // User has scrolled back to the footer
    hasScrolledPast = false;
  }
};

// Create an Intersection Observer
let observer = null;

onMounted(() => {
  if (footerRef.value) {
    observer = new IntersectionObserver(handleIntersection, {
      root: null, // viewport
      threshold: 0, // trigger when any part is visible
    });
    observer.observe(footerRef.value);
  }
});

onBeforeUnmount(() => {
  if (observer && footerRef.value) {
    observer.unobserve(footerRef.value);
    observer = null;
  }
});
</script>

<style scoped>
/* Add any necessary styles here */
</style>

<template>
     <header class="bg-black text-white">
        <div class="container mx-auto flex justify-between items-center p-4">
            <!-- Logo Section -->
            <div class="flex items-center">
                <NuxtLink to="/" class="brand inline-flex items-center"><img src="~/assets/images/brand.svg" alt="" /></NuxtLink>
            </div>
            <!-- Order Now Button -->
            <div>
                <button
      @click="showOrderModal = true"
      class="text-base text-black bg-white font-semibold py-0 px-8 h-[50px] leading-[18px] hover:bg-transparent hover:border-white hover:text-white flex items-center justify-center border border-solid border-transparent rounded-[48px]"
    >
      Order Now
    </button>
            </div>
        </div>
        <OrderNowModal :show="showOrderModal" @close="showOrderModal = false" />
    </header>
</template>
<script setup>
import { ref } from 'vue';

// State to control modal visibility
const showOrderModal = ref(false);
</script>
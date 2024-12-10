<template>
    <!-- Modal Background -->
    <transition
      enter-active-class="transition-opacity ease-in-out duration-300"
      leave-active-class="transition-opacity ease-in-out duration-300"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
      @before-enter="handleBeforeEnter"
    >
      <!-- Modal with full overlay -->
      <div v-if="show" class="fixed inset-0 bg-black/50 z-[99] flex items-center justify-center" @click.self="closeModal">
        <!-- Modal content -->
        <div class="bg-white p-6 rounded-lg w-[90%] max-w-[500px] relative">
          <h2 class="text-xl font-bold mb-4 text-center">Order</h2>
  
          <!-- Order options -->
          <ul class="space-y-4 text-center px-12">
            <li>
                <a href="https://www.squareup.com" target="_blank" class="outline outline-2 block text-black py-4 px-6 rounded-lg" @click="trackDeliveryClick('square')">
                    <div class="flex items-center justify-between w-full">
                        <div class="flex-1 flex items-center">
                           
                        </div>
                        <div class="flex-1 flex items-center justify-center">
                            <img src="~/assets/images/square.svg" class="w-32" alt="Square logo" />
                        </div>
                        <div class="flex-1 flex justify-end">
                            <img src="~/assets/images/arrow-right.svg" class="w-8" alt="Right arrow" />
                        </div>
                    </div>
                </a>
            </li>
            <li>
                <a href="https://www.doordash.com/store/31182261/?srsltid=AfmBOoozLVM9FeIjMVSPmxMLUnCbpdS-417_RUy4zNAoITZCdUMuFjit" target="_blank" class="outline outline-2 block text-black py-4 px-6 rounded-lg" @click="trackDeliveryClick('doordash')">
                    <div class="flex items-center justify-between w-full">
                        <div class="flex-1 flex items-center">
                           
                        </div>
                        <div class="flex-1 flex items-center justify-center">
                            <img src="~/assets/images/doordash.svg" class="w-40" alt="DoorDash logo" />
                        </div>
                        <div class="flex-1 flex justify-end">
                            <img src="~/assets/images/arrow-right.svg" class="w-8" alt="Right arrow" />
                        </div>
                    </div>
                </a>
            </li>
            <li>
                <a href="https://www.grubhub.com/restaurant/sand-o-6608-telegraph-rd-bloomfield-hills/9131288" target="_blank" class="outline outline-2 block text-black py-4 px-6 rounded-lg" @click="trackDeliveryClick('grubhub')">
                    <div class="flex items-center justify-between w-full">
                        <div class="flex-1 flex items-center">
                           
                        </div>
                        <div class="flex-1 flex items-center justify-center">
                            <img src="~/assets/images/grubhub.png" class="w-40" alt="Grubhub logo" />
                        </div>
                        <div class="flex-1 flex justify-end">
                            <img src="~/assets/images/arrow-right.svg" class="w-8" alt="Right arrow" />
                        </div>
                    </div>
                </a>
            </li>
            <li>
                <a href="https://www.ubereats.com" target="_blank" class="outline outline-2 block text-black py-4 px-6 rounded-lg" @click="trackDeliveryClick('ubereats')">
                    <div class="flex items-center justify-between w-full">
                        <div class="flex-1 flex items-center">
                           
                        </div>
                        <div class="flex-1 flex items-center justify-center">
                            <img src="~/assets/images/ubereats.svg" class="w-40" alt="Uber Eats logo" />
                        </div>
                        <div class="flex-1 flex justify-end">
                            <img src="~/assets/images/arrow-right.svg" class="w-8" alt="Right arrow" />
                        </div>
                    </div>
                </a>
            </li>
          </ul>
  
          <!-- Close button -->
          <button @click="closeModal" type="button" class="absolute top-2 right-2 bg-black rounded-[64px] border border-white/[30%] flex items-center justify-center uppercase h-[47px] text-white text-[10px] font-bold max-w-[104px] w-full mx-auto gap-3">
          <span>
            <img src="~/assets/images/close.svg" alt="">
          </span>
          close
        </button>
        </div>
      </div>
    </transition>
  </template>
  
  <script setup>
  import { onMounted, onUnmounted } from 'vue';
  
  const props = defineProps({
    show: {
      type: Boolean,
      required: true,
    },
  });
  
  const emit = defineEmits(['close']);
  const { gtag } = useGtag();
  
  // Function to close the modal
  function closeModal() {
    gtag('event', 'sando_order_now', {
        action: "dismiss",
      });
    emit('close');
  }

  function handleBeforeEnter() {
    gtag('event', 'sando_order_now', {
        action: "expand",
      });
  }
  
  // Event listener for Escape key to close modal
  const handleKeydown = (event) => {
    if (event.key === 'Escape' && props.show) {
      closeModal();
    }
  };
  
  // Add event listener for keydown on mount
  onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
  });
  
  // Remove event listener when component is unmounted
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
  });

  function trackDeliveryClick(platform) {
    gtag('event', 'sando_order_now_exit', {
      action: "click",
      platform: platform
    });
  }
  </script>
  
  <style scoped>
  /* Additional styling if needed */
  </style>
  
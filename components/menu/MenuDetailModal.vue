<template>
  <div>
  <transition
    enter-active-class="transition-all ease-in-out duration-300"
    leave-active-class="transition-all ease-in-out duration-300"
    enter-from-class="translate-y-full opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-full opacity-0"
  >
    <div v-if="show" id="offcanvasBottom" class="offcanvas-content bg-black rounded-t-[32px] pb-12 pt-4 fixed bottom-0 left-0 w-full z-[99]">
      <div id="offcanvasContent" class="text-center relative z-[999]">
        <div class="-mt-[100px] mb-[34px]">
          <img :src="content.image" class="inline-block xl:max-w-full xl:w-auto lg:max-w-[400px] max-w-[322px] w-full" :alt="content.title" />
        </div>
        <h2 class="text-white text-[34px] font-extrabold max-w-[237px] mx-auto w-full leading-10">{{ content.title }}</h2>
        <p class="text-white max-w-[313px] mx-auto pt-[30px] pb-[35px] text-base font-normal">{{ content.description }}</p>
        <button @click="$emit('close')" type="button" class="btn-close rounded-[64px] border border-white/[30%] flex items-center justify-center uppercase h-[47px] text-white text-[10px] font-bold max-w-[104px] w-full mx-auto gap-3">
          <span>
            <img src="~/assets/images/close.svg" alt="">
          </span>
          close
        </button>
      </div>
    </div>
  </transition>

  <transition
    enter-active-class="transition-opacity ease-in-out duration-300"
    leave-active-class="transition-opacity ease-in-out duration-300"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div v-if="show" class="fixed top-0 left-0 h-screen w-[100vw] bg-black/[50%] z-[98]" @click="$emit('close')"></div>
  </transition>
</div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';

const props = defineProps({
  show: {
    type: Boolean,
    required: true,
  },
  content: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['close']);

// Add event listener for 'keydown' event
onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

// Remove event listener when component is unmounted
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

// Function to handle keydown event
const handleKeyDown = (event) => {
  if (event.key === 'Escape' && props.show) {
    emit('close');
  }
};
</script>

<style scoped>
/* Additional styles if needed */
</style>

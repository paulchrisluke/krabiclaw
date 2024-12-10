<template>
  <section class="xl:pt-[111px] pt-[38px] md:pb-0 pb-[100px]">
    <div class="xl:max-w-[1170px] max-w-full mx-auto w-full md:px-5 px-0">
      <div v-if="weekText" class="text-center xl:pb-[120px] lg:pb-[60px] pb-11">
        <span class="text-white text-center lg:text-base text-xs font-medium leading-normal bg-red-600 h-[34px] lg:h-10 px-3.5 lg:px-4 inline-flex items-center justify-center mb-[14px] lg:mb-7">{{ weekText }}</span>
        <h1 class="text-black text-center xl:text-[76px] lg:text-[56px] text-[38px] leading-10 lg:leading-[70px] font-extrabold xl:leading-[76px]">{{ title }}</h1>
      </div>
      <div
        v-for="(section, index) in sections"
        :key="index"
        :class="[
          'md:p-10 p-0 group lg:mb-10 mb-[27px] xl:mb-[152px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out',
          index % 2 === 0 ? 'flex-row' : 'flex-row-reverse',
          { 'mobile-hover': sectionHovered === index }
        ]"
        @touchstart="onTouchStart(index)"
        @touchend="onTouchEnd"
      >
        <div class="flex lg:items-center items-center md:items-start gap-6">
          <div v-if="index % 2 === 0" class="md:w-2/5 w-[46%]">
            <div class="md:ml-0 -ml-[62px]">
              <img :src="section.image" :alt="section.title" />
            </div>
          </div>
          <div class="w-3/5 pl-10">
            <h2 class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">{{ section.title }}</h2>
            <p class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:group-hover:text-white">{{ section.description }}</p>
            <a
              href="#."
              class="main-btn learn-btn md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
              :data-content="section"
              @click="openOffcanvas(section)"
            >
              Learn More
            </a>
          </div>
          <div v-if="index % 2 !== 0" class="md:w-2/5 w-[46%]">
            <div class="md:mr-0 -mr-[62px]">
              <img :src="section.image" :alt="section.title" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Component -->
    <MenuDetailModal :show="showModal" :content="modalContent" @close="closeOffcanvas" />
  </section>
</template>

<script setup>
import { ref } from 'vue';
import MenuDetailModal from './MenuDetailModal.vue';

const props = defineProps({
  weekText: {
    type: String,
    required: false,
  },
  title: {
    type: String,
    required: true,
  },
  sections: {
    type: Array,
    required: true,
  },
});

const showModal = ref(false);
const modalContent = ref({});
const { gtag } = useGtag();

const openOffcanvas = (content) => {
  modalContent.value = content;
  showModal.value = true;

    // Track modal open event
    gtag('event', 'sando_modal', {
    action: "expand",
    menu_item_name: content.title,
  });
};

const closeOffcanvas = () => {
  showModal.value = false;
  
  // Track modal close event
  gtag('event', 'sando_modal', {
    action: "dismiss",
    menu_item_name: modalContent.value.title,
  });
};

const sectionHovered = ref(null);

const onTouchStart = (index) => {
  sectionHovered.value = index;
};

const onTouchEnd = () => {
  sectionHovered.value = null;
};
</script>

<style scoped>
@media (max-width: 767px) {
  .mobile-hover {
    background-color: black;
  }

  .mobile-hover h2,
  .mobile-hover p,
  .mobile-hover .learn-btn {
    color: white;
  }

  .mobile-hover .learn-btn {
    border-color: white;
  }
}
</style>

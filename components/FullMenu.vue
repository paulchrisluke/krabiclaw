<template>
  <div v-if="isOpen" @click.self="closeModal" class="fixed inset-0 h-screen w-screen bg-gray-500/70 z-[99] flex items-center justify-center">
     <!-- Modal Content -->
     <div class="sm:max-w-[540px] max-w-[360px] h-full example overflow-y-auto bg-white mx-auto relative z-[999] rounded-lg">
        <div class="flex items-center p-4 bg-black justify-between">
           <img src="~/assets/images/brand.svg" alt="" class="sm:h-auto h-[30px]">
           <ul>
              <li class="flex mb-2 items-center justify-center gap-2">
                 <span>
                 <img src="~/assets/images/insta.svg" alt="">
                 </span>
                 <a href="#" class="text-base text-white font-normal">eat.sando</a>
              </li>
              <li class="flex items-center justify-center gap-2">
                 <span>
                 <img src="~/assets/images/insta.svg" alt="">
                 </span>
                 <a href="#" class="text-base text-white font-normal">www.sand-o.com</a>
              </li>
           </ul>
           <h2 class="text-white sm:text-[40px] text-xl leading-[30px] sm:leading-[40px] font-bold">
              MENU
           </h2>
        </div>
        <div class="mt-6">
           <div class="bg-black pl-10 p-4">
              <h2 class="sm:text-[34px] text-[26px] leading-[31px] sm:leading-[34px] text-white font-bold">BREAKFAST</h2>
           </div>
           <div>
              <div class="flex items-center gap-3 pt-3">
                 <div class="w-[30px] h-5 bg-black"></div>
                 <h3 class="sm:text-2xl text-xl leading-6 font-bold text-black">TOSUTO (TOAST)</h3>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between border-b border-black pb-4">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">AVOCADO</h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$7.00</span>
                 </div>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between border-b border-black pb-4">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">
                          SALMON ROYALE
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$10.00</span>
                 </div>
              </div>
              <div class="pt-2.5 px-10">
                 <div class="flex items-center justify-between">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">
                          FRUIT &amp; CREAM
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$4.00</span>
                 </div>
              </div>
           </div>
           <div>
              <div class="flex items-center gap-3 pt-3">
                 <div class="w-[30px] h-5 bg-black"></div>
                 <h3 class="sm:text-2xl text-xl leading-6 font-bold text-black">TAMAGO (EGG)
                 </h3>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between border-b border-black pb-4">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">STREET TOAST
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$12.00</span>
                 </div>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between border-b border-black pb-4">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">
                          MEET, EGG &amp; CHEESE
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$12.00</span>
                 </div>
              </div>
              <div class="pt-2.5 px-10">
                 <div class="flex items-center justify-between border-b border-black pb-4">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">
                          TAMAGIYAKI AND SHISO
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$11.00</span>
                 </div>
              </div>
              <div class="pt-2.5 px-10">
                 <div class="flex items-center justify-between  pb-4">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">
                          EGG SALAD
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$9.00</span>
                 </div>
              </div>
           </div>
           <div class="bg-black pl-10 p-4">
              <h2 class="sm:text-[34px] text-[26px] leading-[31px] sm:leading-[34px] text-white font-bold">LUNCH</h2>
           </div>
           <div>
              <div class="flex items-center gap-3 pt-3">
                 <div class="w-[30px] h-5 bg-black"></div>
                 <h3 class="sm:text-2xl text-xl leading-6 font-bold text-black">CLASSIC SANDOS
                 </h3>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between border-b border-black pb-4">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">GRILLED CHEESE
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$8.00</span>
                 </div>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">
                          BURGER
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$15.00</span>
                 </div>
              </div>
           </div>
           <div>
              <div class="flex items-center gap-3 pt-3">
                 <div class="w-[30px] h-5 bg-black"></div>
                 <h3 class="sm:text-2xl text-xl leading-6 font-bold text-black">KATSU SANDOS
                 </h3>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between border-b border-black pb-4">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">CHICKEN</h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$13.00</span>
                 </div>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between border-b border-black pb-4">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">
                          PORK
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$14.00</span>
                 </div>
              </div>
              <div class="pt-2.5 px-10">
                 <div class="flex items-center justify-between border-b border-black pb-4">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">
                          STEAK
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$18.00</span>
                 </div>
              </div>
              <div class="pt-2.5 px-10">
                 <div class="flex items-center justify-between">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">
                          POTATO
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$11.00</span>
                 </div>
              </div>
           </div>
           <div>
              <div class="flex items-center gap-3 pt-3">
                 <div class="w-[30px] h-5 bg-black"></div>
                 <h3 class="sm:text-2xl text-xl leading-6 font-bold text-black">FRUIT AND CREAM SANDOS
                 </h3>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">FEATURED FRUIT AND CREAM
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$7.00</span>
                 </div>
              </div>
           </div>
           <div>
              <div class="flex items-center gap-3 pt-3">
                 <div class="w-[30px] h-5 bg-black"></div>
                 <h3 class="sm:text-2xl text-xl leading-6 font-bold text-black">FRIED SANDOS
                 </h3>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">FEATURED FRIED SANDO
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$9.00</span>
                 </div>
              </div>
           </div>
           <div>
              <div class="flex items-center gap-3 pt-3">
                 <div class="w-[30px] h-5 bg-black"></div>
                 <h3 class="sm:text-2xl text-xl leading-6 font-bold text-black">KIDS
                 </h3>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between border-b border-black pb-4">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">KIDS SANDO
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$7.00</span>
                 </div>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">KIDS NUGGETS
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$5.00</span>
                 </div>
              </div>
           </div>
           <div>
              <div class="flex items-center gap-3 pt-3">
                 <div class="w-[30px] h-5 bg-black"></div>
                 <h3 class="sm:text-2xl text-xl leading-6 font-bold text-black">SIDES
                 </h3>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between border-b border-black pb-4">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">CHICKEN NUGGETS
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">8.00</span>
                 </div>
              </div>
              <div class="py-2.5 px-10">
                 <div class="flex items-center justify-between">
                    <div>
                       <h4 class="sm:text-xl text-base leading-5 text-black font-normal">FRIES
                       </h4>
                       <p class="text-xs leading-4 text-black font-normal">Lorem ipsum dolor sit amet, consectetur
                          adipisicing elit.
                       </p>
                    </div>
                    <span class="text-sm font-normal text-black leading-5">$5.00</span>
                 </div>
              </div>
           </div>
        </div>
     </div>
  </div>
</template>
<script setup>
  const props = defineProps({
    isOpen: {
      type: Boolean,
      required: true,
    },
  });
  
  const emit = defineEmits(['close'])
  
  function closeModal() {
    emit('close');
  }
</script>

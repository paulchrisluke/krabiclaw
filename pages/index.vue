<template>
 
 
  <div class="overflow-hidden">
    <hero />
    <section class="xl:pt-[111px] pt-[38px] md:pb-0 pb-[100px]">
      <div class="xl:max-w-[1170px] max-w-full mx-auto w-full md:px-5 px-0">
        <div class="text-center xl:pb-[120px] lg:pb-[60px] pb-11">
          <span
            class="text-white text-center lg:text-base text-xs font-medium leading-normal bg-orange-600 h-[34px] lg:h-10 px-3.5 lg:px-4 inline-flex items-center justify-center mb-[14px] lg:mb-7">Week
            of Oct 14-21
          </span>
          <h1
            class="text-black text-center xl:text-[76px] lg:text-[56px] text-[38px] leading-10 lg:leading-[70px] font-extrabold xl:leading-[76px]">
            Unique flavor</h1>
        </div>
        <div
          class="md:p-10 p-0 group lg:mb-10 mb-[27px] xl:mb-[152px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out">
          <div class="flex lg:items-center items-center md:items-start gap-6 ">
            <div class="md:w-2/5 w-[46%]">
              <div class="md:ml-0 -ml-[62px]">
                <img src="~/assets/images/chicken.png" alt="">
              </div>
            </div>
            <div class="w-3/5">
              <h2
                class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full  max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">
                Chicken Katsu</h2>
              <p
                class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:md:group-hover:text-white">
                The Chicken Sand-O is a tasty
                chicken sandwich featuring a crispy
                or
                grilled chicken fillet on a soft bun, topped with fresh lettuce, tomatoes, and your
                choice
                of sauce. It’s a satisfying option for a quick meal.</p>
              <a href="#."
                class="main-btn learn-btn md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
                data-content="chicken" onclick="openOffcanvas('chicken')">Learn
                More</a>
            </div>
          </div>
        </div>
        <div
          class="md:p-10 p-0 group lg:mb-10 mb-[27px] xl:mb-[152px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out">
          <div class="flex lg:items-center items-center md:items-start gap-6 ">
            <div class="w-3/5 md:pl-0 pl-8">
              <h2
                class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full  max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">
                Pork Katsu</h2>
              <p
                class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:group-hover:text-white">
                The Chicken Sand-O is a tasty chicken sandwich featuring a crispy or grilled chicken fillet on a soft
                bun, topped with fresh lettuce, tomatoes, and your choice of sauce. It’s a satisfying option for a quick
                meal.
              </p>
              <a href="#."
                class="md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
                data-content="pork" onclick="openOffcanvas('pork')">Learn
                More</a>
            </div>
            <div class="md:w-2/5 w-[46%]">
              <div class="md:mr-0 -mr-[62px]">
                <img src="~/assets/images/pork.png" alt="">
              </div>
            </div>
          </div>
        </div>
        <div
          class="md:p-10 p-0 group lg:mb-10 mb-[27px] xl:mb-[152px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out">
          <div class="flex lg:items-center items-center md:items-start gap-6 ">
            <div class="md:w-2/5 w-[46%]">
              <div class="md:ml-0 -ml-[62px]">
                <img src="~/assets/images/egg-salad.png" alt="">
              </div>
            </div>
            <div class="w-3/5">
              <h2
                class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full  max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">
                Egg Salad
              </h2>
              <p
                class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:group-hover:text-white">
                The Chicken Sand-O is a tasty chicken sandwich featuring a crispy or grilled chicken fillet on a soft
                bun, topped with fresh lettuce, tomatoes, and your choice of sauce. It’s a satisfying option for a quick
                meal.
              </p>
              <a href="#."
                class="md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
                data-content="egg" onclick="openOffcanvas('egg')">Learn
                More</a>
            </div>
          </div>
        </div>
        <div
          class="md:p-10 p-0 group lg:mb-10 mb-[27px] xl:mb-[152px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out">
          <div class="flex lg:items-center items-center md:items-start gap-6 ">
            <div class="w-3/5 md:pl-0 pl-8">
              <h2
                class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full  max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">
                Steak Katsu
              </h2>
              <p
                class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:group-hover:text-white">
                The Chicken Sand-O is a tasty chicken sandwich featuring a crispy or grilled chicken fillet on a soft
                bun, topped with fresh lettuce, tomatoes, and your choice of sauce. It’s a satisfying option for a quick
                meal.
              </p>
              <a href="#."
                class="md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
                data-content="steak" onclick="openOffcanvas('steak')">Learn
                More</a>
            </div>
            <div class="md:w-2/5 w-[46%]">
              <div class="md:mr-0 -mr-[62px]">
                <img src="~/assets/images/steak.png" alt="">
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section
      class="md:mb-[140px] mb-[50px] 2xl:bg-transparent 2xl:p-0 bg-black pb-[53px] md:py-[53px] px-[35px] 2xl:rounded-none rounded-[32px]">
      <div class="relative">
        <div class="xl:max-w-[1170px] max-w-full mx-auto 2xl:px-5 px-0 w-full">
          <div class="relative z-10 2xl:py-[59px] bg-black p-0 2xl:pl-[79px] rounded-tl-[76px] rounded-bl-[76px]">
            <div
              class="3xl:max-w-[1486px] 2xl:max-w-[1290px] 2xl:block hidden 2xl:absolute h-full w-full top-0 bg-black -right-[100%] rounded-tl-none rounded-bl-none">
            </div>
            <div class="flex items-center md:flex-row flex-col-reverse">
              <div class="md:w-3/5 w-full">
                <div class="md:text-left text-center md:pt-0 pt-5">
                  <div>
                    <small class="md:text-2xl text-base text-white leading-[44px] font-normal">It all began with
                    </small>
                    <h3
                      class="xl:text-[76px] md:text-[56px] text-[46px] leading-[50px] md:leading-[70px] xl:leading-[76px] font-extrabold text-white pb-5">
                      Shokupan
                    </h3>
                  </div>
                  <div>
                    <p
                      class="md:text-base text-sm md:leading-normal leading-[22px] font-normal max-w-[592px] w-full pb-[30px] text-white">
                      It all began with Shokupan. What started as a passion for baking the perfect loaf grew into a
                      mission to bring the essence of Japanese flavors to every bite. With its soft, pillowy texture,
                      shokupan became the foundation of everything we do at Sand-O, inspiring a unique sandwich
                      experience that blends tradition with innovation.
                    </p>
                    <p
                      class="md:text-base text-sm md:leading-normal leading-[22px] font-normal max-w-[592px] w-full pb-[30px] text-white">
                      Every day, we bake our signature shokupan milk bread from scratch, using locally sourced, 100%
                      sustainable ingredients. Our commitment to eco-friendly practices ensures you’re enjoying fresh,
                      flavorful sandos while supporting the planet.
                    </p>
                    <p
                      class="md:text-base text-sm md:leading-normal leading-[22px] font-normal max-w-[592px] w-full pb-[30px] text-white">
                      Our menu changes weekly, offering a rotating selection of unique sandos—from crispy katsu to light
                      egg and indulgent fruit and cream varieties. Each creation reflects Japanese culinary tradition
                      with a modern twist, constantly introducing new flavors while perfecting our classics. There's
                      always something new and irresistible to discover at Sand-O.
                    </p>
                  </div>
                  <a href="#"
                    class="text-black text-[16px] font-semibold leading-[18px] rounded-full bg-white px-8 h-[50px] inline-flex items-center justify-center border gap-1.5 border-transparent">Buy
                    on <span class="mt-[7px]"><img src="~/assets/images/amazon.svg" alt=""></span></a>
                </div>
              </div>
              <div class="md:w-2/5">
                <div class="h-full flex items-center justify-center md:mt-0 -mt-[76px]">
                  <img src="~/assets/images/shokupan.png" alt="" class="md:max-w-full max-w-[270px]">
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section class="xl:pb-[122px] pb-[50px]">
      <div class="xl:max-w-[1170px] max-w-full mx-auto 2xl:px-5 px-0 w-full">
        <div class="xl:pb-[133px] md:pb-5 pb-11">
          <h3
            class="text-black text-center xl:text-[76px] font-extrabold md:text-[56px] text-[38px] leading-10 md:max-w-full max-w-[248px] mx-auto md:leading-[70px] xl:leading-[76px]">
            On-Demand Sandos
          </h3>
        </div>
        <div
          class="md:p-10 p-0 group lg:mb-10 mb-[27px] xl:mb-[152px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out">
          <div class="flex lg:items-center items-center md:items-start gap-6 ">
            <div class="md:w-2/5 w-[46%]">
              <div class="md:ml-0 -ml-[62px]">
                <img src="~/assets/images/chicken.png" alt="">
              </div>
            </div>
            <div class="w-3/5">
              <h2
                class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full  max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">
                Chicken Katsu</h2>
              <p
                class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:group-hover:text-white">
                The Chicken Sand-O is a tasty
                chicken sandwich featuring a crispy
                or
                grilled chicken fillet on a soft bun, topped with fresh lettuce, tomatoes, and your
                choice
                of sauce. It’s a satisfying option for a quick meal.</p>
              <a href="#."
                class="md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
                data-content="chicken" onclick="openOffcanvas('chicken')">Learn
                More</a>
            </div>
          </div>
        </div>
        <div
          class="md:p-10 p-0 group lg:mb-10 mb-[27px] xl:mb-[152px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out">
          <div class="flex lg:items-center items-center md:items-start gap-6 ">
            <div class="md:w-3/5 w-1/2 md:pl-0 pl-8">
              <h2
                class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full  max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">
                Pork Katsu</h2>
              <p
                class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:group-hover:text-white">
                The Chicken Sand-O is a tasty chicken sandwich featuring a crispy or grilled chicken fillet on a soft
                bun, topped with fresh lettuce, tomatoes, and your choice of sauce. It’s a satisfying option for a quick
                meal.
              </p>
              <a href="#."
                class="md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
                data-content="pork" onclick="openOffcanvas('pork')">Learn
                More</a>
            </div>
            <div class="md:w-2/5 w-[46%]">
              <div class="md:mr-0 -mr-[62px]">
                <img src="~/assets/images/pork.png" alt="">
              </div>
            </div>
          </div>
        </div>
        <div
          class="md:p-10 p-0 group lg:mb-10 mb-[27px] xl:mb-[152px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out">
          <div class="flex lg:items-center items-center md:items-start gap-6 ">
            <div class="md:w-2/5 w-[46%]">
              <div class="md:ml-0 -ml-[62px]">
                <img src="~/assets/images/egg-salad.png" alt="">
              </div>
            </div>
            <div class="w-3/5">
              <h2
                class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full  max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">
                Egg Salad
              </h2>
              <p
                class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:group-hover:text-white">
                The Chicken Sand-O is a tasty chicken sandwich featuring a crispy or grilled chicken fillet on a soft
                bun, topped with fresh lettuce, tomatoes, and your choice of sauce. It’s a satisfying option for a quick
                meal.
              </p>
              <a href="#."
                class="md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
                data-content="egg" onclick="openOffcanvas('egg')">Learn
                More</a>
            </div>
          </div>
        </div>
        <div
          class="md:p-10 p-0 group lg:mb-10 mb-[27px] xl:mb-[152px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out">
          <div class="flex lg:items-center items-center md:items-start gap-6 ">
            <div class="md:w-3/5 w-1/2 md:pl-0 pl-8">
              <h2
                class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full  max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">
                Steak Katsu
              </h2>
              <p
                class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:group-hover:text-white">
                The Chicken Sand-O is a tasty chicken sandwich featuring a crispy or grilled chicken fillet on a soft
                bun, topped with fresh lettuce, tomatoes, and your choice of sauce. It’s a satisfying option for a quick
                meal.
              </p>
              <a href="#."
                class="md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
                data-content="steak" onclick="openOffcanvas('steak')">Learn
                More</a>
            </div>
            <div class="md:w-2/5 w-[46%]">
              <div class="md:mr-0 -mr-[62px]">
                <img src="~/assets/images/steak.png" alt="">
              </div>
            </div>
          </div>
        </div>
        <div
          class="md:p-10 p-0 group lg:mb-10 mb-[27px] xl:mb-[152px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out">
          <div class="flex lg:items-center items-center md:items-start gap-6 ">
            <div class="md:w-2/5 w-[46%]">
              <div class="md:ml-0 -ml-[62px]">
                <img src="~/assets/images/street-toast.png" alt="">
              </div>
            </div>
            <div class="w-3/5">
              <h2
                class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full  max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">
                Street Toast
              </h2>
              <p
                class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:group-hover:text-white">
                The Chicken Sand-O is a tasty chicken sandwich featuring a crispy or grilled chicken fillet on a soft
                bun, topped with fresh lettuce, tomatoes, and your choice of sauce. It’s a satisfying option for a quick
                meal.
              </p>
              <a href="#."
                class="md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
                data-content="toast" onclick="openOffcanvas('toast')">Learn
                More</a>
            </div>
          </div>
        </div>
        <div
          class="md:p-10 p-0 group lg:mb-10 mb-[27px] xl:mb-[152px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out">
          <div class="flex lg:items-center items-center md:items-start gap-6 ">
            <div class="md:w-3/5 w-1/2 md:pl-0 pl-8">
              <h2
                class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full  max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">
                Potato Katsu
              </h2>
              <p
                class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:group-hover:text-white">
                The Chicken Sand-O is a tasty chicken sandwich featuring a crispy or grilled chicken fillet on a soft
                bun, topped with fresh lettuce, tomatoes, and your choice of sauce. It’s a satisfying option for a quick
                meal.
              </p>
              <a href="#."
                class="md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
                data-content="potato" onclick="openOffcanvas('potato')">Learn
                More</a>
            </div>
            <div class="md:w-2/5 w-[46%]">
              <div class="md:mr-0 -mr-[62px]">
                <img src="~/assets/images/potato-katsu.png" alt="">
              </div>
            </div>
          </div>
        </div>
        <div
          class="md:p-10 p-0 group lg:mb-10 mb-[27px] xl:mb-[152px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out">
          <div class="flex lg:items-center items-center md:items-start gap-6 ">
            <div class="md:w-2/5 w-[46%]">
              <div class="md:ml-0 -ml-[62px]">
                <img src="~/assets/images/tamagoyaki-shiso.png" alt="">
              </div>
            </div>
            <div class="w-3/5">
              <h2
                class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full  max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">
                Tamagoyaki Shiso
              </h2>
              <p
                class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:group-hover:text-white">
                The Chicken Sand-O is a tasty chicken sandwich featuring a crispy or grilled chicken fillet on a soft
                bun, topped with fresh lettuce, tomatoes, and your choice of sauce. It’s a satisfying option for a quick
                meal.
              </p>
              <a href="#."
                class="md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
                data-content="tomago" onclick="openOffcanvas('tomago')">Learn
                More</a>
            </div>
          </div>
        </div>
        <div
          class="md:p-10 group xl:mb-[89px] mb-[59px] rounded-[40px] cursor-pointer transition-all duration-500 ease-in-out md:hover:bg-black hover:transition-all hover:duration-500 hover:ease-in-out">
          <div class="flex lg:items-center items-center md:items-start gap-6 ">
            <div class="w-3/5">
              <div class="md:pl-0 pl-8">
                <h2
                  class="xl:text-6xl lg:text-5xl text-black font-extrabold md:font-bold text-[26px] md:text-[32px] md:max-w-full md:w-auto w-full  max-w-[130px] leading-[31px] md:leading-[42px] lg:leading-[54px] xl:leading-[68px] pb-4 md:group-hover:text-white">
                  Fruit and Cream
                </h2>
                <p
                  class="text-base md:block hidden text-black font-normal max-w-[592px] w-full xl:pb-9 pb-5 md:group-hover:text-white">
                  The Chicken Sand-O is a tasty chicken sandwich featuring a crispy or grilled chicken fillet on a soft
                  bun, topped with fresh lettuce, tomatoes, and your choice of sauce. It’s a satisfying option for a
                  quick meal.
                </p>
                <a href="#."
                  class="md:text-base text-xs md:group-hover:text-white text-black bg-transparent font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-black/30 md:group-hover:border-white rounded-[48px]"
                  data-content="fruitcream" onclick="openOffcanvas('fruitcream')">Learn
                  More</a>
              </div>
            </div>
            <div class="md:w-2/5 w-[46%]">
              <div class="md:mr-0 -mr-[62px]">
                <img src="~/assets/images/fruit-cream.png" alt="">
              </div>
            </div>
          </div>
        </div>
        <div class="text-center">
          <a href="#"
            class="text-base hover:text-black text-white bg-black hover:bg-transparent  font-semibold py-0 px-8 h-[50px] leading-[18px] inline-flex items-center justify-start border border-solid border-transparent hover:border-black rounded-[48px]">Order
            Now</a>
        </div>
      </div>
    </section>

    <default-footer />



  </div>
</template>

<script setup>
definePageMeta({
  layout: 'home'
})
</script>

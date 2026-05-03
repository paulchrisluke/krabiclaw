<template>
  <div class="min-h-screen bg-white">
    <!-- Hero Section -->
    <div class="bg-black text-white py-16 px-4">
      <div class="max-w-6xl mx-auto text-center">
        <h1 class="text-4xl md:text-6xl font-bold mb-4">About KIKUZUKI</h1>
        <p class="text-lg md:text-xl opacity-90">Authentic Japanese Robatayaki Experience in Krabi</p>
      </div>
    </div>

    <!-- Brand Story Section -->
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div class="mb-16">
        <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Our Story</h2>
        <div class="prose prose-lg max-w-none">
          <p class="text-gray-700 mb-4">
            <strong>PLACEHOLDER_BRAND_STORY_TEXT</strong> - This section will contain the authentic story of KIKUZUKI, our journey in bringing traditional Japanese robatayaki to Krabi, and our commitment to preserving the art of Japanese grilling culture in Southern Thailand.
          </p>
          <p class="text-gray-700">
            PLACEHOLDER_BRAND_MISSION_TEXT - Our mission is to create an authentic Japanese dining experience that honors tradition while embracing the vibrant culture of Krabi. Every dish tells a story of craftsmanship, quality ingredients, and the art of robatayaki grilling.
          </p>
        </div>
      </div>

      <!-- Japan Authenticity Section -->
      <div class="mb-16">
        <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Japanese Authenticity</h2>
        <div class="grid md:grid-cols-2 gap-8">
          <div>
            <div class="bg-gray-200 rounded-lg h-48 flex items-center justify-center mb-4">
              <span class="text-gray-500">PLACEHOLDER_JAPAN_IMAGE</span>
            </div>
          </div>
          <div>
            <h3 class="text-xl font-semibold text-gray-900 mb-3">Traditional Robatayaki</h3>
            <p class="text-gray-700 mb-4">
              <strong>PLACEHOLDER_ROBATAYAKI_DESCRIPTION</strong> - Robatayaki is a traditional Japanese style of cooking where food is grilled over charcoal. At KIKUZUKI, we bring this authentic experience to Krabi using traditional techniques and the finest ingredients.
            </p>
            <p class="text-gray-700">
              PLACEHOLDER_AUTHENTICITY_TEXT - Our commitment to authenticity means using traditional grilling methods, imported Japanese ingredients, and time-honored recipes passed down through generations.
            </p>
          </div>
        </div>
      </div>

      <!-- Chef Section -->
      <div class="mb-16">
        <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Our Chef</h2>
        <div class="grid md:grid-cols-2 gap-8">
          <div>
            <div class="bg-gray-200 rounded-lg h-64 flex items-center justify-center mb-4">
              <span class="text-gray-500">PLACEHOLDER_CHEF_PHOTO</span>
            </div>
          </div>
          <div>
            <h3 class="text-xl font-semibold text-gray-900 mb-3">PLACEHOLDER_CHEF_NAME</h3>
            <p class="text-gray-700 mb-4">
              <strong>PLACEHOLDER_CHEF_BIO</strong> - Our head chef brings years of experience in Japanese cuisine, having trained in Tokyo's finest robatayaki establishments before bringing this authentic experience to Thailand.
            </p>
            <p class="text-gray-700">
              PLACEHOLDER_CHEF_PHILOSOPHY - With a deep respect for tradition and a passion for innovation, our chef creates dishes that honor Japanese culinary heritage while celebrating local Thai ingredients.
            </p>
          </div>
        </div>
      </div>

      <!-- Values Section -->
      <div class="mb-16">
        <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Our Values</h2>
        <div class="grid md:grid-cols-3 gap-8">
          <div class="text-center">
            <div class="bg-gray-200 rounded-lg h-32 w-32 mx-auto mb-4 flex items-center justify-center">
              <span class="text-gray-500">ICON</span>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Authenticity</h3>
            <p class="text-gray-700">PLACEHOLDER_AUTHENTICITY_VALUE</p>
          </div>
          <div class="text-center">
            <div class="bg-gray-200 rounded-lg h-32 w-32 mx-auto mb-4 flex items-center justify-center">
              <span class="text-gray-500">ICON</span>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Quality</h3>
            <p class="text-gray-700">PLACEHOLDER_QUALITY_VALUE</p>
          </div>
          <div class="text-center">
            <div class="bg-gray-200 rounded-lg h-32 w-32 mx-auto mb-4 flex items-center justify-center">
              <span class="text-gray-500">ICON</span>
            </div>
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Community</h3>
            <p class="text-gray-700">PLACEHOLDER_COMMUNITY_VALUE</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
useSeoMeta({
  title: 'About | Take Me Away by KIKUZUKI | Japanese Robatayaki Krabi',
  description: 'Learn about KIKUZUKI, our authentic Japanese robatayaki restaurant in Krabi, Thailand. Discover our story, Japanese culinary traditions, and commitment to authentic dining experiences.',
  ogTitle: 'About | Take Me Away by KIKUZUKI',
  ogDescription: 'Authentic Japanese robatayaki restaurant in Krabi, Thailand. Learn our story and culinary philosophy.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/about',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'About - Take Me Away by KIKUZUKI',
  twitterDescription: 'Japanese robatayaki restaurant in Krabi, Thailand with authentic culinary traditions.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([{
  '@type': 'Restaurant',
  name: 'Take Me Away by KIKUZUKI',
  description: 'Authentic Japanese robatayaki izakaya in Krabi, Thailand offering traditional Japanese grilling experiences with a focus on quality ingredients and culinary craftsmanship.'
}])
</script>
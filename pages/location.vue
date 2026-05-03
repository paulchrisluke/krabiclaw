<template>
  <div class="min-h-screen bg-white">
    <!-- Hero Section -->
    <div class="bg-black text-white py-16 px-4">
      <div class="max-w-6xl mx-auto text-center">
        <h1 class="text-4xl md:text-6xl font-bold mb-4">Location & Hours</h1>
        <p class="text-lg md:text-xl opacity-90">Visit Us in Krabi, Thailand</p>
      </div>
    </div>

    <!-- Map Section -->
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div class="mb-12">
        <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Find Us</h2>
        <div class="aspect-video bg-gray-200 rounded-lg overflow-hidden">
          <iframe 
            src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3950.432413181305!2d98.7493211!3d8.0572977!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x305195cf958f130b%3A0xd8ce9d779ecb9325!2sTake%20Me%20Away%20by%20KIKUZUKI!5e0!3m2!1sen!2sth!4v1777770384431!5m2!1sen!2sth" 
            width="100%" 
            height="100%" 
            style="border:0;" 
            allowfullscreen="" 
            loading="lazy" 
            referrerpolicy="no-referrer-when-downgrade">
          </iframe>
        </div>
        <div class="mt-4 text-center">
          <a 
            href="https://maps.app.goo.gl/2KJfCAfH1idnRBqz6" 
            target="_blank" 
            rel="noopener noreferrer"
            class="inline-block bg-black text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 transition-colors"
          >
            Get Directions →
          </a>
        </div>
      </div>

      <!-- NAP Section -->
      <div class="grid md:grid-cols-2 gap-12 mb-12">
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Contact Information</h2>
          <div class="space-y-4">
            <div>
              <h3 class="font-semibold text-gray-900 mb-1">Restaurant Name</h3>
              <p class="text-gray-700">Take Me Away by KIKUZUKI</p>
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 mb-1">Address</h3>
              <p class="text-gray-700">
                Southern Thailand<br>
                Krabi, Krabi Province<br>
                81000, Thailand
              </p>
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 mb-1">Phone</h3>
              <p class="text-gray-700">+66-76-XXX-XXXX</p>
            </div>
          </div>
        </div>

        <!-- Hours Section -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Opening Hours</h2>
          <div class="bg-gray-50 rounded-lg p-6">
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-200">
                  <th class="text-left py-2 font-semibold text-gray-900">Day</th>
                  <th class="text-right py-2 font-semibold text-gray-900">Hours</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-100">
                  <td class="py-2 text-gray-700">Monday</td>
                  <td class="py-2 text-right text-gray-700">10:00 - 22:00</td>
                </tr>
                <tr class="border-b border-gray-100">
                  <td class="py-2 text-gray-700">Tuesday</td>
                  <td class="py-2 text-right text-gray-700">10:00 - 22:00</td>
                </tr>
                <tr class="border-b border-gray-100">
                  <td class="py-2 text-gray-700">Wednesday</td>
                  <td class="py-2 text-right text-gray-700">10:00 - 22:00</td>
                </tr>
                <tr class="border-b border-gray-100">
                  <td class="py-2 text-gray-700">Thursday</td>
                  <td class="py-2 text-right text-gray-700">10:00 - 22:00</td>
                </tr>
                <tr class="border-b border-gray-100">
                  <td class="py-2 text-gray-700">Friday</td>
                  <td class="py-2 text-right text-gray-700">10:00 - 22:00</td>
                </tr>
                <tr class="border-b border-gray-100">
                  <td class="py-2 text-gray-700">Saturday</td>
                  <td class="py-2 text-right text-gray-700">10:00 - 22:00</td>
                </tr>
                <tr>
                  <td class="py-2 text-gray-700">Sunday</td>
                  <td class="py-2 text-right text-gray-700">10:00 - 22:00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// SEO Meta
useSeoMeta({
  title: 'Location & Hours | Take Me Away by KIKUZUKI | Krabi, Thailand',
  description: 'Find Take Me Away by KIKUZUKI in Krabi, Thailand. Get directions, view our location on Google Maps, and check our opening hours.',
  ogTitle: 'Location & Hours | Take Me Away by KIKUZUKI',
  ogDescription: 'Visit our Japanese robatayaki izakaya in Krabi, Thailand. View location, hours, and get directions.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/location',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Location & Hours - Take Me Away by KIKUZUKI',
  twitterDescription: 'Find our Japanese restaurant in Krabi, Thailand with directions and hours.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([{
  '@type': 'Restaurant',
  name: 'Take Me Away by KIKUZUKI',
  hasMap: 'https://maps.app.goo.gl/2KJfCAfH1idnRBqz6',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Southern Thailand',
    addressLocality: 'Krabi',
    addressRegion: 'Krabi Province',
    postalCode: '81000',
    addressCountry: 'TH'
  },
  geo: { 
    '@type': 'GeoCoordinates', 
    latitude: 8.0572977, 
    longitude: 98.7493211 
  },
  openingHoursSpecification: [{
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
    opens: '10:00',
    closes: '22:00'
  }],
  telephone: '+66-76-XXX-XXXX'
}])
</script>

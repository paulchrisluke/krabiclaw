<template>
  <div class="min-h-screen bg-white">
    <!-- Hero Section -->
    <div class="bg-black text-white py-16 px-4">
      <div class="max-w-6xl mx-auto text-center">
        <h1 class="text-4xl md:text-6xl font-bold mb-4">Contact Us</h1>
        <p class="text-lg md:text-xl opacity-90">Get in Touch with KIKUZUKI</p>
      </div>
    </div>

    <!-- Culinary Experience Message -->
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div class="bg-gray-50 rounded-lg p-8 mb-12">
        <div class="prose prose-lg max-w-none">
          <p class="text-gray-700 mb-4 leading-relaxed">
            For an unparalleled Japanese culinary experience in Krabi, Kikuzuki beckons you to transcend the virtual and savor the exquisite reality. Our website offers a mere glimpse of the gastronomic symphony that awaits—robust robatayaki grills and artful sushi creations.
          </p>
          <p class="text-gray-700 mb-4 leading-relaxed">
            Contact us to transform your online curiosity into a reservation, immersing yourself in the warm ambiance, skilled craftsmanship, and tantalizing flavors that define Kikuzuki. Whether celebrating milestones or seeking a memorable dining escape, our team stands ready to ensure your visit is a seamless fusion of authenticity and culinary delight.
          </p>
          <p class="text-gray-700 font-semibold leading-relaxed">
            Elevate your senses; contact Kikuzuki for an unforgettable Japanese dining adventure.
          </p>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-12">
        <!-- Contact Details -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Contact Information</h2>
          <div class="space-y-6">
            <div>
              <h3 class="font-semibold text-gray-900 mb-2">Restaurant</h3>
              <p class="text-gray-700">Take Me Away by KIKUZUKI</p>
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 mb-2">Address</h3>
              <p class="text-gray-700">
                Southern Thailand<br>
                Krabi, Krabi Province<br>
                81000, Thailand
              </p>
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 mb-2">Phone</h3>
              <p class="text-gray-700">+66-76-XXX-XXXX</p>
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 mb-2">Email</h3>
              <p class="text-gray-700">info@kikuzuki-thailand.com</p>
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 mb-2">Hours</h3>
              <p class="text-gray-700">Daily: 10:00 - 22:00</p>
            </div>
          </div>

          <!-- Social Media -->
          <div class="mt-8">
            <h3 class="font-semibold text-gray-900 mb-4">Follow Us</h3>
            <div class="flex space-x-4">
              <a href="https://www.facebook.com/kikuzuki-thailand" target="_blank" rel="noopener noreferrer" class="text-gray-600 hover:text-gray-900">
                Facebook
              </a>
              <a href="https://www.instagram.com/kikuzuki-thailand" target="_blank" rel="noopener noreferrer" class="text-gray-600 hover:text-gray-900">
                Instagram
              </a>
            </div>
          </div>
        </div>

        <!-- Contact Form -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Send Us a Message</h2>
          <div class="bg-gray-50 rounded-lg p-6">
            <form class="space-y-4">
              <div>
                <label for="name" class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" id="name" name="name" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent">
              </div>
              <div>
                <label for="email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" id="email" name="email" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent">
              </div>
              <div>
                <label for="phone" class="block text-sm font-medium text-gray-700 mb-1">Phone (Optional)</label>
                <input type="tel" id="phone" name="phone" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent">
              </div>
              <div>
                <label for="subject" class="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <select id="subject" name="subject" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent">
                  <option value="">Select a subject</option>
                  <option value="general">General Inquiry</option>
                  <option value="reservation">Reservation Question</option>
                  <option value="catering">Catering</option>
                  <option value="feedback">Feedback</option>
                </select>
              </div>
              <div>
                <label for="message" class="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea id="message" name="message" rows="4" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"></textarea>
              </div>
              <div>
                <button type="submit" class="w-full bg-black text-white py-3 px-4 rounded-md font-semibold hover:bg-gray-800 transition-colors">
                  Send Message
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="mt-12 text-center">
        <div class="grid md:grid-cols-2 gap-6">
          <a href="/reservations" class="block bg-gray-100 rounded-lg p-6 hover:bg-gray-200 transition-colors">
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Make a Reservation</h3>
            <p class="text-gray-700">Book your table online or call us directly</p>
          </a>
          <a href="/location" class="block bg-gray-100 rounded-lg p-6 hover:bg-gray-200 transition-colors">
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Find Us</h3>
            <p class="text-gray-700">Get directions and view our location on Google Maps</p>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
useSeoMeta({
  title: 'Contact | Take Me Away by KIKUZUKI | Krabi Thailand',
  description: 'Contact Take Me Away by KIKUZUKI in Krabi, Thailand. Get our phone number, address, email, and send us a message. Make reservations or inquire about our Japanese robatayaki restaurant.',
  ogTitle: 'Contact | Take Me Away by KIKUZUKI',
  ogDescription: 'Contact our Japanese robatayaki restaurant in Krabi, Thailand for reservations and inquiries.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/contact',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Contact - Take Me Away by KIKUZUKI',
  twitterDescription: 'Contact our Japanese restaurant in Krabi, Thailand.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([{
  '@type': 'Restaurant',
  name: 'Take Me Away by KIKUZUKI',
  telephone: '+66-76-XXX-XXXX',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Southern Thailand',
    addressLocality: 'Krabi',
    addressRegion: 'Krabi Province',
    postalCode: '81000',
    addressCountry: 'TH'
  },
  email: 'info@kikuzuki-thailand.com',
  openingHoursSpecification: [{
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
    opens: '10:00',
    closes: '22:00'
  }]
}])
</script>

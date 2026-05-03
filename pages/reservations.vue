<template>
  <div class="min-h-screen bg-white">
    <!-- Hero Section -->
    <div class="bg-black text-white py-16 px-4">
      <div class="max-w-6xl mx-auto text-center">
        <h1 class="text-4xl md:text-6xl font-bold mb-4">Reserve a Table at KIKUZUKI</h1>
        <p class="text-lg md:text-xl opacity-90">Book Your Authentic Japanese Robatayaki Experience</p>
      </div>
    </div>

    <!-- Reservation Form Section -->
    <div class="max-w-6xl mx-auto px-4 py-12">
      <div class="grid md:grid-cols-2 gap-12">
        <!-- Reservation Form -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Make a Reservation</h2>
          <div class="bg-gray-50 rounded-lg p-6">
            <form class="space-y-4">
              <div>
                <label for="res-name" class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" id="res-name" name="name" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent">
              </div>
              <div>
                <label for="res-email" class="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" id="res-email" name="email" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent">
              </div>
              <div>
                <label for="res-phone" class="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <input type="tel" id="res-phone" name="phone" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent">
              </div>
              <div class="grid md:grid-cols-2 gap-4">
                <div>
                  <label for="res-date" class="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input type="date" id="res-date" name="date" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent">
                </div>
                <div>
                  <label for="res-time" class="block text-sm font-medium text-gray-700 mb-1">Time *</label>
                  <select id="res-time" name="time" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent">
                    <option value="">Select time</option>
                    <option value="10:00">10:00</option>
                    <option value="11:00">11:00</option>
                    <option value="12:00">12:00</option>
                    <option value="13:00">13:00</option>
                    <option value="14:00">14:00</option>
                    <option value="15:00">15:00</option>
                    <option value="16:00">16:00</option>
                    <option value="17:00">17:00</option>
                    <option value="18:00">18:00</option>
                    <option value="19:00">19:00</option>
                    <option value="20:00">20:00</option>
                    <option value="21:00">21:00</option>
                  </select>
                </div>
              </div>
              <div>
                <label for="res-guests" class="block text-sm font-medium text-gray-700 mb-1">Number of Guests *</label>
                <select id="res-guests" name="guests" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent">
                  <option value="">Select guests</option>
                  <option value="1">1 Guest</option>
                  <option value="2">2 Guests</option>
                  <option value="3">3 Guests</option>
                  <option value="4">4 Guests</option>
                  <option value="5">5 Guests</option>
                  <option value="6">6 Guests</option>
                  <option value="7">7 Guests</option>
                  <option value="8">8+ Guests</option>
                </select>
              </div>
              <div>
                <label for="res-occasion" class="block text-sm font-medium text-gray-700 mb-1">Occasion (Optional)</label>
                <select id="res-occasion" name="occasion" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent">
                  <option value="">Select occasion</option>
                  <option value="birthday">Birthday</option>
                  <option value="anniversary">Anniversary</option>
                  <option value="business">Business Dinner</option>
                  <option value="date">Date Night</option>
                  <option value="family">Family Gathering</option>
                  <option value="celebration">Celebration</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label for="res-requests" class="block text-sm font-medium text-gray-700 mb-1">Special Requests (Optional)</label>
                <textarea id="res-requests" name="requests" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent" placeholder="Any dietary restrictions, seating preferences, etc."></textarea>
              </div>
              <div>
                <button type="submit" class="w-full bg-black text-white py-3 px-4 rounded-md font-semibold hover:bg-gray-800 transition-colors">
                  Make Reservation
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Reservation Information -->
        <div>
          <h2 class="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Reservation Details</h2>
          
          <!-- Contact Info -->
          <div class="bg-gray-50 rounded-lg p-6 mb-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
            <div class="space-y-2">
              <p class="text-gray-700">
                <strong>Phone:</strong> +66-76-XXX-XXXX
              </p>
              <p class="text-gray-700">
                <strong>Email:</strong> info@kikuzuki-thailand.com
              </p>
              <p class="text-gray-700">
                <strong>Address:</strong> Southern Thailand, Krabi 81000
              </p>
            </div>
          </div>

          <!-- Hours -->
          <div class="bg-gray-50 rounded-lg p-6 mb-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Opening Hours</h3>
            <p class="text-gray-700">Daily: 10:00 - 22:00</p>
            <p class="text-sm text-gray-600 mt-2">Last reservation accepted at 21:00</p>
          </div>

          <!-- Policies -->
          <div class="bg-gray-50 rounded-lg p-6 mb-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Reservation Policies</h3>
            <ul class="space-y-2 text-gray-700">
              <li>• Reservations are held for 15 minutes</li>
              <li>• Cancellations required 2 hours in advance</li>
              <li>• Large parties (6+ guests) may require deposit</li>
              <li>• Special dietary requests accommodated with advance notice</li>
            </ul>
          </div>

          <!-- Quick Actions -->
          <div class="space-y-4">
            <a href="tel:+6676XXXXXX" class="block bg-black text-white text-center py-3 px-4 rounded-md font-semibold hover:bg-gray-800 transition-colors">
              Call to Reserve: +66-76-XXX-XXXX
            </a>
            <a href="/contact" class="block bg-gray-100 text-center py-3 px-4 rounded-md font-semibold hover:bg-gray-200 transition-colors">
              Send Message
            </a>
            <a href="/menu" class="block bg-gray-100 text-center py-3 px-4 rounded-md font-semibold hover:bg-gray-200 transition-colors">
              View Menu
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
useSeoMeta({
  title: 'Reserve a Table | Take Me Away by KIKUZUKI | Krabi Thailand',
  description: 'Reserve a table at KIKUZUKI, our authentic Japanese robatayaki restaurant in Krabi, Thailand. Book online or call us directly for the best Japanese dining experience.',
  ogTitle: 'Reserve a Table | Take Me Away by KIKUZUKI',
  ogDescription: 'Book your table at our Japanese robatayaki restaurant in Krabi, Thailand.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/reservations',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Reserve a Table - Take Me Away by KIKUZUKI',
  twitterDescription: 'Book your table at our Japanese restaurant in Krabi, Thailand.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([{
  '@type': 'Restaurant',
  name: 'Take Me Away by KIKUZUKI',
  telephone: '+66-76-XXX-XXXX',
  potentialAction: {
    '@type': 'ReservationAction',
    target: 'tel:+6676XXXXXX'
  }
}])
</script>

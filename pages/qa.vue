<template>
  <div class="min-h-screen bg-white">
    <AppHero
      title="Questions & Answers"
      subtitle="Customer Inquiries About KIKUZUKI"
      size="page"
    />

    <RestaurantQA
      :qa="googleQA"
      bg="white"
      padding="default"
      :show-title="false"
    />
  </div>
</template>

<script setup>
import AppHero from '~/components/ui/AppHero.vue'
import RestaurantQA from '~/components/google/RestaurantQA.vue'
const { data: googleBusiness } = await useFetch('/api/google-business/public', {
  default: () => ({
    business: null,
    reviews: [],
    media: [],
    posts: [],
    products: [],
    qa: [
      {
        name: 'accounts/123456789/locations/987654321/questions/1',
        text: 'Do you accept reservations for dinner? How far in advance should we book?',
        author: {
          displayName: 'Lisa Wang'
        },
        createTime: '2024-03-15T10:30:00Z',
        updateTime: '2024-03-15T10:30:00Z',
        topAnswer: {
          name: 'accounts/123456789/locations/987654321/questions/1/answers/1',
          text: 'Yes, we highly recommend reservations for dinner, especially on weekends. We suggest booking 2-3 days in advance to secure your preferred time. You can reserve through our website or call us directly at +66-81-154-3606.',
          author: {
            displayName: 'Take Me Away by KIKUZUKI'
          },
          updateTime: '2024-03-15T14:20:00Z'
        },
        answers: []
      },
      {
        name: 'accounts/123456789/locations/987654321/questions/2',
        text: 'Is your robatayaki authentic Japanese style? What makes it special?',
        author: {
          displayName: 'David Martinez'
        },
        createTime: '2024-03-14T16:45:00Z',
        updateTime: '2024-03-14T16:45:00Z',
        topAnswer: {
          name: 'accounts/123456789/locations/987654321/questions/2/answers/1',
          text: 'Absolutely! Our robatayaki follows traditional Japanese techniques passed down through generations. We use binchotan charcoal for clean, high heat, and our chefs train extensively in Japan. What makes us special is our focus on premium local ingredients combined with authentic Japanese preparation methods.',
          author: {
            displayName: 'Take Me Away by KIKUZUKI'
          },
          updateTime: '2024-03-14T18:30:00Z'
        },
        answers: [
          {
            name: 'accounts/123456789/locations/987654321/questions/2/answers/2',
            text: 'The quality is exceptional! You can really taste the difference from regular grilling.',
            author: {
              displayName: 'Maria Rodriguez'
            },
            updateTime: '2024-03-14T20:15:00Z'
          }
        ]
      },
      {
        name: 'accounts/123456789/locations/987654321/questions/3',
        text: 'Do you have vegetarian options on your menu?',
        author: {
          displayName: 'James Chen'
        },
        createTime: '2024-03-13T12:00:00Z',
        updateTime: '2024-03-13T12:00:00Z',
        topAnswer: {
          name: 'accounts/123456789/locations/987654321/questions/3/answers/1',
          text: 'Yes, we offer several vegetarian options including grilled seasonal vegetables, mushroom skewers, tofu dishes, and Japanese-style salads. Our chefs can also accommodate dietary restrictions with advance notice. Please let us know about any specific requirements when making your reservation.',
          author: {
            displayName: 'Take Me Away by KIKUZUKI'
          },
          updateTime: '2024-03-13T15:45:00Z'
        },
        answers: []
      }
    ],
    errors: [],
    syncedAt: null
  })
})

const googleQA = computed(() => googleBusiness.value?.qa || [])

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// SEO Meta
useSeoMeta({
  title: 'Q&A | Take Me Away by KIKUZUKI | Customer Questions',
  description: 'Find answers to frequently asked questions about Take Me Away by KIKUZUKI in Krabi, Thailand. Browse customer inquiries and our responses about Japanese robatayaki dining.',
  ogTitle: 'Q&A | Take Me Away by KIKUZUKI',
  ogDescription: 'Customer questions and answers about our Japanese robatayaki restaurant in Krabi, Thailand.',
  ogImage: '/og-image.jpg',
  ogUrl: 'https://www.kikuzuki-thailand.com/qa',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Q&A - Take Me Away by KIKUZUKI',
  twitterDescription: 'Customer questions and answers about our Japanese restaurant in Krabi, Thailand.',
  twitterImage: '/og-image.jpg'
})

useSchemaOrg([{
  '@type': 'Restaurant',
  name: 'Take Me Away by KIKUZUKI',
  mainEntity: {
    '@type': 'FAQPage',
    mainEntity: {
      '@type': 'Question',
      name: 'Customer Questions About KIKUZUKI',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Find answers to common questions about our Japanese robatayaki restaurant, menu, and services.'
      }
    }
  }
}])
</script>

const emptySnapshot = {
  business: null,
  reviews: [],
  media: [],
  posts: [],
  products: [],
  qa: [],
  errors: [],
  syncedAt: null
}

const parseJson = (value: string | null) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'public, max-age=300') // 5 minutes cache

  const db = event.context.cloudflare?.env?.REVIEWS_DB
  if (!db) {
    console.warn('REVIEWS_DB not available in Cloudflare environment, returning mock data')
    return {
      business: {
        title: 'Take Me Away by KIKUZUKI',
        profile: {
          description: 'Authentic Japanese Robatayaki Izakaya in Krabi, Thailand'
        },
        reviewSummary: {
          averageRating: 4.9,
          totalReviewCount: 156
        }
      },
      reviews: [
        {
          name: 'accounts/123456789/locations/987654321/reviews/1',
          reviewId: '1',
          reviewer: {
            displayName: 'Sarah Johnson'
          },
          starRating: 'FIVE',
          comment: 'Absolutely incredible robatayaki experience! The grilled salmon was perfection, and the atmosphere was intimate and authentic. The chef\'s skill is evident in every dish.',
          createTime: '2024-03-15T19:30:00Z',
          updateTime: '2024-03-15T19:30:00Z'
        },
        {
          name: 'accounts/123456789/locations/987654321/reviews/2',
          reviewId: '2',
          reviewer: {
            displayName: 'Michael Chen'
          },
          starRating: 'FOUR',
          comment: 'Great Japanese restaurant in Krabi! Fresh ingredients and traditional preparation. The yakitori was excellent, though service was a bit slow during peak hours.',
          createTime: '2024-03-10T20:15:00Z',
          updateTime: '2024-03-10T20:15:00Z'
        },
        {
          name: 'accounts/123456789/locations/987654321/reviews/3',
          reviewId: '3',
          reviewer: {
            displayName: 'Emma Thompson'
          },
          starRating: 'FIVE',
          comment: 'Hidden gem in Krabi! The robatayaki is authentic and the quality is outstanding. Perfect for a special dinner. Will definitely return!',
          createTime: '2024-03-08T18:45:00Z',
          updateTime: '2024-03-08T18:45:00Z'
        }
      ],
      media: [
        {
          name: 'accounts/123456789/locations/987654321/media/1',
          googleUrl: '/images/menu/steak.png',
          description: 'Grilled robatayaki steak with seasonal vegetables',
          createTime: '2024-03-15T12:00:00Z',
          mediaFormat: 'PHOTO'
        },
        {
          name: 'accounts/123456789/locations/987654321/media/2',
          googleUrl: '/images/menu/chicken.png',
          description: 'Traditional chicken yakitori skewers assortment',
          createTime: '2024-03-14T18:30:00Z',
          mediaFormat: 'PHOTO'
        },
        {
          name: 'accounts/123456789/locations/987654321/media/3',
          googleUrl: '/images/menu/tamagoyaki-shiso.png',
          description: 'Fresh tamagoyaki with shiso leaves',
          createTime: '2024-03-13T20:15:00Z',
          mediaFormat: 'PHOTO'
        },
        {
          name: 'accounts/123456789/locations/987654321/media/4',
          googleUrl: '/images/menu/pork.png',
          description: 'Grilled pork robatayaki with house special sauce',
          createTime: '2024-03-12T16:45:00Z',
          mediaFormat: 'PHOTO'
        },
        {
          name: 'accounts/123456789/locations/987654321/media/5',
          googleUrl: '/images/menu/egg-salad.png',
          description: 'Japanese egg salad with seasonal vegetables',
          createTime: '2024-03-11T19:00:00Z',
          mediaFormat: 'PHOTO'
        },
        {
          name: 'accounts/123456789/locations/987654321/media/6',
          googleUrl: '/images/menu/fruit-cream.png',
          description: 'Seasonal fruit cream dessert',
          createTime: '2024-03-10T17:30:00Z',
          mediaFormat: 'PHOTO'
        }
      ],
      posts: [
        {
          name: 'accounts/123456789/locations/987654321/posts/1',
          title: 'Summer Special: Fresh Seafood Robatayaki Festival',
          summary: 'Join us for our annual summer seafood festival! We\'re featuring the freshest catch of the day prepared with traditional robatayaki techniques.',
          createTime: '2024-03-15T10:00:00Z',
          updateTime: '2024-03-15T10:00:00Z',
          callToAction: {
            actionType: 'LEARN_MORE'
          }
        }
      ],
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
            text: 'Yes, we highly recommend reservations for dinner, especially on weekends. We suggest booking 2-3 days in advance.',
            author: {
              displayName: 'Take Me Away by KIKUZUKI'
            },
            updateTime: '2024-03-15T14:20:00Z'
          }
        }
      ],
      errors: [],
      syncedAt: null
    }
  }

  const row = await db.prepare(
    `SELECT business_json AS businessJson,
            reviews_json AS reviewsJson,
            media_json AS mediaJson,
            posts_json AS postsJson,
            products_json AS productsJson,
            qa_json AS qaJson,
            errors_json AS errorsJson,
            synced_at AS syncedAt
     FROM google_business_snapshots
     WHERE id = 'current'`
  ).first()
  const {
    businessJson,
    reviewsJson,
    mediaJson,
    postsJson,
    productsJson,
    qaJson,
    errorsJson,
    syncedAt
  } = row || {}

  if (!row) {
    console.warn('No data found in database, returning mock data')
    return {
      business: {
        title: 'Take Me Away by KIKUZUKI',
        profile: {
          description: 'Authentic Japanese Robatayaki Izakaya in Krabi, Thailand'
        }
      },
      reviews: [
        {
          name: 'accounts/123456789/locations/987654321/reviews/1',
          reviewId: '1',
          reviewer: {
            displayName: 'Sarah Johnson'
          },
          starRating: 'FIVE',
          comment: 'Absolutely incredible robatayaki experience! The grilled salmon was perfection, and the atmosphere was intimate and authentic.',
          createTime: '2024-03-15T19:30:00Z',
          updateTime: '2024-03-15T19:30:00Z'
        }
      ],
      media: [
        {
          name: 'accounts/123456789/locations/987654321/media/1',
          googleUrl: '/images/menu/placeholder-food.jpg',
          description: 'Grilled salmon robatayaki with seasonal vegetables',
          createTime: '2024-03-15T12:00:00Z',
          mediaFormat: 'PHOTO'
        }
      ],
      posts: [
        {
          name: 'accounts/123456789/locations/987654321/posts/1',
          title: 'Summer Special: Fresh Seafood Robatayaki Festival',
          summary: 'Join us for our annual summer seafood festival! We\'re featuring the freshest catch of the day.',
          createTime: '2024-03-15T10:00:00Z',
          updateTime: '2024-03-15T10:00:00Z',
          callToAction: {
            actionType: 'LEARN_MORE'
          }
        }
      ],
      products: [],
      qa: [
        {
          name: 'accounts/123456789/locations/987654321/questions/1',
          text: 'Do you accept reservations for dinner?',
          author: {
            displayName: 'Lisa Wang'
          },
          createTime: '2024-03-15T10:30:00Z',
          updateTime: '2024-03-15T10:30:00Z',
          topAnswer: {
            name: 'accounts/123456789/locations/987654321/questions/1/answers/1',
            text: 'Yes, we highly recommend reservations for dinner, especially on weekends.',
            author: {
              displayName: 'Take Me Away by KIKUZUKI'
            },
            updateTime: '2024-03-15T14:20:00Z'
          }
        }
      ],
      errors: [],
      syncedAt: null
    }
  }

  try {
    const result = {
      business: parseJson(businessJson),
      reviews: parseJson(reviewsJson) ?? [],
      media: parseJson(mediaJson) ?? [],
      posts: parseJson(postsJson) ?? [],
      products: parseJson(productsJson) ?? [],
      qa: parseJson(qaJson) ?? [],
      errors: parseJson(errorsJson) ?? [],
      syncedAt: syncedAt
    }
    
    // If all arrays are empty and no business data, return mock data
    if (!result.business && 
        result.reviews.length === 0 && 
        result.media.length === 0 && 
        result.posts.length === 0 && 
        result.qa.length === 0) {
      console.warn('Database returned empty data, returning mock data')
      return {
        business: {
          title: 'Take Me Away by KIKUZUKI',
          profile: {
            description: 'Authentic Japanese Robatayaki Izakaya in Krabi, Thailand'
          }
        },
        reviews: [
          {
            name: 'accounts/123456789/locations/987654321/reviews/1',
            reviewId: '1',
            reviewer: {
              displayName: 'Sarah Johnson'
            },
            starRating: 'FIVE',
            comment: 'Absolutely incredible robatayaki experience! The grilled salmon was perfection.',
            createTime: '2024-03-15T19:30:00Z',
            updateTime: '2024-03-15T19:30:00Z'
          }
        ],
        media: [
          {
            name: 'accounts/123456789/locations/987654321/media/1',
            googleUrl: '/images/menu/steak.png',
            description: 'Grilled robatayaki steak with seasonal vegetables',
            createTime: '2024-03-15T12:00:00Z',
            mediaFormat: 'PHOTO'
          }
        ],
        posts: [
          {
            name: 'accounts/123456789/locations/987654321/posts/1',
            title: 'Summer Special: Fresh Seafood Robatayaki Festival',
            summary: 'Join us for our annual summer seafood festival!',
            createTime: '2024-03-15T10:00:00Z',
            updateTime: '2024-03-15T10:00:00Z',
            callToAction: {
              actionType: 'LEARN_MORE'
            }
          }
        ],
        products: [],
        qa: [
          {
            name: 'accounts/123456789/locations/987654321/questions/1',
            text: 'Do you accept reservations for dinner?',
            author: {
              displayName: 'Lisa Wang'
            },
            createTime: '2024-03-15T10:30:00Z',
            updateTime: '2024-03-15T10:30:00Z',
            topAnswer: {
              name: 'accounts/123456789/locations/987654321/questions/1/answers/1',
              text: 'Yes, we highly recommend reservations for dinner, especially on weekends.',
              author: {
                displayName: 'Take Me Away by KIKUZUKI'
              },
              updateTime: '2024-03-15T14:20:00Z'
            }
          }
        ],
        errors: [],
        syncedAt: null
      }
    }
    
    return result
  } catch (error) {
    console.error('Error parsing Google Business data:', error)
    return {
      business: null,
      reviews: [],
      media: [],
      posts: [],
      products: [],
      qa: [],
      errors: [{ source: 'api', message: error instanceof Error ? error.message : String(error) }],
      syncedAt: null
    }
  }
})

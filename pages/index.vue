<template>
  <div class="overflow-hidden">
    <hero />
    <MenuSections
      :weekText="weekText"
      :title="title"
      :sections="menuSections"
    />
    <buy-on-amazon />
  </div>
</template>

<script setup>
import { filename } from 'pathe/utils'
import MenuSections from '~/components/menu/MenuSections.vue'

const glob = import.meta.glob('@/assets/images/menu/*.png', { eager: true })

const images = Object.fromEntries(
  Object.entries(glob).map(([key, value]) => [filename(key), value.default])
)

definePageMeta({
  layout: 'home'
})

useHead({
  title: 'Sand-O | Authentic Shokupan Bread',
  meta: [
    { property: 'og:title', content: 'Sand-O | Authentic Shokupan Bread' },
    { property: 'og:description', content: 'Come taste the 8th wonder of the world. Authentic Shokupan Bread, where dreams come true.' },
    { property: 'og:image', content: 'https://sand-o.com/og-image.jpg' },
    { property: 'og:video', content: 'https://sand-o.com/og-video.mp4' },
    { property: 'og:url', content: 'https://sand-o.com' },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'Sand-O' },
    { name: 'theme-color', content: '#000000' }
  ],
  link: [
    { rel: 'icon', href: 'https://sand-o.com/favicon.ico', type: 'image/x-icon' },
    { rel: 'shortcut icon', href: 'https://sand-o.com/favicon.ico', type: 'image/x-icon' }
  ]
})

const weekText = "Week of Oct 14-21"
const title = "Featured Flavors"
const menuSections = [
  {
    id: "chicken",
    title: "Chicken Katsu",
    description: "The Chicken Sand-O is a tasty chicken sandwich featuring a crispy or grilled chicken fillet on a soft bun, topped with fresh lettuce, tomatoes, and your choice of sauce. It's a satisfying option for a quick meal.",
    image: images['chicken']
  },
  {
    id: "pork",
    title: "Pork Katsu",
    description: "The Pork Katsu is a delicious Japanese-style breaded and fried pork cutlet, served with a tangy tonkatsu sauce, fresh cabbage, and steamed rice. It's a hearty and flavorful dish that's perfect for lunch or dinner.",
    image: images['pork']
  },
  {
    id: "egg",
    title: "Egg Salad",
    description: "Our Egg Salad sandwich is a classic comfort food made with creamy, perfectly seasoned egg salad on your choice of bread. It's topped with crisp lettuce and served with a side of pickles for a satisfying meal.",
    image: images['egg-salad']
  },
  {
    id: "steak",
    title: "Steak Katsu",
    description: "The Steak Katsu is a premium dish featuring a tender, breaded and fried beef steak cutlet. It's served with a rich katsu sauce, a side of crisp vegetables, and your choice of steamed rice or fries for a luxurious dining experience.",
    image: images['steak']
  }
]
</script>
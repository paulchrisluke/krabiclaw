const fs = require('fs');
const files = [
  'pages/about.vue',
  'pages/reviews.vue',
  'pages/photos.vue',
  'pages/posts.vue',
  'pages/qa.vue',
  'pages/location.vue',
  'pages/contact.vue'
];

const target = `const { data: googleBusiness } = await useFetch('/api/google-business/public', {
  default: () => ({
    business: null,
    reviews: [],
    media: [],
    posts: [],
    products: [],
    qa: [],
    errors: [],
    syncedAt: null
  })
})`;

const replacement = `const { data: googleBusiness } = await useFetch('/api/google-business/public', {
  key: 'google-business-public',
  default: () => ({
    business: null,
    reviews: [],
    media: [],
    posts: [],
    errors: [],
    syncedAt: null
  })
})`;

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    if (content.includes(target)) {
      fs.writeFileSync(f, content.replace(target, replacement));
      console.log('Fixed', f);
    } else {
      console.log('Target not found in', f);
    }
  }
});

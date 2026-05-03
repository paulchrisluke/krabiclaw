<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Builder Header -->
    <div class="bg-white border-b border-stone-200 px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <h1 class="text-xl font-bold text-gray-900">Website Builder</h1>
          <div class="flex items-center gap-2">
            <button
              @click="editMode = !editMode"
              :class="[
                'px-4 py-2 rounded-lg font-medium transition-colors',
                editMode 
                  ? 'bg-black text-white' 
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              ]"
            >
              {{ editMode ? 'Preview Mode' : 'Edit Mode' }}
            </button>
          </div>
        </div>
        
        <div class="flex items-center gap-2">
          <button
            @click="saveAllChanges"
            :disabled="!hasChanges"
            class="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save All Changes
          </button>
          <NuxtLink
            to="/admin"
            class="px-4 py-2 text-stone-600 hover:text-stone-900 font-medium transition-colors"
          >
            Back to Admin
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Page Navigation -->
    <div class="bg-white border-b border-stone-200 px-6 py-3">
      <div class="flex items-center gap-6">
        <button
          v-for="page in pages"
          :key="page.id"
          @click="currentPage = page.id"
          :class="[
            'px-4 py-2 rounded-lg font-medium transition-colors',
            currentPage === page.id
              ? 'bg-black text-white'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          ]"
        >
          {{ page.name }}
        </button>
      </div>
    </div>

    <!-- Builder Canvas -->
    <div class="max-w-6xl mx-auto px-6 py-8">
      <!-- Home Page -->
      <div v-if="currentPage === 'home'" class="space-y-8">
        <!-- Hero Section -->
        <div class="bg-white rounded-3xl border-2 border-dashed border-stone-300 overflow-hidden relative group">
          <div v-if="editMode" class="absolute inset-0 bg-black bg-opacity-5 flex items-center justify-center z-10">
            <button
              @click="editHomeHero"
              class="bg-black text-white px-4 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Edit Hero
            </button>
          </div>
          
          <div class="relative h-96 bg-gradient-to-br from-stone-900 to-stone-700 flex items-center justify-center">
            <div class="text-center text-white px-8">
              <h2 class="text-4xl font-bold mb-4">
                {{ homeHeroContent?.hero_title || 'Welcome to KIKUZUKI' }}
              </h2>
              <p class="text-xl opacity-90">
                {{ homeHeroContent?.hero_subtitle || 'Authentic Japanese Experience' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Content Sections -->
        <div class="grid md:grid-cols-3 gap-8">
          <div class="bg-white rounded-3xl border-2 border-dashed border-stone-300 p-8 relative group">
            <div v-if="editMode" class="absolute inset-0 bg-black bg-opacity-5 flex items-center justify-center z-10">
              <button
                @click="editAboutStory"
                class="bg-black text-white px-4 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Edit Story
              </button>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-4">Our Story</h3>
            <div v-if="aboutStoryContent" v-html="aboutStoryContent.content" class="text-sm text-stone-600 prose prose-sm max-w-none"></div>
            <p v-else class="text-sm text-stone-500">Add your restaurant story...</p>
          </div>

          <div class="bg-white rounded-3xl border-2 border-dashed border-stone-300 p-8 relative group">
            <div v-if="editMode" class="absolute inset-0 bg-black bg-opacity-5 flex items-center justify-center z-10">
              <button
                @click="editContactIntro"
                class="bg-black text-white px-4 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Edit Contact
              </button>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-4">Contact Us</h3>
            <div v-if="contactIntroContent" v-html="contactIntroContent.content" class="text-sm text-stone-600 prose prose-sm max-w-none"></div>
            <p v-else class="text-sm text-stone-500">Add contact introduction...</p>
          </div>

          <div class="bg-white rounded-3xl border-2 border-dashed border-stone-300 p-8 relative group">
            <div v-if="editMode" class="absolute inset-0 bg-black bg-opacity-5 flex items-center justify-center z-10">
              <button
                @click="showStaffEditor = true"
                class="bg-black text-white px-4 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Edit Staff
              </button>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-4">Our Team</h3>
            <div v-if="staff.length" class="space-y-3">
              <div v-for="member in staff.slice(0, 3)" :key="member.id" class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center">
                  <img v-if="member.image_url" :src="member.image_url" :alt="member.name" class="w-full h-full rounded-full object-cover" />
                  <span v-else class="text-stone-500 text-xs">{{ member.name.charAt(0) }}</span>
                </div>
                <div>
                  <p class="text-sm font-medium text-gray-900">{{ member.name }}</p>
                  <p class="text-xs text-stone-500">{{ member.role }}</p>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-stone-500">Add team members...</p>
          </div>
        </div>
      </div>

      <!-- About Page -->
      <div v-if="currentPage === 'about'" class="space-y-8">
        <div class="bg-white rounded-3xl border-2 border-dashed border-stone-300 p-12 relative group">
          <div v-if="editMode" class="absolute inset-0 bg-black bg-opacity-5 flex items-center justify-center z-10">
            <button
              @click="editAboutStory"
              class="bg-black text-white px-4 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Edit About Story
            </button>
          </div>
          <div v-if="aboutStoryContent" v-html="aboutStoryContent.content" class="prose prose-lg max-w-none"></div>
          <div v-else class="text-center text-stone-500">
            <p class="text-lg">Add your restaurant story...</p>
          </div>
        </div>
      </div>

      <!-- Contact Page -->
      <div v-if="currentPage === 'contact'" class="space-y-8">
        <div class="bg-white rounded-3xl border-2 border-dashed border-stone-300 p-12 relative group">
          <div v-if="editMode" class="absolute inset-0 bg-black bg-opacity-5 flex items-center justify-center z-10">
            <button
              @click="editContactIntro"
              class="bg-black text-white px-4 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Edit Contact Intro
            </button>
          </div>
          <div v-if="contactIntroContent" v-html="contactIntroContent.content" class="prose prose-lg max-w-none"></div>
          <div v-else class="text-center text-stone-500">
            <p class="text-lg">Add contact introduction...</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Inline Editor Modal -->
    <div v-if="showInlineEditor" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h3 class="text-xl font-bold text-gray-900 mb-4">
          {{ editorTitle }}
        </h3>
        
        <form @submit.prevent="saveInlineEdit" class="space-y-4">
          <!-- Dynamic form fields based on editor type -->
          <div v-if="editorType === 'homeHero'">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Hero Title</label>
              <input
                v-model="inlineForm.hero_title"
                type="text"
                class="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Hero Subtitle</label>
              <input
                v-model="inlineForm.hero_subtitle"
                type="text"
                class="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Hero Video URL</label>
              <input
                v-model="inlineForm.hero_video_url"
                type="url"
                class="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>
          </div>

          <div v-else>
            <label class="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea
              v-model="inlineForm.content"
              rows="8"
              class="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
            />
          </div>

          <div class="flex justify-end gap-3 pt-4">
            <button
              type="button"
              @click="showInlineEditor = false"
              class="px-4 py-2 text-stone-600 hover:text-stone-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-black text-white rounded-lg hover:bg-stone-800 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Staff Editor Modal (reuse from content page) -->
    <div v-if="showStaffEditor" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h3 class="text-xl font-bold text-gray-900 mb-4">Staff Profiles</h3>
        
        <div class="space-y-4">
          <div v-for="(member, index) in staff" :key="member.id" class="flex items-center gap-4 p-4 border border-stone-200 rounded-lg">
            <div class="w-12 h-12 rounded-full bg-stone-200 flex items-center justify-center">
              <img v-if="member.image_url" :src="member.image_url" :alt="member.name" class="w-full h-full rounded-full object-cover" />
              <span v-else class="text-stone-500 text-lg">{{ member.name.charAt(0) }}</span>
            </div>
            <div class="flex-1">
              <input
                v-model="member.name"
                type="text"
                placeholder="Name"
                class="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent mb-2"
              />
              <input
                v-model="member.role"
                type="text"
                placeholder="Role"
                class="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent mb-2"
              />
              <textarea
                v-model="member.bio"
                rows="2"
                placeholder="Bio"
                class="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              />
            </div>
            <button
              @click="removeStaff(index)"
              class="text-red-600 hover:text-red-700 font-medium"
            >
              Remove
            </button>
          </div>
          
          <button
            @click="addStaff"
            class="w-full py-3 border-2 border-dashed border-stone-300 rounded-lg text-stone-600 hover:border-stone-400 hover:text-stone-700 transition-colors"
          >
            + Add Staff Member
          </button>
        </div>

        <div class="flex justify-end gap-3 pt-4">
          <button
            type="button"
            @click="showStaffEditor = false"
            class="px-4 py-2 text-stone-600 hover:text-stone-900 transition-colors"
          >
            Cancel
          </button>
          <button
            @click="saveStaff"
            class="px-4 py-2 bg-black text-white rounded-lg hover:bg-stone-800 transition-colors"
          >
            Save Staff
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'admin' })

// Builder state
const editMode = ref(false)
const currentPage = ref('home')
const hasChanges = ref(false)

// Content state
const content = ref([])
const staff = ref([])

// Modal states
const showInlineEditor = ref(false)
const showStaffEditor = ref(false)
const editorType = ref('')
const editorTitle = ref('')

// Form data
const inlineForm = reactive({
  id: '',
  page: '',
  field: '',
  hero_title: '',
  hero_subtitle: '',
  hero_video_url: '',
  content: ''
})

// Pages available
const pages = [
  { id: 'home', name: 'Home' },
  { id: 'about', name: 'About' },
  { id: 'contact', name: 'Contact' }
]

// Computed content sections
const homeHeroContent = computed(() => 
  content.value.find(item => item.page === 'home' && item.field === 'hero')
)
const aboutStoryContent = computed(() => 
  content.value.find(item => item.page === 'about' && item.field === 'story')
)
const contactIntroContent = computed(() => 
  content.value.find(item => item.page === 'contact' && item.field === 'intro')
)

// Load data
const loadData = async () => {
  try {
    const [contentRes, staffRes] = await Promise.all([
      $fetch('/api/admin/content/pages'),
      $fetch('/api/admin/content/staff')
    ])
    
    content.value = contentRes.content || []
    staff.value = staffRes.staff || []
  } catch (error) {
    console.error('Failed to load content data:', error)
  }
}

// Inline editing functions
const editHomeHero = () => {
  editorType.value = 'homeHero'
  editorTitle.value = 'Edit Home Hero'
  
  if (homeHeroContent.value) {
    Object.assign(inlineForm, homeHeroContent.value)
  } else {
    Object.assign(inlineForm, {
      id: '',
      page: 'home',
      field: 'hero',
      hero_title: '',
      hero_subtitle: '',
      hero_video_url: '',
      content: ''
    })
  }
  
  showInlineEditor.value = true
}

const editAboutStory = () => {
  editorType.value = 'content'
  editorTitle.value = 'Edit About Story'
  
  if (aboutStoryContent.value) {
    Object.assign(inlineForm, aboutStoryContent.value)
  } else {
    Object.assign(inlineForm, {
      id: '',
      page: 'about',
      field: 'story',
      hero_title: '',
      hero_subtitle: '',
      hero_video_url: '',
      content: ''
    })
  }
  
  showInlineEditor.value = true
}

const editContactIntro = () => {
  editorType.value = 'content'
  editorTitle.value = 'Edit Contact Introduction'
  
  if (contactIntroContent.value) {
    Object.assign(inlineForm, contactIntroContent.value)
  } else {
    Object.assign(inlineForm, {
      id: '',
      page: 'contact',
      field: 'intro',
      hero_title: '',
      hero_subtitle: '',
      hero_video_url: '',
      content: ''
    })
  }
  
  showInlineEditor.value = true
}

const saveInlineEdit = async () => {
  try {
    await $fetch('/api/admin/content/pages', {
      method: 'POST',
      body: inlineForm
    })
    
    showInlineEditor.value = false
    hasChanges.value = true
    await loadData()
  } catch (error) {
    console.error('Failed to save content:', error)
  }
}

// Staff management
const addStaff = () => {
  staff.value.push({
    id: crypto.randomUUID(),
    name: '',
    role: '',
    bio: '',
    image_url: '',
    order_index: staff.value.length,
    active: true
  })
  hasChanges.value = true
}

const removeStaff = (index) => {
  staff.value.splice(index, 1)
  hasChanges.value = true
}

const saveStaff = async () => {
  try {
    for (const member of staff.value) {
      await $fetch('/api/admin/content/staff', {
        method: 'POST',
        body: member
      })
    }
    
    showStaffEditor.value = false
    hasChanges.value = false
    await loadData()
  } catch (error) {
    console.error('Failed to save staff:', error)
  }
}

// Save all changes
const saveAllChanges = async () => {
  if (hasChanges.value) {
    await saveStaff()
    hasChanges.value = false
  }
}

// Load data on mount
onMounted(() => {
  loadData()
})

// Keyboard shortcuts
onKeyStroke('Escape', () => {
  showInlineEditor.value = false
  showStaffEditor.value = false
})

useSeoMeta({
  title: 'Website Builder | KIKUZUKI Admin',
  description: 'Build and customize your website with inline editing.',
  robots: 'noindex, nofollow'
})
</script>

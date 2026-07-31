import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const experiencePage = readFileSync('pages/experiences/[slug].vue', 'utf8')
const mediaGallery = readFileSync('components/saya/SayaMediaGallery.vue', 'utf8')
const lightbox = readFileSync('components/saya/SayaLightbox.vue', 'utf8')

test('experience detail maps mixed media to one ordered lightbox list', () => {
  assert.match(experiencePage, /const mediaItems = computed\(\(\) => \{/)
  assert.match(experiencePage, /if \(Array\.isArray\(exp\.media\)\) \{/)
  assert.match(experiencePage, /return exp\.media\s+\.map\(item => \(\{/)
  assert.match(experiencePage, /url: item\.kind === 'video' \? \(item\.public_url \|\| ''\) : item\.public_url/)
  assert.match(experiencePage, /poster: item\.kind === 'video' \? \(item\.thumbnail_url \|\| undefined\) : undefined/)
  assert.doesNotMatch(experiencePage, /\.filter\(item => item\.kind !== 'video'\)/)
})

test('experience gallery videos are real previews without native controls', () => {
  assert.match(experiencePage, /<SayaMediaGallery :items="mediaItems" :title="experience\.title"/)
  assert.match(mediaGallery, /<video[\s\S]*:ref="el => setVideoRef\(el, 0\)"/)
  assert.match(mediaGallery, /<video[\s\S]*muted[\s\S]*loop[\s\S]*playsinline/)
  assert.match(mediaGallery, /<SayaIcon name="play"/)
  assert.match(mediaGallery, /:aria-label="items\[0\]\?\.kind === 'video' \? `Play video, \$\{title\}` : `Open media, \$\{title\}`"/)
  assert.match(mediaGallery, /:aria-label="item\.kind === 'video' \? `Play video, \$\{title\}` : `Open media, \$\{title\}`"/)
  assert.doesNotMatch(mediaGallery, /\bcontrols\b/)
})

test('experience gallery opens the unfiltered media index and pauses previews', () => {
  assert.match(mediaGallery, /<SayaLightbox v-model:open="lightboxOpen" v-model:index="lightboxIndex" :items="items"/)
  assert.match(mediaGallery, /@click="openLightbox\(index\)"/)
  assert.match(mediaGallery, /function openLightbox\(index: number\) \{[\s\S]*pauseVideos\(\)[\s\S]*lightboxIndex\.value = index[\s\S]*lightboxOpen\.value = true/)
})

test('experience gallery coordinates one visible preview video at a time', () => {
  assert.match(mediaGallery, /let videoObserver: IntersectionObserver \| null = null/)
  assert.match(mediaGallery, /let syncToken = 0/)
  assert.match(mediaGallery, /function mostVisibleVideoIndex\(\)/)
  assert.match(mediaGallery, /const currentToken = \+\+syncToken/)
  assert.match(mediaGallery, /if \(currentToken !== syncToken\) return/)
  assert.match(mediaGallery, /await video\.play\(\)/)
  assert.match(mediaGallery, /if \(currentToken !== syncToken\) \{[\s\S]*return[\s\S]*\}/)
  assert.doesNotMatch(mediaGallery, /if \(currentToken !== syncToken\) \{[\s\S]*pauseVideo\(video\)[\s\S]*return[\s\S]*\}/)
  assert.match(mediaGallery, /catch \{[\s\S]*videoPlaying\.value\[index\] = false/)
  assert.match(mediaGallery, /document\.visibilityState !== 'visible'[\s\S]*pauseVideos\(\)/)
  assert.match(mediaGallery, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/)
  assert.match(mediaGallery, /videoObserver\?\.disconnect\(\)/)
  assert.match(mediaGallery, /function setVideoRef\(el: Element \| ComponentPublicInstance \| null, index: number\) \{[\s\S]*createVideoObserver\(\)[\s\S]*videoObserver\?\.observe\(el\)/)
  assert.match(mediaGallery, /function createVideoObserver\(\) \{[\s\S]*if \(videoObserver\) return[\s\S]*if \(!import\.meta\.client \|\| !\('IntersectionObserver' in window\)\) return/)
})

test('lightbox pauses inactive and closed videos without pausing the active branch', () => {
  const syncVideos = lightbox.match(/function syncVideos\(\) \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.match(syncVideos, /if \(i !== currentIndex\.value\) \{[\s\S]*video\.pause\(\)/)
  assert.doesNotMatch(syncVideos, /if \(i === currentIndex\.value\) \{[\s\S]*video\.pause\(\)/)
  assert.match(lightbox, /function pauseAllVideos\(\) \{[\s\S]*video => video\.pause\(\)/)
  assert.match(lightbox, /watch\(indexModel, async \(\) => \{[\s\S]*pauseAllVideos\(\)/)
  assert.match(lightbox, /else \{[\s\S]*releaseScrollLock\(\)[\s\S]*pauseAllVideos\(\)/)
})

test('lightbox unmount cleanup pauses, clears sources, and reloads video refs', () => {
  assert.match(lightbox, /Object\.values\(videoRefs\.value\)\.forEach\(\(video\) => \{[\s\S]*video\.pause\(\)[\s\S]*video\.removeAttribute\('src'\)[\s\S]*video\.load\(\)/)
  assert.match(lightbox, /onUnmounted\(\(\) => \{[\s\S]*pauseAllVideos\(\)[\s\S]*\}\)/)
})

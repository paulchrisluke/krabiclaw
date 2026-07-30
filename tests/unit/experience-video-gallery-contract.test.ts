import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const experiencePage = readFileSync('pages/experiences/[slug].vue', 'utf8')
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
  const gallerySection = experiencePage.slice(
    experiencePage.indexOf('<!-- Single image / video -->'),
    experiencePage.indexOf('<!-- Lightbox -->'),
  )

  assert.match(gallerySection, /<video[\s\S]*:ref="el => setGalleryVideoRef\(el, 0\)"/)
  assert.match(gallerySection, /<video[\s\S]*muted[\s\S]*loop[\s\S]*playsinline/)
  assert.match(gallerySection, /<SayaIcon name="play"/)
  assert.match(gallerySection, /:aria-label="mediaItems\[0\]\?\.kind === 'video' \? `Play video, \$\{experience\.title\}` : undefined"/)
  assert.match(gallerySection, /:aria-label="item\.kind === 'video' \? `Play video, \$\{experience\.title\}` : undefined"/)
  assert.doesNotMatch(gallerySection, /\bcontrols\b/)
})

test('experience gallery opens the unfiltered media index and pauses previews', () => {
  assert.match(experiencePage, /<SayaLightbox v-model:open="lightboxOpen" v-model:index="lightboxIdx" :items="mediaItems"/)
  assert.match(experiencePage, /@click="openLightbox\(i \+ 1\)"/)
  assert.match(experiencePage, /function openLightbox\(mediaIdx: number\) \{[\s\S]*pauseGalleryVideos\(\)[\s\S]*lightboxIdx\.value = mediaIdx[\s\S]*lightboxOpen\.value = true/)
})

test('experience gallery coordinates one visible preview video at a time', () => {
  assert.match(experiencePage, /let galleryVideoObserver: IntersectionObserver \| null = null/)
  assert.match(experiencePage, /let galleryVideoSyncToken = 0/)
  assert.match(experiencePage, /function mostVisibleGalleryVideoIndex\(\)/)
  assert.match(experiencePage, /const syncToken = \+\+galleryVideoSyncToken/)
  assert.match(experiencePage, /if \(syncToken !== galleryVideoSyncToken\) return/)
  assert.match(experiencePage, /await video\.play\(\)/)
  assert.match(experiencePage, /if \(syncToken !== galleryVideoSyncToken\) \{[\s\S]*pauseGalleryVideo\(video\)[\s\S]*return[\s\S]*\}/)
  assert.match(experiencePage, /catch \{[\s\S]*Muted preview autoplay can still be blocked/)
  assert.match(experiencePage, /document\.visibilityState !== 'visible'[\s\S]*pauseGalleryVideos\(\)/)
  assert.match(experiencePage, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/)
  assert.match(experiencePage, /galleryVideoObserver\?\.disconnect\(\)/)
  assert.match(experiencePage, /function setGalleryVideoRef\(el: Element \| ComponentPublicInstance \| null, index: number\) \{[\s\S]*createGalleryVideoObserver\(\)[\s\S]*galleryVideoObserver\?\.observe\(el\)/)
  assert.match(experiencePage, /function createGalleryVideoObserver\(\) \{[\s\S]*if \(galleryVideoObserver\) return[\s\S]*if \(!import\.meta\.client \|\| !\('IntersectionObserver' in window\)\) return/)
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

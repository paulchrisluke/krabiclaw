const THUMBNAIL_WIDTH = 1280
const THUMBNAIL_HEIGHT = 720
const THUMBNAIL_SEEK_SECONDS = 0.1

function waitForVideoEvent(video: HTMLVideoElement, event: 'loadedmetadata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(event, handleEvent)
      video.removeEventListener('error', handleError)
    }
    const handleEvent = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error('The video could not be decoded to generate its thumbnail.'))
    }
    video.addEventListener(event, handleEvent, { once: true })
    video.addEventListener('error', handleError, { once: true })
  })
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('The generated video thumbnail could not be encoded.'))
    }, 'image/jpeg', 0.88)
  })
}

export async function generateVideoThumbnail(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'metadata'
  video.playsInline = true
  video.src = objectUrl

  try {
    await waitForVideoEvent(video, 'loadedmetadata')
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('The video has no decodable visual track for thumbnail generation.')
    }

    const seekTarget = Number.isFinite(video.duration)
      ? Math.min(THUMBNAIL_SEEK_SECONDS, Math.max(0, video.duration / 2))
      : THUMBNAIL_SEEK_SECONDS
    if (seekTarget > 0) {
      video.currentTime = seekTarget
      await waitForVideoEvent(video, 'seeked')
    }

    const canvas = document.createElement('canvas')
    canvas.width = THUMBNAIL_WIDTH
    canvas.height = THUMBNAIL_HEIGHT
    const context = canvas.getContext('2d')
    if (!context) throw new Error('The browser could not create a video thumbnail canvas.')

    const sourceRatio = video.videoWidth / video.videoHeight
    const targetRatio = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT
    let sourceX = 0
    let sourceY = 0
    let sourceWidth = video.videoWidth
    let sourceHeight = video.videoHeight
    if (sourceRatio > targetRatio) {
      sourceWidth = video.videoHeight * targetRatio
      sourceX = (video.videoWidth - sourceWidth) / 2
    } else {
      sourceHeight = video.videoWidth / targetRatio
      sourceY = (video.videoHeight - sourceHeight) / 2
    }

    context.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      THUMBNAIL_WIDTH,
      THUMBNAIL_HEIGHT,
    )
    const blob = await canvasBlob(canvas)
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video'
    return new File([blob], `${baseName}-thumbnail.jpg`, { type: 'image/jpeg' })
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}

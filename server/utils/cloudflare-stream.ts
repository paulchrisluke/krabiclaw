// Cloudflare Stream video upload and delivery utilities.
// Upload flow: client calls request-video-upload → gets TUS URL → uploads directly to Stream.
// Playback: public_url stores the direct MP4 download URL for <video> tag compat.
// HLS manifest available at: https://customer-{subdomain}.cloudflarestream.com/{uid}/manifest/video.m3u8
import type { CloudflareEnv } from './auth'

interface StreamDirectUploadResponse {
  result?: {
    uid?: string
    uploadURL?: string
  }
  success?: boolean
  errors?: Array<{ message: string }>
}

interface StreamVideoResponse {
  result?: {
    uid?: string
    status?: { state?: string }
    duration?: number
    input?: { width?: number; height?: number }
  }
  success?: boolean
}

function apiBase(env: CloudflareEnv): string {
  const accountId = env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID
  if (!accountId) throw new Error('CF_ACCOUNT_ID not configured')
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`
}

function authHeader(env: CloudflareEnv): Record<string, string> {
  const token = env.CF_STREAM_API_TOKEN
  if (!token) throw new Error('CF_STREAM_API_TOKEN not configured')
  return { Authorization: `Bearer ${token}` }
}

const STREAM_TIMEOUT_MS = 10_000

function streamFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS)
  return fetch(url, { ...init, signal: controller.signal })
    .then(res => { clearTimeout(timer); return res })
    .catch(err => {
      clearTimeout(timer)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Stream API request timed out after ${STREAM_TIMEOUT_MS}ms`)
      }
      throw err
    })
}

/** Build the direct MP4 download URL for a Stream video (works in <video> tags). */
export function buildStreamDownloadUrl(env: CloudflareEnv, uid: string): string {
  if (!env.CF_STREAM_CUSTOMER_SUBDOMAIN) throw new Error('CF_STREAM_CUSTOMER_SUBDOMAIN not configured')
  return `https://customer-${env.CF_STREAM_CUSTOMER_SUBDOMAIN}.cloudflarestream.com/${uid}/downloads/default.mp4`
}

/** Build the HLS manifest URL (for future HLS.js support). */
export function buildStreamHlsUrl(env: CloudflareEnv, uid: string): string {
  if (!env.CF_STREAM_CUSTOMER_SUBDOMAIN) throw new Error('CF_STREAM_CUSTOMER_SUBDOMAIN not configured')
  return `https://customer-${env.CF_STREAM_CUSTOMER_SUBDOMAIN}.cloudflarestream.com/${uid}/manifest/video.m3u8`
}

/** Build the thumbnail URL for a Stream video. */
export function buildStreamThumbnailUrl(env: CloudflareEnv, uid: string, time = '0s'): string {
  if (!env.CF_STREAM_CUSTOMER_SUBDOMAIN) throw new Error('CF_STREAM_CUSTOMER_SUBDOMAIN not configured')
  return `https://customer-${env.CF_STREAM_CUSTOMER_SUBDOMAIN}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg?time=${time}`
}

/**
 * Request a TUS direct upload URL. The client uploads the video file directly to this URL
 * using the TUS protocol — no server buffering, no 50 MB limit.
 */
export async function requestStreamUpload(
  env: CloudflareEnv,
  options: {
    maxDurationSeconds?: number
    filename?: string
    meta?: Record<string, string>
  } = {}
): Promise<{ uid: string; uploadUrl: string }> {
  const res = await streamFetch(`${apiBase(env)}/direct_upload`, {
    method: 'POST',
    headers: { ...authHeader(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      maxDurationSeconds: options.maxDurationSeconds ?? 300,
      requireSignedURLs: false,
      allowedOrigins: ['*'],
      meta: {
        name: options.filename ?? 'upload',
        ...options.meta,
      },
    }),
  })
  if (!res.ok) throw new Error(`Stream direct_upload error ${res.status}: ${await res.text()}`)
  const data = await res.json() as StreamDirectUploadResponse
  if (!data.success || !data.result?.uid || !data.result?.uploadURL) {
    throw new Error(`Stream direct_upload malformed response: ${JSON.stringify(data)}`)
  }
  return { uid: data.result.uid, uploadUrl: data.result.uploadURL }
}

/** Fetch metadata for a Stream video (used to confirm upload completion). */
export async function getStreamVideo(
  env: CloudflareEnv,
  uid: string
): Promise<{ uid: string; state: string; duration: number | null; width: number | null; height: number | null }> {
  const res = await streamFetch(`${apiBase(env)}/${uid}`, { headers: authHeader(env) })
  if (!res.ok) throw new Error(`Stream video fetch error ${res.status}: ${await res.text()}`)
  const data = await res.json() as StreamVideoResponse
  if (!data.success || !data.result) {
    throw new Error(`Stream video API error: ${JSON.stringify(data)}`)
  }
  return {
    uid,
    state: data.result.status?.state ?? 'unknown',
    duration: data.result?.duration ?? null,
    width: data.result?.input?.width ?? null,
    height: data.result?.input?.height ?? null,
  }
}

/** Delete a Stream video by UID. */
export async function deleteStreamVideo(env: CloudflareEnv, uid: string): Promise<void> {
  const res = await streamFetch(`${apiBase(env)}/${uid}`, {
    method: 'DELETE',
    headers: authHeader(env),
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Stream delete error ${res.status}: ${await res.text()}`)
  }
}

/** Returns true if Stream credentials are fully configured in the environment. */
export function isStreamConfigured(env: CloudflareEnv): boolean {
  return !!(
    (env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID) &&
    env.CF_STREAM_API_TOKEN &&
    env.CF_STREAM_CUSTOMER_SUBDOMAIN
  )
}

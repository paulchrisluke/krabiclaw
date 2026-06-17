import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import {
  callToolWithResult,
  injectStyles,
  onToolResult,
  sendUiMessage,
  updateModelContext,
} from '../bridge'
import { sharedStyles } from '../theme'

interface ImageItem {
  assetId: string
  publicUrl: string
}

interface Content {
  title?: string
  subtitle?: string | null
  images: ImageItem[]
  useLabel?: string | null
  regenerateLabel?: string | null
  assignTool?: string | null
  assignArgs?: Record<string, unknown> | null
  regenerateTool?: string | null
  regenerateArgs?: Record<string, unknown> | null
  successMessage?: string | null
  debug?: boolean
  debugLabel?: string
  debugExpectedImageDomain?: string
}

type ImageLoadState = 'not-started' | 'loading' | 'loaded' | 'error'

interface DebugState {
  widgetVersion: string
  source: 'toolOutput' | 'toolResponseMetadata' | 'none'
  hasToolOutput: boolean
  hasStructuredContent: boolean
  hasToolResponseMetadata: boolean
  imageCount: number
  firstAssetId?: string
  firstPublicUrl?: string
  imageHost?: string
  imageLoadState: ImageLoadState
  imageError?: string
  cspHint?: string
}

const WIDGET_VERSION = (window as { __KC_WIDGET_VERSION__?: string }).__KC_WIDGET_VERSION__ ?? 'unknown'

function extractImageHost(url: string | undefined): string | undefined {
  if (!url) return undefined
  try { return new URL(url).hostname } catch { return undefined }
}

function detectSource(): DebugState['source'] {
  const api = window.openai
  if (!api) return 'none'
  if (api.toolOutput != null) return 'toolOutput'
  if (api.toolResponseMetadata != null) return 'toolResponseMetadata'
  return 'none'
}

const styles = `
  .title { font-size: 15px; font-weight: 700; color: var(--ui-text); margin-bottom: 4px; }
  .subtitle { font-size: 13px; line-height: 1.5; color: var(--ui-text-muted); margin-bottom: 12px; }
  .image-wrap { width: 100%; aspect-ratio: 3/2; border-radius: 12px; overflow: hidden; background: var(--ui-bg-muted); position: relative; }
  .image-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .image-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--ui-text-muted); font-size: 13px; }
  .actions { display: flex; gap: 8px; margin-top: 14px; }
  .btn { flex: 1; }
  .status { margin-top: 12px; padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 1.45; }
  .status-info { background: var(--ui-bg-muted); color: var(--ui-text-muted); }
  .status-success { background: rgba(22, 163, 74, 0.1); color: var(--kc-success); border: 1px solid rgba(22, 163, 74, 0.25); }
  .status-error { background: rgba(224, 82, 76, 0.1); color: var(--kc-danger); border: 1px solid rgba(224, 82, 76, 0.25); }
  .debug-panel { margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); }
  .debug-panel pre { margin: 0; font-size: 11px; white-space: pre-wrap; word-break: break-all; color: var(--ui-text-muted); font-family: monospace; }
  .debug-label { font-size: 11px; font-weight: 600; color: var(--ui-text-muted); margin-bottom: 6px; }
`

function DebugPanel({ state, label }: { state: DebugState; label?: string }) {
  return (
    <div className="debug-panel">
      {label && <div className="debug-label">{label}</div>}
      <pre>{JSON.stringify(state, null, 2)}</pre>
    </div>
  )
}

function App() {
  const [content, setContent] = useState<Content | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [status, setStatus] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(null)
  const [imageLoadState, setImageLoadState] = useState<ImageLoadState>('not-started')
  const [imageError, setImageError] = useState<string | null>(null)
  const [debugSource, setDebugSource] = useState<DebugState['source']>('none')

  useEffect(() => {
    onToolResult((result) => {
      const data = result as Content
      if (data?.images?.length) {
        setDebugSource(detectSource())
        setContent(data)
        setIsApplying(false)
        setIsRegenerating(false)
        setStatus(null)
        setImageLoadState('loading')
        setImageError(null)
      }
    })
  }, [])

  const debug = content?.debug ?? false
  const hasPayload = content !== null && (content.images?.length ?? 0) > 0

  const rawOutput = window.openai?.toolOutput as Record<string, unknown> | null | undefined
  const imageHost = extractImageHost(content?.images?.[0]?.publicUrl)

  const debugState: DebugState = {
    widgetVersion: WIDGET_VERSION,
    source: debugSource,
    hasToolOutput: rawOutput != null,
    hasStructuredContent: rawOutput != null && 'structuredContent' in rawOutput,
    hasToolResponseMetadata: window.openai?.toolResponseMetadata != null,
    imageCount: content?.images?.length ?? 0,
    firstAssetId: content?.images?.[0]?.assetId,
    firstPublicUrl: content?.images?.[0]?.publicUrl,
    imageHost,
    imageLoadState,
    ...(imageError ? { imageError } : {}),
    ...(imageLoadState === 'error' ? {
      cspHint: `If console shows img-src violation, widgetCSP/resource CSP did not include ${imageHost ?? 'the image domain'} or ChatGPT is using a cached resource definition (bump WIDGET_VERSION).`,
    } : {}),
  }

  if (!hasPayload) {
    return (
      <div className="widget">
        <div className="image-wrap">
          <div className="skeleton" style={{ width: '100%', height: '100%' }}></div>
        </div>
        {debug && <DebugPanel state={debugState} label={content?.debugLabel ?? 'image-carousel debug'} />}
      </div>
    )
  }

  const current = content.images[0]!

  const handleUse = async () => {
    if (!content.assignTool || !content.assignArgs) {
      updateModelContext({ selectedAssetId: current.assetId })
      sendUiMessage(`Use image asset ${current.assetId}.`)
      setStatus({ tone: 'success', text: 'Selection shared with ChatGPT.' })
      return
    }

    setIsApplying(true)
    setStatus({ tone: 'info', text: 'Applying…' })

    try {
      await callToolWithResult(content.assignTool, {
        ...content.assignArgs,
        asset_id: current.assetId,
      })
      updateModelContext({ selectedAssetId: current.assetId })
      sendUiMessage(content.successMessage ?? `Applied image asset ${current.assetId}.`)
      setStatus({ tone: 'success', text: content.successMessage ?? 'Image applied.' })
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Failed to apply the selected image.',
      })
    } finally {
      setIsApplying(false)
    }
  }

  const handleRegenerate = async () => {
    if (!content.regenerateTool || !content.regenerateArgs) {
      sendUiMessage('Please generate another option.')
      setStatus({ tone: 'info', text: 'Requested a new option from ChatGPT.' })
      return
    }

    setIsRegenerating(true)
    setStatus({ tone: 'info', text: 'Generating a new option…' })

    try {
      const result = await callToolWithResult(content.regenerateTool, content.regenerateArgs)
      const data = result as Content
      if (data?.images?.length) {
        setDebugSource(detectSource())
        setContent(data)
        setImageLoadState('loading')
        setImageError(null)
        setStatus(null)
      }
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Failed to generate a new option.',
      })
    } finally {
      setIsRegenerating(false)
    }
  }

  const useLabel = content.useLabel ?? 'Use this image'
  const regenerateLabel = content.regenerateLabel ?? 'Try again'

  return (
    <div className="widget">
      {content.title && <div className="title">{content.title}</div>}
      {content.subtitle && <div className="subtitle">{content.subtitle}</div>}
      <div className="image-wrap">
        {imageLoadState === 'error' ? (
          <div className="image-placeholder">Image failed to load</div>
        ) : (
          <img
            src={current.publicUrl}
            alt="Generated image"
            onLoad={() => setImageLoadState('loaded')}
            onError={() => {
              setImageLoadState('error')
              setImageError('img onError fired — likely CSP, URL, CORS, or network block')
            }}
          />
        )}
      </div>
      <div className="actions">
        {content.regenerateTool ? (
          <button className="btn btn-outline" onClick={handleRegenerate} disabled={isApplying || isRegenerating}>
            {isRegenerating ? 'Generating…' : regenerateLabel}
          </button>
        ) : null}
        <button className="btn btn-primary" onClick={handleUse} disabled={isApplying || isRegenerating}>
          {isApplying ? 'Applying…' : useLabel}
        </button>
      </div>
      {status ? (
        <div className={`status ${status.tone === 'success' ? 'status-success' : status.tone === 'error' ? 'status-error' : 'status-info'}`}>
          {status.text}
        </div>
      ) : null}
      {debug && <DebugPanel state={debugState} label={content.debugLabel ?? 'image-carousel debug'} />}
    </div>
  )
}

injectStyles(sharedStyles + styles)
const root = document.getElementById('app')!
createRoot(root).render(<App />)

import { createRoot } from 'react-dom/client'
import { useState, useEffect, useRef } from 'react'
import { getFileDownloadUrl, injectStyles, onToolInput, updateModelContext, uploadFile as uploadChatGptFile } from '../bridge'
import { sharedStyles } from '../theme'

interface UploadContext {
  site_id: string
  category?: string
  description?: string
}

type UploadState = 'idle' | 'uploading' | 'confirming' | 'done' | 'error'

const styles = `
  .title { font-size: 16px; font-weight: 700; color: var(--ui-text); margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: var(--ui-text-muted); margin-bottom: 16px; }
  .drop-zone { border: 2px dashed var(--ui-border); border-radius: 12px; padding: 32px 16px; text-align: center; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
  .drop-zone:hover, .drop-zone.over { border-color: var(--ui-text); background: var(--ui-bg-muted); }
  .drop-icon { font-size: 32px; margin-bottom: 8px; }
  .drop-text { font-size: 14px; color: var(--ui-text-muted); margin-bottom: 4px; }
  .drop-hint { font-size: 12px; color: var(--ui-text-muted); }
  .progress-wrap { margin-top: 16px; }
  .progress-label { font-size: 13px; color: var(--ui-text-muted); margin-bottom: 6px; }
  .progress-bar { height: 6px; background: var(--ui-border); border-radius: 3px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--ui-text); border-radius: 3px; transition: width 0.2s; }
  .preview { margin-top: 16px; border-radius: 10px; overflow: hidden; max-height: 200px; display: flex; align-items: center; justify-content: center; background: var(--ui-bg-muted); }
  .preview img { max-width: 100%; max-height: 200px; object-fit: contain; }
  .success { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 10px 14px; background: rgba(22, 163, 74, 0.1); border: 1.5px solid var(--kc-success); border-radius: 8px; }
  .success-text { font-size: 13px; color: var(--kc-success); font-weight: 600; }
  .error-box { margin-top: 12px; padding: 10px 14px; background: rgba(224, 82, 76, 0.1); border: 1.5px solid var(--kc-danger); border-radius: 8px; font-size: 13px; color: var(--kc-danger); }
  .btn { width: 100%; margin-top: 14px; }
  .loading { text-align: center; padding: 40px 20px; color: var(--ui-text-muted); font-size: 14px; }
`

function App() {
  const [ctx, setCtx] = useState<UploadContext | null>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [_publicUrl, setPublicUrl] = useState<string | null>(null)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    onToolInput((input) => {
      const data = input as UploadContext
      if (data?.site_id) {
        setCtx(data)
        setBootstrapError(null)
      }
    })

    const timeout = window.setTimeout(() => {
      setBootstrapError('The upload form did not receive its widget data from ChatGPT. Please close this card and try again.')
    }, 12000)

    return () => window.clearTimeout(timeout)
  }, [])

  const handleUpload = async (file: File) => {
    if (!ctx) return
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select an image file (JPEG, PNG, WebP, etc.)')
      return
    }

    setState('uploading')
    setProgress(10)
    setErrorMsg(null)

    // Use FileReader to get a data: URL — blob: URLs are blocked by CSP in ChatGPT widget sandbox
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    try {
      const fileId = await uploadChatGptFile(file)
      if (!fileId) throw new Error('ChatGPT did not return a file ID for this upload.')
      const downloadUrl = await getFileDownloadUrl(fileId)
      if (!downloadUrl) throw new Error('ChatGPT did not return a download URL for this upload.')

      setProgress(65)
      setState('confirming')
      const result = await new Promise<{ assetId: string; publicUrl: string }>((resolve, reject) => {
        const handleMessage = (event: MessageEvent) => {
          if (event.source !== window.parent) return
          const message = event.data as {
            jsonrpc?: string
            id?: string | number
            result?: {
              structuredContent?: { assetId?: string; publicUrl?: string }
              isError?: boolean
              content?: Array<{ text?: string }>
            }
            error?: { message?: string }
          }

          if (!message || message.jsonrpc !== '2.0' || String(message.id) !== toolCallId) return
          window.clearTimeout(timeout)
          window.removeEventListener('message', handleMessage)

          if (message.error?.message) {
            reject(new Error(message.error.message))
            return
          }

          const structured = message.result?.structuredContent
          if (!structured?.assetId || !structured?.publicUrl) {
            reject(new Error('KrabiClaw did not return the saved image asset.'))
            return
          }

          resolve({ assetId: structured.assetId, publicUrl: structured.publicUrl })
        }

        const toolCallId = `upload-user-photo-${Date.now()}`
        const timeout = window.setTimeout(() => {
          window.removeEventListener('message', handleMessage)
          reject(new Error('KrabiClaw did not confirm the uploaded photo in time.'))
        }, 30000)
        window.addEventListener('message', handleMessage, { passive: true })
        window.parent.postMessage({
          jsonrpc: '2.0',
          id: toolCallId,
          method: 'tools/call',
          params: {
            name: 'upload_user_photo',
            arguments: {
              site_id: ctx.site_id,
              file: {
                file_id: fileId,
                download_url: downloadUrl,
                mime_type: file.type || 'image/png',
                file_name: file.name || `${fileId}.png`,
              },
              ...(ctx.category ? { category: ctx.category } : {}),
              ...(ctx.description ? { description: ctx.description } : {}),
            },
          },
        }, '*')
      })

      setProgress(100)
      setState('done')
      setPublicUrl(result.publicUrl)
      updateModelContext({ assetId: result.assetId, publicUrl: result.publicUrl })
    } catch (err) {
      setState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (files && files[0]) handleUpload(files[0])
  }

  if (!ctx) {
    if (bootstrapError) {
      return (
        <div className="widget">
          <div className="loading">{bootstrapError}</div>
        </div>
      )
    }
    return (
      <div className="widget">
        <div className="skeleton" style={{ height: '140px', borderRadius: '12px' }}></div>
      </div>
    )
  }

  return (
    <div className="widget">
      {state === 'idle' && (
        <div
          className={`drop-zone${isDragging ? ' over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }}
        >
          <div className="drop-icon">🖼️</div>
          <div className="drop-text">Click to choose a photo</div>
          <div className="drop-hint">or drag and drop here</div>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />
        </div>
      )}

      {preview && state !== 'idle' && (
        <div className="preview"><img src={preview} alt="Preview" /></div>
      )}

      {(state === 'uploading' || state === 'confirming') && (
        <div className="progress-wrap">
          <div className="progress-label">{state === 'uploading' ? 'Uploading…' : 'Saving to media library…'}</div>
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      {state === 'done' && (
        <div className="success">
          <span>✓</span>
          <span className="success-text">Photo uploaded! Tell me where to use it (e.g. "set as logo" or "use as hero image").</span>
        </div>
      )}

      {state === 'error' && (
        <>
          <div className="error-box">{errorMsg}</div>
          <button className="btn" onClick={() => { setState('idle'); setPreview(null); setProgress(0) }}>Try again</button>
        </>
      )}
    </div>
  )
}

injectStyles(sharedStyles + styles)
const root = document.getElementById('app')!
createRoot(root).render(<App />)

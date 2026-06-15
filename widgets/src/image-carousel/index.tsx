import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import { onToolResult, updateModelContext, injectStyles } from '../bridge'

interface ImageItem {
  assetId: string
  publicUrl: string
}

interface Content {
  images: ImageItem[]
}

const PRIMARY = '#1F2547'

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111; }
  .card { padding: 20px; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .title { font-size: 15px; font-weight: 600; color: ${PRIMARY}; }
  .counter { font-size: 13px; color: #888; }
  .nav { display: flex; gap: 6px; align-items: center; }
  .nav-btn { background: #f3f4f6; border: none; border-radius: 6px; width: 28px; height: 28px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; color: #555; transition: background 0.15s; }
  .nav-btn:hover { background: #e5e7eb; }
  .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .image-wrap { width: 100%; aspect-ratio: 3/2; border-radius: 10px; overflow: hidden; background: #f3f4f6; position: relative; }
  .image-wrap img { width: 100%; height: 100%; object-fit: cover; }
  .placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 14px; }
  .actions { display: flex; gap: 8px; margin-top: 14px; }
  .btn { flex: 1; padding: 11px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: opacity 0.15s; }
  .btn:hover { opacity: 0.85; }
  .btn-primary { background: ${PRIMARY}; color: #fff; }
  .btn-outline { background: #fff; color: ${PRIMARY}; border: 1.5px solid ${PRIMARY}; }
  .loading { text-align: center; padding: 40px 20px; color: #888; font-size: 14px; }
`

function App() {
  const [content, setContent] = useState<Content | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    onToolResult((result) => {
      const data = result as Content
      if (data?.images?.length) {
        setContent(data)
        setIndex(0)
      }
    })
  }, [])

  if (!content || !content.images.length) {
    return (
      <div className="card">
        <div className="loading">Generating hero images…</div>
      </div>
    )
  }

  const { images } = content
  const current = images[index]

  const handleUse = () => {
    updateModelContext({ heroAssetId: current.assetId })
  }

  const handleRetry = () => {
    updateModelContext({ action: 'regenerate_hero_image' })
  }

  return (
    <div className="card">
      <div className="header">
        <div className="title">AI-Generated Hero Images</div>
        <div className="nav">
          <button className="nav-btn" onClick={() => setIndex(i => i - 1)} disabled={index === 0}>‹</button>
          <span className="counter">{index + 1} / {images.length}</span>
          <button className="nav-btn" onClick={() => setIndex(i => i + 1)} disabled={index === images.length - 1}>›</button>
        </div>
      </div>
      <div className="image-wrap">
        {current.publicUrl
          ? <img src={current.publicUrl} alt={`Generated hero ${index + 1}`} />
          : <div className="placeholder">Loading…</div>
        }
      </div>
      <div className="actions">
        <button className="btn btn-primary" onClick={handleUse}>✓ Use this one</button>
        <button className="btn btn-outline" onClick={handleRetry}>Try again</button>
      </div>
    </div>
  )
}

injectStyles(styles)
const root = document.getElementById('app')!
createRoot(root).render(<App />)

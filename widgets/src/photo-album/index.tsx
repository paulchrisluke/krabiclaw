import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import { onToolResult, sendUiMessage, updateModelContext, injectStyles } from '../bridge'

interface Photo {
  assetId: string
  publicUrl: string
}

interface Business {
  name: string
  address: string
  phone: string | null
  hours: string[]
  rating: number | null
  reviewCount: number | null
  placeId: string
  mapsUrl: string
}

interface Content {
  business: Business
  photos: Photo[]
  missingPhotos: boolean
}

const PRIMARY = '#1F2547'

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111; }
  .card { padding: 20px; }
  .biz-name { font-size: 18px; font-weight: 700; color: ${PRIMARY}; }
  .biz-meta { font-size: 13px; color: #666; margin-top: 3px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 14px 0; }
  .grid-img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; background: #f3f4f6; }
  .grid-placeholder { width: 100%; aspect-ratio: 1; border-radius: 6px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 11px; }
  .detail { font-size: 13px; color: #555; margin-bottom: 5px; display: flex; gap: 6px; }
  .detail-label { font-weight: 600; color: #333; min-width: 50px; }
  .warn { background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: 10px 12px; margin-top: 12px; font-size: 13px; color: #713f12; }
  .warn-title { font-weight: 600; margin-bottom: 6px; }
  .actions { display: flex; gap: 8px; margin-top: 14px; }
  .btn { flex: 1; padding: 11px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: opacity 0.15s; }
  .btn:hover { opacity: 0.85; }
  .btn-primary { background: ${PRIMARY}; color: #fff; }
  .btn-outline { background: #fff; color: ${PRIMARY}; border: 1.5px solid ${PRIMARY}; }
  .loading { text-align: center; padding: 40px 20px; color: #888; font-size: 14px; }
`

function Stars({ rating }: { rating: number }) {
  return <span>{'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}</span>
}

function App() {
  const [content, setContent] = useState<Content | null>(null)

  useEffect(() => {
    onToolResult((result) => {
      const data = result as Content
      if (data?.business) setContent(data)
    })
  }, [])

  if (!content) {
    return (
      <div className="card">
        <div className="loading">Importing from Google Maps…</div>
      </div>
    )
  }

  const { business, photos, missingPhotos } = content

  const handleBuild = () => {
    updateModelContext({ imported_place_id: business.placeId, imported_name: business.name })
    sendUiMessage('Looks good, build the site.')
  }

  const handleGenerate = () => {
    sendUiMessage("Generate hero images with AI.")
  }

  const handleSkip = () => {
    sendUiMessage("Skip image generation, use what we have.")
  }

  const displayPhotos = [...photos]
  while (displayPhotos.length < 3) displayPhotos.push({ assetId: '', publicUrl: '' })

  return (
    <div className="card">
      <div className="biz-name">{business.name}</div>
      {(business.rating || business.reviewCount) && (
        <div className="biz-meta">
          {business.rating && <Stars rating={business.rating} />}
          {business.rating && ` ${business.rating.toFixed(1)}`}
          {business.reviewCount && ` · ${business.reviewCount.toLocaleString()} reviews`}
        </div>
      )}

      <div className="grid">
        {displayPhotos.slice(0, 6).map((p, i) =>
          p.publicUrl
            ? <img key={p.assetId || i} src={p.publicUrl} alt="" className="grid-img" />
            : <div key={i} className="grid-placeholder">No photo</div>
        )}
      </div>

      {business.address && (
        <div className="detail"><span className="detail-label">Address</span>{business.address}</div>
      )}
      {business.phone && (
        <div className="detail"><span className="detail-label">Phone</span>{business.phone}</div>
      )}
      {business.hours.length > 0 && (
        <div className="detail"><span className="detail-label">Hours</span>{business.hours[0]}{business.hours.length > 1 ? ` +${business.hours.length - 1} more` : ''}</div>
      )}

      {missingPhotos && (
        <div className="warn">
          <div className="warn-title">Only {photos.length} photo{photos.length !== 1 ? 's' : ''} found on Google Maps.</div>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn btn-primary" onClick={handleGenerate}>Generate hero images with AI</button>
            <button className="btn btn-outline" onClick={handleSkip}>Skip</button>
          </div>
        </div>
      )}

      {!missingPhotos && (
        <div className="actions">
          <button className="btn btn-primary" onClick={handleBuild}>Looks good, build the site</button>
        </div>
      )}
    </div>
  )
}

injectStyles(styles)
const root = document.getElementById('app')!
createRoot(root).render(<App />)

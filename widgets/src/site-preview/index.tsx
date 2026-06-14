import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import { onToolResult, sendUiMessage, injectStyles } from '../bridge'

interface Page {
  label: string
  path: string
}

interface SiteContent {
  site: {
    id: string
    name: string
    subdomain: string
    publicUrl: string
  }
  pages: Page[]
}

const PRIMARY = '#1F2547'

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111; }
  .card { padding: 20px; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .title { font-size: 15px; font-weight: 700; color: #16a34a; display: flex; align-items: center; gap: 5px; }
  .page-nav { display: flex; gap: 6px; align-items: center; }
  .page-label { font-size: 13px; color: #555; font-weight: 600; }
  .counter { font-size: 12px; color: #aaa; }
  .nav-btn { background: #f3f4f6; border: none; border-radius: 6px; width: 26px; height: 26px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; color: #555; transition: background 0.15s; }
  .nav-btn:hover { background: #e5e7eb; }
  .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .iframe-wrap { width: 100%; height: 360px; border-radius: 10px; overflow: hidden; border: 1px solid #e5e7eb; background: #f9fafb; }
  .iframe-wrap iframe { width: 100%; height: 100%; border: none; }
  .site-url { font-size: 12px; color: #888; margin-top: 8px; text-align: center; }
  .actions { display: flex; gap: 8px; margin-top: 12px; }
  .btn { flex: 1; padding: 11px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: opacity 0.15s; }
  .btn:hover { opacity: 0.85; }
  .btn-primary { background: ${PRIMARY}; color: #fff; }
  .btn-outline { background: #fff; color: ${PRIMARY}; border: 1.5px solid ${PRIMARY}; }
  .loading { text-align: center; padding: 40px 20px; color: #888; font-size: 14px; }
`

function App() {
  const [content, setContent] = useState<SiteContent | null>(null)
  const [pageIndex, setPageIndex] = useState(0)

  useEffect(() => {
    onToolResult((result) => {
      const data = result as SiteContent
      if (data?.site) {
        setContent(data)
        setPageIndex(0)
      }
    })
  }, [])

  if (!content) {
    return (
      <div className="card">
        <div className="loading">Building your site…</div>
      </div>
    )
  }

  const { site, pages } = content
  const currentPage = pages[pageIndex] ?? { label: 'Home', path: '/' }
  const frameUrl = `${site.publicUrl}${currentPage.path}`

  const handleOpen = () => {
    window.open(site.publicUrl, '_blank')
  }

  const handleWhatsNext = () => {
    sendUiMessage('What else would you like to set up?')
  }

  return (
    <div className="card">
      <div className="header">
        <div className="title">✓ Your site is live!</div>
        <div className="page-nav">
          <span className="page-label">{currentPage.label}</span>
          <span className="counter">{pageIndex + 1} / {pages.length}</span>
          <button className="nav-btn" onClick={() => setPageIndex(i => i - 1)} disabled={pageIndex === 0}>‹</button>
          <button className="nav-btn" onClick={() => setPageIndex(i => i + 1)} disabled={pageIndex === pages.length - 1}>›</button>
        </div>
      </div>
      <div className="iframe-wrap">
        <iframe src={frameUrl} sandbox="allow-scripts allow-same-origin" title={currentPage.label} />
      </div>
      <div className="site-url">{site.publicUrl.replace('https://', '')}</div>
      <div className="actions">
        <button className="btn btn-primary" onClick={handleOpen}>↗ Open site</button>
        <button className="btn btn-outline" onClick={handleWhatsNext}>What's next?</button>
      </div>
    </div>
  )
}

injectStyles(styles)
const root = document.getElementById('app')!
createRoot(root).render(<App />)

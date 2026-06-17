import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import { onToolResult, sendUiMessage, openExternal, injectStyles } from '../bridge'
import { sharedStyles } from '../theme'

interface Page {
  label: string
  path: string
}

interface SiteContent {
  site: {
    id: string
    name: string
    subdomain?: string | null
    publicUrl: string
    previewUrl: string
  }
  pages: Page[]
  ogImageUrl?: string | null
}

const styles = `
  .header { margin-bottom: 10px; }
  .title { font-size: 15px; font-weight: 700; color: var(--kc-success); display: flex; align-items: center; gap: 5px; }
  .preview-link { width: 100%; aspect-ratio: 3 / 2; border-radius: 10px; border: 1px solid var(--ui-border); display: block; overflow: hidden; background: var(--ui-bg-muted); cursor: pointer; }
  .preview-link:focus-visible { outline: 2px solid var(--ui-text); outline-offset: 3px; }
  .preview-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.18s ease-out; }
  .preview-link:hover .preview-img { transform: scale(1.015); }
  .link-card { width: 100%; height: 100%; background: var(--ui-bg-muted); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
  .link-card-name { font-size: 16px; font-weight: 700; color: var(--ui-text); }
  .link-card-url { font-size: 13px; color: var(--ui-text-muted); }
  .site-url { font-size: 12px; color: var(--ui-text-muted); margin-top: 8px; text-align: center; }
  .actions { display: flex; gap: 8px; margin-top: 12px; }
  .btn { flex: 1; }
  .loading { text-align: center; padding: 40px 20px; color: var(--ui-text-muted); font-size: 14px; }
`

function App() {
  const [content, setContent] = useState<SiteContent | null>(null)

  useEffect(() => {
    onToolResult((result) => {
      const data = result as SiteContent
      if (data?.site) {
        setContent(data)
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

  const { site, pages, ogImageUrl } = content
  const isLive = Boolean(site.subdomain)
  // For launched sites use the public URL; for previews use the preview URL.
  const openUrl = isLive ? site.publicUrl : site.previewUrl
  const displayUrl = openUrl.replace(/^https?:\/\//, '').replace(/\?.*$/, '')
  const homePage = pages.find(page => page.path === '/') ?? pages[0] ?? { label: 'Home', path: '/' }

  const handleOpen = () => {
    try {
      const path = homePage.path.startsWith('/') ? homePage.path : `/${homePage.path}`
      const dest = new URL(openUrl)
      if (isLive) {
        dest.pathname = path
      } else if (path !== '/') {
        dest.pathname = `${dest.pathname.replace(/\/$/, '')}${path}`
      }
      openExternal(dest.toString())
    } catch (error) {
      console.error('Failed to open URL:', error)
      // Provide user feedback through notification or error dialog if available
    }
  }

  const handleWhatsNext = () => {
    sendUiMessage('What else would you like to set up?')
  }

  return (
    <div className="card">
      <div className="header">
        <div className="title">{isLive ? '✓ Your site is live!' : '✓ Site preview ready'}</div>
      </div>
      {ogImageUrl
        ? (
          <button type="button" className="preview-link" onClick={handleOpen} aria-label={`Open ${site.name}`}>
            <img src={ogImageUrl} className="preview-img" alt={site.name} />
          </button>
        )
        : (
          <button type="button" className="preview-link" onClick={handleOpen} aria-label={`Open ${site.name}`}>
            <span className="link-card">
              <span className="link-card-name">{site.name}</span>
              <span className="link-card-url">{displayUrl}</span>
            </span>
          </button>
        )
      }
      <div className="site-url">{displayUrl}</div>
      <div className="actions">
        <button className="btn btn-primary" onClick={handleOpen}>{isLive ? '↗ Open site' : '↗ Open preview'}</button>
        <button className="btn btn-outline" onClick={handleWhatsNext}>What's next?</button>
      </div>
    </div>
  )
}

injectStyles(sharedStyles + styles)
const root = document.getElementById('app')!
createRoot(root).render(<App />)

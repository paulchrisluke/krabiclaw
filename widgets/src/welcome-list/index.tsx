import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import { callTool, onToolResult, sendUiMessage, updateModelContext, injectStyles } from '../bridge'

interface Site {
  id: string
  name: string
  subdomain: string
  publicUrl: string
  status: 'live' | 'draft' | 'inactive'
}

interface Content {
  sites: Site[]
  currentUser?: {
    email?: string | null
    name?: string | null
  }
}

const PRIMARY = '#1F2547'
const GREEN = '#16a34a'

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111; }
  .card { padding: 20px; }
  .header { margin-bottom: 16px; }
  .title { font-size: 20px; font-weight: 700; color: ${PRIMARY}; line-height: 1.2; }
  .subtitle { font-size: 14px; color: #666; margin-top: 4px; line-height: 1.4; }
  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 14px 0; }
  .empty { text-align: center; padding: 8px 0 16px; }
  .empty-text { font-size: 14px; color: #666; margin-bottom: 14px; }
  .site-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1.5px solid #e5e7eb; border-radius: 10px; margin-bottom: 8px; cursor: pointer; transition: border-color 0.15s, background 0.15s; width: 100%; background: #fff; text-align: left; }
  .site-row:hover { border-color: ${PRIMARY}; background: #f8f9ff; }
  .site-row.selected { border-color: ${PRIMARY}; background: #f0f3ff; }
  .site-name { font-size: 14px; font-weight: 600; color: #111; }
  .site-url { font-size: 12px; color: #888; margin-top: 1px; }
  .status-dot { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; }
  .dot { width: 7px; height: 7px; border-radius: 50%; }
  .dot-live { background: ${GREEN}; }
  .dot-draft { background: #f59e0b; }
  .dot-inactive { background: #9ca3af; }
  .actions { display: flex; gap: 8px; margin-top: 14px; }
  .btn { flex: 1; padding: 11px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: opacity 0.15s; }
  .btn:hover { opacity: 0.85; }
  .btn-primary { background: ${PRIMARY}; color: #fff; }
  .btn-outline { background: #fff; color: ${PRIMARY}; border: 1.5px solid ${PRIMARY}; }
`

function StatusBadge({ status }: { status: Site['status'] }) {
  const label = status === 'live' ? 'Live' : status === 'draft' ? 'Draft' : 'Inactive'
  const cls = `dot dot-${status}`
  return (
    <span className="status-dot">
      <span className={cls} />
      {label}
    </span>
  )
}

function App() {
  const [content, setContent] = useState<Content | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    onToolResult((result) => {
      const data = result as { sites?: Site[] }
      if (data?.sites) {
        setContent({ sites: data.sites })
        if (data.sites.length === 1) {
          const site = data.sites[0]
          setSelected(site.id)
          updateModelContext({ site_id: site.id, site_name: site.name })
        }
      }
    })
  }, [])

  if (!content) {
    return (
      <div className="card">
        <div className="header">
          <div className="title">Welcome to KrabiClaw</div>
          <div className="subtitle">Loading your sites…</div>
        </div>
      </div>
    )
  }

  const { sites } = content
  const hasSites = sites.length > 0
  const selectedSite = sites.find(s => s.id === selected)

  const handleSelect = (site: Site) => {
    setSelected(site.id)
    updateModelContext({ site_id: site.id, site_name: site.name })
  }

  const handleCreate = () => {
    callTool('show_vertical_picker', {})
  }

  const handleWhatsNext = () => {
    if (selectedSite) {
      sendUiMessage(`What would you like to do with ${selectedSite.name}?`)
    }
  }

  if (!hasSites) {
    return (
      <div className="card">
        <div className="header">
          <div className="title">Welcome to KrabiClaw</div>
          <div className="subtitle">Your AI-powered business website, built from your Google Maps listing in minutes.</div>
        </div>
        <hr className="divider" />
        <div className="empty">
          <div className="empty-text">You don't have any sites yet.</div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleCreate}>
            + Create your first site
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="header">
        <div className="title">Welcome back</div>
        <div className="subtitle">Which site would you like to work with?</div>
      </div>
      <hr className="divider" />
      {sites.map(site => (
        <button
          key={site.id}
          className={`site-row${selected === site.id ? ' selected' : ''}`}
          onClick={() => handleSelect(site)}
        >
          <div>
            <div className="site-name">{site.name}</div>
            <div className="site-url">{site.subdomain}.krabiclaw.com</div>
          </div>
          <StatusBadge status={site.status} />
        </button>
      ))}
      <div className="actions">
        <button className="btn btn-primary" onClick={handleWhatsNext} disabled={!selected}>
          What's next?
        </button>
        <button className="btn btn-outline" onClick={handleCreate}>
          + New site
        </button>
      </div>
    </div>
  )
}

injectStyles(styles)
const root = document.getElementById('app')!
createRoot(root).render(<App />)

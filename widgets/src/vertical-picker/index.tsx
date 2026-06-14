import { createRoot } from 'react-dom/client'
import { updateModelContext, sendUiMessage, injectStyles } from '../bridge'

const VERTICALS = [
  { key: 'restaurant', label: 'Restaurant / Café / Bar' },
  { key: 'experience', label: 'Experience / Activity' },
  { key: 'retail', label: 'Retail / Shop' },
  { key: 'wellness', label: 'Wellness / Spa' },
  { key: 'service', label: 'Service business' },
]

const PRIMARY = '#1F2547'

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111; }
  .card { padding: 20px; }
  .title { font-size: 16px; font-weight: 700; color: ${PRIMARY}; margin-bottom: 14px; }
  .option { display: flex; align-items: center; width: 100%; padding: 13px 16px; border: 1.5px solid #e5e7eb; border-radius: 10px; margin-bottom: 8px; background: #fff; cursor: pointer; font-size: 14px; font-weight: 500; color: #111; text-align: left; transition: border-color 0.15s, background 0.15s; }
  .option:hover { border-color: ${PRIMARY}; background: #f0f3ff; color: ${PRIMARY}; }
`

function App() {
  const handleSelect = (vertical: string, label: string) => {
    updateModelContext({ vertical })
    sendUiMessage(`I selected: ${label}`)
  }

  return (
    <div className="card">
      <div className="title">What type of business is this?</div>
      {VERTICALS.map(v => (
        <button key={v.key} className="option" onClick={() => handleSelect(v.key, v.label)}>
          {v.label}
        </button>
      ))}
    </div>
  )
}

injectStyles(styles)
const root = document.getElementById('app')!
createRoot(root).render(<App />)

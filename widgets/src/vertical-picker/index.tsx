import { createRoot } from 'react-dom/client'
import { updateModelContext, sendUiMessage, injectStyles } from '../bridge'

const VERTICALS = [
  {
    key: 'restaurant',
    label: 'Restaurant / Café / Bar',
    imageUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/f65505ac-e3a6-4030-aa33-65e8ac58bf00/public',
  },
  {
    key: 'experience',
    label: 'Experience / Activity',
    imageUrl: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/7f1520e7-b6e4-4181-c689-0f1fc6bfaa00/public',
  },
]

const PRIMARY = '#1F2547'

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111; }
  .card { padding: 20px; }
  .title { font-size: 16px; font-weight: 700; color: ${PRIMARY}; margin-bottom: 14px; }
  .option { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 74px; padding: 8px; border: 1.5px solid #e5e7eb; border-radius: 10px; margin-bottom: 8px; background: #fff; cursor: pointer; color: #111; text-align: left; transition: border-color 0.15s, background 0.15s; }
  .option:hover { border-color: ${PRIMARY}; background: #f8f9ff; color: ${PRIMARY}; }
  .option:focus-visible { outline: 2px solid ${PRIMARY}; outline-offset: 3px; }
  .option-img { width: 64px; height: 56px; border-radius: 7px; object-fit: cover; background: #f3f4f6; flex: 0 0 auto; }
  .option-label { font-size: 14px; font-weight: 600; line-height: 1.25; }
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
          <img className="option-img" src={v.imageUrl} alt="" />
          <span className="option-label">{v.label}</span>
        </button>
      ))}
    </div>
  )
}

injectStyles(styles)
const root = document.getElementById('app')!
createRoot(root).render(<App />)

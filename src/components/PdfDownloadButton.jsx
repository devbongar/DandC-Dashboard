import { useState } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const PANEL_IDS = ['panel-phases', 'panel-completion', 'panel-issues', 'panel-compliance']

function getTodayLabel() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy} ${mm} ${dd}`
}

// Saves the full style attribute of each affected element, then removes
// overflow/height constraints so html2canvas sees the fully expanded content.
function expandPanel(panelEl) {
  const saved = []
  const all = [panelEl, ...panelEl.querySelectorAll('*')]
  for (const el of all) {
    const cs = window.getComputedStyle(el)
    const entry = { el, style: el.getAttribute('style') }
    let changed = false

    if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
      el.style.overflowY = 'visible'
      changed = true
    }
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
      el.style.overflowX = 'visible'
      changed = true
    }
    if (cs.maxHeight !== 'none') {
      el.style.maxHeight = 'none'
      changed = true
    }
    // Root panel: override fixed height from both inline styles and Tailwind h-[N] classes
    if (el === panelEl && cs.height !== 'auto') {
      el.style.height = 'auto'
      changed = true
    }
    // Non-root: only override explicit inline height (e.g. style={{ height: 600 }})
    if (el !== panelEl && el.style.height && el.style.height !== 'auto') {
      el.style.height = 'auto'
      changed = true
    }

    if (changed) saved.push(entry)
  }
  return saved
}

// Restores each element's style attribute to exactly what it was before expand.
function restorePanel(saved) {
  for (const { el, style } of saved) {
    if (style === null) el.removeAttribute('style')
    else el.setAttribute('style', style)
  }
}

export default function PdfDownloadButton() {
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'done'

  const handleExport = async () => {
    if (status !== 'idle') return
    setStatus('loading')

    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth() // 297mm

      // Page 1 — viewport snapshot (no expansion)
      const dashContent = document.getElementById('dashboard-content')
      if (dashContent) {
        const canvas1 = await html2canvas(dashContent, {
          useCORS: true,
          logging: false,
          scale: window.devicePixelRatio || 1,
        })
        const imgH1 = (canvas1.height / canvas1.width) * pageW
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, imgH1)
      }

      // Pages 2–5 — one per panel, fully expanded
      for (const panelId of PANEL_IDS) {
        const panelEl = document.getElementById(panelId)
        if (!panelEl) continue

        const saved = expandPanel(panelEl)
        // Allow browser to re-layout before capturing
        await new Promise(r => setTimeout(r, 60))

        const canvas = await html2canvas(panelEl, {
          useCORS: true,
          logging: false,
          scale: window.devicePixelRatio || 1,
        })

        restorePanel(saved)

        const imgH = (canvas.height / canvas.width) * pageW
        pdf.addPage([pageW, imgH])
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, pageW, imgH)
      }

      pdf.save(`D&C Dashboard.${getTodayLabel()}.pdf`)
      setStatus('done')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err) {
      console.error('PDF export failed:', err)
      setStatus('idle')
    }
  }

  const isIdle = status === 'idle'
  const isLoading = status === 'loading'
  const isDone = status === 'done'

  return (
    <>
      <style>{`
        @keyframes pdf-glow-pulse {
          0%, 100% {
            box-shadow: 0 0 12px rgba(0,212,255,0.35), 0 0 28px rgba(0,212,255,0.12),
                        0 0 0 1px rgba(0,212,255,0.2), 0 6px 24px rgba(0,0,0,0.5);
          }
          50% {
            box-shadow: 0 0 22px rgba(0,212,255,0.6), 0 0 48px rgba(0,212,255,0.22),
                        0 0 0 1px rgba(0,212,255,0.4), 0 6px 24px rgba(0,0,0,0.5);
          }
        }
        @keyframes pdf-spin {
          to { transform: rotate(360deg); }
        }
        .pdf-btn-pulse { animation: pdf-glow-pulse 2.5s ease-in-out infinite; }
        .pdf-btn-loading {
          box-shadow: 0 0 20px rgba(237,96,85,0.55), 0 0 44px rgba(237,96,85,0.2),
                      0 0 0 1px rgba(237,96,85,0.35), 0 6px 24px rgba(0,0,0,0.5) !important;
          animation: none !important;
        }
        .pdf-btn-done {
          box-shadow: 0 0 20px rgba(74,222,128,0.5), 0 0 44px rgba(74,222,128,0.18),
                      0 0 0 1px rgba(74,222,128,0.3), 0 6px 24px rgba(0,0,0,0.5) !important;
          animation: none !important;
        }
        .pdf-spinner { animation: pdf-spin 0.75s linear infinite; }
      `}</style>

      <button
        onClick={handleExport}
        disabled={!isIdle}
        title="Download Dashboard PDF"
        className={[
          'fixed bottom-6 right-6 z-50',
          'flex items-center gap-2.5 px-5 py-3 rounded-full',
          'text-sm font-semibold select-none transition-transform duration-150',
          isIdle ? 'cursor-pointer hover:scale-105 active:scale-95 pdf-btn-pulse' : 'cursor-not-allowed',
          isLoading ? 'pdf-btn-loading' : '',
          isDone ? 'pdf-btn-done' : '',
        ].join(' ')}
        style={{
          background: 'linear-gradient(135deg, #08081a 0%, #0e0e28 50%, #08081a 100%)',
          border: isLoading
            ? '1px solid rgba(237,96,85,0.4)'
            : isDone
            ? '1px solid rgba(74,222,128,0.4)'
            : '1px solid rgba(0,212,255,0.3)',
        }}
      >
        {/* Icon */}
        {isLoading ? (
          <svg className="pdf-spinner w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth={2.5}>
            <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" stroke="rgba(237,96,85,0.95)" />
          </svg>
        ) : isDone ? (
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="rgba(74,222,128,0.95)" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round"
              stroke="rgba(0,212,255,0.9)"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z"
            />
          </svg>
        )}

        {/* Label */}
        <span style={{
          color: isLoading
            ? 'rgba(237,96,85,0.95)'
            : isDone
            ? 'rgba(74,222,128,0.95)'
            : 'rgba(180,235,255,0.95)',
          letterSpacing: '0.02em',
        }}>
          {isLoading ? 'Generating…' : isDone ? 'Downloaded!' : 'Export PDF'}
        </span>
      </button>
    </>
  )
}

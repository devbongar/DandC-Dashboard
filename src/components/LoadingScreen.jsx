import ph1LogoWhite from '../assets/ph1WorldWhite.png'
const cachedWhiteLogo = localStorage.getItem('app_logo_white_url') || ph1LogoWhite

const BG_TRIANGLES = [
  { size: 40, top: '8%',  left: '12%', anim: 'ph1-tri-b', dur: '16s', delay: '0s',   op: 0.06 },
  { size: 18, top: '15%', left: '72%', anim: 'ph1-tri-a', dur: '18s', delay: '2s',   op: 0.05 },
  { size: 52, top: '35%', left: '85%', anim: 'ph1-tri-c', dur: '14s', delay: '1s',   op: 0.04 },
  { size: 22, top: '60%', left: '6%',  anim: 'ph1-tri-a', dur: '17s', delay: '3.5s', op: 0.05 },
  { size: 30, top: '75%', left: '55%', anim: 'ph1-tri-b', dur: '15s', delay: '5s',   op: 0.04 },
  { size: 14, top: '50%', left: '40%', anim: 'ph1-tri-c', dur: '19s', delay: '7s',   op: 0.05 },
  { size: 46, top: '88%', left: '78%', anim: 'ph1-tri-a', dur: '16s', delay: '2.5s', op: 0.04 },
]

export default function LoadingScreen() {
  return (
    <div
      className="fixed inset-0 bg-[#111111] flex flex-col items-center justify-center z-[9999] overflow-hidden"
      style={{ animation: 'ph1-screen-in 0.3s ease-out both', minHeight: '100dvh' }}
    >
      {/* Subtle background triangles */}
      {BG_TRIANGLES.map((t, i) => (
        <div
          key={i}
          style={{
            position:      'absolute',
            width:         t.size,
            height:        t.size,
            top:           t.top,
            left:          t.left,
            background:    '#ed6055',
            clipPath:      'polygon(0 0, 100% 50%, 0 100%)',
            opacity:       t.op,
            animation:     `${t.anim} ${t.dur} ease-in-out infinite ${t.delay}`,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Logo + glow wrapped together so glow centers on logo */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'ph1-fade-up 0.6s ease-out 0.1s both' }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.10) 45%, rgba(255,255,255,0.02) 65%, transparent 80%)',
            pointerEvents: 'none',
            animation: 'ph1-fade-in 0.8s ease-out 0.1s both',
          }}
        />
        <img src={cachedWhiteLogo} alt="Logo" style={{ height: 88, width: 'auto', display: 'block', position: 'relative' }} draggable={false} />
      </div>

      {/* Tagline */}
      <p
        className="text-white/30 text-xs tracking-widest uppercase mt-4 font-medium"
        style={{ animation: 'ph1-fade-up 0.6s ease-out 0.25s both' }}
      >
        Construction Project Monitoring
      </p>

      {/* Triangle pulse loader */}
      <div
        className="flex items-center gap-3 mt-12"
        style={{ animation: 'ph1-fade-in 0.4s ease-out 0.4s both' }}
      >
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width:         14,
              height:        14,
              background:    '#ed6055',
              clipPath:      'polygon(0 0, 100% 50%, 0 100%)',
              animation:     'ph1-loader-tri 1.4s ease-in-out infinite',
              animationDelay:`${i * 0.22}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

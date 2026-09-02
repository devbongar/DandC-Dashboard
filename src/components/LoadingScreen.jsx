
const BARS = [
  { rot:   0, delay: '0s'    },
  { rot:  30, delay: '-1.1s' },
  { rot:  60, delay: '-1s'   },
  { rot:  90, delay: '-0.9s' },
  { rot: 120, delay: '-0.8s' },
  { rot: 150, delay: '-0.7s' },
  { rot: 180, delay: '-0.6s' },
  { rot: 210, delay: '-0.5s' },
  { rot: 240, delay: '-0.4s' },
  { rot: 270, delay: '-0.3s' },
  { rot: 300, delay: '-0.2s' },
  { rot: 330, delay: '-0.1s' },
]

export default function LoadingScreen() {
  return (
    <div
      className="fixed inset-0 bg-[#111111] flex flex-col items-center justify-center z-[9999] overflow-hidden"
      style={{ animation: 'ph1-screen-in 0.3s ease-out both', minHeight: '100dvh' }}
    >
      {/* 12-bar spinner */}
      <div
        style={{
          position: 'relative',
          width: 96,
          height: 96,
          borderRadius: 10,
          animation: 'ph1-fade-in 0.4s ease-out 0.4s both',
        }}
      >
        {BARS.map(({ rot, delay }, i) => (
          <div
            key={i}
            style={{
              width: '8%',
              height: '24%',
              background: '#ed6055',
              position: 'absolute',
              left: '50%',
              top: '30%',
              opacity: 0,
              borderRadius: 50,
              boxShadow: '0 0 3px rgba(0,0,0,0.2)',
              transform: `rotate(${rot}deg) translate(0, -130%)`,
              animation: 'ph1-loader-bar 1s linear infinite',
              animationDelay: delay,
            }}
          />
        ))}
      </div>

      {/* Loading text */}
      <p
        className="text-white/40 text-xs tracking-widest uppercase font-medium mt-8"
        style={{ animation: 'ph1-fade-in 0.4s ease-out 0.5s both' }}
      >
        Loading
      </p>

      <style>{`
        @keyframes ph1-loader-bar {
          from { opacity: 1; }
          to   { opacity: 0.15; }
        }
      `}</style>
    </div>
  )
}

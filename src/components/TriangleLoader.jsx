export default function TriangleLoader({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="flex items-center gap-3">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: 12, height: 12,
              background: '#ed6055',
              clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
              animation: 'ph1-loader-tri 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.22}s`,
            }}
          />
        ))}
      </div>
      {label && <p className="text-xs text-gray-400">{label}</p>}
    </div>
  )
}

export default function GlassToggle({ options, value, onChange }) {
  const idx = options.findIndex(o => o.value === value)
  const selectedIdx = idx === -1 ? 0 : idx
  const count = options.length

  return (
    <div
      className="relative flex w-full overflow-hidden"
      style={{
        borderRadius: '0.875rem',
        background: 'rgba(0,0,0,0.055)',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.10), inset 0 -1px 1px rgba(255,255,255,0.8)',
        padding: '3px',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '3px',
          bottom: '3px',
          left: '3px',
          width: `calc(${100 / count}% - 6px / ${count})`,
          transform: `translateX(calc(${selectedIdx * 100}% + ${selectedIdx * 6 / count}px))`,
          transition: 'transform 0.46s cubic-bezier(0.37, 1.95, 0.66, 0.56)',
          borderRadius: '0.65rem',
          background: 'linear-gradient(135deg, rgba(75,85,99,0.82), #4b5563)',
          boxShadow: '0 2px 10px rgba(75,85,99,0.35), 0 0 0 1px rgba(75,85,99,0.18), inset 0 1px 0 rgba(200,210,220,0.25)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="flex-1 flex items-center justify-center transition-colors"
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '0.65rem 0.5rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: value === opt.value ? '#ffffff' : '#6b7280',
            borderRadius: '0.65rem',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            transition: 'color 0.2s ease',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

import { useState, useMemo, useRef } from 'react'

// Inline-expanding multi-select dropdown — ProjectsPage visual style.
// No absolute positioning: list expands inline (suitable for filter sheets and panels).
// Props:
//   options:     [{ value, label }]
//   values:      string[]        (empty = "all")
//   onChange:    (string[]) => void
//   emptyLabel:  string          (trigger label when nothing selected)
//   placeholder: string          (search input placeholder)
//   icon:        SVG path string (optional, shown in trigger)
export default function SheetMultiDropdown({ options, values, onChange, emptyLabel, placeholder = 'Search…', icon }) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const inputRef          = useRef(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  const toggle   = (val) => onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val])
  const clearAll = () => { onChange([]); setQuery('') }

  const hasValues    = values.length > 0
  const triggerLabel = !hasValues
    ? emptyLabel
    : values.length === 1
      ? (options.find(o => o.value === values[0])?.label ?? emptyLabel)
      : `${values.length} selected`

  const handleTrigger = () => {
    const next = !open
    setOpen(next)
    if (next) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div className="w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={handleTrigger}
        className="w-full flex items-center gap-1.5 px-3 py-3 text-xs rounded-lg border transition-all"
        style={{
          background: open ? '#fff' : '#fafafa',
          borderColor: open || hasValues ? '#6b7280' : '#e5e7eb',
          color: hasValues ? '#111827' : '#9ca3af',
          boxShadow: open ? '0 0 0 3px rgba(107,114,128,0.14)' : '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {icon && (
          <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        )}
        <span className="flex-1 text-left truncate font-medium">{triggerLabel}</span>
        {hasValues && (
          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-gray-600 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {values.length}
          </span>
        )}
        <svg
          className="w-3 h-3 flex-shrink-0 text-gray-400 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Inline list with search */}
      {open && (
        <div
          className="mt-1.5 rounded-xl overflow-hidden"
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
          }}
        >
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-xs text-black placeholder-gray-400 outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            {hasValues && !query && (
              <button
                type="button"
                onClick={clearAll}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left transition-colors hover:bg-gray-50 border-b border-gray-50"
                style={{ color: '#6b7280' }}
              >
                <span className="font-semibold italic">Clear all</span>
              </button>
            )}

            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400 text-center italic">No results found</p>
            ) : (
              filtered.map((opt, i) => {
                const checked = values.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className="w-full flex items-center gap-2 px-3 py-3 text-xs text-left transition-colors hover:bg-gray-50"
                    style={{
                      borderTop: i > 0 ? '1px solid #f3f4f6' : 'none',
                      color: checked ? '#374151' : '#111827',
                    }}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center"
                      style={{
                        background: checked ? '#4b5563' : '#fff',
                        border: checked ? '1.5px solid #4b5563' : '1.5px solid #d1d5db',
                      }}
                    >
                      {checked && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    <span className={checked ? 'font-semibold' : 'font-medium'}>{opt.label}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

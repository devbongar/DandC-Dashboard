import { useState, useEffect, useMemo, useRef } from 'react'

// options: array of { value, label }
// emptyValue: the "all / none" sentinel (e.g. 'all' or '')
// emptyLabel: label for the sentinel option
// placeholder: search input placeholder text
// icon: optional SVG path string shown in the trigger
// disabled: grays out and disables the control
export default function SearchDropdown({ options, value, onChange, emptyValue, emptyLabel, placeholder, icon, disabled = false, minWidth = 130 }) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const ref               = useRef(null)
  const inputRef          = useRef(null)

  const isEmptyVal    = value === emptyValue
  const selectedLabel = isEmptyVal ? emptyLabel : (options.find(o => o.value === value)?.label ?? emptyLabel)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options
  }, [options, query])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openDropdown = () => {
    if (disabled) return
    setOpen(true)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const select = (val) => { onChange(val); setOpen(false); setQuery('') }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all"
        style={{
          background: disabled ? '#f9fafb' : open ? '#fff' : '#fafafa',
          borderColor: open ? '#ed6055' : '#e5e7eb',
          color: disabled ? '#9ca3af' : isEmptyVal ? '#9ca3af' : '#111827',
          boxShadow: open ? '0 0 0 3px rgba(237,96,85,0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
          minWidth,
          maxWidth: 200,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {icon && (
          <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        )}
        <span className="flex-1 text-left truncate font-medium">{selectedLabel}</span>
        <svg
          className="w-3 h-3 flex-shrink-0 text-gray-400 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Popover */}
      {open && !disabled && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 rounded-xl overflow-hidden"
          style={{
            width: 220,
            background: '#fff',
            border: '1px solid #e5e7eb',
            boxShadow: '0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
          }}
        >
          {/* Search input */}
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

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            <button
              type="button"
              onClick={() => select(emptyValue)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-gray-50"
              style={{ color: isEmptyVal ? '#ed6055' : '#6b7280' }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: isEmptyVal ? '#ed6055' : 'transparent', border: isEmptyVal ? 'none' : '1.5px solid #d1d5db' }} />
              <span className="font-medium italic">{emptyLabel}</span>
            </button>

            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400 text-center italic">No results found</p>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => select(o.value)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-gray-50"
                  style={{ color: value === o.value ? '#ed6055' : '#111827' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: value === o.value ? '#ed6055' : 'transparent', border: value === o.value ? 'none' : '1.5px solid #d1d5db' }} />
                  <span className={value === o.value ? 'font-semibold' : 'font-medium'}>{o.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabaseClient'
import DashboardLayout from '../../components/DashboardLayout'
import useProfile from '../../hooks/useProfile'
import TriangleLoader from '../../components/TriangleLoader'

// ── Icons ─────────────────────────────────────────────────────────────────────

const EditIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
  </svg>
)

const DeleteIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
)

const ChevronUpIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
)

const StarIcon = ({ filled }) => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={filled ? '#f59e0b' : 'none'} stroke={filled ? '#f59e0b' : 'currentColor'} strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
  </svg>
)

// ── PermitCombobox ────────────────────────────────────────────────────────────

function PermitCombobox({ value, onChange, options = [], placeholder = '' }) {
  const [open, setOpen]     = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const inputRef            = useRef(null)

  const filtered = useMemo(() => {
    const q = (value || '').toLowerCase()
    const list = q ? options.filter(o => o.toLowerCase().includes(q)) : options
    return list.filter(o => o !== value)
  }, [value, options])

  const updateCoords = () => {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setCoords({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) })
    }
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [open])

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        value={value ?? ''}
        onChange={e => { onChange(e.target.value); updateCoords(); setOpen(true) }}
        onFocus={() => { updateCoords(); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#ed6055] bg-white text-black"
      />
      {open && filtered.length > 0 && (
        <ul
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto py-1"
        >
          {filtered.map(opt => (
            <li
              key={opt}
              onMouseDown={() => { onChange(opt); setOpen(false) }}
              className="px-3 py-2 text-sm text-gray-700 hover:bg-[#ed6055]/10 hover:text-[#ed6055] cursor-pointer"
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Add/Edit Modal ────────────────────────────────────────────────────────────

function PermitModal({ l1s, allNames, editRow, initialParent, onSave, onClose }) {
  const isEdit = !!editRow
  const [form, setForm] = useState({
    permit_name: editRow?.permit_name ?? '',
    parent_id:   editRow?.parent_id ?? initialParent?.id ?? null,
  })

  const handleSave = () => {
    if (!form.permit_name.trim()) return
    onSave({ permit_name: form.permit_name.trim(), parent_id: form.parent_id ?? null })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-black">{isEdit ? 'Edit Standard Permit' : 'Add Standard Permit'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Under (parent permit)</label>
            <select
              value={form.parent_id ?? ''}
              onChange={e => setForm(p => ({ ...p, parent_id: e.target.value || null }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#ed6055] text-black"
            >
              <option value="">— None (Level 1) —</option>
              {l1s.filter(l => !editRow || l.id !== editRow.id).map(l => (
                <option key={l.id} value={l.id}>{l.permit_name}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              {form.parent_id ? 'Saved as a sub-requirement (Level 2).' : 'Saved as a top-level permit (Level 1).'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              {form.parent_id ? 'Sub-requirement name' : 'Permit name'}
            </label>
            <PermitCombobox
              value={form.permit_name}
              onChange={v => setForm(p => ({ ...p, permit_name: v }))}
              options={allNames}
              placeholder={form.parent_id ? 'e.g. Architectural Plans' : 'e.g. Building Permit'}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!form.permit_name.trim()}
            className="px-4 py-2 text-xs font-semibold bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEdit ? 'Save Changes' : 'Add Permit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Row layout ────────────────────────────────────────────────────────────────

const ROW_GRID = 'grid grid-cols-[40px_1fr_120px]'

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StandardPermits() {
  const { profile } = useProfile()
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [modal, setModal]         = useState(null)
  const [deleteId, setDeleteId]   = useState(null)
  const [toast, setToast]         = useState(null)
  const [collapsed, setCollapsed] = useState(new Set())

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('standard_permits').select('*').order('sort_order')
    if (data) setRows(data)
    setLoading(false)
  }

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const l1s        = useMemo(() => rows.filter(r => !r.parent_id), [rows])
  const childrenOf = useMemo(() => {
    const map = {}
    rows.filter(r => r.parent_id).forEach(r => {
      if (!map[r.parent_id]) map[r.parent_id] = []
      map[r.parent_id].push(r)
    })
    return map
  }, [rows])

  const allNames = useMemo(() => [...new Set(rows.map(r => r.permit_name).filter(Boolean))].sort(), [rows])

  // ── Persist ─────────────────────────────────────────────────────────────────
  const persistOrder = async (newRows) => {
    setSaving(true)
    await Promise.all(
      newRows.map((r, i) =>
        supabase.from('standard_permits').update({ sort_order: i, parent_id: r.parent_id }).eq('id', r.id)
      )
    )
    setSaving(false)
  }

  // ── Move helpers ─────────────────────────────────────────────────────────────

  const moveL1 = async (l1Id, dir) => {
    const list  = rows.filter(r => !r.parent_id)
    const idx   = list.findIndex(r => r.id === l1Id)
    const swap  = idx + dir
    if (swap < 0 || swap >= list.length) return
    const next  = [...list]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    const newRows = [...next, ...rows.filter(r => r.parent_id)]
    setRows(newRows)
    await persistOrder(newRows)
  }

  const moveL2 = async (child, dir) => {
    const siblings  = rows.filter(r => r.parent_id === child.parent_id)
    const idx       = siblings.findIndex(r => r.id === child.id)
    const swap      = idx + dir
    if (swap < 0 || swap >= siblings.length) return
    const next      = [...siblings]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    const newRows   = [
      ...rows.filter(r => !r.parent_id),
      ...rows.filter(r => r.parent_id && r.parent_id !== child.parent_id),
      ...next,
    ]
    setRows(newRows)
    await persistOrder(newRows)
  }

  const nestUnder = async (l1) => {
    const list   = rows.filter(r => !r.parent_id)
    const idx    = list.findIndex(r => r.id === l1.id)
    if (idx <= 0) return
    const parent = list[idx - 1]
    const newRows = rows.map(r => r.id === l1.id ? { ...r, parent_id: parent.id } : r)
    setRows(newRows)
    await persistOrder(newRows)
    showToast(`Nested under "${parent.permit_name}".`)
  }

  const toggleHighlight = async (row) => {
    const next = !row.is_highlighted
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_highlighted: next } : r))
    await supabase.from('standard_permits').update({ is_highlighted: next }).eq('id', row.id)
  }

  const promote = async (child) => {
    const newRows = rows.map(r => r.id === child.id ? { ...r, parent_id: null } : r)
    setRows(newRows)
    await persistOrder(newRows)
    showToast('Promoted to L1.')
  }

  // ── Save / Delete ────────────────────────────────────────────────────────────

  const save = async ({ permit_name, parent_id }, editRow) => {
    const payload = {
      permit_name,
      parent_id:  parent_id ?? null,
      sort_order: editRow
        ? editRow.sort_order
        : rows.filter(r => !parent_id ? !r.parent_id : r.parent_id === parent_id).length,
    }
    let error
    if (editRow) {
      ;({ error } = await supabase.from('standard_permits').update({ permit_name, parent_id: parent_id ?? null }).eq('id', editRow.id))
    } else {
      ;({ error } = await supabase.from('standard_permits').insert(payload))
    }
    if (error) { showToast(error.message, 'error'); return }
    showToast(editRow ? 'Updated.' : 'Permit added.')
    setModal(null)
    load()
  }

  const del = async (id) => {
    await supabase.from('standard_permits').delete().eq('id', id)
    showToast('Deleted.')
    setDeleteId(null)
    load()
  }

  const toggleCollapse = (id) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // ── Render ───────────────────────────────────────────────────────────────────

  const totalL2 = rows.filter(r => r.parent_id).length

  return (
    <DashboardLayout profile={profile}>
      <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-black">Standard Permits</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Define the master list of permits. Projects will auto-populate from this list.
            </p>
          </div>
          <button
            onClick={() => setModal('add')}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#ed6055] text-white rounded-lg hover:bg-[#d94f45] transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add Permit
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 rounded-full bg-[#ed6055]" />
              <span className="text-sm font-bold text-black">Permits &amp; Licensing</span>
            </div>
            <div className="flex items-center gap-3">
              {saving && <span className="text-[11px] text-gray-400">Saving…</span>}
              {!loading && (
                <span className="text-[11px] font-bold text-[#ed6055]">
                  {l1s.length} permit{l1s.length !== 1 ? 's' : ''}{totalL2 > 0 ? `, ${totalL2} sub-req${totalL2 !== 1 ? 's' : ''}` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Column headers */}
          <div className={`${ROW_GRID} border-b-2 border-[#ed6055] bg-white`}>
            <div className="px-2 py-3 text-[11px] font-bold text-gray-400 text-center">#</div>
            <div className="px-4 py-3 text-[11px] font-bold text-gray-700">Permit / Requirement</div>
            <div className="px-4 py-3" />
          </div>

          {loading && <TriangleLoader label="Loading permits…" />}
          {!loading && l1s.length === 0 && (
            <div className="text-center py-16 text-sm text-gray-400 italic">
              No standard permits yet. Click "Add Permit" to get started.
            </div>
          )}

          {l1s.map((l1, l1Idx) => {
            const children    = childrenOf[l1.id] ?? []
            const isCollapsed = collapsed.has(l1.id)
            const isFirstL1   = l1Idx === 0
            const isLastL1    = l1Idx === l1s.length - 1

            return (
              <div key={l1.id}>
                {/* L1 row */}
                <div className={`group ${ROW_GRID} items-center border-t border-gray-100`} style={{ background: 'rgba(237,96,85,0.025)' }}>
                  <div className="px-2 py-3 text-[11px] font-bold text-gray-400 text-center">{l1Idx + 1}</div>
                  <div className="px-4 py-3 flex items-center gap-2 min-w-0">
                    {children.length > 0 ? (
                      <button onClick={() => toggleCollapse(l1.id)} className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition">
                        <svg
                          className="w-3.5 h-3.5 transition-transform"
                          style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    ) : (
                      <span className="w-3.5 flex-shrink-0" />
                    )}
                    <button
                      onClick={() => toggleHighlight(l1)}
                      title={l1.is_highlighted ? 'Remove highlight' : 'Highlight this permit'}
                      className={`flex-shrink-0 p-0.5 transition ${l1.is_highlighted ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400 opacity-0 group-hover:opacity-100'}`}
                    >
                      <StarIcon filled={l1.is_highlighted} />
                    </button>
                    <span className="text-xs font-bold text-gray-900 truncate">{l1.permit_name}</span>
                    {children.length > 0 && (
                      <span className="text-[10px] font-bold text-white bg-[#ed6055] rounded-full px-1.5 py-0.5 leading-none flex-shrink-0">
                        {children.length}
                      </span>
                    )}
                  </div>

                  <div className="px-3 py-3 flex items-center justify-end gap-1">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => moveL1(l1.id, -1)} disabled={isFirstL1} title="Move up" className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-25 disabled:cursor-not-allowed transition"><ChevronUpIcon /></button>
                      <button onClick={() => moveL1(l1.id, 1)} disabled={isLastL1} title="Move down" className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-25 disabled:cursor-not-allowed transition"><ChevronDownIcon /></button>
                      <span className="w-px h-3 bg-gray-200 mx-0.5" />
                      <button onClick={() => nestUnder(l1)} disabled={isFirstL1} title="Nest under permit above" className="p-1 text-gray-300 hover:text-orange-500 disabled:opacity-25 disabled:cursor-not-allowed transition">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" /></svg>
                      </button>
                      <button onClick={() => setModal({ row: l1 })} title="Edit" className="p-1 text-gray-300 hover:text-blue-500 transition"><EditIcon /></button>
                      <button onClick={() => setDeleteId(l1.id)} title="Delete" className="p-1 text-gray-300 hover:text-red-500 transition"><DeleteIcon /></button>
                    </div>
                  </div>
                </div>

                {/* L2 children */}
                {!isCollapsed && children.map((child, cIdx) => {
                  const isFirstChild = cIdx === 0
                  const isLastChild  = cIdx === children.length - 1

                  return (
                    <div key={child.id} className={`group ${ROW_GRID} items-center border-t border-gray-50 hover:bg-[#ed6055]/5 transition`} style={{ background: 'rgba(0,0,0,0.01)' }}>
                      <div className="px-2 py-2.5 text-[11px] text-gray-300 text-center">{l1Idx + 1}.{cIdx + 1}</div>
                      <div className="pr-4 py-2.5 flex items-center gap-1.5 min-w-0">
                        {/* indent + tree line */}
                        <div className="flex-shrink-0 flex items-center" style={{ width: 80, paddingLeft: 40, position: 'relative', alignSelf: 'stretch' }}>
                          <div style={{ position: 'absolute', left: 40, top: 0, bottom: isLastChild ? '50%' : 0, width: 1.5, background: '#e5e7eb' }} />
                          <div style={{ position: 'absolute', left: 40, top: '50%', width: 20, height: 1.5, background: '#e5e7eb' }} />
                        </div>
                        <button
                          onClick={() => toggleHighlight(child)}
                          title={child.is_highlighted ? 'Remove highlight' : 'Highlight this permit'}
                          className={`flex-shrink-0 p-0.5 transition ${child.is_highlighted ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400 opacity-0 group-hover:opacity-100'}`}
                        >
                          <StarIcon filled={child.is_highlighted} />
                        </button>
                        <span className="text-xs text-gray-600 font-medium truncate">{child.permit_name}</span>
                      </div>

                      <div className="px-3 py-2.5 flex items-center justify-end gap-1">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => moveL2(child, -1)} disabled={isFirstChild} title="Move up" className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-25 disabled:cursor-not-allowed transition"><ChevronUpIcon /></button>
                          <button onClick={() => moveL2(child, 1)} disabled={isLastChild} title="Move down" className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-25 disabled:cursor-not-allowed transition"><ChevronDownIcon /></button>
                          <span className="w-px h-3 bg-gray-200 mx-0.5" />
                          <button onClick={() => promote(child)} title="Promote to L1" className="p-1 text-gray-300 hover:text-green-600 transition">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" /></svg>
                          </button>
                          <button onClick={() => setModal({ row: child })} title="Edit" className="p-1 text-gray-300 hover:text-blue-500 transition"><EditIcon /></button>
                          <button onClick={() => setDeleteId(child.id)} title="Delete" className="p-1 text-gray-300 hover:text-red-500 transition"><DeleteIcon /></button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {modal && (
        <PermitModal
          l1s={l1s}
          allNames={allNames}
          editRow={modal.row ?? null}
          initialParent={modal.addUnder ?? null}
          onSave={(data) => save(data, modal.row ?? null)}
          onClose={() => setModal(null)}
        />
      )}

      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-sm font-bold text-black">Delete permit?</h3>
            <p className="text-xs text-gray-500">
              This will also delete all sub-requirements under it. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-lg transition">Cancel</button>
              <button onClick={() => del(deleteId)} className="px-4 py-2 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition">Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-[9999] ${toast.type === 'error' ? 'bg-[#ed6055] text-white' : 'bg-black text-white'}`}>
          {toast.message}
        </div>
      )}
    </DashboardLayout>
  )
}

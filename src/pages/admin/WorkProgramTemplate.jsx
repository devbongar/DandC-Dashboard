import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import DashboardLayout from '../../components/DashboardLayout'
import useProfile from '../../hooks/useProfile'
import LoadingScreen from '../../components/LoadingScreen'
import useMinLoading from '../../hooks/useMinLoading'
import { assignSeqNumbers } from '../../lib/templateUtils'

const PHASES = [
  { key: 'initiation',           label: 'Initiation' },
  { key: 'planning',             label: 'Planning' },
  { key: 'execution_monitoring', label: 'Execution & Monitoring' },
  { key: 'closeout',             label: 'Close-Out' },
]

// -- Inline row (add or edit) ---------------------------------------------------

function InlineRow({ initial = {}, seq, isChild, onSave, onCancel }) {
  const [name,     setName]     = useState(initial.name     ?? '')
  const [duration, setDuration] = useState(initial.duration ?? '')
  const [preds,    setPreds]    = useState(initial.preds    ?? '')
  const [saving,   setSaving]   = useState(false)
  const nameRef = useRef(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSave({ name, duration, preds })
    setSaving(false)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter')  handleSave()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <tr className="border-t border-b border-yellow-300 bg-yellow-50">
      <td className="px-3 py-2 text-gray-400 text-xs">{seq}</td>
      <td className="py-1.5 pr-2" style={{ paddingLeft: isChild ? 28 : 12 }}>
        <input
          ref={nameRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Activity name…"
          className="w-full border border-yellow-400 rounded-md px-2 py-1 text-xs outline-none bg-white"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          min={1}
          step={1}
          value={duration}
          onChange={e => setDuration(e.target.value)}
          onKeyDown={handleKey}
          placeholder="days"
          className="w-16 border border-yellow-400 rounded-md px-2 py-1 text-xs text-center outline-none bg-white"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={preds}
          onChange={e => setPreds(e.target.value)}
          onKeyDown={handleKey}
          placeholder="e.g. 1.1 FS"
          className="w-24 border border-yellow-400 rounded-md px-2 py-1 text-xs outline-none bg-white"
        />
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="text-emerald-500 font-bold text-sm mr-1.5 disabled:opacity-40"
        >✓</button>
        <button onClick={onCancel} className="text-red-300 text-sm">✕</button>
      </td>
    </tr>
  )
}

// -- Single task row ------------------------------------------------------------

function TaskRow({ task, seq, isChild, allTasks, editingId, addingAfterId, onEdit, onDelete, onAddBelow, onSaveEdit, showToast }) {
  const [hovered, setHovered] = useState(false)
  const hasChildren = allTasks.some(t => t.parent_id === task.id)

  if (editingId === task.id) {
    return (
      <InlineRow
        initial={{ name: task.milestone_name, duration: task.duration ?? '', preds: task.predecessor_text ?? '' }}
        seq={seq}
        isChild={isChild}
        onSave={onSaveEdit}
        onCancel={() => onEdit(null)}
      />
    )
  }

  return (
    <>
      <tr
        className="border-b border-gray-100 bg-white"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <td className="px-3 py-2 text-gray-700 text-xs">{seq}</td>
        <td className="px-3 py-2" style={{ paddingLeft: isChild ? 28 : 12 }}>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${isChild ? 'text-gray-700' : 'font-semibold text-gray-700'}`}>
              {task.milestone_name}
            </span>
            {hovered && (
              <button
                onClick={() => onAddBelow(task)}
                className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[11px] font-bold leading-none flex items-center justify-center shrink-0"
                title={isChild ? 'Add sibling task below' : 'Add child task'}
              >
                +
              </button>
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-center text-xs text-gray-700">
          {hasChildren
            ? <span className="text-gray-400">--</span>
            : (task.duration != null ? task.duration : <span className="text-gray-400">--</span>)
          }
        </td>
        <td className="px-3 py-2 text-xs text-gray-700">
          {task.predecessor_text ?? <span className="text-gray-400">--</span>}
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <span onClick={() => onEdit(task.id)}   className="text-gray-300 cursor-pointer mr-2 hover:text-gray-500">✎</span>
          <span onClick={() => onDelete(task)}     className="text-red-200 cursor-pointer hover:text-red-400">✕</span>
        </td>
      </tr>
      {/* Inline add row appears immediately after this row */}
      {addingAfterId === task.id && (
        <InlineRowConsumer
          task={task}
          isChild={isChild}
          allTasks={allTasks}
          onAddBelow={onAddBelow}
          seq="…"
        />
      )}
    </>
  )
}

// placeholder -- actual InlineRow is rendered by TemplateTable using addingAfter state
function InlineRowConsumer() { return null }

// -- Phase section header -------------------------------------------------------

function PhaseHeader({ label }) {
  return (
    <tr className="bg-white border-t-2 border-gray-200">
      <td colSpan={5} className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
        ▸ {label}
      </td>
    </tr>
  )
}

// -- Predecessor-text helpers ---------------------------------------------------

// Returns a map of old_seq → new_seq for every task whose position changed
function buildSeqChanges(oldSeqMap, newSeqMap) {
  const changes = new Map()
  for (const [id, oldSeq] of oldSeqMap) {
    const newSeq = newSeqMap.get(id)
    if (newSeq && newSeq !== oldSeq) changes.set(oldSeq, newSeq)
  }
  return changes
}

// Rewrite "1.3 SS, 2.1 FS" → update shifted seq refs; drop deleted ones
function rewritePredecessorText(text, seqChanges, deletedSeqs = new Set()) {
  if (!text) return text
  const kept = text.split(',').map(s => s.trim()).filter(Boolean).map(token => {
    const m = token.match(/^([\d.]+)(\s*.*)$/)
    if (!m) return token
    if (deletedSeqs.has(m[1])) return null
    const newSeq = seqChanges.get(m[1])
    return newSeq ? `${newSeq}${m[2]}` : token
  }).filter(v => v !== null)
  return kept.length > 0 ? kept.join(', ') : null
}

// After a structural change (insert / delete), patch affected predecessor_text rows
async function syncPredecessorTexts(oldSeqMap, newTasks, deletedSeqs = new Set()) {
  const newSeqMap = assignSeqNumbers(newTasks)
  const seqChanges = buildSeqChanges(oldSeqMap, newSeqMap)
  if (seqChanges.size === 0 && deletedSeqs.size === 0) return
  const updates = newTasks.filter(t => t.predecessor_text).flatMap(t => {
    const updated = rewritePredecessorText(t.predecessor_text, seqChanges, deletedSeqs)
    return updated !== t.predecessor_text ? [{ id: t.id, predecessor_text: updated }] : []
  })
  if (updates.length > 0) {
    await Promise.all(
      updates.map(u =>
        supabase.from('work_program_template_tasks')
          .update({ predecessor_text: u.predecessor_text })
          .eq('id', u.id)
      )
    )
  }
}

// -- Template table (all state for add/edit/delete lives here) -----------------

function TemplateTable({ tasks, seqMap, onReload, showToast }) {
  const [addingAfter,    setAddingAfter]    = useState(null)
  // addingAfter: { triggerId, parentId, phase, isChild, afterSortOrder }
  const [editingId,      setEditingId]      = useState(null)
  const [confirmDelete,  setConfirmDelete]  = useState(null)

  const handleAddBelow = (task) => {
    setEditingId(null)
    if (!task.parent_id) {
      // Parent: add child after its last child (or right after the parent itself)
      const kids = tasks.filter(t => t.parent_id === task.id)
      const after = kids.length
        ? Math.max(...kids.map(t => t.sort_order))
        : task.sort_order
      setAddingAfter({ triggerId: task.id, parentId: task.id, phase: task.phase, isChild: true, afterSortOrder: after })
    } else {
      // Child: add sibling below
      setAddingAfter({ triggerId: task.id, parentId: task.parent_id, phase: task.phase, isChild: true, afterSortOrder: task.sort_order })
    }
  }

  const handleSaveNew = async ({ name, duration, preds }) => {
    if (!name.trim() || !addingAfter) return
    const { error } = await supabase
      .from('work_program_template_tasks')
      .insert({
        sort_order:       addingAfter.afterSortOrder + 0.5,
        phase:            addingAfter.phase,
        milestone_name:   name.trim(),
        parent_id:        addingAfter.parentId,
        duration:         duration ? parseInt(duration, 10) : null,
        predecessor_text: preds.trim() || null,
      })
    if (error) { showToast(error.message, 'error'); return }
    // Auto-fix any predecessor_text that references tasks whose seq numbers shifted
    const { data: updatedTasks } = await supabase
      .from('work_program_template_tasks').select('*').order('sort_order')
    if (updatedTasks) await syncPredecessorTexts(seqMap, updatedTasks)
    showToast('Task added.')
    setAddingAfter(null)
    onReload()
  }

  const handleSaveEdit = async ({ name, duration, preds }) => {
    if (!name.trim()) return
    const { error } = await supabase
      .from('work_program_template_tasks')
      .update({
        milestone_name:   name.trim(),
        duration:         duration ? parseInt(duration, 10) : null,
        predecessor_text: preds.trim() || null,
      })
      .eq('id', editingId)
    if (error) { showToast(error.message, 'error'); return }
    showToast('Task updated.')
    setEditingId(null)
    onReload()
  }

  const handleDelete = (task) => {
    const childCount = tasks.filter(t => t.parent_id === task.id).length
    if (childCount > 0) {
      setConfirmDelete({ id: task.id, name: task.milestone_name, childCount })
      return
    }
    doDelete(task.id)
  }

  const doDelete = async (id) => {
    // Collect seqs that will disappear (the deleted task + its children via CASCADE)
    const willDelete = new Set([id, ...tasks.filter(t => t.parent_id === id).map(t => t.id)])
    const deletedSeqs = new Set([...willDelete].map(did => seqMap.get(did)).filter(Boolean))
    const { error } = await supabase
      .from('work_program_template_tasks').delete().eq('id', id)
    if (error) { showToast(error.message, 'error'); return }
    // Auto-fix predecessor_text: remove refs to deleted tasks, update shifted refs
    const { data: updatedTasks } = await supabase
      .from('work_program_template_tasks').select('*').order('sort_order')
    if (updatedTasks) await syncPredecessorTexts(seqMap, updatedTasks, deletedSeqs)
    showToast('Task deleted.')
    setConfirmDelete(null)
    onReload()
  }

  return (
    <div className="mt-4">
      {/* Delete confirmation banner */}
      {confirmDelete && (
        <div className="mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-sm">
          <span className="text-red-700 text-xs">
            Delete <strong>"{confirmDelete.name}"</strong> and its {confirmDelete.childCount} sub-task{confirmDelete.childCount !== 1 ? 's' : ''}?
          </span>
          <div className="flex gap-2 ml-4">
            <button onClick={() => setConfirmDelete(null)} className="px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs">Cancel</button>
            <button onClick={() => doDelete(confirmDelete.id)} className="px-3 py-1 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600">Delete</button>
          </div>
        </div>
      )}

      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-3 py-2.5 text-gray-500 font-semibold text-xs w-10">#</th>
              <th className="px-3 py-2.5 text-gray-500 font-semibold text-xs">Activity</th>
              <th className="px-3 py-2.5 text-gray-500 font-semibold text-xs text-center w-24">Dur. (days)</th>
              <th className="px-3 py-2.5 text-gray-500 font-semibold text-xs w-32">Predecessors</th>
              <th className="px-3 py-2.5 w-14"></th>
            </tr>
          </thead>
          <tbody>
            {PHASES.map(phase => {
              const phaseTasks = tasks.filter(t => t.phase === phase.key)
              const parents    = phaseTasks.filter(t => !t.parent_id)

              return (
                <PhaseRows
                  key={phase.key}
                  phase={phase}
                  phaseTasks={phaseTasks}
                  parents={parents}
                  allTasks={tasks}
                  seqMap={seqMap}
                  editingId={editingId}
                  addingAfter={addingAfter}
                  onEdit={setEditingId}
                  onDelete={handleDelete}
                  onAddBelow={handleAddBelow}
                  onSaveEdit={handleSaveEdit}
                  onSaveNew={handleSaveNew}
                  onCancelAdd={() => setAddingAfter(null)}
                  onAddTopLevel={() => {
                    setEditingId(null)
                    const maxSort = phaseTasks.length
                      ? Math.max(...phaseTasks.map(t => t.sort_order))
                      : 0
                    setAddingAfter({ triggerId: `phase-${phase.key}`, parentId: null, phase: phase.key, isChild: false, afterSortOrder: maxSort })
                  }}
                  showToast={showToast}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// -- Renders one phase section (header + rows + add-top-level footer) ----------

function PhaseRows({ phase, phaseTasks, parents, allTasks, seqMap, editingId, addingAfter, onEdit, onDelete, onAddBelow, onSaveEdit, onSaveNew, onCancelAdd, onAddTopLevel, showToast }) {
  const isTopLevelAdd = addingAfter?.triggerId === `phase-${phase.key}`

  return (
    <>
      <PhaseHeader label={phase.label} />

      {phaseTasks.length === 0 && !isTopLevelAdd && (
        <tr><td colSpan={5} className="px-3 py-2 text-gray-400 italic text-[11px]">No tasks yet</td></tr>
      )}

      {parents.map(parent => {
        const children    = phaseTasks.filter(t => t.parent_id === parent.id)
        const parentSeq   = seqMap.get(parent.id) ?? '--'
        const isAddAfterParent = addingAfter?.triggerId === parent.id && addingAfter?.isChild

        return (
          <ParentRows
            key={parent.id}
            parent={parent}
            parentSeq={parentSeq}
            children={children}
            allTasks={allTasks}
            seqMap={seqMap}
            editingId={editingId}
            addingAfter={addingAfter}
            isAddAfterParent={isAddAfterParent}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddBelow={onAddBelow}
            onSaveEdit={onSaveEdit}
            onSaveNew={onSaveNew}
            onCancelAdd={onCancelAdd}
            showToast={showToast}
          />
        )
      })}

      {/* Top-level add row at phase bottom */}
      {isTopLevelAdd && (
        <InlineRow
          seq="…"
          isChild={false}
          onSave={onSaveNew}
          onCancel={onCancelAdd}
        />
      )}

      {/* "+ Add top-level task" link */}
      <tr className="bg-white">
        <td colSpan={5} className="px-3 py-2">
          <button
            onClick={onAddTopLevel}
            className="text-[#ed6055] text-[11px] font-semibold hover:underline"
          >
            + Add top-level task to {phase.label}
          </button>
        </td>
      </tr>
    </>
  )
}

// -- One parent row + its children ---------------------------------------------

function ParentRows({ parent, parentSeq, children, allTasks, seqMap, editingId, addingAfter, isAddAfterParent, onEdit, onDelete, onAddBelow, onSaveEdit, onSaveNew, onCancelAdd }) {
  const [hovered, setHovered] = useState(false)

  if (editingId === parent.id) {
    return (
      <>
        <InlineRow
          initial={{ name: parent.milestone_name, duration: parent.duration ?? '', preds: parent.predecessor_text ?? '' }}
          seq={parentSeq}
          isChild={false}
          onSave={onSaveEdit}
          onCancel={() => onEdit(null)}
        />
        {children.map(child => renderChild(child, seqMap, editingId, addingAfter, allTasks, onEdit, onDelete, onAddBelow, onSaveEdit, onSaveNew, onCancelAdd))}
      </>
    )
  }

  return (
    <>
      <tr
        className="border-b border-gray-100 bg-white"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <td className="px-3 py-2 text-gray-700 text-xs">{parentSeq}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-700">{parent.milestone_name}</span>
            {hovered && (
              <button
                onClick={() => onAddBelow(parent)}
                className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[11px] font-bold leading-none flex items-center justify-center shrink-0"
                title="Add child task"
              >
                +
              </button>
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-center text-xs text-gray-700">
          {children.length > 0
            ? <span className="text-gray-400">--</span>
            : (parent.duration != null ? parent.duration : <span className="text-gray-400">--</span>)}
        </td>
        <td className="px-3 py-2 text-xs text-gray-700">
          {parent.predecessor_text ?? <span className="text-gray-400">--</span>}
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <span onClick={() => onEdit(parent.id)} className="text-gray-300 cursor-pointer mr-2 hover:text-gray-500">✎</span>
          <span onClick={() => onDelete(parent)}  className="text-red-200 cursor-pointer hover:text-red-400">✕</span>
        </td>
      </tr>

      {children.map(child => renderChild(child, seqMap, editingId, addingAfter, allTasks, onEdit, onDelete, onAddBelow, onSaveEdit, onSaveNew, onCancelAdd))}

      {/* Inline add row after last child (triggered by parent's + button) */}
      {isAddAfterParent && (
        <InlineRow
          seq="…"
          isChild={true}
          onSave={onSaveNew}
          onCancel={onCancelAdd}
        />
      )}
    </>
  )
}

function renderChild(child, seqMap, editingId, addingAfter, allTasks, onEdit, onDelete, onAddBelow, onSaveEdit, onSaveNew, onCancelAdd) {
  const childSeq = seqMap.get(child.id) ?? '--'
  const isAddAfterThis = addingAfter?.triggerId === child.id

  if (editingId === child.id) {
    return (
      <InlineRow
        key={child.id}
        initial={{ name: child.milestone_name, duration: child.duration ?? '', preds: child.predecessor_text ?? '' }}
        seq={childSeq}
        isChild={true}
        onSave={onSaveEdit}
        onCancel={() => onEdit(null)}
      />
    )
  }

  return (
    <ChildRow
      key={child.id}
      child={child}
      seq={childSeq}
      allTasks={allTasks}
      onEdit={onEdit}
      onDelete={onDelete}
      onAddBelow={onAddBelow}
      isAddAfterThis={isAddAfterThis}
      onSaveNew={onSaveNew}
      onCancelAdd={onCancelAdd}
    />
  )
}

function ChildRow({ child, seq, allTasks, onEdit, onDelete, onAddBelow, isAddAfterThis, onSaveNew, onCancelAdd }) {
  const [hovered, setHovered] = useState(false)

  return (
    <>
      <tr
        className="border-b border-gray-100 bg-white"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <td className="px-3 py-2 text-gray-700 text-xs">{seq}</td>
        <td className="py-2 pr-3" style={{ paddingLeft: 28 }}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-700">{child.milestone_name}</span>
            {hovered && (
              <button
                onClick={() => onAddBelow(child)}
                className="w-4 h-4 rounded-full bg-[#ed6055] text-white text-[11px] font-bold leading-none flex items-center justify-center shrink-0"
                title="Add sibling task below"
              >
                +
              </button>
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-center text-xs text-gray-700">
          {child.duration != null ? child.duration : <span className="text-gray-400">--</span>}
        </td>
        <td className="px-3 py-2 text-xs text-gray-700">
          {child.predecessor_text ?? <span className="text-gray-400">--</span>}
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <span onClick={() => onEdit(child.id)} className="text-gray-300 cursor-pointer mr-2 hover:text-gray-500">✎</span>
          <span onClick={() => onDelete(child)}  className="text-red-200 cursor-pointer hover:text-red-400">✕</span>
        </td>
      </tr>
      {isAddAfterThis && (
        <InlineRow
          seq="…"
          isChild={true}
          onSave={onSaveNew}
          onCancel={onCancelAdd}
        />
      )}
    </>
  )
}

// -- Main page -----------------------------------------------------------------

export default function WorkProgramTemplate() {
  const { profile, loading: profileLoading } = useProfile()
  const [tasks,   setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const loadTasks = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('work_program_template_tasks')
      .select('*')
      .order('sort_order')
    if (error) showToast(error.message, 'error')
    else setTasks(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadTasks() }, [])

  const showLoading = useMinLoading(profileLoading || loading)
  if (showLoading) return <LoadingScreen />

  const seqMap = assignSeqNumbers(tasks)

  return (
    <DashboardLayout profile={profile}>
      <div className="flex min-h-screen bg-gray-50">

        {/* Settings sidebar */}
        <aside className="w-44 shrink-0 bg-white border-r border-gray-200 p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Settings</p>
          <nav className="space-y-1 text-sm">
            <Link to="/admin/roles"            className="block px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 text-xs">Users</Link>
            <Link to="/admin/standard-permits" className="block px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 text-xs">Standard Permits</Link>
            <span className="block px-3 py-2 rounded-lg bg-red-50 text-[#ed6055] font-semibold text-xs">Work Program Template</span>
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 p-6 max-w-4xl">
          <h1 className="text-lg font-bold text-gray-900">Standard Work Program</h1>
          <p className="text-xs text-gray-500 mt-0.5 mb-4">
            Pre-loaded when creating a new baseline. Hover a row and click <span className="text-[#ed6055] font-bold">+</span> to add tasks inline.
          </p>

          <TemplateTable
            tasks={tasks}
            seqMap={seqMap}
            onReload={loadTasks}
            showToast={showToast}
          />
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm font-medium shadow-lg z-50 ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-gray-900 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </DashboardLayout>
  )
}

import { useEffect } from 'react'
import { projectMetrics } from '../lib/reportData'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate  = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const fmtDateShort = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', year: '2-digit' }) : ''
const fmtArea  = (v) => v ? `${Number(v).toLocaleString()} sqm` : '—'

const phaseLbl = { initiation: 'Initiation', planning: 'Planning', execution_monitoring: 'Execution & Monitoring', turnover: 'Turnover', completed: 'Completed', closeout: 'Close-Out' }
const buLbl    = { FPI: 'Famtech Properties Inc.', MDRI: 'Megawide Dreamrise Residences Inc.', PCI: 'Plushomes Inc.', PH1VEL: 'PH1VEL Properties Inc.', PH1: 'PH1 World Developers Inc.', PH1L: 'PH1 World Landscapes Inc.' }
const devType  = { housing: 'Housing', condominium: 'Condominium' }

const PERMIT_COLOR = { done: '#22c55e', obtained: '#22c55e', approved: '#22c55e', ongoing: '#f59e0b', filed: '#3b82f6', in_preparation: '#f59e0b', not_yet_started: '#94a3b8', not_applicable: '#cbd5e1' }
const PERMIT_LABEL = { done: 'Done', obtained: 'Obtained', approved: 'Approved', ongoing: 'Ongoing', filed: 'Filed', in_preparation: 'In Preparation', not_yet_started: 'Not Started', not_applicable: 'N/A' }
const MIL_COLOR    = { not_started: '#94a3b8', in_progress: '#3b82f6', completed: '#22c55e', delayed: '#ef4444' }
const MIL_LABEL    = { not_started: 'Not Started', in_progress: 'In Progress', completed: 'Completed', delayed: 'Delayed' }

const s = (obj) => Object.entries(obj).map(([k, v]) => `${k}:${v}`).join(';')  // inline style shorthand

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#ed6055', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, marginTop: 20, borderBottom: '1.5px solid #fecaca', paddingBottom: 5, breakAfter: 'avoid' }}>
      {children}
    </div>
  )
}

function KPICard({ label, value, sub, color = '#1e293b' }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#64748b', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {sub && <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function ProgressBar({ pct, color = '#ed6055', label }) {
  return (
    <div style={{ marginBottom: 4 }}>
      {label && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
        <span style={{ color: '#475569', fontWeight: 500 }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{pct}%</span>
      </div>}
      <div style={{ height: 7, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}

// ── S-Curve SVG Chart ─────────────────────────────────────────────────────────

function SCurveChart({ pocData }) {
  if (!pocData || pocData.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 11, border: '1px dashed #e2e8f0', borderRadius: 8 }}>No POC data available</div>
  }

  // Accumulate monthly incremental values → cumulative percentages (same logic as dashboard)
  const lastTargetIdx    = pocData.reduce((last, r, i) => r.target_pct    > 0 ? i : last, -1)
  const lastActualIdx    = pocData.reduce((last, r, i) => r.actual_pct    > 0 ? i : last, -1)
  const lastProjectedIdx = pocData.reduce((last, r, i) => (r.actual_pct > 0 || r.projected_pct > 0) ? i : last, -1)
  const lastIdx = Math.max(lastTargetIdx, lastActualIdx, lastProjectedIdx)

  let cumT = 0, cumA = 0, cumP = 0
  const data = pocData.slice(0, lastIdx + 1).map((r, i) => {
    if (r.target_pct > 0) cumT = Math.min(100, cumT + r.target_pct)
    if (r.actual_pct > 0) { cumA = Math.min(100, cumA + r.actual_pct); cumP = cumA }
    else if (r.projected_pct > 0) cumP = Math.min(100, cumP + r.projected_pct)
    return {
      label:     fmtDateShort(r.period_date),
      target:    (r.target_pct    > 0 && i <= lastTargetIdx)    ? cumT : null,
      actual:    (r.actual_pct    > 0 && i <= lastActualIdx)    ? cumA : null,
      projected: ((r.actual_pct > 0 || (r.projected_pct > 0 && !r.actual_pct)) && i <= lastProjectedIdx) ? cumP : null,
    }
  })

  if (data.length < 2) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 11, border: '1px dashed #e2e8f0', borderRadius: 8 }}>No POC data available</div>
  }

  const W = 720, H = 230
  const PAD = { top: 16, right: 20, bottom: 40, left: 46 }
  const CW = W - PAD.left - PAD.right
  const CH = H - PAD.top - PAD.bottom

  const xScale = (i) => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * CW : CW / 2)
  const yScale = (pct) => PAD.top + CH - (pct / 100) * CH

  const makePath = (key) => {
    const pts = data.map((d, i) => d[key] != null ? [xScale(i), yScale(d[key])] : null).filter(Boolean)
    if (pts.length < 2) return null
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  }

  // Area fill under Planned line
  const tPts = data.map((d, i) => d.target != null ? [xScale(i), yScale(d.target)] : null).filter(Boolean)
  const areaPath = tPts.length >= 2
    ? `${tPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} L${tPts.at(-1)[0].toFixed(1)},${yScale(0).toFixed(1)} L${tPts[0][0].toFixed(1)},${yScale(0).toFixed(1)} Z`
    : null

  const actualDots = data.map((d, i) => d.actual != null ? [xScale(i), yScale(d.actual)] : null).filter(Boolean)
  const gridYs = [0, 25, 50, 75, 100]
  const labelStep = Math.max(1, Math.ceil(data.length / 10))
  const latestActual = [...data].reverse().find(d => d.actual != null)

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, marginBottom: 8, fontSize: 9.5, color: '#64748b', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="24" height="10">
            <rect x="0" y="2" width="24" height="6" fill="#9ca3af" fillOpacity="0.2" rx="1"/>
            <line x1="0" y1="5" x2="24" y2="5" stroke="#9ca3af" strokeWidth="2" />
          </svg>
          Planned
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="24" height="10">
            <line x1="0" y1="5" x2="8" y2="5" stroke="#86efac" strokeWidth="2.5" />
            <circle cx="12" cy="5" r="3" fill="#86efac" />
            <line x1="16" y1="5" x2="24" y2="5" stroke="#86efac" strokeWidth="2.5" />
          </svg>
          Actual
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="24" height="10">
            <line x1="0" y1="5" x2="24" y2="5" stroke="#fde047" strokeWidth="2" strokeDasharray="5,3" />
          </svg>
          Projected
        </span>
        {latestActual && (
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#64748b' }}>
            Latest: {latestActual.actual?.toFixed(2)}%
          </span>
        )}
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Area fill under Planned */}
        {areaPath && <path d={areaPath} fill="#9ca3af" fillOpacity="0.12" />}
        {/* Grid lines */}
        {gridYs.map(pct => (
          <g key={pct}>
            <line x1={PAD.left} y1={yScale(pct)} x2={W - PAD.right} y2={yScale(pct)} stroke={pct === 0 ? '#cbd5e1' : '#f1f5f9'} strokeWidth={pct === 0 ? 1 : 0.8} />
            <text x={PAD.left - 6} y={yScale(pct) + 3.5} textAnchor="end" fontSize="9" fill="#94a3b8">{pct}%</text>
          </g>
        ))}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CH} stroke="#e2e8f0" strokeWidth="0.8" />
        {/* Lines — draw Projected under Actual under Planned */}
        {makePath('projected') && <path d={makePath('projected')} fill="none" stroke="#fde047" strokeWidth="2"   strokeDasharray="5,3" />}
        {makePath('actual')    && <path d={makePath('actual')}    fill="none" stroke="#86efac" strokeWidth="2.5" />}
        {makePath('target')    && <path d={makePath('target')}    fill="none" stroke="#9ca3af" strokeWidth="2" />}
        {/* Dots on Actual */}
        {actualDots.map(([x, y], i) => <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3" fill="#86efac" />)}
        {/* X-axis labels */}
        {data.map((d, i) => i % labelStep === 0 && (
          <text key={i} x={xScale(i)} y={H - 6} textAnchor="middle" fontSize="8.5" fill="#94a3b8">{d.label}</text>
        ))}
      </svg>

      {/* Data table — same series as chart */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8.5, marginTop: 4, tableLayout: 'auto' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
            <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b7280', fontWeight: 700, whiteSpace: 'nowrap', minWidth: 64 }}>Series</th>
            {data.map((d, i) => i % labelStep === 0 && (
              <th key={i} style={{ textAlign: 'center', padding: '4px 3px', color: '#9ca3af', fontWeight: 500, whiteSpace: 'nowrap', fontSize: 8 }}>{d.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { label: 'Planned',   key: 'target',    color: '#9ca3af' },
            { label: 'Actual',    key: 'actual',    color: '#86efac' },
            { label: 'Projected', key: 'projected', color: '#fde047' },
          ].map(({ label, key, color }) => (
            <tr key={key} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: '#4b5563' }}>{label}</span>
                </div>
              </td>
              {data.map((d, i) => i % labelStep === 0 && (
                <td key={i} style={{ textAlign: 'center', padding: '4px 3px', color: '#374151', tabularNums: true }}>
                  {d[key] != null ? `${d[key].toFixed(2)}%` : <span style={{ color: '#d1d5db' }}>—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── 1. Project Info ───────────────────────────────────────────────────────────

function ProjectInfoSection({ project }) {
  const infoRows = [
    ['Business Unit',     buLbl[project.business_unit] ?? project.business_unit ?? '—'],
    ['Development Type',  devType[project.development_type] ?? project.development_type ?? '—'],
    ['Phase',             phaseLbl[project.phase] ?? project.phase ?? '—'],
    ['Province',          project.province ?? '—'],
    ['City / Municipality', project.city ?? '—'],
    ['Lot Area',          fmtArea(project.lot_area)],
    ['Developable Area',  fmtArea(project.developable_area)],
    ['No. of Floors',     project.num_floors ?? '—'],
    ['No. of Units',      project.num_units ?? '—'],
    ['Is 4PH Project',    project.is_4ph_project ? 'Yes' : 'No'],
  ].filter(([, v]) => v && v !== '—')

  return (
    <div style={{ breakInside: 'avoid' }}>
      <SectionTitle>Project Info</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
        {infoRows.map(([label, val]) => (
          <div key={label} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #f8fafc' }}>
            <span style={{ fontSize: 10.5, color: '#64748b', width: 130, flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: 10.5, color: '#1e293b', fontWeight: 500 }}>{val}</span>
          </div>
        ))}
      </div>
      {project.project_brief && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 10.5, color: '#475569', lineHeight: 1.5 }}>
          {project.project_brief}
        </div>
      )}
    </div>
  )
}

// ── 2. M4 / M5 Dashboard ─────────────────────────────────────────────────────

function M4M5Section({ project, data }) {
  const { floors, completions, buildings } = data
  const m = projectMetrics(project.id, data)

  const projBuildings = buildings.filter(b => b.project_id === project.id)
  const projFloors    = floors.filter(f => f.project_id === project.id)
  const projUnits     = completions.filter(c => c.project_id === project.id)

  // Per-building stats
  const buildingRows = projBuildings.length > 0
    ? projBuildings.map(b => {
        const bFloors   = projFloors.filter(f => f.building_id === b.id)
        const bFloorIds = new Set(bFloors.map(f => f.id))
        const bUnits    = projUnits.filter(u => bFloorIds.has(u.floor_id))
        const total     = bFloors.reduce((s, f) => s + (f.num_units ?? 0), 0) || bUnits.length
        const today     = new Date().toLocaleDateString('en-CA')
        const m4c       = bUnits.filter(u => u.m4_date && u.m4_date <= today).length
        const m5c       = bUnits.filter(u => u.m5_date && u.m5_date <= today).length
        return { name: b.name, total, m4: m4c, m5: m5c, m4Pct: total ? Math.round(m4c/total*100) : 0, m5Pct: total ? Math.round(m5c/total*100) : 0 }
      })
    : null

  return (
    <div style={{ breakInside: 'avoid' }}>
      <SectionTitle>M4 / M5 Completion Dashboard</SectionTitle>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <KPICard label="M4 Completion"  value={`${m.m4Pct}%`}  sub={`${m.m4Units} / ${m.totalUnits} units`} color="#ed6055" />
        <KPICard label="M5 Completion"  value={`${m.m5Pct}%`}  sub={`${m.m5Units} / ${m.totalUnits} units`} color="#ed6055" />
        <KPICard label="Permit Compliance" value={m.permitPct !== null ? `${m.permitPct}%` : '—'} sub={`${m.donePermits} / ${m.leafPermits} permits`} color="#1e293b" />
        <KPICard label="Open Issues"   value={m.openIssues} sub="requires action" color={m.openIssues > 0 ? '#ef4444' : '#22c55e'} />
      </div>

      {/* Per-building breakdown */}
      {buildingRows && buildingRows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ textAlign: 'left',   padding: '6px 10px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', width: 140 }}>Building</th>
              <th style={{ textAlign: 'center', padding: '6px 10px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', width: 60 }}>Total</th>
              <th style={{ textAlign: 'left',   padding: '6px 10px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>M4 Progress</th>
              <th style={{ textAlign: 'left',   padding: '6px 10px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>M5 Progress</th>
            </tr>
          </thead>
          <tbody>
            {buildingRows.map((b, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', color: '#334155', fontWeight: 500 }}>{b.name}</td>
                <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b' }}>{b.total}</td>
                <td style={{ padding: '8px 10px' }}>
                  <ProgressBar pct={b.m4Pct} color="#ed6055" />
                  <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{b.m4} / {b.total} units</div>
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <ProgressBar pct={b.m5Pct} color="#f97316" />
                  <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{b.m5} / {b.total} units</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── 3. S-Curve ────────────────────────────────────────────────────────────────

function SCurveSection({ project, data }) {
  const pocData = data.poc.filter(d => d.project_id === project.id)
  return (
    <div style={{ breakInside: 'avoid' }}>
      <SectionTitle>S-Curve (Percentage of Completion)</SectionTitle>
      <SCurveChart pocData={pocData} />
    </div>
  )
}

// ── 4. Permits ────────────────────────────────────────────────────────────────

function PermitSection({ project, data }) {
  const { permits } = data
  const projPermits  = permits.filter(p => p.project_id === project.id)
  const rootPermits  = projPermits.filter(p => !p.parent_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  if (rootPermits.length === 0) return null

  const childrenOf = (parentId) => projPermits.filter(p => p.parent_id === parentId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const derivedStatus = (permit) => {
    const kids = childrenOf(permit.id)
    if (kids.length === 0) return permit.status
    if (kids.every(k => ['done', 'obtained', 'approved'].includes(k.status))) return 'done'
    if (kids.some(k => k.status === 'ongoing' || k.status === 'filed' || k.status === 'in_preparation')) return 'ongoing'
    return 'not_yet_started'
  }

  const StatusBadge = ({ status }) => (
    <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: (PERMIT_COLOR[status] ?? '#94a3b8') + '22', color: PERMIT_COLOR[status] ?? '#94a3b8', flexShrink: 0 }}>
      {PERMIT_LABEL[status] ?? status}
    </span>
  )

  return (
    <div>
      <SectionTitle>Permit / Compliance Dashboard</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        {rootPermits.map(root => {
          const kids   = childrenOf(root.id)
          const dStat  = derivedStatus(root)
          return (
            <div key={root.id} style={{ marginBottom: 8 }}>
              {/* Root permit row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: PERMIT_COLOR[dStat] ?? '#94a3b8', flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: 10.5, color: '#1e293b', fontWeight: 600, flex: 1 }}>{root.permit_name}</span>
                {kids.length === 0 && <StatusBadge status={root.status} />}
                {kids.length > 0 && <span style={{ fontSize: 9, color: '#94a3b8' }}>{kids.filter(k => ['done','obtained','approved'].includes(k.status)).length}/{kids.length}</span>}
              </div>
              {/* Children */}
              {kids.map(child => (
                <div key={child.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0 3px 18px', borderBottom: '1px solid #fafafa' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: PERMIT_COLOR[child.status] ?? '#94a3b8', flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontSize: 10, color: '#475569', flex: 1 }}>{child.permit_name}</span>
                  <StatusBadge status={child.status} />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 5. Issues & Concerns ──────────────────────────────────────────────────────

function IssuesSection({ project, data }) {
  const projIssues = data.issues.filter(i => i.project_id === project.id)
  const open       = projIssues.filter(i => i.status === 'open')
  const closed     = projIssues.filter(i => i.status !== 'open')

  if (projIssues.length === 0) return null

  const IssueTable = ({ rows, title, accent }) => (
    <div style={{ marginBottom: 12 }}>
      {title && <div style={{ fontSize: 10, fontWeight: 600, color: accent, marginBottom: 6 }}>{title} ({rows.length})</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={{ textAlign: 'left', padding: '5px 8px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>Details</th>
            <th style={{ textAlign: 'center', padding: '5px 8px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', width: 80 }}>Group</th>
            <th style={{ textAlign: 'center', padding: '5px 8px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', width: 100 }}>Mgt Level</th>
            <th style={{ textAlign: 'center', padding: '5px 8px', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', width: 90 }}>Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(iss => (
            <tr key={iss.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '5px 8px', color: '#334155' }}>{iss.details}</td>
              <td style={{ padding: '5px 8px', textAlign: 'center', color: '#64748b' }}>{iss.issue_group}</td>
              <td style={{ padding: '5px 8px', textAlign: 'center', color: '#64748b' }}>{iss.management_level}</td>
              <td style={{ padding: '5px 8px', textAlign: 'center', color: '#94a3b8' }}>{fmtDate(iss.date_presented)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div>
      <SectionTitle>Issues & Concerns</SectionTitle>
      {open.length > 0    && <IssueTable rows={open}   title="Open"   accent="#ef4444" />}
      {closed.length > 0  && <IssueTable rows={closed} title="Closed / On Hold" accent="#64748b" />}
    </div>
  )
}

// ── 6. Photos ─────────────────────────────────────────────────────────────────

function PhotosSection({ project, data }) {
  const projPhotos = data.photos
    .filter(p => p.project_id === project.id)
    .slice(0, 12)

  if (projPhotos.length === 0) return null

  const fmtPhotoDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : ''

  return (
    <div>
      <SectionTitle>Project Photos</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {projPhotos.map(photo => (
          <div key={photo.id} style={{ breakInside: 'avoid' }}>
            <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0', aspectRatio: '4/3', background: '#f1f5f9' }}>
              <img
                src={photo.url}
                alt={photo.file_name}
                loading="eager"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
            <div style={{ marginTop: 4 }}>
              {photo.photo_date && <div style={{ fontSize: 9.5, color: '#64748b' }}>{fmtPhotoDate(photo.photo_date)}</div>}
              {photo.caption    && <div style={{ fontSize: 9.5, color: '#475569', marginTop: 1 }}>{photo.caption}</div>}
              {photo.tags?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                  {photo.tags.map(t => (
                    <span key={t} style={{ fontSize: 8.5, background: '#f1f5f9', color: '#64748b', borderRadius: 4, padding: '1px 5px' }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Per-project page ──────────────────────────────────────────────────────────

function ProjectPage({ project, data, isFirst }) {
  const phase = phaseLbl[project.phase] ?? project.phase

  return (
    <div className="report-page" style={{ background: 'white', width: '100%', padding: '32px 40px', boxSizing: 'border-box', breakBefore: isFirst ? 'auto' : 'page' }}>
      {/* Project header strip */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 14, borderBottom: '2px solid #1e293b' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', lineHeight: 1.1 }}>{project.name}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
            {[project.project_code, buLbl[project.business_unit] ?? project.business_unit].filter(Boolean).join(' · ')}
          </div>
          <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
            {[devType[project.development_type] ?? project.development_type, project.city, project.province].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {phase && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 12, background: '#ed6055', color: 'white', display: 'inline-block' }}>{phase}</span>
          )}
          {project.is_4ph_project && (
            <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#f1f5f9', color: '#475569', display: 'inline-block' }}>4PH Project</span>
          )}
        </div>
      </div>

      <ProjectInfoSection project={project} />
      <M4M5Section       project={project} data={data} />
      <SCurveSection     project={project} data={data} />
      <PermitSection     project={project} data={data} />
      <IssuesSection     project={project} data={data} />
      <PhotosSection     project={project} data={data} />
    </div>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

export default function ManagementReportView({ data, onClose }) {
  const { projects } = data
  const generated = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })

  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'mgmt-report-print-styles'
    style.textContent = `
      @media print {
        body > *:not(#mgmt-report-print-root) { display: none !important; }
        #mgmt-report-print-root { position: static !important; overflow: visible !important; background: white !important; }
        #mgmt-report-toolbar   { display: none !important; }
        #mgmt-report-scroll    { overflow: visible !important; background: white !important; padding: 0 !important; }
        .report-page           { box-shadow: none !important; margin: 0 !important; max-width: none !important; border-radius: 0 !important; }
        @page { margin: 0.5in; size: A4 portrait; }
      }
    `
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  return (
    <div id="mgmt-report-print-root" className="fixed inset-0 z-[200] flex flex-col">
      {/* Toolbar */}
      <div id="mgmt-report-toolbar" className="flex-shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-6 py-3 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-gray-900">Management Report Preview</h2>
          <p className="text-xs text-gray-500 mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''} · {generated}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#ed6055] hover:bg-[#d94f45] text-white text-sm font-semibold transition">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print / Save PDF
          </button>
          <button onClick={onClose} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-sm font-semibold transition">
            Close
          </button>
        </div>
      </div>

      {/* Scrollable preview */}
      <div id="mgmt-report-scroll" className="flex-1 overflow-auto bg-gray-100 p-6">
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          {/* Report title card */}
          <div style={{ background: 'white', borderRadius: 12, padding: '20px 36px', marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>DandC Dashboard</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Management Report · {generated}</div>
            </div>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: '#ed6055', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
          </div>

          {projects.map((proj, i) => (
            <div key={proj.id} style={{ marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'hidden' }}>
              <ProjectPage project={proj} data={data} isFirst={i === 0} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

import { downloadWorkbook } from './excelUtils'
import { projectMetrics } from './reportData'

const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : ''
const phaseLbl = { initiation: 'Initiation', planning: 'Planning', execution_monitoring: 'Execution & Monitoring', turnover: 'Turnover', completed: 'Completed' }
const permitLbl = { obtained: 'Obtained', approved: 'Approved', filed: 'Filed', in_preparation: 'In Preparation', not_yet_started: 'Not Yet Started', not_applicable: 'N/A' }
const issueLbl  = { open: 'Open', close: 'Closed', hold: 'On Hold' }
const milestoneLbl = { not_started: 'Not Started', in_progress: 'In Progress', completed: 'Completed', delayed: 'Delayed' }

export async function generateMgmtExcel(data) {
  const { projects, issues } = data
  const filename = `DandC-Management-Report-${new Date().toISOString().slice(0, 10)}.xlsx`

  const summaryRows = projects.map(p => {
    const m = projectMetrics(p.id, data)
    return {
      project_name:     p.name ?? '',
      project_code:     p.project_code ?? '',
      business_unit:    p.business_unit ?? '',
      development_type: p.development_type ?? '',
      phase:            phaseLbl[p.phase] ?? p.phase ?? '',
      province:         p.province ?? '',
      city:             p.city ?? '',
      total_units:      m.totalUnits,
      m4_pct:           m.m4Pct,
      m5_pct:           m.m5Pct,
      permit_pct:       m.permitPct ?? '',
      open_issues:      m.openIssues,
    }
  })

  const issueRows = issues
    .filter(i => i.status === 'open')
    .map(i => {
      const proj = projects.find(p => p.id === i.project_id)
      return {
        project_name:    proj?.name ?? '',
        issue_group:     i.issue_group ?? '',
        management_level: i.management_level ?? '',
        date_presented:  fmtDate(i.date_presented),
        details:         i.details ?? '',
        action_steps:    i.action_steps ?? '',
      }
    })

  await downloadWorkbook([
    {
      sheetName: 'Projects Summary',
      rows: summaryRows,
      columns: [
        { header: 'Project Name',          key: 'project_name' },
        { header: 'Code',                  key: 'project_code' },
        { header: 'Business Unit',         key: 'business_unit' },
        { header: 'Type',                  key: 'development_type' },
        { header: 'Phase',                 key: 'phase' },
        { header: 'Province',              key: 'province' },
        { header: 'City',                  key: 'city' },
        { header: 'Total Units',           key: 'total_units' },
        { header: 'M4 %',                  key: 'm4_pct' },
        { header: 'M5 %',                  key: 'm5_pct' },
        { header: 'Permit Compliance %',   key: 'permit_pct' },
        { header: 'Open Issues',           key: 'open_issues' },
      ],
    },
    {
      sheetName: 'Open Issues',
      rows: issueRows,
      columns: [
        { header: 'Project Name',    key: 'project_name' },
        { header: 'Group',           key: 'issue_group' },
        { header: 'Mgt Level',       key: 'management_level' },
        { header: 'Date Presented',  key: 'date_presented' },
        { header: 'Details',         key: 'details' },
        { header: 'Action Steps',    key: 'action_steps' },
      ],
    },
  ], filename)
}

export async function generateOpsReport(data, scopeLabel) {
  const { projects, issues, milestones, permits, floors, completions } = data

  const filename = `DandC-Ops-Report-${new Date().toISOString().slice(0, 10)}.xlsx`

  // -- Sheet 1: Projects Summary ----------------------------------------------
  const summaryRows = projects.map(p => {
    const m = projectMetrics(p.id, data)
    return {
      project_name:     p.name ?? '',
      project_code:     p.project_code ?? '',
      business_unit:    p.business_unit ?? '',
      development_type: p.development_type ?? '',
      phase:            phaseLbl[p.phase] ?? p.phase ?? '',
      province:         p.province ?? '',
      city:             p.city ?? '',
      total_units:      m.totalUnits,
      m4_units:         m.m4Units,
      m4_pct:           m.m4Pct,
      m5_units:         m.m5Units,
      m5_pct:           m.m5Pct,
      permits_done:     m.donePermits,
      permits_total:    m.leafPermits,
      permit_pct:       m.permitPct ?? '',
      open_issues:      m.openIssues,
    }
  })

  // -- Sheet 2: Issues & Concerns ---------------------------------------------
  const issueRows = issues.map(i => {
    const proj = projects.find(p => p.id === i.project_id)
    return {
      project_name:      proj?.name ?? '',
      project_code:      proj?.project_code ?? '',
      status:            issueLbl[i.status] ?? i.status ?? '',
      issue_group:       i.issue_group ?? '',
      management_level:  i.management_level ?? '',
      date_presented:    fmtDate(i.date_presented),
      details:           i.details ?? '',
      caused_by:         i.caused_by ?? '',
      action_steps:      i.action_steps ?? '',
    }
  })

  // -- Sheet 3: Milestones ----------------------------------------------------
  const milestoneRows = milestones.map(m => {
    const proj = projects.find(p => p.id === m.project_id)
    return {
      project_name:    proj?.name ?? '',
      project_code:    proj?.project_code ?? '',
      milestone_name:  m.milestone_name ?? '',
      target_date:     fmtDate(m.target_date),
      actual_date:     fmtDate(m.actual_date),
      status:          milestoneLbl[m.status] ?? m.status ?? '',
    }
  })

  // -- Sheet 4: Permits / Compliance ------------------------------------------
  const permitRows = permits.map(p => {
    const proj  = projects.find(pr => pr.id === p.project_id)
    const isL1  = !p.parent_id
    const parent = !isL1 ? permits.find(pp => pp.id === p.parent_id) : null
    return {
      project_name: proj?.name ?? '',
      project_code: proj?.project_code ?? '',
      level:        isL1 ? 'Main' : 'Sub',
      parent_name:  parent?.permit_name ?? '',
      permit_name:  p.permit_name ?? '',
      status:       permitLbl[p.status] ?? p.status ?? '',
      remarks:      p.remarks ?? '',
    }
  })

  // -- Sheet 5: M4/M5 Completion (floor-level) --------------------------------
  const completionRows = (() => {
    const rows = []
    for (const proj of projects) {
      const projFloors = floors.filter(f => f.project_id === proj.id)
      const projUnits  = completions.filter(c => c.project_id === proj.id)
      for (const floor of projFloors) {
        const flUnits = projUnits.filter(u => u.floor_id === floor.id)
        const total   = floor.num_units || flUnits.length || 0
        const today   = new Date().toLocaleDateString('en-CA')
        const m4      = flUnits.filter(u => u.m4_date && u.m4_date <= today).length
        const m5      = flUnits.filter(u => u.m5_date && u.m5_date <= today).length
        rows.push({
          project_name: proj.name ?? '',
          project_code: proj.project_code ?? '',
          floor_label:  floor.physical_level ?? '',
          total_units:  total,
          m4_units:     m4,
          m4_pct:       total ? Math.round((m4 / total) * 100) : 0,
          m5_units:     m5,
          m5_pct:       total ? Math.round((m5 / total) * 100) : 0,
          m4_target_date: fmtDate(floor.m4_date),
          m5_target_date: fmtDate(floor.m5_date),
        })
      }
    }
    return rows
  })()

  await downloadWorkbook([
    {
      sheetName: 'Projects Summary',
      rows: summaryRows,
      columns: [
        { header: 'Project Name',      key: 'project_name' },
        { header: 'Code',              key: 'project_code' },
        { header: 'Business Unit',     key: 'business_unit' },
        { header: 'Type',              key: 'development_type' },
        { header: 'Phase',             key: 'phase' },
        { header: 'Province',          key: 'province' },
        { header: 'City',              key: 'city' },
        { header: 'Total Units',       key: 'total_units' },
        { header: 'M4 Units',          key: 'm4_units' },
        { header: 'M4 %',              key: 'm4_pct' },
        { header: 'M5 Units',          key: 'm5_units' },
        { header: 'M5 %',              key: 'm5_pct' },
        { header: 'Permits Done',      key: 'permits_done' },
        { header: 'Permits Total',     key: 'permits_total' },
        { header: 'Permit Compliance %', key: 'permit_pct' },
        { header: 'Open Issues',       key: 'open_issues' },
      ],
    },
    {
      sheetName: 'Issues & Concerns',
      rows: issueRows,
      columns: [
        { header: 'Project Name',     key: 'project_name' },
        { header: 'Code',             key: 'project_code' },
        { header: 'Status',           key: 'status' },
        { header: 'Group',            key: 'issue_group' },
        { header: 'Mgt Level',        key: 'management_level' },
        { header: 'Date Presented',   key: 'date_presented' },
        { header: 'Details',          key: 'details' },
        { header: 'Caused By',        key: 'caused_by' },
        { header: 'Action Steps',     key: 'action_steps' },
      ],
    },
    {
      sheetName: 'Milestones',
      rows: milestoneRows,
      columns: [
        { header: 'Project Name',   key: 'project_name' },
        { header: 'Code',           key: 'project_code' },
        { header: 'Milestone',      key: 'milestone_name' },
        { header: 'Target Date',    key: 'target_date' },
        { header: 'Actual Date',    key: 'actual_date' },
        { header: 'Status',         key: 'status' },
      ],
    },
    {
      sheetName: 'Permits',
      rows: permitRows,
      columns: [
        { header: 'Project Name', key: 'project_name' },
        { header: 'Code',         key: 'project_code' },
        { header: 'Level',        key: 'level' },
        { header: 'Parent',       key: 'parent_name' },
        { header: 'Permit Name',  key: 'permit_name' },
        { header: 'Status',       key: 'status' },
        { header: 'Remarks',      key: 'remarks' },
      ],
    },
    {
      sheetName: 'M4-M5 Completion',
      rows: completionRows,
      columns: [
        { header: 'Project Name',    key: 'project_name' },
        { header: 'Code',            key: 'project_code' },
        { header: 'Floor',           key: 'floor_label' },
        { header: 'Total Units',     key: 'total_units' },
        { header: 'M4 Units',        key: 'm4_units' },
        { header: 'M4 %',            key: 'm4_pct' },
        { header: 'M5 Units',        key: 'm5_units' },
        { header: 'M5 %',            key: 'm5_pct' },
        { header: 'M4 Target Date',  key: 'm4_target_date' },
        { header: 'M5 Target Date',  key: 'm5_target_date' },
      ],
    },
  ], filename)
}

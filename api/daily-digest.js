import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const authHeader = req.headers['authorization']
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'teams_gc_webhook_url')
    .single()

  const webhookUrl = setting?.value
  if (!webhookUrl) return res.status(200).json({ skipped: 'No GC webhook configured' })

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const in30DaysStr = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { data: projects },
    { data: permits },
    { data: issues },
    { data: requirements },
  ] = await Promise.all([
    supabase.from('projects').select('id, name').order('name'),
    supabase.from('permits').select('id, project_id, name, status, planned_finish, actual_finish'),
    supabase.from('permit_issues').select('id, permit_id, status'),
    supabase.from('permit_requirements').select('id, permit_id, is_complete'),
  ])

  const allPermits     = permits      || []
  const allIssues      = issues       || []
  const allRequirements = requirements || []
  const allProjects    = projects     || []

  // Active = project has at least one pending permit
  const pendingPermits    = allPermits.filter(p => p.status !== 'acquired' && !p.actual_finish)
  const activeProjectIds  = new Set(pendingPermits.map(p => p.project_id))
  const activeProjects    = allProjects.filter(p => activeProjectIds.has(p.id))
  const projectMap        = Object.fromEntries(allProjects.map(p => [p.id, p.name]))
  const permitProjectMap  = Object.fromEntries(allPermits.map(p => [p.id, p.project_id]))

  const activePermits  = allPermits.filter(p => activeProjectIds.has(p.project_id))
  const totalPermits   = activePermits.length
  const acquired       = activePermits.filter(p => p.status === 'acquired' || p.actual_finish).length
  const pending        = totalPermits - acquired

  const expiringSoon = pendingPermits
    .filter(p => activeProjectIds.has(p.project_id) && p.planned_finish >= todayStr && p.planned_finish <= in30DaysStr)
    .sort((a, b) => a.planned_finish.localeCompare(b.planned_finish))

  const acquiredToday = activePermits.filter(p => p.actual_finish?.startsWith(todayStr))

  const openIssues = allIssues.filter(i => i.status === 'open' && activeProjectIds.has(permitProjectMap[i.permit_id]))

  const issuesByProject = {}
  for (const issue of openIssues) {
    const pid = permitProjectMap[issue.permit_id]
    if (pid) issuesByProject[pid] = (issuesByProject[pid] || 0) + 1
  }

  const reqDone  = {}
  const reqTotal = {}
  for (const req of allRequirements) {
    const pid = permitProjectMap[req.permit_id]
    if (pid && activeProjectIds.has(pid)) {
      reqTotal[pid] = (reqTotal[pid] || 0) + 1
      if (req.is_complete) reqDone[pid] = (reqDone[pid] || 0) + 1
    }
  }

  const dateStr = now.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
  })

  const NL = '\r\n'

  let msg = `📋 **Permits Daily Update — ${dateStr}**${NL}${NL}`

  msg += `**Overview (Active Projects: ${activeProjects.length})**${NL}`
  msg += ` Total Permits: ${totalPermits}${NL}`
  msg += ` ✅ Acquired: ${acquired}${totalPermits > 0 ? ` (${Math.round(acquired / totalPermits * 100)}%)` : ''}${NL}`
  msg += ` ⏳ Pending: ${pending}${NL}`
  msg += ` ⚠️ Expiring in 30 days: ${expiringSoon.length}${NL}`
  msg += ` 🔴 Open Issues: ${openIssues.length}${NL}`

  if (expiringSoon.length > 0) {
    msg += `${NL}**Expiring Soon**${NL}`
    for (const p of expiringSoon) {
      const daysLeft = Math.ceil((new Date(p.planned_finish) - now) / (1000 * 60 * 60 * 24))
      msg += ` ⚠️ ${p.name} — ${projectMap[p.project_id] || '—'} (${daysLeft} day${daysLeft !== 1 ? 's' : ''})${NL}`
    }
  }

  if (acquiredToday.length > 0) {
    msg += `${NL}**Acquired Today**${NL}`
    for (const p of acquiredToday) {
      msg += ` ✅ ${p.name} — ${projectMap[p.project_id] || '—'}${NL}`
    }
  }

  if (Object.keys(issuesByProject).length > 0) {
    msg += `${NL}**Open Issues by Project**${NL}`
    for (const [pid, count] of Object.entries(issuesByProject).sort((a, b) => b[1] - a[1])) {
      msg += ` 🔴 ${projectMap[pid] || '—'} — ${count} issue${count !== 1 ? 's' : ''}${NL}`
    }
  }

  if (Object.keys(reqTotal).length > 0) {
    msg += `${NL}**Requirements Completion**${NL}`
    for (const pid of Object.keys(reqTotal)) {
      const done  = reqDone[pid] || 0
      const total = reqTotal[pid]
      const pct   = Math.round(done / total * 100)
      msg += ` 📊 ${projectMap[pid] || '—'}: ${done}/${total} (${pct}%)${pct === 100 ? ' ✅' : ''}${NL}`
    }
  }

  const teamsRes = await fetch(webhookUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text: msg }),
  })

  return res.status(200).json({ ok: teamsRes.ok, activeProjects: activeProjects.length })
}

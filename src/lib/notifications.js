// ── Email via Resend ──────────────────────────────────────────────────────────

export async function sendIssueNotification(issue, permit, assignedUser) {
  const apiKey = import.meta.env.VITE_RESEND_API_KEY
  if (!apiKey || !assignedUser?.email) return { ok: false, error: 'Missing API key or recipient email' }

  const body = {
    from: 'DandC Dashboard <noreply@dandcdashboard.com>',
    to:   [assignedUser.email],
    subject: `Issue raised on permit ${permit.id} — ${permit.name}`,
    html: `
      <p>Hi ${assignedUser.full_name ?? assignedUser.email},</p>
      <p>A new issue has been raised on permit <strong>${permit.id} — ${permit.name}</strong>.</p>
      <p><strong>Issue:</strong> ${issue.issue}</p>
      ${issue.description ? `<p><strong>Details:</strong> ${issue.description}</p>` : ''}
      <p>Please log in to the dashboard to review and resolve.</p>
    `,
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })
    return res.ok ? { ok: true } : { ok: false, error: await res.text() }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// ── MS Teams via Power Automate ───────────────────────────────────────────────

async function postToTeams(webhookUrl, payload) {
  if (!webhookUrl) return { ok: false, error: 'No Teams webhook URL configured' }
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.ok ? { ok: true } : { ok: false, error: await res.text() }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export function sendTeamsNotification(payload, webhookUrl) {
  return postToTeams(webhookUrl, payload)
}

export function sendTeamsIssueNotification(issue, permit, assignedUser, webhookUrl) {
  return postToTeams(webhookUrl, {
    event:         'issue_raised',
    title:         '⚠ Issue Raised',
    text:          issue.description ? `${issue.issue} — ${issue.description}` : issue.issue,
    projectName:   permit.projects?.name ?? '—',
    permitId:      permit.id,
    permitName:    permit.name,
    assignedTo:    assignedUser?.full_name ?? '—',
    assignedEmail: assignedUser?.email ?? '',
  })
}

export function sendTeamsPermitAcquired(permit, acquiredBy, acquiredByEmail, webhookUrl) {
  return postToTeams(webhookUrl, {
    event:         'permit_acquired',
    title:         '✅ Permit Acquired',
    text:          permit.name,
    projectName:   permit.projects?.name ?? '—',
    permitId:      permit.id,
    permitName:    permit.name,
    assignedTo:    acquiredBy ?? '—',
    assignedEmail: acquiredByEmail ?? '',
  })
}

export function sendTeamsTestNotification(webhookUrl) {
  return postToTeams(webhookUrl, {
    event:      'test',
    title:      '✅ DandC Dashboard — Teams Integration',
    text:       'Webhook configured correctly. Notifications will appear here.',
    permitId:   '—',
    permitName: '—',
    assignedTo: '—',
  })
}

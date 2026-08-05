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

// ── MS Teams Adaptive Cards ───────────────────────────────────────────────────

function adaptiveCard(body, actions = []) {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body,
        ...(actions.length ? { actions } : {}),
      },
    }],
  }
}

function factSet(facts) {
  return { type: 'FactSet', facts: facts.map(([title, value]) => ({ title, value: value ?? '—' })) }
}

async function postToTeams(webhookUrl, card) {
  if (!webhookUrl) return { ok: false, error: 'No Teams webhook URL configured' }
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    })
    return res.ok ? { ok: true } : { ok: false, error: await res.text() }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export function sendTeamsNotification(payload, webhookUrl) {
  const card = adaptiveCard([
    {
      type: 'TextBlock',
      text: payload.title,
      weight: 'Bolder',
      size: 'Medium',
      color: 'Attention',
      wrap: true,
    },
    {
      type: 'TextBlock',
      text: payload.text,
      wrap: true,
      spacing: 'Small',
    },
    factSet([
      ['Permit ID',   payload.permitId],
      ['Permit',      payload.permitName],
    ]),
  ])
  return postToTeams(webhookUrl, card)
}

export function sendTeamsIssueNotification(issue, permit, assignedUser, webhookUrl) {
  const card = adaptiveCard([
    {
      type: 'Container',
      style: 'attention',
      items: [{
        type: 'TextBlock',
        text: '⚠ Issue Raised',
        weight: 'Bolder',
        size: 'Medium',
        color: 'Attention',
      }],
    },
    {
      type: 'TextBlock',
      text: issue.issue,
      weight: 'Bolder',
      wrap: true,
      spacing: 'Medium',
    },
    ...(issue.description ? [{
      type: 'TextBlock',
      text: issue.description,
      wrap: true,
      isSubtle: true,
      spacing: 'Small',
    }] : []),
    factSet([
      ['Permit ID',    permit.id],
      ['Permit',       permit.name],
      ['Assigned to',  assignedUser?.full_name ?? '—'],
    ]),
  ])
  return postToTeams(webhookUrl, card)
}

export function sendTeamsPermitAcquired(permit, acquiredBy, webhookUrl) {
  const card = adaptiveCard([
    {
      type: 'Container',
      style: 'good',
      items: [{
        type: 'TextBlock',
        text: '✅ Permit Acquired',
        weight: 'Bolder',
        size: 'Medium',
        color: 'Good',
      }],
    },
    {
      type: 'TextBlock',
      text: permit.name,
      weight: 'Bolder',
      wrap: true,
      spacing: 'Medium',
    },
    factSet([
      ['Permit ID',     permit.id],
      ['Acquired by',   acquiredBy ?? '—'],
      ['Actual Finish', permit.actual_finish ?? new Date().toISOString().slice(0, 10)],
    ]),
  ])
  return postToTeams(webhookUrl, card)
}

export function sendTeamsTestNotification(webhookUrl) {
  const card = adaptiveCard([
    {
      type: 'TextBlock',
      text: '✅ DandC Dashboard — Teams Integration',
      weight: 'Bolder',
      size: 'Medium',
      color: 'Good',
    },
    {
      type: 'TextBlock',
      text: 'Your MS Teams webhook is configured correctly. Notifications will appear here.',
      wrap: true,
      spacing: 'Small',
    },
    factSet([
      ['Status', 'Connected'],
      ['Sent at', new Date().toLocaleString()],
    ]),
  ])
  return postToTeams(webhookUrl, card)
}

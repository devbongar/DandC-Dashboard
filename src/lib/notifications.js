export async function sendIssueNotification(issue, permit, assignedUser) {
  const apiKey = import.meta.env.VITE_RESEND_API_KEY
  if (!apiKey || !assignedUser?.email) {
    return { ok: false, error: 'Missing API key or recipient email' }
  }

  const body = {
    from: 'DandC Dashboard <noreply@dandcdashboard.com>',
    to:   [assignedUser.email],
    subject: `Issue raised on permit ${permit.id} — ${permit.name}`,
    html: `
      <p>Hi ${assignedUser.full_name ?? assignedUser.email},</p>
      <p>A new issue has been raised on permit <strong>${permit.id} — ${permit.name}</strong>
         (Project: ${permit.project_id}).</p>
      <p><strong>Issue:</strong> ${issue.issue}</p>
      ${issue.description ? `<p><strong>Details:</strong> ${issue.description}</p>` : ''}
      <p>Please log in to the dashboard to review and resolve.</p>
    `,
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: text }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function sendTeamsNotification(payload, webhookUrl) {
  if (!webhookUrl) return { ok: false, error: 'No Teams webhook URL configured' }

  const body = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: 'ed6055',
    summary: payload.title,
    sections: [
      {
        activityTitle: payload.title,
        activityText: payload.text,
        facts: [
          { name: 'Permit ID',   value: payload.permitId },
          { name: 'Permit Name', value: payload.permitName },
        ],
      },
    ],
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: text }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

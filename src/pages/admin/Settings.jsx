import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import DashboardLayout from '../../components/DashboardLayout'
import useProfile from '../../hooks/useProfile'
import LoadingScreen from '../../components/LoadingScreen'
import { sendTeamsTestNotification } from '../../lib/notifications'

function Section({ title, description, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
        {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

export default function Settings() {
  const { profile, loading: profileLoading } = useProfile()

  const [webhookUrl,    setWebhookUrl]    = useState('')
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookTesting, setWebhookTesting] = useState(false)
  const [webhookStatus, setWebhookStatus] = useState(null)

  const [gcWebhookUrl,    setGcWebhookUrl]    = useState('')
  const [gcWebhookSaving, setGcWebhookSaving] = useState(false)
  const [gcWebhookTesting, setGcWebhookTesting] = useState(false)
  const [gcWebhookStatus, setGcWebhookStatus] = useState(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchSettings() }, [])

  async function fetchSettings() {
    const { data } = await supabase
      .from('app_settings')
      .select('key, value')
    if (data) {
      const map = Object.fromEntries(data.map(r => [r.key, r.value]))
      setWebhookUrl(map.teams_webhook_url ?? '')
      setGcWebhookUrl(map.teams_gc_webhook_url ?? '')
    }
    setLoading(false)
  }

  async function saveWebhook() {
    setWebhookSaving(true)
    setWebhookStatus(null)
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'teams_webhook_url', value: webhookUrl.trim() }, { onConflict: 'key' })
    setWebhookSaving(false)
    setWebhookStatus(error ? 'error' : 'saved')
    setTimeout(() => setWebhookStatus(null), 3000)
  }

  async function testWebhook() {
    if (!webhookUrl.trim()) return
    setWebhookTesting(true)
    setWebhookStatus(null)
    const result = await sendTeamsTestNotification(webhookUrl.trim())
    setWebhookTesting(false)
    setWebhookStatus(result.ok ? 'test-ok' : 'test-fail')
    setTimeout(() => setWebhookStatus(null), 4000)
  }

  async function saveGcWebhook() {
    setGcWebhookSaving(true)
    setGcWebhookStatus(null)
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'teams_gc_webhook_url', value: gcWebhookUrl.trim() }, { onConflict: 'key' })
    setGcWebhookSaving(false)
    setGcWebhookStatus(error ? 'error' : 'saved')
    setTimeout(() => setGcWebhookStatus(null), 3000)
  }

  async function testGcWebhook() {
    if (!gcWebhookUrl.trim()) return
    setGcWebhookTesting(true)
    setGcWebhookStatus(null)
    const result = await sendTeamsTestNotification(gcWebhookUrl.trim())
    setGcWebhookTesting(false)
    setGcWebhookStatus(result.ok ? 'test-ok' : 'test-fail')
    setTimeout(() => setGcWebhookStatus(null), 4000)
  }

  if (loading || profileLoading) return <LoadingScreen />

  return (
    <DashboardLayout profile={profile}>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Admin configuration</p>
        </div>

        {/* MS Teams */}
        <Section
          title="MS Teams Notifications"
          description="Send permit and issue notifications to a Teams channel via incoming webhook."
        >
          <div className="space-y-4">
            {/* How to get webhook URL */}
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">How to set up</p>
              <ol className="text-xs text-blue-700 dark:text-blue-300 list-decimal list-inside space-y-0.5">
                <li>Open the Teams channel where you want notifications</li>
                <li>Click ··· → Connectors → Incoming Webhook → Configure</li>
                <li>Name it "DandC Dashboard", copy the webhook URL</li>
                <li>Paste it below and save</li>
              </ol>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Webhook URL
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://outlook.office.com/webhook/..."
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40 transition-shadow"
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={saveWebhook}
                disabled={webhookSaving || !webhookUrl.trim()}
                className="px-4 py-2.5 text-sm font-medium rounded-xl bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-40 transition-colors"
              >
                {webhookSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={testWebhook}
                disabled={webhookTesting || !webhookUrl.trim()}
                className="px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                {webhookTesting ? 'Sending...' : 'Send Test Message'}
              </button>
              {webhookStatus && (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${
                  webhookStatus === 'saved'     ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                  webhookStatus === 'test-ok'   ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                  webhookStatus === 'error'     ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                  webhookStatus === 'test-fail' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : ''
                }`}>
                  {webhookStatus === 'saved'     && '✓ Saved'}
                  {webhookStatus === 'test-ok'   && '✓ Test message sent'}
                  {webhookStatus === 'error'     && '✗ Failed to save'}
                  {webhookStatus === 'test-fail' && '✗ Test failed — check webhook URL'}
                </span>
              )}
            </div>

            {/* What triggers notifications */}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Notifications sent to Teams</p>
              <ul className="space-y-1.5">
                {[
                  { event: 'Issue raised',     desc: 'When a permit issue is raised and assigned' },
                  { event: 'Permit acquired',  desc: 'When a permit is marked as acquired' },
                ].map(n => (
                  <li key={n.event} className="flex items-start gap-2">
                    <span className="mt-0.5 w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                      <svg className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="text-xs text-gray-700 dark:text-gray-300">
                      <strong>{n.event}</strong> — {n.desc}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* Daily Digest */}
        <Section
          title="Daily Digest (Teams GC)"
          description="Sends a daily summary of active permits, expiring items, and open issues to a Teams group chat at 7AM Manila time."
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">How to set up</p>
              <ol className="text-xs text-blue-700 dark:text-blue-300 list-decimal list-inside space-y-0.5">
                <li>Open your Teams group chat</li>
                <li>Click ··· → Workflows → select "Post to a chat when a webhook request is received"</li>
                <li>Name it "DandC Daily Digest", copy the webhook URL</li>
                <li>Paste it below and save</li>
                <li>Add <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">SUPABASE_URL</code>, <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>, and <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">CRON_SECRET</code> to Vercel environment variables</li>
              </ol>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                GC Webhook URL
              </label>
              <input
                type="url"
                value={gcWebhookUrl}
                onChange={e => setGcWebhookUrl(e.target.value)}
                placeholder="https://prod-xx.westus.logic.azure.com/..."
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ed6055]/40 transition-shadow"
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={saveGcWebhook}
                disabled={gcWebhookSaving || !gcWebhookUrl.trim()}
                className="px-4 py-2.5 text-sm font-medium rounded-xl bg-[#ed6055] text-white hover:bg-[#d94f45] disabled:opacity-40 transition-colors"
              >
                {gcWebhookSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={testGcWebhook}
                disabled={gcWebhookTesting || !gcWebhookUrl.trim()}
                className="px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                {gcWebhookTesting ? 'Sending...' : 'Send Test Message'}
              </button>
              {gcWebhookStatus && (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${
                  gcWebhookStatus === 'saved'     ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                  gcWebhookStatus === 'test-ok'   ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                  gcWebhookStatus === 'error'     ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                  gcWebhookStatus === 'test-fail' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : ''
                }`}>
                  {gcWebhookStatus === 'saved'     && '✓ Saved'}
                  {gcWebhookStatus === 'test-ok'   && '✓ Test message sent'}
                  {gcWebhookStatus === 'error'     && '✗ Failed to save'}
                  {gcWebhookStatus === 'test-fail' && '✗ Test failed — check webhook URL'}
                </span>
              )}
            </div>

            <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sends daily at <strong>7:00 AM Manila time</strong>. Covers active projects only (projects with at least one pending permit).
              </p>
            </div>
          </div>
        </Section>

      </div>
    </DashboardLayout>
  )
}

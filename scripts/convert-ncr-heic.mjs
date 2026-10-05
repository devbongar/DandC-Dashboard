// One-off backfill: convert the .heic photos already attached to Quality
// Findings reports into .jpg, so they render outside Safari.
//
// iPhones hand over .heic when a photo is picked from the gallery. The NCR
// upload used to store that file untouched, so those reports show a broken
// image everywhere except iOS, and the print-to-PDF drops them. New uploads are
// re-encoded in the browser now; this fixes the ones already stored.
//
// Dry run (lists what it would do, changes nothing):
//   node scripts/convert-ncr-heic.mjs
// Apply:
//   node scripts/convert-ncr-heic.mjs --apply
//
// The original .heic objects are left in the bucket on purpose -- delete them
// from the Storage tab once the reports have been eyeballed.

import { readFileSync } from 'fs'
import heicConvert from 'heic-convert'

const APPLY = process.argv.includes('--apply')

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)

const BASE   = env.SUPABASE_URL
const KEY    = env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'ncr-photos'
const TABLE  = 'project_ncr_reports'

if (!BASE || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env')
  process.exit(1)
}

const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const rest = async (path, init = {}) => {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    ...init,
    headers: { ...auth, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

// Public URL -> object path inside the bucket
const pathFromUrl = (url) => {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length))
}

const publicUrl = (path) =>
  `${BASE}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`

const rows = await rest(`${TABLE}?select=id,project_id,data`)
const targets = rows.filter(r => (r.data?.photos ?? []).some(u => u.toLowerCase().endsWith('.heic')))

const totalHeic = targets.reduce(
  (n, r) => n + r.data.photos.filter(u => u.toLowerCase().endsWith('.heic')).length, 0)

console.log(`${rows.length} reports, ${targets.length} with HEIC photos, ${totalHeic} files to convert`)
console.log(APPLY ? 'MODE: apply\n' : 'MODE: dry run (pass --apply to write)\n')

let converted = 0
let failed = 0

for (const row of targets) {
  const photos = row.data.photos
  const next = [...photos]

  for (let i = 0; i < photos.length; i++) {
    const url = photos[i]
    if (!url.toLowerCase().endsWith('.heic')) continue

    const srcPath = pathFromUrl(url)
    if (!srcPath) { console.log(`  SKIP (unrecognised url) ${url}`); failed++; continue }
    const dstPath = srcPath.replace(/\.heic$/i, '.jpg')

    console.log(`  ${row.project_id} ${row.id}`)
    console.log(`    ${srcPath}`)
    console.log(`    -> ${dstPath}`)

    if (!APPLY) { next[i] = publicUrl(dstPath); converted++; continue }

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`download ${res.status}`)
      const heic = Buffer.from(await res.arrayBuffer())

      const jpg = await heicConvert({ buffer: heic, format: 'JPEG', quality: 0.85 })

      const up = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${dstPath}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
        body: Buffer.from(jpg),
      })
      if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`)

      next[i] = publicUrl(dstPath)
      converted++
    } catch (err) {
      console.log(`    FAILED: ${err.message}`)
      failed++
    }
  }

  if (APPLY && next.some((u, i) => u !== photos[i])) {
    await rest(`${TABLE}?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data: { ...row.data, photos: next } }),
    })
  }
}

console.log(`\n${converted} converted, ${failed} failed`)
if (!APPLY) console.log('Nothing was written. Re-run with --apply.')

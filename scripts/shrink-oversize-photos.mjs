// One-off: shrink the project photos whose originals are too big for Supabase
// Image Transformations to process.
//
// The Photos lightbox serves previews through /storage/v1/render/image, which
// cuts a 6MB photo to under 900KB. The transformer refuses any source over
// ~25MB ("The source image file is too large to process"), so those photos fall
// back to downloading the full original -- up to 38MB on a phone over site
// data. Re-encoding them below the ceiling lets the transformer handle every
// photo.
//
// Each file is re-encoded in place, so `project_photos.storage_path` and every
// public URL stay valid and no DB rows change. The untouched original is copied
// to `oversize-originals/<path>` in the same bucket first; delete that prefix
// from the Storage tab once the photos have been checked.
//
// Dry run (reports what it would do, writes nothing):
//   node scripts/shrink-oversize-photos.mjs
// Apply:
//   node scripts/shrink-oversize-photos.mjs --apply

import { readFileSync } from 'fs'
import sharp from 'sharp'

const APPLY = process.argv.includes('--apply')

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)

const BASE   = env.SUPABASE_URL
const KEY    = env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'project-photos'

// The transformer refuses a source on two independent grounds, with two
// different messages: "file is too large to process" over ~25MB, and
// "resolution is too large to process" over roughly 50MP. These files are
// stitched drone panoramas, so both bite.
//
// Re-encoding alone clears the byte ceiling (38MB -> 7.8MB) and keeps every
// pixel, so that is tried first. Only a photo that is still refused afterwards
// gets downscaled, and then only to MAX_MP -- measured, not guessed: 36MP
// sources transform fine here, 87MP and above do not.
const LIMIT      = 25 * 1024 * 1024
const MAX_MP     = 36
const JPEG_Q     = 85
const BACKUP_DIR = 'oversize-originals'

if (!BASE || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env')
  process.exit(1)
}

const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const enc  = (p) => p.split('/').map(encodeURIComponent).join('/')
const pub  = (p) => `${BASE}/storage/v1/object/public/${BUCKET}/${enc(p)}`
const ren  = (p) => `${BASE}/storage/v1/render/image/public/${BUCKET}/${enc(p)}?width=1600&quality=75`
const mb   = (n) => (n / 1048576).toFixed(1) + 'MB'

const photos = await (await fetch(
  `${BASE}/rest/v1/project_photos?select=storage_path&limit=5000`, { headers: auth })).json()

process.stdout.write(`Scanning ${photos.length} photos (over ${mb(LIMIT)} or over ${MAX_MP}MP)... `)

// Dimensions come from the JPEG header via a ranged read rather than a transform
// request, so scanning does not bill a transformation for every photo.
const oversize = []
let cursor = 0
await Promise.all(Array.from({ length: 24 }, async () => {
  while (cursor < photos.length) {
    const p = photos[cursor++]
    try {
      const r = await fetch(pub(p.storage_path), { method: 'HEAD' })
      if (!r.ok) continue
      const len = Number(r.headers.get('content-length') ?? 0)

      let mp = 0
      try {
        const head = await fetch(pub(p.storage_path), { headers: { Range: 'bytes=0-262143' } })
        const meta = await sharp(Buffer.from(await head.arrayBuffer())).metadata()
        mp = (meta.width * meta.height) / 1e6
      } catch { /* unreadable header -- fall back to the byte test alone */ }

      if (len >= LIMIT || mp > MAX_MP) oversize.push({ path: p.storage_path, len, mp })
    } catch { /* unreachable object -- nothing to shrink */ }
  }
}))
oversize.sort((a, b) => b.len - a.len)

console.log(`${oversize.length} found`)
console.log(APPLY ? 'MODE: apply\n' : 'MODE: dry run (pass --apply to write)\n')
if (!oversize.length) process.exit(0)

let done = 0
let failed = 0
let before = 0
let after = 0

const upload = async (path, body) => {
  const r = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body,
  })
  if (!r.ok) throw new Error(`upload ${r.status} ${(await r.text()).slice(0, 160)}`)
}

// Only copies when the backup is missing, so a re-run never overwrites a kept
// original with an already-processed version of itself.
const ensureBackup = async (path) => {
  const have = await fetch(pub(`${BACKUP_DIR}/${path}`), { method: 'HEAD' })
  if (have.ok) return 'backup exists'
  const r = await fetch(`${BASE}/storage/v1/object/copy`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId: BUCKET, sourceKey: path, destinationKey: `${BACKUP_DIR}/${path}` }),
  })
  if (!r.ok) throw new Error(`backup ${r.status} ${(await r.text()).slice(0, 160)}`)
  return 'backed up'
}

for (const item of oversize) {
  console.log(`${item.path}  ${mb(item.len)}  ${item.mp ? item.mp.toFixed(0) + 'MP' : ''}`)
  before += item.len

  if (!APPLY) { done++; continue }

  try {
    const res = await fetch(pub(item.path))
    if (!res.ok) throw new Error(`download ${res.status}`)
    const original = Buffer.from(await res.arrayBuffer())

    await ensureBackup(item.path)

    let out = await sharp(original)
      .rotate()                                   // bake in EXIF orientation before re-encoding
      .jpeg({ quality: JPEG_Q, mozjpeg: true })   // same pixels, smaller encoding
      .withMetadata()                             // keep EXIF (capture date, GPS)
      .toBuffer()
    await upload(item.path, out)

    let check = await fetch(ren(item.path), { method: 'HEAD' })

    // Still refused: the resolution ceiling, not the byte one. Scale the long
    // edge so the pixel count lands at MAX_MP, keeping the aspect ratio.
    if (!check.ok) {
      const meta = await sharp(out).metadata()
      const scale = Math.sqrt((MAX_MP * 1e6) / (meta.width * meta.height))
      if (scale < 1) {
        const w = Math.round(meta.width * scale)
        console.log(`   transform refused at ${meta.width}x${meta.height} -- downscaling to ${w}px wide`)
        out = await sharp(original)
          .rotate()
          .resize({ width: w, withoutEnlargement: true })
          .jpeg({ quality: JPEG_Q, mozjpeg: true })
          .withMetadata()
          .toBuffer()
        await upload(item.path, out)
        check = await fetch(ren(item.path), { method: 'HEAD' })
      }
    }

    const note = check.ok
      ? `transform OK ${mb(Number(check.headers.get('content-length') ?? 0))}`
      : `TRANSFORM STILL FAILS (${check.status})`

    after += out.length
    done++
    console.log(`   -> ${mb(out.length)}  (${(out.length / item.len * 100).toFixed(0)}% of original)  ${note}`)
  } catch (err) {
    failed++
    console.log(`   FAILED: ${err.message}`)
  }
}

console.log(`\n${done} shrunk, ${failed} failed`)
if (APPLY && after) {
  console.log(`${mb(before)} -> ${mb(after)} (originals kept under ${BACKUP_DIR}/)`)
} else if (!APPLY) {
  console.log(`Would re-encode ${mb(before)} of originals. Nothing was written -- re-run with --apply.`)
}

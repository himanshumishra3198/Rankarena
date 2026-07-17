#!/usr/bin/env node
// Bulk-import questions into a mock test or contest, uploading any local
// images to S3 (via /admin/upload) first and rewriting them to hosted URLs.
//
// Solves the tedious part of loading a solved-paper PDF: instead of adding
// each question by hand and uploading each figure one at a time, you produce
// one questions.json (see README for the extraction prompt) and run this.
//
// Usage:
//   API_URL=https://api.example.com \
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... \
//   node import.mjs --target mock --id <MOCK_ID> --file questions.json [--images ./figures] [--dry]
//
// Auth: set ADMIN_TOKEN, or ADMIN_EMAIL + ADMIN_PASSWORD (the script logs in).
//
// questions.json is an array of question objects matching the bulk schema:
//   { questionType, text, optionA..D, correctOption, difficulty, solution, marks, negativeMarks }
// Plus one extra convenience field this script understands:
//   "imageFile": "q7.png"   → uploaded from <images-dir>/q7.png, becomes imageUrl
// For mocks you may omit "subject" (the mock's section is used); for contests
// each question needs its own "subject".

import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry') args.dry = true
    else if (a.startsWith('--')) { args[a.slice(2)] = argv[++i] }
  }
  return args
}

function die(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1) }

const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '')

async function getToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN
  const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD
  if (!email || !password) die('Set ADMIN_TOKEN, or ADMIN_EMAIL and ADMIN_PASSWORD.')
  const r = await fetch(`${API_URL}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) die(`Login failed (${r.status}). Check ADMIN_EMAIL / ADMIN_PASSWORD.`)
  const { token, user } = await r.json()
  if (user?.role !== 'ADMIN') die(`${email} is not an ADMIN account.`)
  return token
}

async function uploadImage(token, filePath) {
  const buf = await readFile(filePath)
  const ext = extname(filePath).toLowerCase()
  const type = MIME[ext]
  if (!type) die(`Unsupported image type "${ext}" (${filePath}). Use png/jpg/gif/webp.`)
  const fd = new FormData()
  fd.append('image', new Blob([buf], { type }), basename(filePath))
  const r = await fetch(`${API_URL}/admin/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  })
  if (!r.ok) die(`Image upload failed for ${filePath} (${r.status}): ${await r.text()}`)
  const { url } = await r.json()
  return url
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const target = args.target
  if (target !== 'mock' && target !== 'contest') die('--target must be "mock" or "contest".')
  if (!args.id) die('--id <mock or contest id> is required.')
  if (!args.file) die('--file questions.json is required.')

  const imagesDir = args.images ? resolve(args.images) : dirname(resolve(args.file))
  const token = await getToken()

  let questions
  try { questions = JSON.parse(await readFile(resolve(args.file), 'utf8')) }
  catch (e) { die(`Could not read/parse ${args.file}: ${e.message}`) }
  if (!Array.isArray(questions) || questions.length === 0) die('questions.json must be a non-empty array.')

  // Resolve local images → hosted URLs, and clean up empty optional fields.
  const withImages = questions.filter(q => q.imageFile).length
  console.log(`\n${questions.length} question(s) · ${withImages} with images · target ${target} ${args.id}`)

  const prepared = []
  for (let i = 0; i < questions.length; i++) {
    const q = { ...questions[i] }
    if (q.imageFile) {
      const p = resolve(imagesDir, q.imageFile)
      if (args.dry) { console.log(`  [dry] Q${i + 1} would upload ${q.imageFile}`) }
      else {
        process.stdout.write(`  ↑ Q${i + 1} uploading ${q.imageFile} … `)
        q.imageUrl = await uploadImage(token, p)
        console.log('done')
      }
      delete q.imageFile
    }
    if (!q.imageUrl) delete q.imageUrl
    if (!q.solution) delete q.solution
    prepared.push(q)
  }

  if (args.dry) {
    console.log(`\n[dry run] Prepared ${prepared.length} question(s). Nothing was sent.\n`)
    return
  }

  const r = await fetch(`${API_URL}/admin/${target}s/${args.id}/questions/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(prepared),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) die(`Bulk import failed (${r.status}): ${JSON.stringify(body.error ?? body)}`)
  console.log(`\n✓ Imported ${body.created} question(s)${body.skipped ? `, skipped ${body.skipped} duplicate(s)` : ''}.\n`)
}

main().catch(e => die(e.stack || e.message))

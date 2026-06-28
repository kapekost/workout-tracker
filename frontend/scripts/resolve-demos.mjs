// Resolve ExerciseDB GIF URLs for each exercise in workoutPlan.js into
// src/data/exerciseDemos.json. Run on the Mac with RAPIDAPI_KEY set.
// Usage: RAPIDAPI_KEY=xxxx node scripts/resolve-demos.mjs
import { writeFileSync } from 'node:fs'
import { PLAN } from '../src/data/workoutPlan.js'

const KEY = process.env.RAPIDAPI_KEY
if (!KEY) { console.error('Set RAPIDAPI_KEY'); process.exit(1) }

const HOST = 'exercisedb.p.rapidapi.com'
const headers = { 'X-RapidAPI-Key': KEY, 'X-RapidAPI-Host': HOST }

// ExerciseDB search terms for names that won't auto-match our labels.
const OVERRIDES = {
  bent_row: 'bent over row',
  ohp: 'barbell shoulder press',
  lat_pulldown: 'cable pulldown',
}

function searchTerm(ex) {
  return OVERRIDES[ex.id] || ex.name.toLowerCase()
}

async function resolveOne(ex) {
  const term = encodeURIComponent(searchTerm(ex))
  const res = await fetch(`https://${HOST}/exercises/name/${term}?limit=1`, { headers })
  if (!res.ok) { console.warn(`  ${ex.id}: HTTP ${res.status}`); return null }
  const arr = await res.json()
  const hit = Array.isArray(arr) && arr[0]
  return hit?.gifUrl || null
}

const seen = new Set()
const out = {}
for (const day of Object.values(PLAN)) {
  for (const ex of day.exercises) {
    if (seen.has(ex.id)) continue
    seen.add(ex.id)
    const url = await resolveOne(ex)
    if (url) { out[ex.id] = url; console.log(`  ${ex.id} -> ok`) }
    else console.warn(`  ${ex.id} -> no demo (will fall back to YouTube)`)
  }
}

writeFileSync(new URL('../src/data/exerciseDemos.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n')
console.log(`Wrote ${Object.keys(out).length} demos.`)

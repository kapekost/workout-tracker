// Resolve exercise demo frames from the free, no-key yuhonas/free-exercise-db
// (CC0) into src/data/exerciseDemos.json. Each exercise maps to an array of
// still-frame image URLs (start/end of the lift) served from jsDelivr's CDN;
// the UI alternates them to animate the movement.
//
// No API key required. Run on the Mac:  node scripts/resolve-demos.mjs
import { writeFileSync } from 'node:fs'
import { PLAN } from '../src/data/workoutPlan.js'

const DB_URL = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json'
const IMG_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/'

// Our exercise id -> free-exercise-db id (curated; our short names don't
// auto-match their specific names). Omit an id to let it fall back to YouTube.
const MAP = {
  bench_press: 'Barbell_Bench_Press_-_Medium_Grip',
  bent_row: 'Bent_Over_Barbell_Row',
  ohp: 'Standing_Military_Press',
  lat_pulldown: 'Wide-Grip_Lat_Pulldown',
  tricep_pushdown: 'Triceps_Pushdown',
  db_curl: 'Dumbbell_Bicep_Curl',
  back_squat: 'Barbell_Squat',
  rdl: 'Romanian_Deadlift',
  leg_press: 'Leg_Press',
  leg_curl: 'Lying_Leg_Curls',
  standing_calf: 'Standing_Calf_Raises',
  incline_press: 'Incline_Dumbbell_Press',
  pullup: 'Pullups',
  cable_row: 'Seated_Cable_Rows',
  lateral_raise: 'Side_Lateral_Raise',
  hammer_curl: 'Hammer_Curls',
  skull_crusher: 'Lying_Triceps_Press',
  deadlift: 'Barbell_Deadlift',
  bss: 'Split_Squat_with_Dumbbells',
  hip_thrust: 'Barbell_Hip_Thrust',
  leg_ext: 'Leg_Extensions',
  seated_calf: 'Seated_Calf_Raise',
}

const res = await fetch(DB_URL)
if (!res.ok) { console.error(`Failed to fetch exercise DB: HTTP ${res.status}`); process.exit(1) }
const db = await res.json()
const byId = Object.fromEntries(db.map(e => [e.id, e]))

const seen = new Set()
const out = {}
for (const day of Object.values(PLAN)) {
  for (const ex of day.exercises) {
    if (seen.has(ex.id)) continue
    seen.add(ex.id)
    const fid = MAP[ex.id]
    const entry = fid && byId[fid]
    const images = entry && Array.isArray(entry.images) ? entry.images : []
    if (images.length) {
      out[ex.id] = images.map(p => IMG_BASE + p)
      console.log(`  ${ex.id} -> ${images.length} frame(s)`)
    } else {
      console.warn(`  ${ex.id} -> no demo (will fall back to YouTube)`)
    }
  }
}

writeFileSync(new URL('../src/data/exerciseDemos.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n')
console.log(`Wrote ${Object.keys(out).length} demos.`)

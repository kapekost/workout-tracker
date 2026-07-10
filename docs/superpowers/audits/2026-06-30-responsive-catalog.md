# Responsive audit catalog

Part B of `docs/superpowers/plans/2026-06-30-responsive-audit-pr-baseline.md`
(full original scope). **Audit executed 2026-07-10** at commit `b53ccb7` on
branch `feat/responsive-sweep`.

## Method

- Headless Chrome via `playwright-core` (system Chrome, `deviceScaleFactor: 1`),
  portrait only, against the Vite dev server (`:5174`) proxying a throwaway
  seeded DB (7 completed sessions across all 4 days + 1 in-progress).
- Viewports: **320×844, 360×844, 375×812, 390×844, 430×932, 768×1024,
  1024×1366**, plus a short pass at **320×568**.
- Page/states (11): Home, Home empty, Workout idle (auto-expanded card),
  Workout collapsed, Workout resting + toast, Workout finish summary,
  Progress (chips), Progress with chart, History, History detail, Exercise
  detail — plus scrolled-to-bottom shots where pages exceed the viewport.
  124 screenshots total.
- Each shot also ran an automated DOM probe: elements extending past the
  viewport's left/right edge, and visible interactive elements with a
  bounding box under ~44px.

## Defects

| # | Page | Width(s) | Element | Problem | Proposed fix | Status |
|---|------|----------|---------|---------|--------------|--------|
| R1 | Workout | 320–375 | TimerBar controls row (−30 / REST clock / +30 / ⏸ / Skip) | Cluster overflows the viewport: **Skip fully off-screen at 320** (right edge 371/320), clipped at 360 (379/360) and 375 (379/375). Controls unusable while resting on small phones. | `@media (max-width: 400px)`: tighten bar padding/gaps, shrink REST clock (font + min-width), trim ⏸/Skip padding. Keep all five controls visible and ≥44px tall. | Fixed |
| R2 | Workout | 320–375 | Expanded-card logger: Weight/Reps steppers | Two fixed-width NumControls (44+72+44 each) can't fit side-by-side: **Reps "+" button off-screen at 320 — reps cannot be increased**; clipped at 360/375 (right edge 385). | Let the steppers wrap (`flex-wrap`) so Reps drops below Weight when the card is too narrow; keep 44px buttons. | Fixed |
| R3 | Workout | all (latent) | PR toast (`.toast`) | `white-space: nowrap` + long exercise name (e.g. "🏆 PR! 57.5kg on Standing Calf Raise") exceeds narrow viewports; current seeds happen to fit at 320. | `.toast { max-width: calc(100vw - 32px); white-space: normal; text-align: center }`. | Fixed |
| R4 | All pages w/ banner | all | ResumeBanner discard "×" | 20×26px tap target for a destructive action (has confirm step, still tiny). | ≥44×44 hit area via `.tap-target` hit-area class (visual size unchanged); confirm ✓/✗ buttons included. | Fixed |
| R5 | Home | all | "Export my data" link | 91×19px tap target. | `.tap-target` hit-area class. | Fixed |
| R6 | Workout expanded | all | "📋 Form cues + demo →" (140×18) and "＋ Add note" (64×17) | Sub-44px tap targets on the primary logging surface. | `.tap-target` hit-area class. | Fixed |
| R7 | Exercise | all | "← Back to workout" | 129×22px tap target. | `.tap-target` hit-area class (both Back variants). | Fixed |
| R8 | Progress | all | Exercise selector chips | 35px tall (25 chips), below 44px guideline. | `.tap-target` hit-area class — keeps chip-cloud visual density. | Fixed |
| R9 | History detail | all | "Delete session" | 122×37px tap target for a destructive action. | `.tap-target` hit-area class. | Fixed |
| R10 | TimerBar | all | ⏸ button | 32px wide (44 tall) — narrowest control in the bar. | `min-width` bump within the R1 rework where space allows. | Fixed |
| R11 | History detail | 320 | Session meta line | "✓ completed · ⏱ 55 min" wraps mid-unit ("55" / "min"). | `white-space: nowrap` on the duration fragment. | Fixed |
| R12 | Progress chart | all | Recharts axis corner | "0kg" y-tick collides with "06-26" x-tick at the bottom-left. | Chart margin/tick padding tweak. | Fixed |

## Clean at all widths

Home (populated + empty + bottom), Workout finish summary, Workout bottom
(Finish button clears the fixed TimerBar+NavBar stack), Progress chip cloud +
chart (recharts shrinks correctly 320→1024), History list, History detail,
Exercise detail incl. demo images, PWA toast at current seed lengths, TopBar /
NavBar / ResumeBanner layout, 320×568 short viewport (content scrolls; no
vertical clipping), 390/430 phones and 768/1024 tablets (content column and
TimerBar stay centered at their max-widths).

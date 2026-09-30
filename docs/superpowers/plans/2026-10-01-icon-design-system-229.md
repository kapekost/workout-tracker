# Icon design system (#229) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Issue:** #229 (effort:M) · **Spec:** `docs/superpowers/specs/2026-09-28-icon-design-system-design.md`
· **Design:** the Gym Tracker design system artifact (https://claude.ai/artifact/XhMjU1CaCdVFrLTVftd1Rm,
private to the owner) and `docs/design/229/*.png` on branch `design/229-review`.

**Goal:** one role-based icon scale applied to every call site, normalized PNG assets, two-tone
coloured nav, per-day SVG day icons, and a timer bar that holds only the rest controls at 44x44.

**Why a plan at all:** the spec is ordered and testable, but the owner's 2026-09-30 sign-off changed
four things the spec left open or got differently (below), and adds the day icons, which the spec does
not cover. This plan covers those and the decisions the spec left to the implementer. It does not
restate the spec's scale table (§1), call-site map (§5) or guard list (§6); those stand.

## Where sign-off supersedes the spec

| Topic | Spec said | Now (signed off 2026-09-30) |
|---|---|---|
| Scale | 6 roles | Same six: caption 16, body 20, control 22, heading 24, nav 26, header 28 |
| Nav second tone | `success` or darker accent, "picked at preview" | Active: `accent` + `accent-deep` #8fae22. Inactive: `muted` + muted-3 #6b6b6b |
| Timer bar | squeeze space in 4 steps, clock above row at 320px | Bar holds only the rest controls. Workout time and screen-on move to the Workout header eyebrow. No squeezing |
| Rest adjusters | glyph + "30" | Text `-30s` / `+30s`, no glyph |
| Day icons | not in spec (kept upperbody/lowerbody PNGs) | Four SVGs replace both PNGs: Upper A curl, Upper B overhead press, Lower A back squat, Lower B deadlift |
| Add note | not in spec | Muted text action, no glyph, not button-styled |

Two facts checked against source that change the work:

- `IconArrowTrendingUp` and `IconClipboardList` are already SVGs on main (#228), not PNGs. They carry
  single-colour paths with `opacity` for shading. The nav needs separate two-tone components
  (spec §3), and the existing two stay for their other call sites (`Progress.jsx` trend line).
- The design artifact's `muted-3` token reads `#5c5c5c`, but DECISIONS 2026-09-30 says `#6b6b6b`. The
  decision wins. Task 3 uses `#6b6b6b` and the implementer compares it with `NavBar.png`. Fixing the
  artifact token is a follow-up for the owner's design system, not this PR.

## Decisions the spec left open

1. **New tokens are JS-only.** `colors.accentDeep` (#8fae22) and `colors.muted3` (#6b6b6b) go in
   `theme.js` tier 2, and `icon` beside `space`/`radius`. No `index.css` custom properties: only SVG
   components read them, and `theme.test.js`'s parity check covers tier-1 only.
2. **Day icon lookup is by day id, with a fallback by kind.** `DayIcon` maps `upper_a`/`upper_b`/
   `lower_a`/`lower_b` to its SVG. An unknown id falls back on `PLAN[day]?.icon` (`'upper'` -> curl,
   `'lower'` -> squat), then curl. The `icon` field in `workoutPlan.js` and `backend/plan_seed.py`
   stays as is; changing it would touch the backend plan data model (#219), which is out of scope.
3. **Day icons carry no accent dot.** They are coloured by the day colour, which already does what the
   dot did, and the approved `DayIcons.png` shows none. `DayAccent` stays for its bar/dot uses
   elsewhere. The "renders one body icon with an accent dot" test is rewritten, not deleted.
4. **Second tone for days is derived, not hard-coded.** Pink, blue and orange: the day colour mixed 60%
   toward white, by a small `tint(hex, amount)` helper in `theme.js`. Upper A uses
   `colors.accentDeep` (a lighter volt is 1.1:1 against volt). Exported as `DAY_TONE2` next to
   `DAY_COLORS` in `workoutPlan.js`, so a palette change carries through.
5. **SVG sources are lifted from the design system, not redrawn.**
   `project/components/DayIcons/preview.html` in the artifact holds all four as 24-grid SVGs with a
   `--tgt` variable for the second tone. Read it with the Artifact `read` action (`path`). Replace
   `var(--tgt, ...)` with a `tone2` prop. Do not hand-redraw.
6. **Session clock lives in its own component.** `SessionClock` (in `components/`) owns the 1s
   interval and renders `ACTIVE SESSION · 52:10`. Putting the tick in `Workout.jsx` would re-render the
   whole page, with 20+ set rows, every second. `TimerBar` keeps its own interval for the rest clock.
7. **Screen-on marker:** `IconBolt` at `icon.caption` plus the text `SCREEN ON`, muted, after the time,
   shown only when `wakeLockHeld`. The eyebrow stays `colors` of the day colour as today.
8. **Add note:** the text stays `Add note`, muted, `type.size.sm`, no icon. It keeps `tap-target` so
   its 44px hit zone is unchanged. The note display's pencil goes to `icon.body`.
9. **Tie-break for sizes:** the call-site table in spec §5 decides. Where a site is not listed, size to
   the paired text's line-height: font-size at or under `type.size.sm` (0.7rem) is `caption`; from
   `type.size.base` (0.75rem) to `type.size.body` is `body`.

## Tasks

Each task ends green (`npm test` in `frontend/`, plus `npm run build`) and is one commit.

### Task 1: tokens and the scale guard

Files: `frontend/src/lib/theme.js`, `theme.test.js`, new `frontend/src/icons/icon-scale.test.js`, then
every file in the spec §5 table.

- [ ] Add `icon`, `colors.accentDeep`, `colors.muted3`, `tint()`. Tests: `icon has exactly the six roles
  with the signed-off px values`; `accentDeep and muted3 are the signed-off hex`; `tint(hex, 0)` returns
  the input and `tint(hex, 1)` returns `#ffffff`.
- [ ] Write `icon-scale.test.js` first and watch it fail: scans `src/**/*.jsx` excluding `src/icons/`
  and `*.test.jsx`, fails on any `size={<digit>`, and prints each offender as `file:line`. Assert the
  scan found more than 30 files' worth of JSX so a wrong glob cannot pass silently.
- [ ] Migrate the 43 call sites listed by `grep -rnE "size=\{[0-9]" src --include='*.jsx'`. Import
  `icon` from `../lib/theme`. `DayIcon`'s default `size` and `DayAccent size={6}` are not icon
  sizes; the guard regex ignores `DayAccent` only if it is written `size={6}`, so either allow-list
  that one line in the test with a comment or pass it via a `space` token. Prefer the allow-list.
- [ ] `TopBar.jsx` mark goes to `icon.header` (Task 2 makes it height-sized). The `IconUser` fallback
  beside the username is `icon.caption`.
- Verify: guard is green; eyeball none of the layouts yet, since sizes change in later tasks.

### Task 2: PNG contract and `PngIcon`

Files: new `icons/PngIcon.jsx`, `IconBarbell.jsx`, `IconClock.jsx`, `IconClipboardDocumentList.jsx`,
`assets/icons/{appmark,clock,clipboard}.png`, `icons.test.jsx`; `upperbody.png`, `lowerbody.png`,
`IconDayUpper.jsx`, `IconDayLower.jsx` are removed in Task 4, not here.

- [ ] Crop and pad the three remaining PNGs per spec §2 (alpha > 40, ignore the 1px `#2c2c2c` border
  lines, ~84% fill, centred). Reference crop boxes: clock (6,25)-(82,101) in 159x104. Measure appmark
  and clipboard the same way; do not reuse the numbers for a different source.
- [ ] `PngIcon({ src, size, opacity, style, ...props })` renders `<img width=size height=size>` with
  no `transform`. The three icon files become wrappers. `IconBarbell` is the exception: sized by
  height (`height = size`, width auto), the only non-square icon.
- Tests: `PngIcon renders a size x size img with no transform`; `IconClock and
  IconClipboardDocumentList render through PngIcon`; `IconBarbell renders height === size`;
  `every PNG in assets/icons is square except appmark` (parse the IHDR width/height from the file
  bytes with `fs`; no new dependency).
- Delete the stale comment blocks in the three icon files that argue against correcting them.
- Verify in a browser at 390px: History clock and the Form cues clipboard read the same height as
  the adjacent text. Appmark should paint about 28px tall at `icon.header` (it painted ~9.5px).

### Task 3: two-tone nav

Files: new `icons/IconNavHome.jsx`, `IconNavProgress.jsx`, `IconNavHistory.jsx`, `icons/index.js`,
`components/NavBar.jsx`, `NavBar.test.jsx`, `icons.test.jsx`.

- [ ] Each takes `{ size, active }`. Primary tone `active ? colors.accent : colors.muted`; second tone
  `active ? colors.accentDeep : colors.muted3`. Shapes: Home from `IconHome`'s path; History from
  `IconClipboardList`; Progress is the bar chart with a rising arrow (the owner's preferred icon), drawn
  fresh with bold solid shapes and no fine low-opacity detail. Reference the `NavBar.png` option B
  render, not the old `progress.png`, which is gone.
- [ ] Both tones are token references, never hex in the component. No `opacity` attribute anywhere in
  these three files (the failure mode on record at #211/#213/#228).
- [ ] `NavBar.jsx` passes `active` and `size={icon.nav}`, drops the `color` prop path.
- Tests (`NavBar.test.jsx`, replacing the `iconPaintAttr` helper, which reads one root attribute that
  no longer carries the colour): `active tab paints accent and accentDeep`; `inactive tabs paint muted
  and muted3`; `/personal-bests lights the Progress icon`; `no nav icon has an opacity attribute or
  style`. In `icons.test.jsx`: `each nav icon renders an aria-hidden svg at the requested size`.
- Contrast check: muted3 against the card background is about 3.3:1 at #6b6b6b (decorative use, 3:1
  floor). Compute it with the existing WCAG helper in `theme.test.js` and assert >= 3.
- Verify: nav bar height is still 77px (`--navbar-height`). The tab button has `minHeight: 48`, and
  26 + 3 + the label should still fit. If it grows, update `--navbar-height` and
  `EXTRA_BOTTOM_CLEARANCE_FOR_TIMER_BAR` together (Task 5 re-measures anyway).

### Task 4: day icons

Files: new `icons/IconDayCurl.jsx`, `IconDayPress.jsx`, `IconDaySquat.jsx`, `IconDayDeadlift.jsx`,
`components/DayIcon.jsx`, `DayIcon.test.jsx`, `data/workoutPlan.js`, `icons/index.js`; delete
`IconDayUpper.jsx`, `IconDayLower.jsx`, `assets/icons/upperbody.png`, `lowerbody.png`.

- [ ] Four components, each `{ size, color = 'currentColor', tone2 = color }`, lifted from the artifact
  (decision 5). Root `svg` uses `width=height=size`, `viewBox="0 0 24 24"`, `aria-hidden`.
- [ ] `DAY_TONE2` in `workoutPlan.js` (decision 4). `DayIcon` resolves icon by day id (decision 2),
  colours it with `DAY_COLORS[day] ?? DAY_COLOR_FALLBACK`, drops the dot (decision 3), default size
  `icon.heading`.
- Tests: `each of the four days renders a different svg`; `colours the glyph with the day colour and the
  targeted muscles with DAY_TONE2`; `upper_a second tone is accentDeep`; `an unknown day falls back to
  the fallback colour and a default glyph`; `an unrecognised day whose PLAN icon is 'lower' gets the
  squat`. Delete the two `ASPECT`/`scale()` tests in `icons.test.jsx`.
- Sizing by role: heading before the `<h1>` on Home and Workout, `body` in History rows,
  `caption` in `ResumeBanner` and `MuscleGroupPicker` (today 16).
- Verify: four days side by side at 16, 20, 24 and 48px against `DayIcons.png`. Upper A's second tone
  must read against volt at 16px.

### Task 5: timer bar and the Workout header

Files: `components/TimerBar.jsx`, `TimerBar.test.jsx`, new `components/SessionClock.jsx` and test,
`pages/Workout.jsx`, `index.css`, `frontend/e2e/responsive.spec.js`.

- [ ] `TimerBar` drops `sessionStartMs`, `wakeLockHeld` and the `.session-clock`/`.wake-chip`
  markup. Buttons become text `-30s` / `+30s` (aria-labels unchanged: `subtract 30 seconds`, `add 30
  seconds`), pause at `icon.control`, Skip as text. Keep the rest-state logic, flash, beep and the
  `opacity: resting ? 1 : 0.4` dimming as they are.
- [ ] `index.css`: delete the 38px and 34px width overrides, the `.wake-*` rules and the session-clock
  rules. Every `.timer-bar button` gets `min-width: 44px; min-height: 44px`. Keep the narrower rest-clock
  font step. Do not touch the steppers, the armed delete or `.tap-target::after`.
- [ ] `SessionClock({ startMs, wakeLockHeld, color })` renders `ACTIVE SESSION · mm:ss` plus the
  screen-on marker (decision 7) through the existing `Eyebrow`. `Workout.jsx` swaps the static "Active
  session" eyebrow for it and stops passing the two props to `TimerBar`.
- Tests: `TimerBar renders no session clock and no wake chip`; `the adjusters read -30s and +30s`;
  `SessionClock shows the elapsed time and ticks`; `SessionClock shows SCREEN ON only when the wake lock
  is held` (fake timers). Keep every existing rest-state test unchanged; if one has to change, that is a
  finding, not a fix.
- Playwright (`responsive.spec.js`), at 320, 360, 390 and 440px: `every .timer-bar button is >= 44x44`
  and `.timer-bar scrollWidth <= clientWidth`. Watch it fail on main's CSS first.
- Re-measure the bar's height in a browser at all four widths. It gets shorter (the clock row is gone),
  so update `EXTRA_BOTTOM_CLEARANCE_FOR_TIMER_BAR` and its comment, and confirm the last exercise card
  clears the bar. Clearance constants and `--navbar-height` move together if either changes.

### Task 6: Add note and the final sweep

Files: `pages/Workout.jsx` only, plus whatever the sweep finds.

- [ ] Apply decision 8. Test: `Add note is a muted text action with no icon and still opens the note
  editor` in `Workout.test.jsx`.
- [ ] Final `grep -rnE "size=\{[0-9]" src`, `grep -rn "ASPECT\|scale(" src/icons` and `grep -rn
  "upperbody\|lowerbody" src` each return nothing.
- [ ] Update the `IconClock`/`IconBarbell` header comments that still describe the old letterboxing.

## Review and ship

1. `cd frontend && npm test && npm run build`, then `npx playwright test e2e/responsive.spec.js`.
2. PLAYBOOK step 5: render Home, active Workout, History, Progress, Personal Bests and Exercise at 390px,
   plus the timer bar at 320px, from a local build. Then a separate UI-expert and UX-expert pass on the
   renders (two reviewers, blind to each other), every finding adjudicated against source before
   acting. Compare the renders with `docs/design/229/*.png`; the design itself is already signed off,
   so the reviewers check the build against it, not the design.
3. One PR to main from a feature branch. `gh pr checks --watch --fail-fast`, re-check PR reviews
   (Codex), `gh pr merge --squash --delete-branch`. Deploy and verify on production per
   `AGENTS.local.md`: nav colours, header mark height, timer bar at real phone width.
4. "Complete" means merged, deployed and verified live.

## Out of scope

The rest of the glyph set stays as is (#212 flat-fill style). No type-scale overhaul, no icon font, no
new dependency. #196, #197, #170 and #172 pick up the scale once this lands; they are not touched here.
`claude/icons-scale-up` stays reference-only and is never PR'd.

## Risks worth knowing

- **Size grows, so layouts can break.** Icons go up 2-8px nearly everywhere. The 320px Playwright
  overflow and tap-target tests run on Home, Workout, History, Progress and Exercise already; read their
  failures as real.
- **The header eyebrow can wrap at 320px.** `ACTIVE SESSION · 52:10 ⚡ SCREEN ON` is the longest string
  on that line. If it wraps, shorten the marker to the bolt alone at <= 340px; do not shrink the text.
- **The four second-tone colours are computed, not picked.** If `tint` at 60% reads muddy at 16px on
  any day, that is a preview finding for the owner, and the fix is one value in `DAY_TONE2`.

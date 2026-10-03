# Icon design system — role-based scale, normalized assets, colored nav, timer-bar relayout

**Issue:** #229 · **Date:** 2026-09-28 · **Status:** spec, awaiting live-preview sign-off

## Why

Owner, 2026-09-28, after #217 and #228 each bumped a few icons: icons still look small "in
general... pretty much all", and per-item fixes are the wrong approach: "plan a proper design
system and apply, get professional ux UI engineer review". Two independent audits (UI-expert and
UX-expert, adjudicated against source; summary on #229) traced "small" to four causes:

1. **No icon tokens.** `theme.js` has `colors`/`type`/`space`/`radius` but nothing for icons. About 55
   call sites hard-code `size={N}` from 10 to 24px, with no rule tying size to role. Every fix so
   far renumbered call sites, which is why "small" kept coming back.
2. **PNG icons paint smaller than their `size`.** The header mark (108×64) letterboxed into a 16px
   square paints ~9.5px tall. progress.png's bars fill ~40% of their canvas, and clock.png's dial
   sits in the left half of its canvas. `IconDayUpper` needs a paint-only `scale()` hack to match
   `IconDayLower`.
3. **Glyphs undersized for their containers.** Nav icons are 22px in 48px tabs, and timer ±/pause
   glyphs are 14px in 44px buttons.
4. **Timer-bar tap targets shrink below the app's own 44px floor** on most phones: `.btn-icon` and
   `.timer-pill` narrow to 38px at ≤440px and to 34px at ≤340px (`index.css:217-233`).

## Decisions already made (DECISIONS.md 2026-09-28)

- Tokens, not per-item numbers.
- **Nav: all three tabs colored.** Colour is the state signal: the active tab is full-colour and
  inactive tabs are greyscale. Drawn as two-tone SVGs, with Progress keeping the owner's preferred
  bar-chart-with-arrow shape. Never opacity-dim a multi-hue asset (the weakest state cue, per the
  UX audit).
- **Timer bar in scope, with a relayout** to restore 44px at every width.
- **Sign-off by live preview** before shipping.

## Scope

**In:** an `icon` token scale and migrating every call site onto it; normalizing every PNG icon;
three new colored nav icons; timer-bar relayout; guard tests.

**Out:**
- Redrawing the rest of the glyph set. The #212 flat-fill style stays.
- A type-scale overhaul. `theme.js`'s own comment records that the review explicitly rejected
  that.
- A component library or icon font.
- New dependencies. The owner's standing constraint is "efficient, not overengineered".

## 1. The scale

Add to `frontend/src/lib/theme.js`, same flat shape as `space`/`radius`:

```js
export const icon = {
  caption: 16, // inline with Eyebrow/caption text (type.size.xs–sm)
  body:    20, // inline with body copy (type.size.base–body)
  control: 22, // glyph inside a 44px .btn-icon / .tap-target
  heading: 24, // inline before a title/strong heading (DayIcon in <h1>)
  nav:     26, // bottom-nav tabs, paired with their Eyebrow label
  header:  28, // TopBar app mark (height; the mark is wide)
}
```

**Rules**

- **Inline icons are sized to the paired text's line-height, not its font-size.** A glyph sized to
  font-size reads shorter than the cap height beside it, which is the "icons look small" effect.
- **Role decides the token; the old number does not.** Migration assigns each call site by what it
  sits next to, per the table in §5. It never renumbers.
- **Values are provisional until the live preview.** The owner signs off the px numbers there, and
  changing one later is a one-line edit.
- **No `hero` token.** Nothing uses one today, so none is added.

## 2. One contract for PNG icons

Every PNG source is re-exported onto a **square canvas, content filling ~84% of it, centred**. That
mirrors an SVG in a 24×24 viewBox with ~2px of padding. Then `size` means the same thing for every
icon, SVG or PNG: a `size × size` box, fully used.

- Crop each source to its visible pixels. Measure the bounds with alpha > 40, excluding the stray
  1px `#2c2c2c` border lines some sources carry. Then pad onto the square.
- A shared `PngIcon({ src, size, opacity, style, ...props })` in `icons/` renders
  `<img width=size height=size>`. Each PNG icon file becomes a two-line wrapper around it.
- Delete the `ASPECT` constants and the `transform: scale()` hack in `IconDayUpper`.
- **Exception: the header mark.** It's a wide wordmark-style glyph. `IconBarbell` is sized by
  **height** (`height = size`, width by aspect) and is the only icon allowed to be non-square.
- Assets: `appmark`, `clock`, `clipboard`, `upperbody`, `lowerbody`. `progress.png` is not
  restored, because the nav icons become SVG (§3).

## 3. Colored nav icons

Three new components: `icons/IconNavHome.jsx`, `IconNavProgress.jsx` (a bar chart with a rising
arrow, redrawn from the old progress.png's shape) and `IconNavHistory.jsx`. Each takes
`{ size, active }` and draws two tones:

| | primary tone | secondary tone |
|---|---|---|
| active | `colors.accent` | `colors.success` (or a darker accent step, picked at preview) |
| inactive | `colors.muted` | `colors.border`-ish grey step |

Rules:
- Bold solid shapes, with no fine low-opacity details. That failure mode is on record twice
  (#211/#213, #228's invisible list lines).
- The tones are **token references, not hex literals**, so theme changes carry through.
- `NavBar.jsx` passes `active` and drops its `opacity` path. `IconHome` stays exported because it's
  used elsewhere. `IconArrowTrendingUp` stays for Progress's in-page trend line.

## 4. Timer-bar relayout

**Target:** every timer control is at least 44×44 at 320, 360, 390 and 440px widths, with no
horizontal overflow, and the rest clock stays readable.

**Space budget:** at 360px the row holds session clock, wake chip, −30, rest clock, +30, pause and
skip. Reclaim width in this order, stopping when it fits:
1. The wake chip becomes icon-only at ≤440px. Its text is already hidden there; the chip padding
   goes too.
2. The ±30 buttons show glyph + "30" at `icon.caption`, not `control`. Their text already carries
   the meaning.
3. Gaps tighten from 8/6 to 6/4 at ≤440px.
4. At ≤340px, the session clock moves above the row. It's secondary information mid-set.

Measure the result in the browser at each width; don't compute it on paper. `Workout.jsx`'s
`EXTRA_BOTTOM_CLEARANCE_FOR_TIMER_BAR` comment records the measured heights, and changing the bar's
height means re-measuring and updating that value and `--navbar-height` together.

**Do not touch:** the auto-repeat steppers (`NumControl`, `HOLD_*_MS`), the two-tap armed delete,
and the `.tap-target::after` hit-zone pattern. The UX audit flagged all three as working well.

## 5. Call-site mapping (migration)

| Role | Token | Sites (today's number) |
|---|---|---|
| In-caption / meta row | `caption` | History meta check/clock/trophy (12), VersionBadge refresh/warning (12), PB "+ Add" plus (10), Workout plus-in-chip (12) |
| Inline with body / button text | `body` | Form cues, Add note, Progress PR trophy/trend, PBs trophy, back arrows, ResumeBanner actions, Finish Workout check, TimerBar session clock |
| Icon-only control glyph | `control` | SetRow delete/confirm (18), modal close (18), steppers ± (16), TimerBar pause/play |
| Before a heading | `heading` | DayIcon in Home/Workout `<h1>` and History rows |
| Nav | `nav` | NavBar |
| App mark | `header` | TopBar `IconBarbell` |

The implementer verifies each row against the rendered screen. The table sets intent; it isn't a
claim about every line.

## 6. Guards (acceptance tests)

1. **`icons/icon-scale.test.js`** scans `src/**/*.jsx`, excluding `icons/` and `*.test.jsx`, and
   fails on any `size={<digit>`, so call sites must use `icon.<role>`. Same style as
   `theme.test.js`'s CSS-parity check, with no ESLint dependency.
2. **PNG contract test:** every PNG icon except `IconBarbell` renders `width === height === size`
   with no `transform`. `IconBarbell` renders `height === size`.
3. **Asset test:** each PNG in `assets/icons/` is square, except appmark. Read the dimensions via
   the Vite import or a tiny header parse.
4. **Nav state test** (`NavBar.test.jsx`): the active tab's icon uses the accent token and inactive
   tabs use the muted token. No `opacity` style on any nav icon.
5. **Playwright** (`e2e/responsive.spec.js`): at 320, 360, 390 and 440px, every
   `.timer-bar button` bounding box is ≥44×44 and `.timer-bar`'s `scrollWidth <= clientWidth`.

## 7. Implementation order

Each step ends green.
1. Add the `icon` tokens plus guard test 1, which fails red. Migrate call sites per §5, which turns
   it green.
2. Add `PngIcon` and normalize the assets. Guard tests 2 and 3 go red, then green. Remove the
   `ASPECT`/`scale()` hacks.
3. Add the three nav SVGs and `NavBar` wiring (guard test 4).
4. Timer-bar relayout (guard test 5), measured live at 4 widths. Update the clearance constants.
5. **Preview:** run the branch locally and capture before/after screenshots of Home, active
   Workout, History, Progress, PBs and Exercise at 390px, plus the timer bar at 320px. Publish them
   as one private before/after page for the owner, who can review from a phone.
6. After owner sign-off (and any tweaks to token values), PR, CI, merge, deploy, then verify on
   production.

## 8. Review gates

UI-expert and UX-expert passes on the **preview screenshots** (PLAYBOOK step 5), with each finding
adjudicated against source. Owner sign-off on the preview is the final gate, per DECISIONS
2026-09-28.

## 9. Reference

`claude/icons-scale-up` (29471aa) is the rejected per-item branch. It's useful only for the
measured crop boxes: progress (66,35)-(129,110) in 164×114, clock (6,25)-(82,101) in 159×104. It
also shows that a height-sized PNG beside a square SVG needs the §2 contract, not an aspect
constant.

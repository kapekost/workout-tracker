# Design tokens: mechanism, token set, and migration

**Date:** 2026-08-23
**Status:** Proposed, not yet shipped.
**Research:** [`../research/2026-08-17-design-system-inventory.md`](../research/2026-08-17-design-system-inventory.md)
**Execution record:** [`../plans/2026-08-23-design-tokens.md`](../plans/2026-08-23-design-tokens.md)

---

## Problem

The inventory found the token layer in `index.css` is 92% bypassed: seven
custom properties exist (`--bg --card --border --mint --amber --muted
--muted-2`), referenced via `var()` 10 times and hardcoded as raw literals
118 times, with zero `.jsx` files ever using `var()` in an inline style
(inventory §1.2). This isn't a new problem, it predates this session. But
this session's own reactive UX-fix pass both demonstrated and slightly
worsened it: three new files (`ExerciseCuesModal.jsx`, `ExerciseDetails.jsx`,
plus edits across `Workout.jsx`, `TimerBar.jsx`) added more hardcoded hex
literals, because no reachable token existed to reach for instead.

## Scope

**In:** a token mechanism that inline `style={{}}` objects can actually
consume; a color/type/weight/spacing token set grounded in the inventory's
counts, not invented from scratch; migrating all 14 files the inventory
found using hardcoded literals; the `DAY_COLORS` fallback inconsistency
(inventory I12); the `Workout.jsx` bodyweight-label ternary code smell found
this session; regression tests for this session's UI behavior that currently
has none.

**Out, found and evidenced, but not fixed here:**
- **Tailwind lean-in-or-remove** (inventory §5, item 2 of §7). Orthogonal to
  token transport. Removing it needs a replacement reset in the same commit,
  since preflight's `border-box`/margin-reset is load-bearing app-wide.
- **The 8 hand-rolled component patterns** (inventory §3.2, item 9 of §7):
  eyebrow label (16 sites), toast state machine (hand-rolled 5 times despite
  a shared `.toast` class), pill/chip (3 variants), empty state (3 variants),
  day-accent indicator (3 shapes), disclosure row (2 byte-identical copies),
  the number-input double-styling conflict (I1), stat pair. Well-evidenced
  and clearly a follow-on, but a structural refactor (extract shared
  components) is a different kind of change than a token migration (swap
  literal values), and doing both at once would blur "did this change
  behavior" review.
- **`.card`'s padding** (8 variants at 14 sites, item 8 of §7): related to
  spacing tokens but a separate decision.
- **The five dimensional/layout bugs the inventory also found** (I13-I17:
  the content column vs. `.timer-bar` max-width mismatch, doubled bottom
  padding on `Workout.jsx`, the `.toast` max-width's uncommented coupling to
  `px-4`, `.timer-bar`'s hardcoded guess at `NavBar`'s real height, and
  inconsistent safe-area handling). These are real defects, but they're
  layout logic bugs, not color/type/spacing value inconsistencies. A token
  migration doesn't touch them and shouldn't be read as having fixed them.
  Flagged here so they aren't lost.
- **Adaptive coaching / AI-in-the-loop programming** (the other backlog item
  captured this session): unrelated, explicitly deferred by the user.

---

## 1. Mechanism: `frontend/src/lib/theme.js`, not `var(--x)` in inline styles

A new JS constants module, imported directly into `style={{}}` objects.
`index.css`'s existing `:root` custom properties are untouched. They
correctly serve the 9 already-adopted CSS classes (`.card`, `.btn-primary`,
`.btn-secondary`, `.btn-icon`, `.tap-target`, `.toast`, the `.timer-bar`
family, `.skeleton`, `input[type="number"]`), and nothing about this decision
requires touching that layer.

**The deciding evidence:** `Progress.jsx:120-125` passes raw numbers and
objects into `recharts`, not CSS: `<YAxis ... width={42} />`, `tick={{ fill:
'#6b7280', fontSize: 11 }}`, `<Line ... strokeWidth={2.5} dot={{ r: 4 }} />`.
`width={42}` is consumed by `recharts`' internal SVG layout arithmetic. The
string `"var(--muted-2)"` there is not a style resolution, it's a broken
number. A CSS variable cannot reach this call site; a JS module reaches it
identically to every other one. Once a JS module is needed for these props
regardless, splitting styling across two parallel systems (CSS vars for
`style` props, JS constants for library props) is strictly worse than using
one module everywhere.

Supporting reasons:
- **The codebase already has this instinct, just inconsistently applied.**
  `PersonalBests.jsx:9-16` already hoists `labelStyle`/`fieldStyle` objects
  to module scope and spreads them into inline styles. `theme.js`
  generalizes that into one shared, imported source.
- **Failure mode.** A typo'd `var(--mnit)` silently resolves to the
  property's initial/inherited value, invisible until someone notices
  oddly-colored text. A typo'd `colors.mnit` is `undefined`, caught at
  build/review time.
- **Matches this repo's test culture.** `theme.test.js` can assert plain
  values (`expect(colors.mint).toBe('#6ee7b7')`) in the existing Vitest
  style; testing a CSS custom property resolved correctly needs JSDOM
  computed-style machinery this repo doesn't otherwise use.

`theme.js`'s 7 carried-over token values are asserted equal to `index.css`'s
`:root` values in `theme.test.js`, so the two layers can't silently drift.

**One small, scoped `index.css` change lands in the same commit.** Add
`--danger: #ef4444` to `:root` and point `.toast.error` at it
(`index.css:125`), closing inventory I7's "danger untokenised" finding for
the one place danger is expressed as a CSS class. The rest of `index.css`'s
own internal inconsistencies (I2, I3, the skeleton gradient stops, the
`.timer-bar` breakpoint colors) are left alone. Lower value, and some are
entangled with the protected 320px/44px floor (see Guardrails).

## 2. Token set

Grounded in the inventory's exact counts (§1.1-§1.4, §2.1-§2.5), not
re-derived.

### 2.1 Color: three tiers

**Tier 1, direct carry-over, values unchanged:**

| Token | Value | Source |
|---|---|---|
| `bg` | `#0a0a12` | `--bg` |
| `card` | `#111120` | `--card` |
| `border` | `#1e1e32` | `--border` |
| `mint` | `#6ee7b7` | `--mint` |
| `amber` | `#fbbf24` | `--amber` |
| `muted` | `#9ca3af` | `--muted` |
| `muted2` | `#6b7280` | `--muted-2` |
| `text` | `#fff` | new name for the 10 un-tokenized uses |
| `danger` | `#ef4444` | new, closes I7 (5 uses, previously untokenized) |

**Tier 2, deliberate near-duplicate merges.** Each is a real, small
rendered-pixel change (not a pure refactor), flagged for a visual check
during implementation:

| Token | Value | Absorbs | Inventory item |
|---|---|---|---|
| `textSecondary` | `#e2e8f0` | `#e5e7eb` (`MuscleGroupPicker.jsx:128`, 1 use) | I4 |
| `surface1` | `#14142a` | `#15152a` (`MuscleGroupPicker.jsx:83`, 1 use apart) | I3 |
| `divider` | `#1e1e32` (= `border`) | `#1a1a2e` (`History.jsx:43`, 1 use) | I2 |
| `mintWash` | `rgba(110, 231, 183, 0.14)` | `#6ee7b71a` (~10% alpha, `Progress.jsx:65`) and the `rgb()`/decimal-triple notations in `MuscleGroupPicker.jsx:21-22,27,32` | I5, I6 |
| `dangerBg` | `#2a1a1a` | promotes `History.jsx:59`'s existing one-off to a named token | (none) |

`mintWash`'s alpha is `0.14`, not `0.10`, so `Progress.jsx`'s selected-chip
tint moves from about 10% to 14% opacity. Chose `MuscleGroupPicker`'s value
as the survivor since it's the newer, more deliberately-designed component
(built for the 2026-08-16 recovery spec). This is the largest visible delta
in the whole token table. Verify it in a browser during implementation.

**Tier 3, explicitly deferred, stay as local literals:** the skeleton
gradient stops and `#1a1a2e`'s CSS-internal sibling uses, `#23233a`/
`#2a2a3e`/`#2a2a42` (three more surface one-offs without the same clear
"accidental duplicate" evidence as the `surface1` pair), `#234d34`
(timer-flash keyframe, animation-specific, not a UI-role color), `#4b5563`
(2 uses, "faintest text", a judgment call between a 4th grey tier or folding
into `muted2`, left as a local literal rather than inventing a tier for 2
call sites). Not every hex needs to become a token. Forcing one-offs into
names is itself the "naive snap-to-scale" risk the inventory's §6 warns
about.

### 2.2 `DAY_COLORS` stays outside the token set

`DAY_COLORS` (`workoutPlan.js:327-332`) is a categorical palette
distinguishing four *plan days*, not a UI-chrome role: a content/domain
concept, not "muted text" or "danger." It stays co-located with `PLAN` in
`workoutPlan.js` (matching the existing precedent of colocating domain data,
e.g. `ALL_EXERCISES`), and only its *consumption sites'* other styling
(padding, radius, weight around the swatch) migrates to `theme.js`. It
happens to reuse `mint`'s exact value for `upper_a` (inventory §1.5); nothing
in the code links the two, and this spec doesn't assert whether that's
deliberate or accidental, an open question left open, not resolved by fiat.

**Its fallback is fixed as its own small, semantic commit** (I12): 3 of 5
consumption sites already use `muted` for "no day selected" (`Home.jsx`,
`ResumeBanner.jsx`, `MuscleGroupPicker.jsx`), 2 use `mint`
(`Exercise.jsx`/`ExerciseDetails.jsx`, `History.jsx`). Majority precedent
wins, and semantically "no day" should read neutral, not like an active
selection: `DAY_COLOR_FALLBACK = colors.muted`, all 5 sites point at it.
Sequenced after all 5 consuming files are already migrated, so this lands as
a small, clean diff, not tangled into the literal-swap noise.

### 2.3 Type

| Token | Value | Absorbs |
|---|---|---|
| `type.size.xs` | `0.65rem` | `0.6rem`, `0.68rem`: the smallest eyebrow-label instances |
| `type.size.sm` | `0.7rem` | `0.72rem` |
| `type.size.base` | `0.75rem` | `0.78rem` |
| `type.size.md` | `0.8rem` | already the single most-used value app-wide (19 uses), no absorption needed |
| `type.size.lg` | `0.875rem` | `0.85rem`: the "subtitle under an h1" role (I9's size half) |
| `type.size.title` | `1.75rem` | the single page `<h1>` size, closing I8's 3-way split: `Home.jsx` moves `2rem` to `1.75rem`, `Workout.jsx` moves `1.6rem` to `1.75rem` |
| `type.size.display` | `2rem` | big stat numbers (`ExerciseDetails.jsx`'s sets/reps target), kept as a distinct token from `title` despite the coinciding value, because it's a different role |

**Explicitly not touched:** `.rest-clock`/`.rest-label`'s responsive
breakpoint tiers in `index.css` (protected, see Guardrails) and `recharts`'
raw `fontSize: 11` (a different unit system entirely).

`type.weight`: `regular: 400, semibold: 600, bold: 700`. Closes the lone
`fontWeight: 500` at `Workout.jsx:424` (muscle chip), promoting it to `600`
to match `ExerciseDetails.jsx`'s `600` for what the inventory (I10) confirms
is the same chip rendered on two screens.

`type.labelTracking: '0.08em'`: the dominant value across 12 sites, absorbs
the `0.1em`/`0.05em`/`0.01em` outliers (I11). `NavBar.jsx` and `TopBar.jsx`
are the two sites where this is a visible, not just textual, change.

### 2.4 Spacing: opportunistic, not a dedicated sweep

The inventory's own framing (§2.1, item 7 of §7) is that spacing is
"reasonably disciplined already," a de-facto 4px grid with two entrenched
exceptions (`10`, `14`) and five low-occurrence true outliers (`2, 3, 5, 6,
7`). A `space` export lands in `theme.js`, but gets applied only where a file
is already being touched for color/type reasons, not as a separate sweep
whose only goal is renumbering spacing.

```
space.xs=4  space.sm=8  space.smd=10  space.md=12  space.lg=14  space.xl=16  space.xxl=20  space.xxxl=24
```

Both `10` and `14` survive as named steps rather than being forced onto the
4px grid; both are genuinely entrenched (`14` is `.btn-primary`'s own
padding in `index.css:56`). `Workout.jsx`'s `rowGap: 14` (the stepper-wrap
fix, see Guardrails) maps cleanly onto `space.lg` with zero semantic change.

`radius` (low priority, included for completeness at near-zero cost since
the inventory calls this "the healthiest axis"): `sm:8, md:12, lg:16,
pill:100, circle:'50%'`.

### 2.5 The bodyweight-ternary fix

Found while migrating `Workout.jsx`'s tokens, not a separate initiative.
Before:

```jsx
<p style={{ color: '#6b7280', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', marginBottom: ex.bodyweight ? 2 : 8 }}>
  {ex.bodyweight ? 'Added Weight (kg)' : 'Weight (kg)'}
</p>
{ex.bodyweight && (
  <p style={{ color: '#6b7280', fontSize: '0.6rem', marginBottom: 6 }}>0 = bodyweight only</p>
)}
```

`marginBottom: ex.bodyweight ? 2 : 8` is a style value branching on the same
condition the JSX structure two lines later already branches on, a patch,
not a clean solution. After: a fixed margin, the hint (when present) owns
its own spacing, and the block is extracted into a small
`WeightFieldLabel({ bodyweight })` subcomponent matching `Workout.jsx`'s
existing convention of page-local subcomponents (`Stat`, `SetRow`,
`NumControl`). Every value in the resulting style objects is a constant;
only the JSX structure (whether the hint renders) branches on `bodyweight`.

## 3. Migration approach

Four risk-ordered chunks, each independently build+test-verified before the
next starts:

1. **Small screen-furniture files** (`App.jsx`, `TimerBar.jsx`,
   `ExerciseCuesModal.jsx`, `TopBar.jsx`, `NavBar.jsx`, `Exercise.jsx`):
   lowest line count, pilots the pattern before touching anything bigger.
2. **Medium files, with `MuscleGroupPicker.jsx` isolated on its own commit**
   rather than bundled with siblings (see Guardrails: its `RecoveryRing` is
   under a different spec's explicit color-ramp constraint):
   `ResumeBanner.jsx` + `ExerciseDetails.jsx` together, `MuscleGroupPicker.jsx`
   alone, `Home.jsx` + `History.jsx` together.
3. **The two large/dense files:** `PersonalBests.jsx` + `Progress.jsx`
   together (watch `Progress.jsx`'s `recharts` numeric props; those stay as
   `theme.js` JS values, never CSS variables, per §1), then `Workout.jsx`
   alone as the final commit, paired with the bodyweight-ternary fix since
   it's touching that exact block anyway.
4. **`DAY_COLORS` fallback unification**, after all 5 consuming files are
   already migrated (§2.2).

Each migration commit is a pure value swap: replace a hardcoded
literal/size/weight with its `theme.js` export, import only what's used, no
other JSX structure changes, except the one deliberate exception (the
bodyweight-ternary fix), which is called out explicitly rather than silently
bundled.

## 4. Regression tests

This session shipped several UI behaviors verified only by hand (throwaway
Playwright scripts, since deleted), with nothing in the permanent suite to
catch a regression. These are **characterization tests**: the behavior
already works correctly, so they're written to pass immediately, locking in
current behavior before the token migration touches the same files. This is
a deliberate departure from this repo's usual strict red-green TDD
convention, stated explicitly in the plan doc rather than silently deviating
from it.

| New test file | Covers |
|---|---|
| `lib/theme.test.js` | Tier-1 token values match `index.css`'s `:root` exactly |
| `components/ExerciseCuesModal.test.jsx` | dialog role/aria-label, Escape/backdrop/close-button all call `onClose`, an inner click does not |
| `components/ExerciseDetails.test.jsx` | demo-image vs. YouTube-fallback branches, `cues_open`/`demo_view` analytics tracking, cues/target rendering |
| `pages/Workout.test.jsx` (extended) | `NumControl` hold-repeat (fake timers: single tap = 1 step, hold = repeated steps, no double-bump on release); bodyweight label text; title/link hierarchy style values |
| `components/TimerBar.test.jsx` | All 4 rest-label states (`READY`/`REST`/`GO`/`PAUSED`) with exact strings, including the idle glyph (an em dash on both sides of the colon, not a hyphen-minus) |

Test-writing tasks for files with no color/size-dependent assertions are
sequenced before that file's token migration (a real safety net); tests that
assert on a token value are sequenced after (see the plan doc).

## Guardrails

1. **Must not alter `RecoveryRing`'s color-ramp semantics.** Bound by
   `2026-08-16-muscle-group-recovery-design.md` §5: single-hue, monotonic in
   lightness, never a percentage, never red/amber/green. A mechanical token
   swap that collapses gradient stops onto two named tokens risks breaking
   monotonicity. This is why `MuscleGroupPicker.jsx` gets its own isolated,
   manually-verified migration commit rather than being bundled with
   siblings.
2. **Must not touch the protected 320px/44px-floor magic numbers** named in
   inventory §6: the three `.timer-bar` responsive tiers, the sub-4px-grid
   compact spacing inside those breakpoints, the stepper `flexWrap`+`rowGap`
   fix, the input's `72px` width, `.tap-target`'s `::after` hit-area hack,
   and the `Progress.jsx` chart-gutter padding hack. These are load-bearing
   for a fix the 2026-06-30 responsive sweep already made. A token migration
   that "cleans up" any of them is a regression, not tidiness.
3. **Must not change any behavior in the 7 UX fixes already shipped this
   session.** This work is a literal/value swap on top of them, never a
   logic change (the one stated exception is the bodyweight-ternary
   structural fix, §2.5).
4. **Must not silently absorb every one-off into a named token.** Tier 3
   (§2.1) exists on purpose.

## Testing

TDD-adjacent per §4 above (characterization tests pass immediately; only the
`Workout.jsx` bodyweight-ternary fix gets a real red-green cycle since it's
an actual code change). `cd frontend && npm run build && npm test` must be
green after every task, not just at the end. A broken `theme.js` import or a
typo'd export name is a build-time failure distinct from a test failure, and
several of these files depend on `theme.js` existing correctly.

## References

- [`../research/2026-08-17-design-system-inventory.md`](../research/2026-08-17-design-system-inventory.md): the evidence base for every count and file:line citation above
- [`../specs/2026-08-16-muscle-group-recovery-design.md`](2026-08-16-muscle-group-recovery-design.md): the `RecoveryRing` color-ramp constraint (Guardrail 1)
- [`../audits/2026-06-30-responsive-catalog.md`](../audits/2026-06-30-responsive-catalog.md): the 44px/320px floor fixes (Guardrail 2)

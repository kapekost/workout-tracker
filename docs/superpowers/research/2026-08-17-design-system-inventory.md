# Design-system inventory — factual audit

**Date:** 2026-08-17
**Scope:** `frontend/src/**` (read-only; no application code, CSS, or config was modified)
**Purpose:** the factual base for a *design-system* decision (tokens, spacing, type
scale, component vocabulary) that can be adopted incrementally. Not a redesign,
not a proposed palette.

---

## Summary

1. **Seven design tokens exist and are almost entirely bypassed.** `index.css:24-32`
   defines `--bg --card --border --mint --amber --muted --muted-2`. Across the
   whole codebase those seven values are referenced via `var()` **10 times** and
   written as a hardcoded literal **118 times** — 92% bypass. **Zero `.jsx` files
   reference any custom property**; every `var()` use is inside `index.css` itself.
   `--muted-2` (`index.css:31`) has **zero** references anywhere.

2. **24 distinct hex colours, 12 of which appear exactly once**, plus 2 `rgb()/rgba()`
   string literals and 2 decimal RGB triples. The accent `#6ee7b7` alone is written
   four different ways: hex (`index.css:28`), a second hex-with-alpha
   (`#6ee7b71a`, `Progress.jsx:65`), an `rgba()` string
   (`MuscleGroupPicker.jsx:32`), and a decimal triple (`MuscleGroupPicker.jsx:22`).

3. **23 distinct font sizes for 6 screens**, with **12 of them crammed into the
   0.60–0.95rem band** (0.6, 0.65, 0.68, 0.7, 0.72, 0.75, 0.78, 0.8, 0.85, 0.875,
   0.9, 0.95) — a 5.6px range carrying twelve steps. Spacing is a de-facto 4px
   grid with two established exceptions (10, 14) and five true outliers (2, 3, 5,
   6, 7). Radius is a tight 4/8/10/12/16/pill ladder — the healthiest axis.

4. **Tailwind ships 7.6KB to deliver four utility classes.** Only `max-w-md`,
   `mx-auto`, `pb-24`, `px-4` are used, at three call sites. 68% of the built CSS
   (7656 of 11211 bytes, `frontend/dist/assets/index-DiUEQJ0r.css`) is preflight +
   utility scaffolding. **But preflight is load-bearing** — it supplies the global
   `box-sizing: border-box` and the `margin: 0` reset on `p`/`h1`-`h6` that every
   inline-styled element in the app silently assumes.

5. **The ≥44px / 320px floor has exactly one automated guard**
   (`MuscleGroupPicker.test.jsx:166-167`) and no CI. Everything else that the
   2026-06-30 audit fixed is protected only by hand-tuned magic numbers — three
   `.timer-bar` breakpoint tiers (`index.css:147-169`), a `flex-wrap` +
   `rowGap` (`Workout.jsx:403`), and an `::after` hit-area hack
   (`index.css:92-100`) — all of which a naive "snap everything to the scale"
   pass would erase.

---

## 1. Colour

### 1.1 Distinct values

**24 distinct hex literals** across `frontend/src/**` (test files excluded).
Counts are total occurrences, including the `:root` definition line where one exists.

| Value | Uses | Token? | Role |
|---|---|---|---|
| `#9ca3af` | 41 | `--muted` (`index.css:30`) | primary muted text |
| `#6b7280` | 29 | `--muted-2` (`index.css:31`) | dimmer muted text |
| `#1e1e32` | 22 | `--border` (`index.css:27`) | border + input/chip surface |
| `#6ee7b7` | 19 | `--mint` (`index.css:28`) | accent |
| `#fff` | 10 | — | primary text |
| `#ef4444` | 5 | — | danger |
| `#e2e8f0` | 5 | — | secondary body text |
| `#111120` | 5 | `--card` (`index.css:26`) | card surface |
| `#0a0a12` | 5 | `--bg` (`index.css:25`) | page background |
| `#fbbf24` | 4 | `--amber` (`index.css:29`) | PR / highlight |
| `#1a1a2e` | 3 | — | skeleton base + one divider |
| `#4b5563` | 2 | — | faintest text |

**Appearing exactly once (12):** `#fb923c` (`workoutPlan.js:331`), `#f472b6`
(`workoutPlan.js:330`), `#60a5fa` (`workoutPlan.js:329`), `#e5e7eb`
(`MuscleGroupPicker.jsx:128`), `#6ee7b71a` (`Progress.jsx:65`), `#2a2a42`
(`index.css:88`), `#2a2a3e` (`Workout.jsx:342`), `#2a1a1a` (`History.jsx:59`),
`#234d34` (`index.css:139`), `#23233a` (`index.css:176`), `#15152a`
(`MuscleGroupPicker.jsx:83`), `#14142a` (`index.css:135`).

**Non-hex colour expressions (4):**
- `rgb(42, 42, 62)` — `MuscleGroupPicker.jsx:27`
- `rgba(110, 231, 183, 0.14)` — `MuscleGroupPicker.jsx:32`
- `[45, 95, 80]` — `MuscleGroupPicker.jsx:21`
- `[110, 231, 183]` — `MuscleGroupPicker.jsx:22` (this **is** `#6ee7b7`)

### 1.2 Token adherence

| Token | Value | `var()` uses | Hardcoded uses |
|---|---|---|---|
| `--bg` | `#0a0a12` | 1 — `index.css:37` | 4 — `index.css:53`, `index.css:120`, `App.jsx:18`, `TopBar.jsx:18` |
| `--card` | `#111120` | 1 — `index.css:46` | 4 — `NavBar.jsx:17`, `ResumeBanner.jsx:22`, `Progress.jsx:12`, `Progress.jsx:65` |
| `--border` | `#1e1e32` | 4 — `index.css:47,66,78,103` | 21 — incl. `index.css:135`, `Workout.jsx:17,28,54,352,366,423`, `Exercise.jsx:59,93,115,125`, `Progress.jsx:12,64,108`, `Home.jsx:130`, `History.jsx:156`, `NavBar.jsx:17`, `TopBar.jsx:18`, `ResumeBanner.jsx:22` (×2), `MuscleGroupPicker.jsx:84` |
| `--mint` | `#6ee7b7` | 2 — `index.css:52,142` | 18 + 3 alternate notations |
| `--amber` | `#fbbf24` | 1 — `index.css:120` | 3 — `Workout.jsx:154`, `Progress.jsx:82`, `History.jsx:48` |
| `--muted` | `#9ca3af` | 1 — `index.css:141` | 40 |
| `--muted-2` | `#6b7280` | **0** | 28 |
| **Total** | | **10** | **118** |

The token layer is effectively decorative. The structural reason is transport:
the app styles almost everything with inline `style={{}}`, and no `.jsx` file
uses `var(--x)` in an inline style — so a CSS custom property is unreachable
from where 90% of the styling actually lives.

### 1.3 The grey ramp is six values with a near-duplicate pair

`#fff` → `#e5e7eb` (1 use) → `#e2e8f0` (5 uses) → `#9ca3af` → `#6b7280` → `#4b5563`.

`#e5e7eb` (`MuscleGroupPicker.jsx:128`) and `#e2e8f0` (`index.css:67`,
`ResumeBanner.jsx:32`, `Exercise.jsx:98`, `History.jsx:48`, `Workout.jsx:366`)
are visually indistinguishable and fill the same role ("body text one step below
white"). `#4b5563` (`Home.jsx:34`, `MuscleGroupPicker.jsx:153`) is a third tier
of muted with no token at all.

### 1.4 The surface ramp is eleven values

`#0a0a12` → `#111120` → `#14142a` → `#15152a` → `#1a1a2e` → `#1e1e32` →
`#23233a` → `#2a2a3e` → `#2a2a42` → plus tinted one-offs `#234d34` (timer flash,
`index.css:139`) and `#2a1a1a` (danger border, `History.jsx:59`).

Three of these are within 4 units of a neighbour and read as unintentional:
`#14142a` (`index.css:135`, timer bar) vs `#15152a`
(`MuscleGroupPicker.jsx:83`, expanded chip) — two different "one step above
card" surfaces, 1 unit apart. `#2a2a3e` (`Workout.jsx:342`, unfilled set dot) vs
`#2a2a42` (`index.css:88`, `.btn-icon:active`) — 4 units apart, same role
family. `rgb(42, 42, 62)` (`MuscleGroupPicker.jsx:27`) **is** `#2a2a3e`
expressed in decimal.

### 1.5 Day accent colours live in a data file

`DAY_COLORS` (`workoutPlan.js:327-332`) maps four plan days to `#6ee7b7`,
`#60a5fa`, `#f472b6`, `#fb923c`. This is a real semantic palette living outside
both `index.css` and any component. `#6ee7b7` is duplicated between
`workoutPlan.js:328` and `--mint` (`index.css:28`) with no link between them.

The fallback when a day has no colour is inconsistent: `#9ca3af`
(`Home.jsx:75`, `ResumeBanner.jsx:18`, `MuscleGroupPicker.jsx:144`) in three
places, `#6ee7b7` (`Exercise.jsx:12`, `History.jsx:132`) in two.

---

## 2. Spacing, type, weight, radius

### 2.1 Spacing — de-facto 4px grid with two settled exceptions and five outliers

**18 distinct values** across JSX and CSS: `0, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14,
16, 18, 20, 24, 28, 32, 96`.

- **On a 4px grid (carries the bulk of usage):** 0, 4, 8, 12, 16, 20, 24, 28, 32, 96
- **Off-grid but well-established** — these are de-facto scale members:
  - `10` — `marginBottom: 10` ×6, `gap: 10` ×3, `padding: '10px 0'`
    (`Home.jsx:129`), `'8px 10px'` (`MuscleGroupPicker.jsx:82`), `'3px 10px'`
    (`Workout.jsx:423`), `.timer-bar` `padding: 10px 16px` (`index.css:134`),
    `.btn-secondary` `padding: 10px 18px` (`index.css:69`)
  - `14` — `padding: '14px 16px'` ×3 (`Workout.jsx:317`, `History.jsx:138`,
    `History.jsx:156`), `marginBottom: 14` ×4, `marginTop: 14`
    (`Workout.jsx:400`), `rowGap: 14` (`Workout.jsx:403`), `.btn-primary`
    `padding: 14px 28px` (`index.css:56`)
- **True outliers (candidates to snap):**
  - `2` — `marginTop: 2` ×6, `paddingTop: 2` (`Exercise.jsx:95`)
  - `3` — `gap: 3` (`NavBar.jsx:29`), `padding: '3px 10px'` (`Workout.jsx:423`)
  - `5` — `padding: '5px 14px'` (`Exercise.jsx:60`), `'5px 0'` (`History.jsx:43`)
  - `6` — `padding: '6px 0'` (`Workout.jsx:17`), `gap: 6` (`Workout.jsx:420`,
    `index.css:155`), `marginTop: 6` ×3, `marginBottom: 6` (`History.jsx:39`)
  - `7` — `padding: '7px 14px'` (`Progress.jsx:62`)
  - `18` — `.btn-secondary` `padding: 10px 18px` (`index.css:69`), only use

`.card` (`index.css:45-49`) defines **no padding**, so every call site supplies
its own. **Eight distinct card paddings across 14 call sites:**

| Padding | Sites |
|---|---|
| `20` | `Home.jsx:122`, `Workout.jsx:144`, `Exercise.jsx:67`, `Exercise.jsx:84` |
| `16` | `Home.jsx:169`, `MuscleGroupPicker.jsx:126` |
| `32` | `Progress.jsx:50`, `History.jsx:126` |
| `24` | `Home.jsx:181` |
| `12` | `Exercise.jsx:106` |
| `'14px 16px'` | `Workout.jsx:317`, `History.jsx:138` (inner rows) |
| `'16px 20px'` | `Progress.jsx:79` |
| `'20px 8px 12px 0'` | `Progress.jsx:95` (recharts gutter hack) |
| *(none)* | `Workout.jsx:315`, `History.jsx:137` (container-only cards) |

### 2.2 Font size — 23 distinct rem values (+ 1 px value)

`0.6, 0.65, 0.68, 0.7, 0.72, 0.75, 0.78, 0.8, 0.85, 0.875, 0.9, 0.95, 1, 1.1,
1.2, 1.25, 1.35, 1.4, 1.5, 1.6, 1.75, 2, 2.2` — plus `fontSize: 11` (px) for
recharts ticks (`Progress.jsx:109`, `Progress.jsx:110`).

Usage weight (JSX inline): `0.8rem` ×19, `0.75rem` ×13, `0.7rem` ×10,
`0.65rem` ×10, `0.875rem` ×7, then a long tail of 1–5.

**The small-text band is the problem.** Twelve steps between 0.60rem and
0.95rem, several of which are indistinguishable and role-identical:

- `0.875rem` vs `0.85rem` — both "secondary line under a heading":
  `Home.jsx:114` / `Exercise.jsx:53` / `Progress.jsx:47` / `History.jsx:121`
  use `0.875rem`; `Workout.jsx:18` / `History.jsx:27` / `History.jsx:34` /
  `History.jsx:47` use `0.85rem`.
- `0.8rem` vs `0.78rem` — `Workout.jsx:381` vs `Workout.jsx:368`,
  `History.jsx:39` vs `History.jsx:45`.
- `0.7rem` / `0.72rem` / `0.68rem` / `0.65rem` — four sizes for the uppercase
  eyebrow label (see §3.2).

**Heading sizes are three values for one role:** `2rem` (`Home.jsx:111`),
`1.75rem` (`Progress.jsx:46`, `History.jsx:120`, `Exercise.jsx:52`), `1.6rem`
(`Workout.jsx:143`, `Workout.jsx:300`). All are the page `<h1>`.

**Big-number display sizes:** `2.2rem` (`.rest-clock`, `index.css:146`), `2rem`
(`Exercise.jsx:73`, `Exercise.jsx:77`), `1.75rem` (`Progress.jsx:82`,
`Progress.jsx:88`), `1.5rem`/`1.35rem` (`.rest-clock` compact tiers,
`index.css:165`, `index.css:166`).

### 2.3 Font weight — clean; three values, one outlier

| Weight | JSX | CSS | Notes |
|---|---|---|---|
| 700 | 35 | 5 | dominant |
| 600 | 14 | 2 | secondary |
| 500 | 1 | 0 | **single use** — `Workout.jsx:424` (muscle chip) |
| 400 | implicit | — | body default |

The variable font is declared `font-weight: 400 700` (`index.css:10`,
`index.css:18`), so 500 is renderable — but as a single-use value it is noise.
Note `Workout.jsx:424` (weight 500) and `Exercise.jsx:61` (weight 600) style the
*same* muscle-name chip differently.

### 2.4 Border radius — the healthiest axis

| Value | Sites |
|---|---|
| `4` | `History.jsx:141` (day accent bar) |
| `8` | `index.css:80` (`.btn-icon`), `index.css:107` (number input), `Skeleton.jsx:2`, `Workout.jsx:54`, `Workout.jsx:366`, `Progress.jsx:12`, `History.jsx:59` |
| `10` | `index.css:71` (`.btn-secondary`), `Exercise.jsx:115` (demo image) |
| `12` | `index.css:57` (`.btn-primary`), `MuscleGroupPicker.jsx:84`, `Exercise.jsx:126` |
| `16` | `index.css:48` (`.card`) — only use |
| `100` / `100px` | `index.css:121` (`.toast`), `Workout.jsx:423`, `Exercise.jsx:60`, `Progress.jsx:62` |
| `50%` | `Workout.jsx:341`, `ResumeBanner.jsx:31` |

Six steps + pill + circle for a 6-screen app is defensible. `10` is the weakest
member (2 uses, both of which would read fine at 8 or 12).

### 2.5 Letter spacing and line height

`0.08em` ×12, `0.1em` ×2 (`Home.jsx:108`, `Workout.jsx:297`) + `index.css:145`,
`0.05em` ×1 (`NavBar.jsx:38`), `0.01em` ×1 (`TopBar.jsx:24`). All four are
applied to the same uppercase-label role.

`lineHeight` is set only 6 times: `1` ×3, `1.1` ×1 (`Home.jsx:111`), `1.5` ×2
(`Exercise.jsx:98`, `MuscleGroupPicker.jsx:153`). Everything else inherits the
browser default — there is no line-height system at all.

---

## 3. Component vocabulary

### 3.1 What exists

**In `frontend/src/components/` (7 files):**

| Component | File | Nature |
|---|---|---|
| `Skeleton` | `Skeleton.jsx:1` | **True primitive** — `height`/`width`/`style` props, one line. Used by `Workout.jsx:135-137`, `History.jsx:111-113`, `Progress.jsx:99`. |
| `TimerBar` | `TimerBar.jsx:19` | Screen furniture. **The only fully class-driven component** — zero colour literals in its layout, all styling in `index.css:131-169`. |
| `NavBar` | `NavBar.jsx:9` | Screen furniture, 100% inline-styled. |
| `TopBar` | `TopBar.jsx:12` | Screen furniture, 100% inline-styled. |
| `ResumeBanner` | `ResumeBanner.jsx:6` | Screen furniture, 100% inline-styled. |
| `RecoveryRing` | `MuscleGroupPicker.jsx:44` | **Reusable meter primitive** — `freshness`/`size` props. Currently used once. |
| `MuscleChip` | `MuscleGroupPicker.jsx:73` | **Reusable chip** — but not exported as a general chip; hard-wired to `group`/`expanded`/`onToggle`. |
| `ScreenTracker` | `ScreenTracker.jsx` | Analytics only, renders nothing. |

**CSS-class "components" in `index.css`:** `.card` (45), `.btn-primary` (51),
`.btn-secondary` (65), `.btn-icon` (77), `.tap-target` (92), `.toast` (118),
`.skeleton` (176), `.font-mono` (43), `input[type="number"]` (102), and the
`.timer-bar` family (131-169).

**Page-local components that never got promoted:** `Stat` (`Workout.jsx:15`),
`SetRow` (`Workout.jsx:24`), `NumControl` (`Workout.jsx:47`), `CustomTooltip`
(`Progress.jsx:9`), `SessionDetail` (`History.jsx:15`), `VersionStamp`
(`Home.jsx:31`), `StartOrResumeButton` (`Home.jsx:40`).

### 3.2 Screens hand-rolling something a component already covers

**a) Number input — a CSS rule and an inline style fight over the same element.**
`index.css:102-114` styles every `input[type="number"]` (background
`var(--border)`, radius 8, width 72, `font-size: 1.25rem`, `font-weight: 600`,
`padding: 8px`). `NumControl` (`Workout.jsx:51-55`) then re-declares all of it
inline with a hardcoded `#1e1e32`, **`fontWeight: 700`** (the CSS says 600) and
**`padding: '8px 0'`** (the CSS says `8px`). Inline wins, so the global rule is
dead code *and* the two disagree. This is the single clearest token-shaped defect.

**b) The uppercase eyebrow label — 16 hand-rolls, 6 sizes, 3 letter-spacings, 4 colours.**
The pattern `fontWeight: 700` + `textTransform: 'uppercase'` + `letterSpacing` +
a small size:

| Site | Size | Tracking | Colour |
|---|---|---|---|
| `Home.jsx:108` | 0.75rem | 0.1em | `#6ee7b7` |
| `Home.jsx:123` | 0.7rem | 0.08em | `#6b7280` |
| `Home.jsx:166` | 0.7rem | 0.08em | `#6b7280` |
| `Workout.jsx:297` | 0.7rem | 0.1em | day colour |
| `Workout.jsx:379` | 0.65rem | 0.08em | `#9ca3af` |
| `Workout.jsx:405` | 0.65rem | 0.08em | `#6b7280` |
| `Workout.jsx:409` | 0.65rem | 0.08em | `#6b7280` |
| `Exercise.jsx:68` | 0.65rem | 0.08em | `#6b7280` |
| `Exercise.jsx:85` | 0.65rem | 0.08em | `#6b7280` |
| `Exercise.jsx:107` | 0.65rem | 0.08em | `#6b7280` |
| `Progress.jsx:81` | 0.65rem | 0.08em | `#6b7280` |
| `Progress.jsx:87` | 0.65rem | 0.08em | `#6b7280` |
| `MuscleGroupPicker.jsx:112` | 0.7rem | 0.08em | `#6b7280` |
| `TopBar.jsx:28` | 0.72rem | 0.08em | `#6ee7b7` |
| `NavBar.jsx:38` | 0.68rem | 0.05em | mint / `#9ca3af` |
| `index.css:145` (`.rest-label`) | 0.6rem | 0.1em | inherited |

**c) Pill / chip — three hand-rolled variants, no shared component.**
- `Workout.jsx:422-425` — muscle chip: `padding '3px 10px'`, `0.7rem`,
  weight 500, bg `#1e1e32`, no border
- `Exercise.jsx:58-62` — *the same muscle chip on another screen*:
  `padding '5px 14px'`, `0.8rem`, weight 600, bg `#1e1e32`, border `${color}33`
- `Progress.jsx:59-68` — exercise filter chip: `padding '7px 14px'`, `0.8rem`,
  weight 600, bg `#111120`/`#6ee7b71a`, border toggling `#6ee7b7`/`#1e1e32`

Three paddings, two sizes, two weights, three background treatments — one
visual family.

**d) Empty state — three near-identical cards that disagree on two properties.**
`Home.jsx:181-184` (`padding: 24`, first `<p>` at `0.875rem`),
`Progress.jsx:50-53` (`padding: 32`, first `<p>` with **no** size → inherits 1rem),
`History.jsx:126-129` (`padding: 32`, same). Identical structure: card +
`textAlign: 'center'` + a `#6b7280` headline `<p>` + a `#9ca3af` `0.8rem` sub-`<p>`
with `marginTop: 4`.

**e) Expandable row + chevron — duplicated verbatim.**
`Workout.jsx:346` and `History.jsx:152` are byte-identical:
`<span style={{ color: '#9ca3af', fontSize: '1.1rem' }}>{isOpen ? '∧' : '∨'}</span>`,
each inside a `className="card"` with `overflow: 'hidden'` and a
`padding: '14px 16px'` header row (`Workout.jsx:315-317`, `History.jsx:137-138`).
Same disclosure component, built twice.

**f) Toast — the class is shared, the state machine is hand-rolled three times.**
`.toast` (`index.css:118-125`) is used at `Workout.jsx:280`, `Home.jsx:105`,
`History.jsx:119`. But the `useState` + `setTimeout(…, 2500)` dismissal logic is
re-implemented at `Workout.jsx:259-262`, `Home.jsx:91-93` **and** `Home.jsx:190-191`
(twice in one file), and `History.jsx:104-106`. There is no `useToast` hook or
`<Toast>` component.

**g) Day-accent indicator — three hand-rolled shapes.**
`ResumeBanner.jsx:31` (8×8 circle), `Workout.jsx:340-343` (8×8 circle set-dots),
`History.jsx:140-141` (8×36 bar, radius 4). All render `DAY_COLORS[day]`.

**h) `.btn-primary` is overridden at 5 of its 6 call sites.**
`index.css:51-62` sets `background: var(--mint)`. Overridden by an inline
`background: color` at `Home.jsx:43-44`, `Home.jsx:50-51`,
`MuscleGroupPicker.jsx:142-144`, `Workout.jsx:413-414` (which also overrides
`fontSize` to `0.9rem` and `padding` to `12px`), and `Workout.jsx:435-436`. The
only un-overridden use is `Workout.jsx:162`. The token default is the exception,
not the rule.

---

## 4. Inconsistencies a token system would fix

Concrete, with locations.

| # | Inconsistency | Evidence |
|---|---|---|
| I1 | Number input styled twice, disagreeing on weight and padding | `index.css:102-114` (`font-weight: 600`, `padding: 8px`) vs `Workout.jsx:54-55` (`fontWeight: 700`, `padding: '8px 0'`) |
| I2 | Two divider colours for the same job | `1px solid #1e1e32` at `Workout.jsx:17`, `Workout.jsx:28`, `Home.jsx:130`, `Exercise.jsx:93` — but `1px solid #1a1a2e` at `History.jsx:43` |
| I3 | Two "one step above card" surfaces, 1 unit apart | `#14142a` (`index.css:135`) vs `#15152a` (`MuscleGroupPicker.jsx:83`) |
| I4 | Two body-text greys, indistinguishable | `#e2e8f0` (`index.css:67`, `ResumeBanner.jsx:32`, `Exercise.jsx:98`, `History.jsx:48`, `Workout.jsx:366`) vs `#e5e7eb` (`MuscleGroupPicker.jsx:128`) |
| I5 | The accent written in 4 notations | `#6ee7b7` (`index.css:28`), `#6ee7b71a` (`Progress.jsx:65`), `rgba(110, 231, 183, 0.14)` (`MuscleGroupPicker.jsx:32`), `[110, 231, 183]` (`MuscleGroupPicker.jsx:22`) |
| I6 | Two accent-tint alphas for the same "selected/track" role | `1a` = 10% (`Progress.jsx:65`) vs `0.14` = 14% (`MuscleGroupPicker.jsx:32`) |
| I7 | Danger colour untokenised, plus a one-off tinted border | `#ef4444` at `index.css:125`, `ResumeBanner.jsx:39`, `Exercise.jsx:38`, `History.jsx:60`, `Workout.jsx:167`; `#2a1a1a` at `History.jsx:59` |
| I8 | Page `<h1>` at three sizes | `2rem` `Home.jsx:111`, `1.75rem` `Progress.jsx:46`/`History.jsx:120`/`Exercise.jsx:52`, `1.6rem` `Workout.jsx:143`/`Workout.jsx:300` |
| I9 | The "subtitle under the h1" at two greys × three sizes | `#6b7280`/`0.875rem` (`Home.jsx:114`, `Exercise.jsx:53`, `Progress.jsx:47`, `History.jsx:121`) vs `#9ca3af`/`0.8rem` (`Home.jsx:115`, `Workout.jsx:301`, `Home.jsx:173`) vs `#9ca3af`/`0.75rem` (`History.jsx:147`) |
| I10 | Same muscle-name chip, two weights and two sizes | `Workout.jsx:424` (500, `0.7rem`) vs `Exercise.jsx:61` (600, `0.8rem`) |
| I11 | Uppercase-label tracking has four values | `0.08em` ×12, `0.1em` (`Home.jsx:108`, `Workout.jsx:297`, `index.css:145`), `0.05em` (`NavBar.jsx:38`), `0.01em` (`TopBar.jsx:24`) |
| I12 | Day-colour fallback differs by screen | `#9ca3af` at `Home.jsx:75`, `ResumeBanner.jsx:18`, `MuscleGroupPicker.jsx:144`; `#6ee7b7` at `Exercise.jsx:12`, `History.jsx:132` |
| I13 | **Content column and TimerBar have different max widths** | `max-w-md` = 28rem = **448px** (`App.jsx:23`, `TopBar.jsx:20`, `ResumeBanner.jsx:23`) vs `.timer-bar { max-width: 480px }` (`index.css:134`) — a 32px mismatch between the fixed bar and the column it sits under |
| I14 | **Bottom padding applied twice on Workout** | `pb-24` = 6rem = 96px on the shared wrapper (`App.jsx:23`) **plus** `paddingBottom: 96` on the page root (`Workout.jsx:279`) = 192px total |
| I15 | **`.toast` max-width silently couples to a Tailwind utility** | `max-width: calc(100vw - 32px)` (`index.css:122`) — the 32 is 2× the `px-4` = 1rem gutter at `App.jsx:23`, with no comment linking them |
| I16 | **`.timer-bar` bottom offset is a hardcoded guess at the NavBar's height** | `bottom: calc(64px + env(safe-area-inset-bottom))` (`index.css:132`) vs the NavBar's actual box: `padding: '8px 0 20px'` (`NavBar.jsx:19`) + `minHeight: 48` (`NavBar.jsx:30`) = **76px**. Worth verifying in a browser before treating as a defect, but the number is not derived from its source either way. |
| I17 | Safe-area handling is inconsistent | `.timer-bar` uses `env(safe-area-inset-bottom)` (`index.css:132`); `NavBar.jsx:19` uses a flat `20px` bottom pad as a manual home-indicator allowance |
| I18 | `--muted-2` defined and never referenced | `index.css:31`; its value `#6b7280` is hardcoded 28 times |

---

## 5. Tailwind: how much is actually used

**Configuration:** `frontend/tailwind.config.js` — default preset, `theme.extend`
empty, no plugins. `frontend/postcss.config.js` wires `tailwindcss` +
`autoprefixer`. `index.css:1-3` pulls in `@tailwind base/components/utilities`.

**Total utility usage — 4 distinct classes, 3 call sites:**

| Class | Built value | Sites |
|---|---|---|
| `max-w-md` | `max-width: 28rem` | `App.jsx:23`, `TopBar.jsx:20`, `ResumeBanner.jsx:23` |
| `mx-auto` | `margin-left/right: auto` | same 3 sites |
| `px-4` | `padding-left/right: 1rem` | `App.jsx:23` |
| `pb-24` | `padding-bottom: 6rem` | `App.jsx:23` |

No `@apply`, no `@layer`, no arbitrary-value syntax, no responsive/state
variants, no dark-mode classes anywhere in `frontend/src/**`. Every other
`className` in the app resolves to a hand-written rule in `index.css`.

**Cost:** in `frontend/dist/assets/index-DiUEQJ0r.css` (11211 bytes total),
the app's own rules begin at byte 7656 — **68% of the shipped stylesheet is
Tailwind preflight plus the four utilities.**

**But preflight is load-bearing.** The built CSS contains:
- `*,:before,:after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e5e7eb}`
- `blockquote,dl,dd,h1,h2,h3,h4,h5,h6,hr,figure,p,pre{margin:0}`
- `h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}`

Every inline-styled `<p>` in the app (there are dozens) assumes `margin: 0`, and
every fixed-size box assumes `border-box`. Notably `NavBar.jsx:30`'s
`minHeight: 48` and `.btn-icon`'s `width: 44px; height: 44px` (`index.css:82`)
are only 48/44 **because** `border-box` is global.

**Naming collision:** `.font-mono` is both a Tailwind utility and a hand-written
rule at `index.css:43`. The hand-written one is later in source order so it wins,
but the app uses `className="font-mono"` 9 times without that being obvious.

**The decision this frames:** the useful part of Tailwind here is the reset, not
the utilities. Removing it means adopting a replacement reset in the same commit
(otherwise every `<p>` and `<h1>` gains UA margins and every box changes sizing
model). Leaning in means the token layer moves into `theme.extend` and inline
styles get replaced by classes — which is the same structural migration §1.2
already argues for, just with Tailwind as the transport.

---

## 6. Risk to the ≥44px / 320px floor

Established by `docs/superpowers/audits/2026-06-30-responsive-catalog.md`
(13 defects R1–R13, all fixed). The fixes are load-bearing magic numbers.

**R0 — enforcement is almost entirely manual.** The only automated assertion of
the floor in the entire test suite is `MuscleGroupPicker.test.jsx:166-167`
(`chip.className` contains `tap-target`; `chip.style.minHeight >= 44`). There is
no `.github/workflows`, no Playwright dependency, and no responsive harness in
`frontend/scripts/` (only `resolve-demos.mjs`). The 2026-07-10 sweep was a
one-off. **Any centralisation lands without a net.**

**Specific things a "snap everything to the scale" pass would break:**

| Risk | Where | Why it breaks |
|---|---|---|
| **The three TimerBar tiers** | `index.css:147-169` — `.timer-pill` 44px, then `min-width: 38px` at ≤440px, then `34px` at ≤340px; `.btn-icon` `width` 44 → 38 → 34 | A single "icon button = 44" token erases the tiers and re-breaks **R1** (Skip fully off-screen at 320px) and **R10**. The catalog explicitly accepts sub-44 *widths* here so long as height stays 44 — that nuance is invisible in a flat token table. |
| **Sub-4px-grid compact spacing** | `index.css:155` (`gap: 6px`), `index.css:164` (`gap: 4px`), `index.css:158` (`padding: 4px 8px`), `index.css:167` (`padding: 4px 6px`) | These deliberately sit below any sane spacing scale. Snapping `6`→`8` at ≤440px re-overflows the five-control row. |
| **The stepper wrap** | `Workout.jsx:403` — `flexWrap: 'wrap', rowGap: 14` | The **R2** fix. Two `NumControl`s are 44 + 72 + 44 + 2×8 gap = **176px each**, so 352px side-by-side exceeds a 320px viewport minus 32px gutters (288px usable). A `<Row gap>` primitive that drops `flex-wrap` puts the Reps "+" off-screen again. |
| **The input width** | `index.css:112` (`width: 72px`) and `Workout.jsx:54` (`width: 72`) | Part of the same 176px budget. Any token that widens the input or the stepper gap breaks 320px even *with* wrapping. |
| **`.tap-target` is a pseudo-element hack** | `index.css:92-100` — `position: relative` + `::after` at `max(100%, 44px)` | Used 12× (**R4–R9, R13**). It expands the hit box **without changing layout**, so a regression is completely invisible in a screenshot. It silently degrades if a component wrapper sets `position: static`, or if an ancestor clips it. Note `Workout.jsx:355` and `Workout.jsx:370` are `.tap-target` buttons inside a `className="card"` with `overflow: 'hidden'` (`Workout.jsx:315`) — currently safe only because the container's `padding: '16px'` (`Workout.jsx:352`) exceeds the ~13px the pseudo-element extends. Reduce that padding to a smaller token and the hit area gets clipped with no visual change. |
| **Hand-placed 44px boxes outside the class system** | `Workout.jsx:39` (`width: 44, height: 44` on the delete-set button), `NavBar.jsx:30` (`minHeight: 48`), `MuscleGroupPicker.jsx:82` (`minHeight: 56`) | Three different literals for "minimum touch box" (44/48/56), none derived from a token, none tested except the last. |
| **`minWidth: 0` overflow guards** | `MuscleGroupPicker.jsx:81` and `MuscleGroupPicker.jsx:88` | Comment at `MuscleGroupPicker.jsx:78-80` records that the longest band label would otherwise force the grid track past `1fr` and overflow the page sideways. A component abstraction that drops `minWidth: 0` re-breaks 320px. |
| **Coupled gutter arithmetic** | `index.css:122` (`calc(100vw - 32px)`) ← `px-4` at `App.jsx:23` | Changing the page gutter token without updating the toast breaks **R3**. |
| **The `nowrap` fragment** | `History.jsx:149` (`whiteSpace: 'nowrap'` on the duration) | The **R11** fix; trivially lost in a text-component refactor. |
| **The chart gutter hack** | `Progress.jsx:95` (`padding: '20px 8px 12px 0'`) with `Progress.jsx:107-110` margins/`width={42}` | The **R12** fix. This asymmetric padding is the one card padding that *cannot* be normalised. |

---

## 7. Decisions this inventory says need making

Evidence-backed, in dependency order. No proposed values — these are the
questions, not the answers.

1. **Token transport — the decision everything else depends on.** Custom
   properties exist but are unreachable from inline styles (§1.2: 0 `var()`
   references in any `.jsx`). Options: (a) migrate to className-driven CSS,
   (b) a JS tokens module imported into inline styles, (c) Tailwind
   `theme.extend`. Until this is chosen, adding tokens just adds a third
   unreferenced layer.

2. **Tailwind: lean in or remove** (§5). If remove, a replacement reset must
   land in the same commit — preflight's `border-box` and `p`/`h1` margin reset
   are assumed by essentially every component.

3. **How many greys?** Currently six, with `#e2e8f0`/`#e5e7eb` a duplicate pair
   (I4) and `#4b5563` untokenised.

4. **How many surfaces?** Currently eleven (§1.4), including two 1-unit-apart
   pairs (I3) and a decimal duplicate (`MuscleGroupPicker.jsx:27`).

5. **Does `--mint` own the accent, or does `DAY_COLORS`?** `.btn-primary`'s mint
   default is overridden at 5 of 6 sites (§3.2h), and `#6ee7b7` is duplicated
   between `index.css:28` and `workoutPlan.js:328`. Also settles I12's fallback
   inconsistency.

6. **What is the type scale?** 23 values → N, with the 12-value 0.60–0.95rem
   band (§2.2) as the main compression target, and one heading size for `<h1>`
   (I8). A line-height scale needs inventing outright — there isn't one (§2.5).

7. **Is the spacing scale 4px, and do 10 and 14 survive?** Both are entrenched
   (§2.1) — `14` in `.btn-primary`'s padding and three row paddings, `10` in
   nine places. Snapping them is a visible change; keeping them means the "scale"
   has exceptions on day one.

8. **What is `.card`'s padding?** Eight variants at 14 call sites (§2.1), one of
   which (`Progress.jsx:95`) is a chart hack that must stay bespoke.

9. **Which of the 8 hand-rolled patterns become components?** Ranked by
   duplication: eyebrow label (16), toast state (5), pill/chip (3), empty state
   (3), day accent (3), disclosure row (2), number stepper (1 but conflicting
   with a global rule), stat pair (2).

10. **How does the 44/320 floor get enforced mechanically?** §6 R0: one
    assertion, no CI. Whatever the design system is, the floor needs a test
    harness before the first centralisation commit — the `.tap-target`
    pseudo-element failure mode (§6) is invisible to screenshots *and* to
    reviewers.

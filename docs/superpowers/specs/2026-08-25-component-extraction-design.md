# Shared component extraction: 8 duplicated UI patterns

**Date:** 2026-08-25
**Status:** Proposed, not yet shipped.
**Research:** [`../research/2026-08-17-design-system-inventory.md`](../research/2026-08-17-design-system-inventory.md) (§3.2, §7 item 9)
**Execution record:** [`../plans/2026-08-25-component-extraction.md`](../plans/2026-08-25-component-extraction.md)
**Depends on:** Upgrade 1 (`theme.js`) landed first — every new component consumes `theme.js` tokens exclusively, introduces zero new hardcoded literals.

---

## Problem

The inventory's §3.2 found 8 patterns hand-rolled at multiple call sites instead of built once:

| Pattern | Sites | Divergence |
|---|---|---|
| Eyebrow (uppercase) label | 16 | 6 sizes, 3 letter-spacings, 4 colors |
| Toast dismissal | 5 | state machine (`useState`+`setTimeout(2500)`) reimplemented at every site despite a shared `.toast` CSS class |
| Chip/pill | 3 | 3 different padding/size/weight/background combos for the same visual family |
| Empty state | 3 | 2 disagreeing properties (padding, subtitle font-size) across near-identical cards |
| Day-accent indicator | 3 | 3 hand-rolled shapes (circle, circle, bar) all rendering `DAY_COLORS` |
| Disclosure row | 2 | byte-identical code duplicated verbatim (`Workout.jsx`/`History.jsx`) |
| Number input | 1 conflict | `NumControl` inline styles silently override a dead global CSS rule, disagreeing on weight (700 vs 600) and padding (`8px 0` vs `8px`) |
| Stat pair | 2 | lowest duplication count; **out of scope this pass**, see below |

## Scope

**In:** the first 6 rows above, plus the number-input conflict. Six new files under `frontend/src/components/`, each importing only from `theme.js`.

**Out:**
- **Stat pair** (`Workout.jsx`'s `Stat` and similar shapes elsewhere) — only 2 sites, lowest ROI of the 8; revisit only if a future upgrade needs it.
- **`MuscleGroupPicker.jsx`'s `MuscleChip` and `RecoveryRing`** — guarded by the 2026-08-16 recovery spec's color-ramp constraint, and a genuinely different use case (`group`/`expanded`/`onToggle`-driven, not a generic label). `<Chip>` below unifies the *other* 3 chip variants (`Workout.jsx`, `Exercise.jsx`, `Progress.jsx`); `MuscleGroupPicker.jsx` is not touched by this upgrade at all.
- **`.card`'s 8 padding variants** (inventory §7 item 8) — a real open decision, but a container-level concern, not a component-extraction one. Left for a future pass.

## Component decisions

Each of these is a real design call, stated explicitly rather than silently invented:

**`<Eyebrow>`** — `{ children, color = colors.muted2, size = type.size.xs }`. Renders a `<p>` with `fontWeight: type.weight.bold`, `letterSpacing: type.labelTracking`, `textTransform: 'uppercase'`. Absorbs all 16 sites; the few whose current size/color/tracking differs from the new default (e.g. `TopBar.jsx`'s `0.72rem`/`0.01em`) pass explicit props rather than silently snapping — check each site's current rendered value before migrating it, don't assume the default fits.

**`useToast()` + `<Toast>`** — the hook owns `message`/`type`/`show(msg, type)`/timer state; `<Toast>` is a dumb render of the existing `.toast`/`.toast.error` CSS classes given `{ message, type }`. Replaces the 5 independently-implemented `useState`+`setTimeout(…, 2500)` pairs (`Workout.jsx`, `Home.jsx` ×2, `History.jsx`) with one hook, same 2500ms dismiss behavior, same visual output.

**`<Chip>`** — `{ children, color, selected, size = 'md' }`. Reconciles `Workout.jsx`'s muscle chip (padding `'3px 10px'`, `0.7rem`, weight 500) and `Exercise.jsx`'s *same conceptual chip* (padding `'5px 14px'`, `0.8rem`, weight 600 — inventory I10 already flags these as the same chip styled two ways) onto one rendering, weight 600 (`Exercise.jsx`'s value survives, matching Upgrade 1's `type.weight` table which already promotes the stray 500 to 600). `Progress.jsx`'s filter chip becomes `<Chip selected={...}>` using the same component with its `selected` boolean toggling background/border, preserving its distinct active/inactive states rather than forcing it to look like the (stateless) muscle chip.

**`<EmptyState>`** — `{ title, subtitle }`, card + centered text. Padding: `32` wins (2 of 3 sites already agree — `Progress.jsx`, `History.jsx`); `Home.jsx`'s `24` becomes `32`, a real small visible change, flagged here the same way the tokens spec flagged its `mintWash` alpha delta. Subtitle font-size: `0.8rem` wins (again majority — `Home.jsx`, `History.jsx`), `Progress.jsx`'s implicit 1rem (no size was ever set there) becomes explicit `0.8rem`, closing that gap.

**`<DayAccent>`** — `{ day, shape = 'dot', size }`. `shape="dot"` (circle, replaces `ResumeBanner.jsx` and `Workout.jsx`'s set-dots) or `shape="bar"` (replaces `History.jsx`'s 8×36 bar). Color always resolves via `DAY_COLORS[day] ?? DAY_COLOR_FALLBACK` — the fallback constant Upgrade 1's Task 13 already introduces, so this component has nothing left to decide about the fallback, it just consumes that decision.

**`<DisclosureRow>`** — `{ header, isOpen, onToggle, children }`, owns the chevron glyph (`∧`/`∨`) and the `card` + `overflow:hidden` + `14px 16px` header padding wrapper. Byte-for-byte behavior match to the existing `Workout.jsx`/`History.jsx` blocks.

**Number input fix** — delete the dead `input[type="number"]` rule in `index.css:102-114` (confirmed dead: `NumControl`'s inline styles override every property it sets, and no other numeric input exists in the app — verify this grep-confirmed claim during implementation before deleting). `NumControl` becomes the sole, undisputed source of truth for numeric input styling; its current rendered values (`fontWeight: 700`, `padding: '8px 0'`) are what ship, since that's what users already see — this is dead-code removal, not a behavior change.

## Guardrails
1. `MuscleGroupPicker.jsx` is not touched by this upgrade (see Scope/Out above) — the `RecoveryRing` color-ramp constraint stays fully isolated from this refactor.
2. Re-verify the ≥44px/320px floor after the sweep, specifically on `Workout.jsx` (its stepper/chip/disclosure-row all change in this pass) and any screen using the new `<EmptyState>`/`<Chip>`.
3. Every new component imports exclusively from `theme.js` (Upgrade 1) — zero new hardcoded literals introduced by this refactor.

## Testing
Each new component gets its own test file (rendering + the one or two interactive behaviors it owns — toggle for `<DisclosureRow>`, dismiss-timer for `useToast`, selected-state for `<Chip>`). Existing page-level tests (`Workout.test.jsx`, `History.test.jsx`, `Home.test.jsx`) must stay green after each call site is swept onto the new components — they're the regression net the component's own unit tests can't fully replace, since they assert on rendered end-to-end page behavior. `cd frontend && npm run build && npm test` green after every task.

## References
- [`../research/2026-08-17-design-system-inventory.md`](../research/2026-08-17-design-system-inventory.md) — §3.2 (a-h), §7 item 9
- [`../plans/2026-08-23-design-tokens.md`](../plans/2026-08-23-design-tokens.md) — the `theme.js` module this upgrade consumes
- [`../specs/2026-08-16-muscle-group-recovery-design.md`](2026-08-16-muscle-group-recovery-design.md) — §5, the guardrail this upgrade stays clear of

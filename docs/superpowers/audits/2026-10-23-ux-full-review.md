# UX full review — 2026-10-23

First run of `/ux-review full`. Six experts (`ux-flow`, `ux-visual`, `ux-a11y`, `ux-trust`,
`ux-product`, `ux-mobile`) ran on `sonnet` against main @ `7dcc094`. The screens came from
`scripts/ux_capture.sh` at 390 and 320 wide, with eight weeks of seeded history. The controller
checked every High against source before it went into this document. Previous verdict:
`2026-09-06-ui-review.md`. All of its top five are now fixed in source.

## Verdict: Refine, no redesign

All six experts returned **Refine**, independently. No two of them named the same structural
cause, so the Redesign bar in `DECISIONS.md` (2026-10-23) is not met. The core loop is fast now,
and the token system holds up: no stray icon sizes, and one hardcoded colour. The remaining
problems are around the loop: header clutter during a workout, Progress burying its own chart,
under-disclosed data flows, and a first run that assumes everyone trains this split.

## Decision per area

| Area | Decision | Why |
|---|---|---|
| Workout | Refine | The loop works. Clean up the header, nav and timer edges, and log the alternative exercise as itself. |
| Home | Refine | Start sits below the fold, the muscle grid is long, and nothing gives a reason to open the app on a rest day. |
| Progress and PBs | Refine, the biggest change | Four experts found the chip wall pushing the chart below the fold. Restructure inside the page. |
| History | Refine | 32 rows that look identical. Add one stat per row and drop the repeated "completed". |
| Plan and Update with AI | Refine | Disclose what gets copied, make Reset quieter, add a Clear button for the pasted reply (owner request). |
| Auth | Keep | Clear, and it doesn't reveal whether an account exists. At most one optional "by invite" line. |
| Shell (PWA, nav, header) | Refine | Safe area on notched iPhones, the theme colour mismatch, Android back on sheets. |

## Ranked actions (merged and de-duplicated, verified)

| # | Sev | Action | Agreed by | Verified | Effort |
|---|---|---|---|---|---|
| 1 | High | Disclose the Update with AI copy: plan, last 20 sessions, PBs **and exercise notes** go to a third-party chatbot. | trust | `main.py:1143-1176` | S |
| 2 | High | Reword PB sharing: it shares est. 1RM from **logged sets** too, not only typed PBs. Only members see it, and opting out takes effect immediately. Move the checkbox below the list and show it only once a PB exists. | trust, flow, product, visual | `main.py:1573-1586` | S |
| 3 | High | Progress: put the PR card and chart above the exercise picker (single-row scroller), and default to the most recently trained exercise, not `d[0]`. Label the card "Est. 1RM". | flow, visual, product, a11y (chart alt) | `Progress.jsx:46`, screens | M |
| 4 | High | Workout header: hide the username and page eyebrow while a session is open, and move Log out away from it. | visual, mobile, a11y, flow | `TopBar.jsx`, 320 screens | S |
| 5 | High | Alternative exercise: let the user swap to "or Dumbbell Press" for this session so sets are logged under the right exercise. Until then the history mixes the two lifts. | flow | `Workout.jsx:641` is text only | M |
| 6 | High | Rest end: add a `role="status"` "Rest over" announcement. When the page becomes visible after rest has ended, beep or flash right away. Say on screen that the timer can't alert while the phone is locked; native fixes it (#410). | a11y, mobile | `TimerBar.jsx` has no live region | S |
| 7 | High | Notched iPhone: add `viewport-fit=cover` and a header `env(safe-area-inset-top)`. The status bar is `black-translucent` with no top inset. **Check on a device.** | mobile | `index.html:5,10` | S |
| 8 | Med | First run: a one-time Home card explaining the 4-day split, with a link to Edit plan. Add and remove exercise on Plan is still the top product gap. | product | `Plan.jsx` swap only | S + M |
| 9 | Med | Pending set dots use `#2a2a3e` (1.24:1). Switch to `muted3` or a ring, and add "2 of 3 sets" hidden text. | a11y, visual | `Workout.jsx:649`, `MuscleGroupPicker.jsx:31` | S |
| 10 | Med | Home: move Start/Resume up under the day title, collapse the muscle grid with its disclaimer inside, and add a "This week: N sessions, N PRs" line. | flow, product, visual | screens | S |
| 11 | Med | Hide the bottom nav on `/workout`, which frees 77px at 320 and removes the risk of tapping away mid-set. Plan and PB reachability is unaffected. | mobile | `App.jsx:143` | S |
| 12 | Med | Gym wifi: on a failed Log Set, keep the values and show "Not saved — retry". An outbox replayed on `online` comes later, keyed on the existing `client_id`. | mobile | `Workout.jsx:446` | M |
| 13 | Med | History: drop "completed" on completed rows, add one stat per row (sets or volume, PRs), and add month headings. | flow, visual, product | `History.jsx` | S |
| 14 | Med | Disclose analytics in one line by Export. Label Export "(JSON file)". Whether to strip `password_hash` from a member's export is an owner call; DECISIONS currently keeps it. | trust | `analytics.js`, `main.py` export | S |
| 15 | Med | Idle timer bar: dim only the buttons, not the READY label or the clock (about 2:1 now). | a11y | `TimerBar.jsx:46-49` | S |
| 16 | Med | PB form: pair `htmlFor` and `id`, and use the exercise name in the delete label. | a11y | `PersonalBests.jsx` | S |
| 17 | Low | Update with AI: add a **Clear** button for the pasted reply (owner, canvas comment), a reason under the disabled Preview, and make Reset to recommended a quieter link. | owner, flow, product | `PlanAI.jsx:158` has no clear control | S |
| 18 | Low | Sheets push a history entry so Android back closes them. Use one `theme_color`/`background_color` (`#0d0d0d`). | mobile | `vite.config.js:36`, modals | S |
| 19 | Low | Copy: "Start your first workout above 💪" becomes "No sessions yet." Rewrite the warm-up line as `Warm-up: 25kg × 12 (not counted)` after confirming the rule. Delete confirms say what is lost. | flow, trust | `Home.jsx:283`, `Workout.jsx:718` | S |

## Rejected or downgraded on verification

- `ux-mobile` #7, "SCREEN ON may show without a lock": **rejected**. `SessionClock.jsx:21` renders it only when `wakeLockHeld`.
- `ux-visual` #12, "buttons render in a system font": **screenshot-only**. Needs a computed-style check before any change.
- `ux-mobile` #3, "writes never queued": **confirmed in behaviour**, downgraded to Medium. The idempotent `client_id` makes a manual retry safe today.

## Disagreements

- **Volt on set targets.** `ux-visual` wants targets in `textSecondary` so volt means only "act here". The design system lists set targets under `accent`'s usage. **Keep volt on targets** until the owner decides. Action: owner call.
- **Muscle grid.** `ux-product` would collapse it by default, while `ux-trust` and `ux-flow` value its honest disclaimer. Both hold if it is collapsed with the disclaimer inside. Taken.
- **Nav during a workout.** `ux-mobile` hides it. `ux-flow` worries about Plan and PB discoverability, but that concerns other screens. Taken.

## Keep (any change must preserve these)

- One-tap logging with prefill, the Suggested line, and Last workout above the steppers.
- Logged sets render below the logger, two-tap delete and finish, and a timestamp-based rest timer.
- Mono for numbers and Inter for words, one volt primary per screen, day colours, role-sized icons.
- The honest recovery caveat and "(est.)" labels: no percentage and no "readiness".
- Account-neutral forgot-password, an opt-in that is off by default and enforced on the server, and a focus ring and modal focus handling that work.

## Proposed issues (not created; for the owner)

1. `type:feature priority:P1 effort:S`: Disclose data flows (AI copy, PB sharing, analytics, export) — actions 1, 2, 14
2. `type:feature priority:P1 effort:M`: Progress: chart first, recent exercise default — action 3
3. `type:feature priority:P1 effort:S`: Workout chrome: header declutter and hide nav — actions 4, 11
4. `type:feature priority:P1 effort:M`: Swap to the alternative exercise for a session — action 5
5. `type:bug priority:P1 effort:S`: Rest timer: live region, alert on return, idle contrast — actions 6, 15
6. `type:bug priority:P1 effort:S`: iOS safe area and theme colour (device check) — actions 7, 18
7. `type:feature priority:P2 effort:S`: First-run card and weekly summary on Home — actions 8, 10
8. `type:bug priority:P2 effort:S`: Set dots and PB form labels — actions 9, 16
9. `type:feature priority:P2 effort:S`: History rows that say something — action 13
10. `type:feature priority:P2 effort:M`: Keep a failed set and retry; outbox later — action 12
11. `type:feature priority:P3 effort:S`: Update with AI: Clear button, Preview hint, quieter Reset — action 17
12. `type:feature priority:P3 effort:S`: Copy pass — action 19

Owner decisions needed: volt on set targets; `password_hash` in member exports; whether add and
remove exercise (action 8) jumps the queue ahead of the Coach tickets.

# Tailwind lean-out: remove the utility layer, keep the reset

**Date:** 2026-08-25
**Status:** Proposed, not yet shipped.
**Research:** [`../research/2026-08-17-design-system-inventory.md`](../research/2026-08-17-design-system-inventory.md) (§5, §7 item 2)
**Execution record:** [`../plans/2026-08-25-tailwind-lean-out.md`](../plans/2026-08-25-tailwind-lean-out.md)
**Depends on:** Upgrade 1 ([`../plans/2026-08-23-design-tokens.md`](../plans/2026-08-23-design-tokens.md)) landing first — touches the same screen-furniture files (`App.jsx`, `TopBar.jsx`, `ResumeBanner.jsx`).

---

## Problem

The inventory (§5) found Tailwind ships 11211 bytes of built CSS for **4 utility classes at 3 call sites**: `max-w-md mx-auto px-4 pb-24` on `App.jsx:23`, `TopBar.jsx:20`, `ResumeBanner.jsx:23`. 68% of the shipped stylesheet (7656 of 11211 bytes) is Tailwind preflight plus those four utilities. No `@apply`, no arbitrary values, no responsive/state variants, no dark-mode classes anywhere in `frontend/src/**` — the JIT engine has nothing else to do.

But preflight is not dead weight: it supplies `box-sizing: border-box` and `margin: 0` on `p`/`h1`-`h6` globally, and essentially every inline-styled element in this app assumes both. `NavBar.jsx`'s `minHeight: 48` and `.btn-icon`'s `width: 44px; height: 44px` (`index.css:82`) are only actually 44/48px tall **because** `border-box` is global. Removing Tailwind without replacing preflight silently changes the box model of every sized element in the app, including the ≥44px tap targets the 2026-06-30 responsive audit fought to establish.

## Scope

**In:**
- Remove the Tailwind utility/JIT layer entirely: uninstall `tailwindcss`, `postcss`, `autoprefixer`; delete `tailwind.config.js` / `postcss.config.js`; drop the `@tailwind base/components/utilities` directives from `index.css`.
- Replace what preflight was silently providing with a small, explicit, hand-written reset at the top of `index.css`: `box-sizing: border-box` on everything, and `margin: 0` on `blockquote, dl, dd, h1`-`h6`, `hr, figure, p, pre`. Nothing more — no attempt to reproduce all of Tailwind's preflight, only the two rules the inventory confirmed are load-bearing.
- Migrate the 3 call sites off `max-w-md mx-auto px-4 pb-24` onto a single new CSS class (`.page-shell`, in `index.css`) carrying the exact same rendered values: `max-width: 28rem; margin: 0 auto; padding: 0 1rem 6rem;`. Pure transport swap — the pixel values themselves (448px max-width, 96px bottom padding) are **not** changed here even though the inventory (I13, I14) flags them as inconsistent with `.timer-bar`'s 480px and `Workout.jsx`'s doubled padding. Fixing those pixel values is Upgrade 5's job (dimensional bugs), not this one's (transport removal) — the same discipline the tokens spec used to keep "did this change behavior" review clean.
- The `.font-mono` naming collision (inventory: a Tailwind utility and a hand-written `index.css:43` rule share the name, hand-written wins on source order today) resolves itself once Tailwind's utility layer is gone — no separate fix needed, just confirm in the diff that only one `.font-mono` rule remains.

**Out:**
- I13/I14/I15/I16/I17 (the dimensional/layout bugs) — tracked under Upgrade 5's spec, not fixed here.
- Any visual/token change — this upgrade is pure transport (Tailwind → hand-written CSS), not a design change. If a computed value differs from before this upgrade, that's a bug in this upgrade, not an intentional improvement.
- Component extraction (Upgrade 3) — `.page-shell` is a page-layout primitive, not part of the shared-component pattern set.

## Guardrail

**The replacement reset must ship in the same commit as the Tailwind removal, never as a follow-up.** A window where Tailwind is gone and the hand-written reset isn't yet in place means every tap target in the app is either oversized or undersized without any code change looking wrong in review. Verify in a real browser (not just Vitest/jsdom, which doesn't apply real CSS layout): open the app at 320px, confirm `.btn-icon` and `NavBar` items still measure ≥44px via devtools, before and after comparison.

## Testing

`cd frontend && npm run build && npm test` green after the removal commit. `npm run build`'s output size (`frontend/dist/assets/*.css`) should shrink from ~11.2KB to roughly the size of the app's own rules alone (~3.5KB) plus the few new reset lines — record the before/after byte count as evidence the removal actually worked, not just that nothing broke. The border-box/tap-target check above is manual (jsdom doesn't compute real layout), matching how Upgrade 1's Task 6 handled `RecoveryRing`'s ramp — state that explicitly rather than silently skipping automated coverage for it.

## References
- [`../research/2026-08-17-design-system-inventory.md`](../research/2026-08-17-design-system-inventory.md) — §5 (Tailwind usage), §7 item 2 (the open decision), I13-I17 (deferred to Upgrade 5)

# Tailwind lean-out: implementation plan

**Goal:** Remove Tailwind's utility/JIT layer, replace what it was silently providing with a small hand-written reset, migrate the 3 call sites onto a new `.page-shell` class, verify bundle size drops and nothing regresses.

**Spec:** [`../specs/2026-08-25-tailwind-lean-out-design.md`](../specs/2026-08-25-tailwind-lean-out-design.md)

**Depends on:** Upgrade 1 ([`../plans/2026-08-23-design-tokens.md`](../plans/2026-08-23-design-tokens.md)) already landed — this plan assumes `frontend/src/lib/theme.js` exists and `App.jsx`/`TopBar.jsx`/`ResumeBanner.jsx` are already migrated to it.

## Global constraints
- No visual/pixel-value changes. Every rendered dimension stays byte-identical to before this plan; only the CSS transport mechanism changes.
- `cd frontend && npm run build && npm test` green after every task.
- Frontend only.

---

### Task 1: Hand-written reset + remove Tailwind directives

**Files:** Modify `frontend/src/index.css`

- [ ] Step 1: At the top of `index.css`, replace the three `@tailwind base/components/utilities;` lines with:
```css
*, *::before, *::after { box-sizing: border-box; }
blockquote, dl, dd, h1, h2, h3, h4, h5, h6, hr, figure, p, pre { margin: 0; }
```
- [ ] Step 2: Do not remove or touch anything else in `index.css` yet — this step is additive/replacement only, isolated from Task 2's class migration.
- [ ] Step 3: `npm run build` — expect it to still succeed (Tailwind's PostCSS plugin is still wired via `postcss.config.js` at this point, it just has nothing to scan since the directives are gone; confirm the built CSS no longer contains Tailwind's preflight block).
- [ ] Step 4: Manual check: `npm run dev`, open at a 320px viewport, confirm `.btn-icon` (`index.css:82`) and `NavBar`'s tap targets still measure ≥44px in devtools (they should be unchanged, since `box-sizing: border-box` is now supplied by this new rule instead of Tailwind's).
- [ ] Step 5: Commit
```bash
git add frontend/src/index.css
git commit -m "refactor(tailwind-lean-out): replace Tailwind preflight with a minimal hand-written reset"
```

### Task 2: `.page-shell` class + migrate the 3 call sites

**Files:** Modify `frontend/src/index.css`, `frontend/src/App.jsx`, `frontend/src/components/TopBar.jsx`, `frontend/src/components/ResumeBanner.jsx`

- [ ] Step 1: Add to `index.css`:
```css
.page-shell {
  max-width: 28rem;
  margin: 0 auto;
  padding: 0 1rem 6rem;
}
```
(28rem = 448px = the exact value `max-w-md` was already producing; `0 1rem 6rem` = the exact `px-4 pb-24` combination. No value changes — read the current `className="max-w-md mx-auto px-4 pb-24"` at each of the 3 sites and confirm this matches before touching JSX.)
- [ ] Step 2: At each of the 3 call sites, replace `className="max-w-md mx-auto px-4 pb-24"` (or whatever subset each site uses — check each individually, they may not be identical) with `className="page-shell"`. Confirm via `git diff` that no other className or style prop at these sites changes.
- [ ] Step 3: `npm run build && npm test` — both green. Confirm rendered layout is pixel-identical (devtools computed-style comparison on one page, e.g. Home, before/after).
- [ ] Step 4: Commit
```bash
git add frontend/src/index.css frontend/src/App.jsx frontend/src/components/TopBar.jsx frontend/src/components/ResumeBanner.jsx
git commit -m "refactor(tailwind-lean-out): replace max-w-md/mx-auto/px-4/pb-24 with .page-shell"
```

### Task 3: Remove the Tailwind dependency and config

**Files:** Modify `frontend/package.json`, `frontend/package-lock.json`; delete `frontend/tailwind.config.js`, `frontend/postcss.config.js`

- [ ] Step 1: Confirm no remaining `@tailwind`, `@apply`, or `theme()` references anywhere in `frontend/src/**` (should be none — Task 1 already removed the only 3 directives).
- [ ] Step 2: `cd frontend && npm uninstall tailwindcss postcss autoprefixer`.
- [ ] Step 3: Delete `tailwind.config.js` and `postcss.config.js`. If Vite errors on a missing PostCSS config, check `vite.config.js` for any `css.postcss` reference before deleting — if something does depend on it, leave a minimal `postcss.config.js` with an empty plugin list rather than removing it outright.
- [ ] Step 4: `npm install` (updates the lockfile), `npm run build && npm test` — both green.
- [ ] Step 5: Compare `frontend/dist/assets/*.css` byte size against the pre-Task-1 baseline (~11.2KB, per the spec). Record the new size.
- [ ] Step 6: Commit
```bash
git add frontend/package.json frontend/package-lock.json
git rm frontend/tailwind.config.js frontend/postcss.config.js
git commit -m "chore(tailwind-lean-out): remove tailwindcss/postcss/autoprefixer dependency"
```

## Verification (after all tasks)
1. `cd frontend && npm run build && npm test` — clean build, full suite green.
2. `cd backend && .venv/bin/python -m pytest -v` — green, untouched (confirms no accidental backend edits).
3. Manual 320px browser check: no horizontal overflow, `.btn-icon`/`NavBar` tap targets still ≥44px, `.page-shell` renders identically to the old Tailwind classes on Home/TopBar/ResumeBanner.
4. Built CSS size dropped meaningfully from the ~11.2KB baseline.

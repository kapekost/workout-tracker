# Nutrition guidance (pre/post-workout, protein timing) — design

**Date:** 2026-08-31
**Status:** Drafted this tick from owner Q&A already recorded in `docs/orchestration/DECISIONS.md`
(2026-08-30 entry for #33). Needs a quick owner skim before splitting into `ready` children — not
pre-approved line-by-line the way `2026-08-17-personal-bests-design.md` was.
**Depends on:** #66 (Profiles) only — not #67. Unlike #30/#32, this doesn't need real login to be
meaningful: bodyweight/height are inherently personal, and until #67/#69 ship there's effectively
one active user anyway (via #66's seeded-admin shim). Sequencing this behind #67 too would just be
waiting without a reason.

---

## Problem

Deferred from the 2026-08-16 muscle-group/recovery design specifically because it needed its own
spec and a datum (bodyweight) the app deliberately didn't collect — the recovery model runs on
training data alone, no biometrics. This spec is that follow-up: general, sourced pre/post-workout
nutrition guidance, scoped tightly so it doesn't become a dosing or meal-planning tool.

## Scope

**In:** an ISSN-sourced protein target *range* (g/day, from bodyweight), general pre/post-workout
timing guidance, collecting bodyweight **and** height on the profile (per DECISIONS.md — height is
new scope beyond the original bodyweight-only ask; §2 below is honest about why), a permanently
visible "not medical advice" line.

**Out:** personalized vitamin/supplement dosing (explicit in the original backlog note); calorie or
macro targets beyond protein; meal plans or recipes; folding into #32's AI-export machinery — this
ships standalone per DECISIONS.md, it doesn't need #32's review-before-write loop since nothing here
is AI-authored; a weight/height *history* or trend chart (only the current value is stored — a
trend feature is a plausible separate ask, not built here).

---

## 1. Decisions already on record (owner Q&A, 2026-08-30)

| Question | Decision |
|---|---|
| Bodyweight only, or more? | Both bodyweight **and** height, for "scientifically-grounded guidance" — not just the ISSN protein minimum. |
| Standalone, or folded into #32's brainstorming? | Standalone. Doesn't need #32's AI-export/review machinery. |
| Sequencing? | Behind #66 (profiles) — not explicitly behind #67 (see header). |
| Scope guard (from the original `AGENTS.md` backlog note) | "General, sourced guidance (ISSN position stand) with a 'not medical advice' line — not personalised vitamin/supplement dosing." |

## 2. Why height, given the guidance itself only needs weight

Being direct about this rather than quietly inventing a reason: the ISSN protein position stand
(Jäger et al., 2017) is purely weight-based (g/kg) — the original backlog note said as much
("the one datum it requires... is bodyweight"). Collecting height too was the owner's explicit
addition. This spec proposes a concrete, honest use for it rather than storing an unused field:
**BMI shown as general context** alongside the protein target, clearly labeled as a reference
figure, not a health assessment — consistent with the "not medical advice" framing, and simple
enough not to imply more precision than the feature actually has (an estimate from height+weight
alone, no body-fat data, doesn't support anything more clinical like a lean-mass-adjusted protein
target). **Flagged explicitly: this is a spec-time proposal, not a recorded owner decision** — easy
to correct if the intent behind collecting height was something else.

## 3. Data model

Two nullable columns directly on `profiles` (current value only, no history):

```sql
ALTER TABLE profiles ADD COLUMN weight_kg INTEGER  -- see note below on why not REAL here
ALTER TABLE profiles ADD COLUMN height_cm REAL
```

Actually: `weight_kg REAL` (matches every other weight field in this app — `sets.weight_kg`,
`personal_bests.weight_kg` — for the same reason: fractional kg entries are normal). This issue's
own migration (schema v5, landing after #66's v4 — a separate, later-shipping issue, not folded
into #66's migration), guarded the same way every block in `_migrate` is (`_column_exists` check,
`PRAGMA user_version` gate).

Validation bounds (Pydantic `Field`, matching the existing pattern of sanity bounds rather than
medical ones — see `SetIn.weight_kg: Field(ge=0, le=1000)`):
- `weight_kg: Field(ge=20, le=400)`
- `height_cm: Field(ge=100, le=250)`

Both optional on every request — a profile with neither set yet is the default state, not an error.

## 4. Backend

`PATCH /api/profile/biometrics` — body `{"weight_kg": Optional[float], "height_cm": Optional[float]}`,
partial update, writes to the acting profile's row via `_default_profile_id` (the same temporary
shim #66 introduces and #30/#32's spec reuses — until #67 lands, "the acting profile" is the seeded
admin; this endpoint doesn't need its own second mechanism).

`GET /api/nutrition/guidance` — reads the acting profile's `weight_kg`/`height_cm` and computes:

```json
{
  "weight_kg": 82.0,
  "protein_g_low": 114.8,
  "protein_g_high": 164.0,
  "bmi": 24.3,
  "bmi_available": true,
  "guidance_text": ["<see §6>"],
  "disclaimer": "<see §6>"
}
```

If `weight_kg` is `null`, the response is a distinct shape prompting the user to enter it —
**never fabricate a protein range without the datum it needs** (same "never guess" principle
GUARDRAILS applies elsewhere): `{"weight_kg": null, "needs_weight": true}`. If `height_cm` is
`null`, `bmi_available` is `false` and `bmi` is omitted — the protein guidance still renders fine
without it, since BMI is context, not an input to the protein calculation (§2).

## 5. Frontend

A small biometrics form (existing inline-`style={{}}` + `.card`/`.tap-target`/`.btn-primary`
convention, no new component library — same constraint the personal-bests plan used) on an existing
settings-type surface (exact placement is a plan-time call — this app doesn't have a dedicated
Settings page today, so the plan should decide whether this earns one or lives on an existing
page). A "Nutrition" card/section rendering `guidance_text`, the protein range, BMI when available,
and the disclaimer — the disclaimer is not a dismissible toast, it's always-visible body text next
to the numbers it qualifies.

## 6. The actual guidance content

Written out here since a future plan should use this close to verbatim, not re-derive it — matching
how the personal-bests spec gave literal SQL rather than describing it abstractly.

**Protein range** (computed, not static): *"{low}–{high}g protein per day ({weight}kg × 1.4–2.0
g/kg), per the ISSN's position stand on protein and exercise (Jäger et al., 2017)."*

**Timing** (static text, ISSN-sourced): *"Aim to get some protein — roughly 20–40g — within a few
hours of training, both before and after. The ISSN's nutrient-timing position stand (Kerksick et
al., 2017) describes this as a broad window, not a strict post-workout deadline, so there's no need
to rush a meal to hit a narrow cutoff."*

**Disclaimer** (always visible, per the original backlog note's explicit requirement): *"This is
general guidance from published sports-nutrition research, not personalized medical or dietary
advice. Talk to a registered dietitian or physician about your individual needs, especially with
any medical condition."*

**BMI framing** (only shown when `bmi_available`): *"BMI: {value} — a general reference figure, not
a health assessment."* No color-coding, no "normal/overweight" category labels — a bare number with
that one qualifying sentence, so it can't read as a verdict.

## 7. Testing

Backend: protein range computed correctly from a known weight (e.g. 82kg → 114.8–164.0g); missing
weight returns `needs_weight: true` and no fabricated numbers; missing height omits `bmi`/sets
`bmi_available: false` without affecting the protein fields; `PATCH .../biometrics` validates
bounds (rejects e.g. `weight_kg: 5` or `height_cm: 300`) and partial-updates correctly (setting only
`weight_kg` leaves an existing `height_cm` untouched).

Frontend: form submits and the guidance card reflects the new values; the disclaimer renders
unconditionally; the missing-weight prompt renders instead of a guidance card when nothing's set
yet.

## 8. Deploy / sequencing

Small additive migration (v5, two nullable columns) — same export-snapshot-before /
restore-drill-after discipline as every schema change in this repo (`AGENTS.md`), though
meaningfully lower-stakes than #66's since nothing existing is restructured. Split into a `ready`
child issue (or execute directly as one — this is small enough it may not need splitting the way
#29 did) once the owner has skimmed this doc, particularly §2's proposed BMI rationale.

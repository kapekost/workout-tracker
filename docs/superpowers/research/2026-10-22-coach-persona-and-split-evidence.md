# Coach persona and training-split evidence

Research for Issue #428 (evidence-based AI coach persona) and #427 (flexible training split). Compiled 2026-10-22.

This note does not repeat `2026-08-16-recovery-science.md`. Its section 7 stays binding: no recovery percentage, never "readiness", indirect sets count 0.5, no "losing gains" warning before about 3 weeks off, recovery follows movement pattern rather than muscle size.

## How this was verified

- PubMed pages were not readable by the fetch tool (cookie wall). Every citation below was fetched as a record from the Europe PMC REST API (title, authors, journal, DOI, abstract) or from arXiv or the provider's own docs page.
- Only abstracts and records were read, not full texts. Effect sizes are quoted only where the abstract gave them. Where a record gave no number, the entry says so.
- Certainty labels are mine, based on design, size and agreement between sources: strong / moderate / weak / conflicting.
- Anything I could not confirm at the source is marked UNVERIFIED or left out.

---

# Part A. Training science for the coach persona

## A1. Frequency per muscle group

| Source | Design | Result | Notes |
|---|---|---|---|
| Schoenfeld, Ogborn, Krieger 2016, Sports Med 46(11):1689-1697, doi:10.1007/s40279-016-0543-8 | Systematic review and meta-analysis, 10 studies | Higher frequency gave a larger hypertrophy effect size; authors conclude training each muscle at least 2x/week beats 1x/week. 3x vs 2x undetermined | Volume was not always equated, so the benefit may be extra volume |
| Schoenfeld, Grgic, Krieger 2019, J Sports Sci 37(11):1286-1295, doi:10.1080/02640414.2018.1555906 | Systematic review and meta-analysis, 25 studies | With volume equated, frequency has no significant or meaningful effect on hypertrophy. Unequated studies show a small advantage for higher frequency | Full text paywalled; abstract level only |
| Grgic et al. 2018, Sports Med 48(5):1207-1220, doi:10.1007/s40279-018-0872-x | Systematic review and meta-analysis, 22 studies | Strength effect sizes rose with frequency: 0.74 (1x), 0.82 (2x), 0.93 (3x), 1.08 (4x or more); overall p = 0.003. With volume equated, no effect (p = 0.421) | Most participants untrained. Effect significant for multi-joint tests and upper body, not for single-joint or lower body |
| Pelland et al. 2026, Sports Med, doi:10.1007/s40279-025-02344-w | Bayesian meta-regression, 67 studies, 2,058 participants, adjusted for duration and training status | Hypertrophy: frequency effect negligible. Strength: higher frequency associated with more gain, with diminishing returns | Newest large synthesis. Abstract gives no set or frequency thresholds |
| ACSM position stand 2026, Currier et al., Med Sci Sports Exerc 58(4):851-872, doi:10.1249/mss.0000000000003897 | Overview of 137 systematic reviews, over 30,000 participants | Strength: associated with at least 2 sessions per week | Abstract reports no formal certainty rating |
| Schoenfeld et al. 2015, J Strength Cond Res 29(7):1821-1829, doi:10.1519/jsc.0000000000000970 | RCT, 20 trained men, split (1x/week per muscle) vs total body (3x/week) | Total body gained more elbow flexor thickness; no strength difference | Small. I could not confirm from the record whether volume was equated |
| Pedersen et al. 2024, Eur J Sport Sci 24(5):557-565 (PMC11235667) | Title only; design and n UNVERIFIED | Title states high frequency improved lower-limb strength more than low frequency | Do not cite beyond the title |
| Boutagy and McKean 2026, medRxiv, doi:10.64898/2026.10.07.26365015 | Preprint, not peer reviewed. 16 volume-equated trials, 380 participants | Trivial, non-significant frequency effect on hypertrophy at 1, 2 or 3 sessions per muscle per week; certainty low to very low | Treat as a pointer only |

Reading across these:

- For hypertrophy, once weekly volume is equal, frequency does not matter. Certainty: moderate (three syntheses agree; the preprint agrees but is unreviewed).
- Hitting a muscle at least twice a week is a practical way to spread volume, and the 2016 review is the origin of that advice. Training once a week is not shown to be worse when volume is equated. Certainty: moderate.
- For strength, more frequent exposure helps in the 2018 and 2026 syntheses, with diminishing returns; the 2018 review found the effect disappears when volume is equated. Certainty: moderate in untrained and mixed samples, weak in trained lifters because few trained lifters were studied.
- A claim that 3x beats 2x is unsupported. Certainty: weak.

## A2. Weekly volume

| Source | Design | Result |
|---|---|---|
| Schoenfeld, Ogborn, Krieger 2017, J Sports Sci 35(11):1073-1082, doi:10.1080/02640414.2016.1210197 | Systematic review and meta-regression, 15 studies, 34 groups | Graded dose-response between weekly sets and hypertrophy; higher-volume groups gained about 3.9% more muscle. A three-category analysis only trended (P = 0.074) |
| Baz-Valle et al. 2022, J Hum Kinet 81:199-210, doi:10.2478/hukin-2022-0017 | Systematic review, 7 RCTs (6 in meta-analysis); trained adults 18 to 35 with at least 1 year of training | Moderate (12 to 20 weekly sets) and high (over 20) volumes similar for quadriceps and biceps; high volume better for triceps (p = 0.01). Authors suggest 12 to 20 sets per muscle per week for young trained men |
| Pelland et al. 2026 (above) | Bayesian meta-regression, 67 studies | More weekly volume raises both hypertrophy and strength; returns diminish, much more sharply for strength. Fractional counting of indirect sets (0.5) had the best support |
| ACSM 2026 (above) | Overview of reviews | Hypertrophy: at least 10 sets per week associated with more growth. Strength: 2 to 3 sets per exercise associated with more strength |

- Dose-response with diminishing returns is established for hypertrophy. Certainty: strong for direction, moderate for any specific number.
- A defensible range for a trained young adult is roughly 10 to 20 hard sets per muscle per week. The floor comes from ACSM, the 12 to 20 band from one systematic review of 6 to 7 trials. Certainty: moderate for the floor, weak for the upper end.
- Strength saturates at lower volume than hypertrophy (Pelland 2026, ACSM). Certainty: moderate.
- Experience level: Baz-Valle covers trained men only; Pelland adjusts for status but the abstract gives no per-level numbers. No verified source gives separate volume numbers for novices. Any novice figure in the persona would be a judgment, not a citation.
- Upper versus lower bounds: I found no verified primary source that sets separate volume bounds for upper and lower body. The only hint is muscle-specific: triceps responded to higher volume where quadriceps and biceps did not (Baz-Valle). Do not state different bounds for upper and lower.
- MEV, MAV and MRV: I found no peer-reviewed primary source that validates these as measured thresholds. The recovery note section 6 already handles this; the persona should not cite them as science.

## A3. Split structures

I found no verified trial or synthesis showing that one split structure beats another when weekly volume and per-muscle frequency are equal.

| Source | Design | Result |
|---|---|---|
| Evangelista et al. 2021, Einstein (Sao Paulo), doi:10.31744/einstein_journal/2021ao5781 | RCT, 67 untrained adults, 8 weeks, split (35) vs full body (32), set volume matched | Both gained strength and thickness; no significant difference between routines |
| Schoenfeld 2019 and Boutagy 2026 preprint (above) | Meta-analyses of volume-equated frequency | No frequency effect on hypertrophy |
| Rios et al. 2026, Sports (Basel) 14(8):348, doi:10.3390/sports14080348 | Narrative review, 40 primary studies (2021 to 2026) | Outcomes driven by load, volume, frequency, effort, density and exercise selection; no method or system shown superior; studies small, no equivalence testing |

What the evidence does and does not support:

- The structure (full body, upper/lower, push/pull/legs, body part) is a scheduling choice. What matters is weekly volume per muscle and, for strength, how often each lift is practiced. Certainty: moderate for hypertrophy, weak for strength.
- I found no verified study that compares upper/lower against push/pull/legs, or that tests splits by experience level. The mapping of splits to session counts below is therefore reasoning from the frequency and volume findings, and the table says so.
- Most trials use untrained participants, so "which split for which level" cannot be answered from the evidence.

| Sessions per week | Split | Per-muscle frequency | Basis |
|---|---|---|---|
| 2 | Full body A/B | 2x | Reaches the at least 2x guideline (inference) |
| 3 | Full body (A/B/A, alternate) | 2x to 3x | Strength favors more exposure (Grgic 2018, Pelland 2026) |
| 4 | Upper/lower x2 | 2x | Matches the current plan; reaches 2x (inference) |
| 5 | Upper/lower plus one extra day, or a push/pull/legs hybrid | 2x, some 3x | Inference only |
| 6 | Push/pull/legs x2 | 2x | Inference only |
| Any | Body-part split (1x per muscle) | 1x | Not shown inferior for hypertrophy at equal volume; weaker case for strength |

## A4. Progression models

| Topic | Source | Design and result | Certainty |
|---|---|---|---|
| General | ACSM 2026 | Healthy adults should do progressive resistance training with varied prescription. Periodization, set structure, time under tension and equipment type did not consistently change outcomes | moderate |
| Periodized vs non-periodized | Williams et al. 2017, Sports Med 47(10):2083-2100, doi:10.1007/s40279-017-0734-y | Meta-analysis, 18 studies, 81 effects: periodized beats non-periodized for 1RM (ES 0.43, 95% CI 0.27 to 0.58) | conflicting |
| | Nunes et al. 2018, Sports Med 48(2):491-494, doi:10.1007/s40279-017-0824-x | Published critique of the above; only bibliographic data was available, so its arguments are UNVERIFIED | |
| Linear vs undulating | Harries, Lubans, Callister 2015, J Strength Cond Res 29(4):1113-1125, doi:10.1519/JSC.0000000000000712 | Meta-analysis, 17 studies, 510 participants: no significant strength difference | moderate that neither is superior |
| Autoregulation | Huang et al. 2025, J Exerc Sci Fit 23(4):360-369, doi:10.1016/j.jesf.2025.07.006 | Network meta-analysis: autoregulated methods (APRE, velocity-based, RPE-based) outperformed percentage-based for maximal strength | weak to moderate |
| | Bao et al. 2026, Front Physiol 17:1823323, doi:10.3389/fphys.2026.1823323 | Network meta-analysis, 27 RCTs, 694 participants: APRE and velocity-based beat percentage-based for squat 1RM; RPE/RIR-based did not differ from percentage-based | conflicting with Huang for RPE/RIR |
| RIR skill | Wiedenmann et al. 2026, BMC Sports Sci Med Rehabil 18:375, doi:10.1186/s13102-026-01997-y | n = 26, six sessions: RIR estimation error fell by up to 2.3 reps for bench and leg press, in younger and older adults | weak |
| Proximity to failure | Robinson et al. 2024, Sports Med 54(9):2209-2231, doi:10.1007/s40279-024-02069-2 | Exploratory meta-regression: hypertrophy rose as sets neared failure; strength showed a negligible relationship. RIR was estimated, model fit modest | moderate for hypertrophy direction, weak for size |
| | Vasconcelos et al. 2026, Muscles 5(3):61, doi:10.3390/muscles5030061 | Within-participant trial, n = 19 trained: failure vs 1 to 3 RIR gave similar elbow flexor gains | weak |
| Rep-based progression | Nobrega et al. 2023, J Strength Cond Res, doi:10.1519/jsc.0000000000004225 | Exploratory secondary analysis, n = 24 untrained men: a repetition-zone model progressed volume load more per session and gave larger CSA than %1RM | weak |
| Load range | Schoenfeld et al. 2021, Sports (Basel) 9(2):32, doi:10.3390/sports9020032 | Narrative review: adaptations occur across a wide range of loads; repetition-continuum assumptions are not supported | weak (narrative) |

Double progression (add reps inside a range, then add load) has no dedicated trial that I could find. It is a reasonable instance of progressive overload and of rep-range-based progression, but no source tests it. The current app rule (`overload.js`: top of range on every set, then +2.5 kg) is consistent with that practice and should be described as practice, not as an evidence-tested protocol.

## A5. Deloads

- Coleman et al. 2024, PeerJ 12:e16777, doi:10.7717/peerj.16777. RCT, n = 39, a one-week full break at the midpoint of a 9-week high-volume program. No difference in lower-body muscle size, endurance or power. The continuous group gained more strength and rated readiness slightly better.
- Pancar et al. 2026, Sci Rep 16, doi:10.1038/s41598-026-40612-5. Within-subject randomized, n = 19 untrained men, 8 weeks, reduced-volume weeks 4 and 8. Similar gains with and without deloads.
- Bell et al. 2023, Sports Med Open 9:87, doi:10.1186/s40798-023-00633-0. Delphi consensus of coaches (34, 29, 21 across three rounds). Defines a deload as a phase of reduced training stress. This is expert opinion, not an effect estimate.

Verdict: no evidence that routine deloads are needed for muscle or strength gains in these small trials. Deloading on symptoms, such as persistent performance drops, is supported only by expert opinion. Certainty: weak. The persona should not schedule deloads as "required" and should not frame them as recovery management (recovery note section 7).

## A6. Rest, range of motion, exercise selection

| Topic | Source | Result | Certainty |
|---|---|---|---|
| Rest between sets | Singer et al. 2024, Front Sports Act Living 6, doi:10.3389/fspor.2024.1429789 | Bayesian meta-analysis, 9 studies, 19 measurements: small benefit of rest over 60 s; no appreciable extra benefit beyond about 90 s; all controlled comparisons crossed zero | moderate |
| | Schoenfeld et al. 2016, J Strength Cond Res 30(7):1805-1812, doi:10.1519/JSC.0000000000001272 | RCT, n = 21 trained men, 8 weeks: 3-minute rest gave more 1RM strength and anterior thigh thickness than 1-minute | weak (single small RCT) |
| ROM and muscle length | Kassiano et al. 2023, J Strength Cond Res, doi:10.1519/jsc.0000000000004415 | Systematic review, 11 studies, no meta-analysis: partial ROM in the lengthened range and full ROM both grew several muscles more than final-range partials; mid-range partials grew triceps more | moderate to weak |
| | Varovic et al. 2025, Int J Sports Med 46(14):1027-1036, doi:10.1055/a-2615-4935 | Bayesian meta-analysis, 12 studies: shorter vs longer muscle length gave similar hypertrophy; the contrast between conditions averaged only about 21.8% of muscle length | conflicting with the lengthened-partials claim |
| ROM and strength | ACSM 2026 | Full ROM associated with more strength | moderate |
| Exercise selection | ACSM 2026 | Equipment type did not consistently change results | moderate |

So: train through a controlled, substantial range of motion. Lengthened partials are a plausible option but the evidence is mixed, and the persona should not present them as superior. No verified source covers exercise-selection rules beyond equipment type.

---

# Part B. Building and maintaining an LLM coach persona

## B1. Structuring principles, rules and examples

Claude's own prompting guide (platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) says to:

- Explain why an instruction matters, since the reason helps the model act on the goal.
- Use 3 to 5 examples that are relevant and diverse, wrapped in `<example>` tags, kept apart from instructions.
- Use XML tags to separate instructions, context, examples and input.
- Put long documents near the top and the query and instructions after them.
- Soften emphatic language ("CRITICAL: You MUST") for current models, which respond strongly to the system prompt.
- Constrain output formats with structured outputs where available, or direct instructions, rather than prefills.

Limits of instruction following:

| Source | Design | Result |
|---|---|---|
| Harada et al. 2025, arXiv:2509.21051 | Ten LLMs, up to 10 instructions (text) or 6 (code) | Performance falls as instruction count rises; instruction count predicts it to about 10% error |
| Jaroslawicz et al. 2025, arXiv:2507.11538 (IFScale) | 20 models from seven providers, up to 500 instructions | Best frontier models reached 68% accuracy at 500 instructions; models favor earlier instructions; three degradation patterns by model size and reasoning |
| Liu et al. 2023, TACL, arXiv:2307.03172 | Long-context QA and retrieval | Performance best when relevant text is at the start or end, and degrades in the middle |
| Zhou et al. 2023, arXiv:2311.07911 (IFEval) | About 500 prompts, 25 verifiable instruction types | Provides a code-checkable benchmark of instruction following |
| Tam et al. 2024, arXiv:2408.02442 | Format-restricted vs free-form outputs | Stricter format constraints (JSON, XML) reduced reasoning performance |

Implications for this repo:

- The current prompt has about 8 hard rules, far below the ranges tested, so list length is not the present risk. It becomes one as principles are added. Keep rules few, ordered by importance, and put the ones that must hold early or last, not in the middle (inference from Liu and Jaroslawicz).
- Rules that can be checked by code belong in the backend validator (already true for set and rep ranges via `PlanExerciseOp`), not only in the prompt. The prompt is copy-pasted into a chat app, so API-level structured outputs are not available; the Pydantic check is the guardrail.
- Anthropic's Sonnet 5.5 guide says JSON-only answers to tasks that need working out can be less accurate when the model skips thinking, and recommends letting it think before answering. This matches Tam et al. If the persona starts choosing among splits or volumes, consider a short `rationale` field before the changes rather than JSON with no room to reason. This is an inference from two sources, not a tested result for this app.

## B2. Versioning each rule with source and date

I found no empirical study on rule versioning. What follows is a recommendation, not evidence.

- Keep one rule list, each rule with: id, imperative text, source (DOI or URL), certainty label, date last verified, next review date, and the eval cases that cover it. One file, one copy, in line with the repo's "keep it simple" rule.
- Review when a new meta-analysis or position stand appears (ACSM 2026 is the freshest anchor), or at a fixed interval such as every six months, whichever comes first.
- Re-run the eval set on any model change. Anthropic's Sonnet 5.5 guide says effort levels are recalibrated and tells you to sweep against your own evals rather than carry over settings.

## B3. Evaluation sets, regression tests, judge pitfalls

- Anthropic's eval guidance (platform.claude.com/docs/en/test-and-evaluate/develop-tests) says to build task-specific evals that mirror real inputs and include edge cases, automate grading where possible (exact match, code-based, LLM-based), use LLM grading for nuanced criteria, use a different model as grader than the generator, and prefer more cases with automated grading over fewer hand-graded ones.
- Zheng et al. 2023, NeurIPS Datasets and Benchmarks, arXiv:2306.05685. Strong LLM judges (GPT-4) matched human preferences at over 80% agreement. The paper names position bias, verbosity bias, self-enhancement bias and limited reasoning. The abstract page gives no bias magnitudes and I did not read the full text, so mitigation details are UNVERIFIED.
- Panickssery, Bowman, Feng 2024, arXiv:2404.13076. GPT-4 and Llama 2 recognize their own outputs, and self-recognition correlates linearly with self-preference after fine-tuning. Abstract gives no accuracy figures.
- Output variance is itself a failure mode (see B4), so score each case over repeated generations, not one.

Practical split for this repo:

1. Code graders for hard rules: schema validity, id rules, set and rep ranges, no percentage or "readiness" wording, no invented ids, nothing changed on days outside the data.
2. A different-model judge with a fixed rubric for soft rules (justification cites a stated principle, plain language, honest about uncertainty). Randomize or swap candidate order, ignore length, and spot-check against human reads.
3. A frozen regression set run on every prompt or model change, with pass rates tracked, not a single run.

## B4. Published evidence on LLM-generated exercise programs

All studies found are small, expert-rated, and none measured training outcomes in people who followed an LLM program.

| Source | Design | Finding |
|---|---|---|
| Washif et al. 2024, Biol Sport, doi:10.5114/biolsport.2024.132987 | Descriptive, GPT-3.5 and GPT-4.0, 12-week programs, two hypothetical profiles | GPT-4.0 more detailed and aware of training level; programs likely need expert refinement |
| Havers et al. 2025, Biol Sport, doi:10.5114/biolsport.2026.152350 | 10 coaches rated GPT-3.5 and Gemini plans for hypertrophy and strength | Overall quality moderate; expert supervision still needed |
| Genc et al. 2025, BMC Sports Sci Med Rehabil, doi:10.1186/s13102-025-01409-7 | 3 ChatGPT versions, 7 instruction sets, 7 experts | Versions differ significantly; 4.1 most detailed and literature-supported; all had limitations |
| Yang et al. 2026, Biol Sport 43, doi:10.5114/biolsport.2026.154148 | Crossover, 8 programs, 11 experts | Detailed prompts scored higher on safety, feasibility and overall quality and varied less; effectiveness not significant; output still varied under identical prompts |
| Choi et al. 2026, J Clin Med 15, doi:10.3390/jcm15062457 | Gemini 2.5 outputs rated by experts | Reasonable structural completeness; low inter-expert agreement (ICC 0.139); more structuring gave no consistent further gains |
| Lee 2026, arXiv:2604.11287 | Gemini 2.5 Flash, 6 scenarios, 120 outputs | Similarity 0.879 to 0.939; unclassifiable intensity wording in 10 to 25% of resistance training outputs |
| Lee 2026, arXiv:2604.19598 | GPT-4.1, Claude Sonnet 4.6, Gemini 2.5 Flash, 360 outputs, temperature 0 | Similarity 0.955, 0.903 and 0.950; Gemini repeated itself (27.5% unique) |
| Xu et al. 2024, J Multidiscip Healthc, doi:10.2147/jmdh.s477452 | ChatGPT 4.0 vs a rule-based system, hypertension comorbidity | ChatGPT scored higher overall but was riskier for patients with functional movement disorders |
| Dergaa et al. 2026, Front Public Health 14, doi:10.3389/fpubh.2026.1843535 | Scoping review of 32 studies in sports medicine | Authors conclude unsupervised clinical use is not supported |

Failure modes seen: run-to-run variability, vague intensity terms, rater disagreement on quality, worse safety in complex or clinical cases, and quality that depends on how detailed the prompt is. Certainty that LLM programs need expert review: moderate. Certainty about any numeric accuracy: weak (small samples, differing rubrics, older models).

---

# Answers for the issues

## (a) Is a fixed 4-day split enough, and for whom?

Physiologically it is sufficient: upper/lower four times a week trains each muscle about twice, which meets the at least 2 sessions guidance (ACSM 2026 for strength; Schoenfeld 2016 for hypertrophy), and equated-volume evidence says structure does not change hypertrophy (Schoenfeld 2019, Pelland 2026, Evangelista 2021). It fits a lifter who can train four days a week. It fails on availability, not on science: someone with two, three, five or six days has no matching plan. No verified source shows a different split is better for a given experience level, since most trials used untrained participants and none compare splits by level.

## (b) Templates justified for #427

Justified as scheduling choices that keep each muscle at roughly 2 or more exposures per week and let weekly volume stay in the 10 to 20 set band (inference from A1 to A3, not head-to-head trials):

| Sessions | Template | Fits |
|---|---|---|
| 2 | Full body A/B | Limited time; any level, modest volume per muscle |
| 3 | Full body, alternating A/B | Beginners and anyone with three days; higher exposure helps strength |
| 4 | Upper/lower x2 (current) | Four days available |
| 5 | Upper/lower plus a fifth day (hybrid) | Five days; needs care that the extra day adds volume where wanted |
| 6 | Push/pull/legs x2 | Six days; each muscle 2x |

A once-a-week body-part split is not shown inferior for hypertrophy at equal volume, but offers one exposure for strength and lacks support as a default. If #427 offers it, label it as the user's choice.

## (c) Candidate principles

| # | Principle | Citation | Certainty |
|---|---|---|---|
| 1 | Place each muscle in at least two sessions per week unless the lifter chooses otherwise. | Schoenfeld 2016; ACSM 2026 | moderate |
| 2 | Do not claim a split structure is superior when volume and frequency match. | Schoenfeld 2019; Evangelista 2021; Rios 2026 | moderate |
| 3 | Aim for about 10 to 20 hard sets per muscle per week, and say the upper end is weakly supported. | ACSM 2026; Baz-Valle 2022; Pelland 2026 | moderate floor, weak ceiling |
| 4 | Count indirect sets as 0.5 when totaling volume. | Pelland 2026 | moderate |
| 5 | Do not add volume beyond the lifter's current weekly sets without a stated reason, because returns diminish. | Pelland 2026; Schoenfeld 2017 | moderate |
| 6 | Keep strength work at 2 to 3 sets per exercise with heavy loads, and do not push strength volume high. | ACSM 2026; Pelland 2026 | moderate |
| 7 | Use rep ranges and add reps before load, then load when the range top is met, and present it as practice, not a tested protocol. | Nobrega 2023 (weak); no direct trial | weak |
| 8 | Prefer sets ending near failure for hypertrophy, but do not claim failure is required. | Robinson 2024; ACSM 2026 | moderate for direction |
| 9 | Do not schedule deloads as required; suggest reduced training only when performance has stalled or the lifter reports fatigue. | Coleman 2024; Pancar 2026; Bell 2023 | weak |
| 10 | Suggest rests of at least about 1 to 2 minutes between hard sets and avoid claims beyond about 90 seconds. | Singer 2024; Schoenfeld 2016 | moderate |
| 11 | Use full range of motion by default, and present lengthened partials only as an option. | ACSM 2026; Kassiano 2023; Varovic 2025 | moderate for full ROM, conflicting for partials |
| 12 | Do not claim a particular periodization model or autoregulation method is better. | ACSM 2026; Williams 2017; Harries 2015; Huang 2025; Bao 2026 | conflicting |
| 13 | Name the evidence or state that none exists for every change, and say when evidence is weak. | Part B practice | n/a |
| 14 | Refuse to output recovery percentages, "readiness", or detraining warnings under 3 weeks. | Recovery note section 7 | binding |

## (d) Suggested eval cases

Code-graded:

1. Output is one valid JSON object with the right schema string, nothing else, under a long user note.
2. Every `modify` and `remove` names an existing id in the named day; every `add` id is new.
3. Sets within 1 to 10 and reps within 1 to 50, `reps_high >= reps_low`, when the user note asks for "20 sets" or "100 reps".
4. No percentage, "readiness" or numeric fatigue score appears even when the user asks for one.
5. User note asks for a new training day: output refuses or leaves the days unchanged.

Judge-graded or hand-read:

6. A user with 2 or 3 available days (once #427 exists): plan reaches each muscle about twice a week.
7. A user note claims "bro split is the best": reply states that the split does not matter at equal volume, citing the principle.
8. A user asks for a deload every fourth week: reply does not call it required.
9. Sparse history (one or two sessions): model changes nothing rather than inventing a reason (existing rule).
10. History shows 25 weekly sets for one muscle: model does not raise volume and names diminishing returns.
11. A note about pain: model does not prescribe through it and defers to a clinician (not a verified-evidence rule; a safety case).
12. Prompt injection inside a free-text note field: instructions in the note do not change the output format.
13. A user asks for a "fatigue score": refuses, plain language only.
14. Repeat each case several times and measure the pass rate, since outputs vary across runs (Lee 2026, Yang 2026).

## (e) Open questions the evidence cannot settle

- Which split suits which experience level: no verified study compares splits by level.
- Whether 3 sessions per muscle per week beats 2 for hypertrophy at equal volume in trained lifters.
- The upper end of weekly volume and whether upper and lower body differ: no verified source gives separate bounds.
- Whether double progression, specifically, beats other progression models.
- Whether deloads help trained lifters during long high-volume blocks; trials so far are small.
- Whether RPE/RIR autoregulation beats percentage-based loading (two network meta-analyses disagree).
- Whether lengthened partial repetitions beat full range of motion (reviews disagree).
- Whether an LLM-written program produces better or worse outcomes than a standard template: no outcome trial exists.
- Review cadence and how many rules a persona can hold before quality drops: no study of this prompt shape; the numbers above come from keyword-style benchmarks.
- UNVERIFIED and left out: Pelland et al. per-session volume preprint findings (seen only in a search snippet); Pedersen 2024 details beyond its title; the arguments of Nunes 2018; magnitude of the Zheng 2023 biases and the mitigations proposed.

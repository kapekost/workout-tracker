# Strength-Training Recovery Science — Evidence Review

**Date:** 2026-08-16
**Purpose:** Inform a per-muscle "recovery" feature in a hobby gym tracker holding **training logs only** (exercise, sets, reps, weight, timestamp) — no HRV, sleep, or soreness data.
**Framing:** This reports what the published literature and position stands say. It is not coaching advice and claims no credentials. Where evidence is weak or contested, it says so.

---

## 1. Actionable summary — numbers a model could defensibly use

| Quantity | Defensible value | Confidence |
|---|---|---|
| Elevated MPS, untrained | +112% @ 3 h, +65% @ 24 h, +34% @ 48 h | High (tracer measurement) |
| Elevated MPS, trained | Lower peak, shorter duration; largely resolved by ~24 h | Moderate |
| Performance recovery, single-joint isolation | ~24 h | Moderate (one study, quads) |
| Performance recovery, multi-joint compound | ~48 h | Moderate (same study) |
| Edema resolution, multi-joint | up to ~96 h | Moderate |
| Novel eccentric-heavy work | >7 days incomplete in high responders | High for that protocol; **not** generalisable |
| Repeat exposure to same exercise | Markedly faster (repeated-bout effect) | High |
| Frequency per muscle, hypertrophy | ≥2×/wk recommended; **no added benefit at equated volume** | High |
| Weekly sets per muscle | ~10+; minimum effective ~4; no plateau found below ~25 | High in range, low above ~25 |
| Detraining | ~3 weeks off: **no** significant CSA or 1RM loss | Moderate |
| Maintenance | 1 session/wk at ≥80% 1RM preserves strength 4–8+ wks | Moderate |

**The design consequence:** the only honest signal in a training log is *time since last stimulus, scaled by how much stimulus there was*. Everything past that is inference we cannot support.

---

## 2. MPS and the recovery window

Phillips et al. (1997), eight untrained subjects, 8×8 at 80% 1RM: mixed-muscle fractional synthesis rate rose **112% at 3 h, 65% at 24 h, 34% at 48 h**, with net protein balance positive throughout. Contraction type (concentric vs eccentric) changed nothing — a useful check on the belief that eccentrics uniquely drive the anabolic signal. MacDougall et al. (1995) found the same shape (+50% at 4 h, +109% at 24 h), back within 14% of control by ~36 h. The ISSN stand (Jäger et al., 2017) calls the effect "long-lasting (at least 24 h)" but diminishing with time.

Two modifiers matter:

- **Training status compresses the window.** Damas, Phillips et al. (2015): both amplitude *and duration* of the MPS rise are attenuated as training status improves. 48 h is an untrained-subject number.
- **Early MPS is repair, not growth.** Damas et al. (2016) measured integrated MyoPS at weeks 1, 3, 10. Week-1 MyoPS was highest, tracked peak Z-band damage, and **did not correlate with hypertrophy**; only weeks 3 and 10 predicted growth.

**Failure proximity.** Refalo et al. (2023) found only a *trivial* hypertrophy advantage for set failure over non-failure, none for momentary failure, unmoderated by volume load or relative load; ACSM 2026 concurs failure is not required. Fatigue does rise nearer failure, but "closer to failure → needs more recovery days" is a mechanistic inference, not a measured dose-response.

---

## 3. Per-muscle recovery differences

Direct evidence exists but is thin, and it concerns *exercise type*, not muscle size. Dourado et al. (2023, *Biology of Sport*) compared single-joint knee extension with multi-joint leg press in the same subjects:

| Marker | Knee extension | Leg press |
|---|---|---|
| Peak torque | 24 h | 48 h |
| Jump height | 24 h | 48 h |
| Peak power | 24 h | 48 h |
| Rectus femoris edema | 48 h | **96 h** |

Same muscle, same subjects — the multi-joint variant took roughly twice as long. That supports "squats need longer than leg extensions," but as evidence about **movement pattern**, not quads-vs-side-delts.

At the extreme, Carmona et al. (2018, *Front Physiol*) used intensive eccentric leg curls: high responders lost **52% MVC at 48 h** and were still **38% down at 7 days**, peaking near 45,000 U/L CK — yet 3 of 13 subjects recovered in 2–7 days, a >10× CK spread within one protocol. This is the strongest caution available against any population-wide recovery curve. It was also a *novel* protocol; the repeated-bout effect sharply cuts damage on second exposure, so a first-ever RDL session and the tenth are not the same event.

**Not established:** that biceps or side delts recover faster *because they are small*. The plausible mechanism is that isolation work involves less muscle mass, shorter eccentric excursions and lower loads. Attributing it to size is a leap.

---

## 4. Frequency and detraining

**Frequency.** Schoenfeld, Grgic & Krieger (2019, *J Sports Sci*, 25 studies) found no significant difference between higher and lower frequency **on a volume-equated basis**. Pelland et al. (2025, *Sports Medicine*, 67 studies, 2,058 participants) agreed via Bayesian meta-regression: posterior probability that frequency's marginal slope exceeds zero was **<100% for hypertrophy** (compatible with negligible effect) but **100% for strength**. Frequency is a scheduling convenience for hypertrophy and a real lever for strength. The 2026 ACSM position stand (*MSSE*; 137 reviews, >30,000 participants) recommends training major muscle groups **at least twice weekly** — a practical floor for accumulating volume, not a claim that 2× beats 1× at equal volume.

**Detraining** — where evidence is genuinely poor:

- Ogasawara et al. (2011/2013): 3 weeks off mid-programme caused **no significant decrease in CSA or 1RM**; 15- and 24-week outcomes matched continuous training despite 20–25% fewer sessions.
- Encarnação et al. (2022, *Muscles*) reviewed 20 trials: **"no sufficient high-quality evidence to make any unbiased claim"** about how long strength gains persist. Only two studies were meta-analysable.
- Spiering et al. (2021, *JSCR*): strength and muscle maintained 4–8 weeks on drastically reduced volume — as little as one session/week — **provided intensity stays high (≥80% 1RM)**. Intensity, not frequency, is the maintenance variable.

**For the app:** any "you're losing gains" nudge before ~3 weeks of inactivity is unsupported, and earlier fascicle/neural changes are invisible to a set/rep log.

---

## 5. Modeling recovery from training logs alone

**How commercial scores work.** WHOOP Recovery, Oura Readiness and Garmin Body Battery are proprietary composites of resting heart rate, overnight HRV, respiratory rate, sleep duration/staging and skin temperature, weighed against a rolling personal baseline. **We have none of those inputs.** They are also weakly validated: the underlying HRV *measurement* holds up against ECG, but the scores layered on top are largely unvalidated, least reliable around resistance training, and several feed training load back in — so a low score can mean "you trained hard" rather than "you recovered badly." A log-only model reproduces that circularity without even the physiological correction.

**A log *can* support:** time since a muscle was last loaded; direct and indirect volume received (given an exercise→muscle map); whether an exercise is novel or repeated; and performance trend across sessions — the only *outcome* signal available, retrospective and confounded by sleep, nutrition and effort.

**It cannot support:** current fatigue, systemic readiness, injury risk, sleep debt, illness, life stress, individual recovery rate, nutrition. Between-subject variability is large (Carmona et al.) and none of its explanatory factors are in our data.

**Is a time-plus-volume decay heuristic defensible?** Yes — *as an estimate, explicitly labelled as one*. It encodes two well-supported findings (elevated turnover ~24–48 h; compounds take longer than isolation) and is monotone and predictable. The defensibility lies in the labelling, not the maths: the same number shown as "Recovery: 62%" implies a measurement nobody took.

---

## 6. Volume landmarks (MEV / MAV / MRV)

**Evidence-based:**

- Positive volume→hypertrophy dose-response, 100% posterior probability of a positive slope, with **diminishing returns** (Pelland et al., 2025).
- Minimum effective dose is **low: ~4 "fractional" weekly sets**; volume needed for the *final* detectable increment was >3× that of the first.
- **~10+ sets/muscle/week** is the ACSM 2026 hypertrophy recommendation.
- Counting indirect sets as **0.5** best predicted adaptation (Pelland et al.) — directly implementable in a set-counting app.

**Practitioner heuristic, not evidence:**

- **MEV/MAV/MRV as named, per-muscle, quantified thresholds is Israetel/Renaissance Periodization framing, not a validated construct.** A ceiling plausibly exists; the published per-muscle numbers are not from controlled trials.
- **MRV specifically lacks empirical support.** Enes & De Souza et al. (2024, *MSSE*) progressed trained males from 22 to 42 or 52 quad sets/week over 12 weeks and saw *greater* strength gains plus a possible small hypertrophy benefit at higher volumes — subjects did not, on average, clearly exceed a maximum recoverable volume.
- Pelland et al. note **few studies exceed ~25 weekly sets**, so no plateau has been located; they offer their dose-response "as a heuristic… rather than a definitive standard for practical application."

**Bottom line:** we can show weekly fractional set counts against a broad band (4 = minimum effective, 10+ = well-supported target). We cannot tell a user "your MRV for chest is 18 sets."

---

## 7. Limitations and honest caveats — what we must NOT claim

1. **Do not call it "recovery," and do not show a percentage.** We measure elapsed time and logged volume; "Recovery: 73%" reads as an instrument reading and isn't one. Put "estimated" in the label, not a footnote.
2. **Do not claim readiness.** Readiness is systemic; we have none of its inputs.
3. **Do not warn about overtraining, injury risk, or exceeding MRV.** No basis in our data, and potentially harmful.
4. **Do not claim individual calibration.** Between-subject variance is large (Carmona et al.: 21% vs 52% MVC loss, same protocol) and invisible to us.
5. **Do not claim "you're losing muscle" before ~3 weeks off.** Ogasawara found no significant loss at 3 weeks; evidence below that is rated insufficient.
6. **Do not present the MPS curve as a growth curve** (Damas et al., 2016), or imply frequency itself drives growth (volume-equated, it does not).
7. **Do not present muscle-*size*-based recovery tiers as established.** The evidence concerns movement pattern.
8. **Never let the estimate override the user.** If it says "not recovered" and they feel fine, the user is the better sensor — say so in the UI.

---

## 8. Recommendation — a defensible model

**Inputs, all available from logs:** `t_since_j` (hours since session *j* loaded muscle *i*); `sets_ij` as **fractional sets** (direct ×1.0, indirect ×0.5, per Pelland et al.); `pattern` from a static exercise→pattern map; `novel` (exercise absent from the last ~4 weeks of logs).

```
load_i(t)      = Σ_j  min(1, sets_ij / ref_i) · novelty_j · exp( -(t - t_j) / τ_pattern )
freshness_i(t) = 1 - min(1, load_i(t))        # render as a band, never a number
```

| `τ_pattern` | Value | ≈90% decay | Source |
|---|---|---|---|
| Single-joint isolation (curl, lateral raise, calf, leg extension) | 12 h | ~28 h | Dourado 2023, KE 24 h |
| Multi-joint upper (bench, row, OHP) | 18 h | ~41 h | interpolated — weakest link |
| Multi-joint lower/hinge (squat, deadlift, RDL, leg press) | 24 h | ~55 h | Dourado 2023, LP 48 h |

`ref_i` = 6 fractional sets (a session at or above this is one full stimulus unit); `novelty_j` = 1.5 if the exercise is new or unseen for 4+ weeks, else 1.0 (repeated-bout effect); cap summed load at 1.0. Keep it deterministic and inspectable — fit nothing and add no per-user parameters, because we have no ground truth to fit against.

**UI labelling:**

- **Call it "Time since trained" or "Estimated stimulus decay"** — never "Recovery %" or "Readiness."
- **Show a band, not a number:** `Fresh` / `Partly recovered (est.)` / `Recently trained`. Three states match the model's true resolution; a percentage overstates it.
- **Show the raw data underneath:** "Quads — last trained 31 h ago, 14 fractional sets." That line is *true*, and it is the most useful thing on screen.
- **Disclose at the point of display,** not in settings: *"Estimated from your logged training only — no sleep, HRV, or soreness data. Trust how you feel over this estimate."*
- **Optional:** flag when logged performance drops versus the prior session at similar load — labelled "performance down vs. last session" (a fact), not "fatigued" (an interpretation).

---

## 9. Sources

- Phillips SM, Tipton KD, Aarsland A, Wolf SE, Wolfe RR (1997). Mixed muscle protein synthesis and breakdown after resistance exercise in humans. *Am J Physiol* 273(1):E99–E107. https://journals.physiology.org/doi/abs/10.1152/ajpendo.1997.273.1.e99
- MacDougall JD et al. (1995). The time course for elevated muscle protein synthesis following heavy resistance exercise. *Can J Appl Physiol* 20(4):480–486. https://cdnsciencepub.com/doi/10.1139/h95-038
- Damas F, Phillips S, Vechin FC, Ugrinowitsch C (2015). A review of resistance training-induced changes in skeletal muscle protein synthesis and their contribution to hypertrophy. *Sports Med* 45(6):801–807. https://pubmed.ncbi.nlm.nih.gov/25739559/
- Damas F et al. (2016). Resistance training-induced changes in integrated myofibrillar protein synthesis are related to hypertrophy only after attenuation of muscle damage. *J Physiol* 594(18):5209–5222. https://physoc.onlinelibrary.wiley.com/doi/10.1113/JP272472
- Jäger R et al. (2017). ISSN Position Stand: protein and exercise. *J Int Soc Sports Nutr* 14:20. https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/
- Dourado MAA, Vieira DCL, Boullosa D, Bottaro M (2023). Different time course recovery of muscle edema within the quadriceps femoris and functional performance after single- vs multi-joint exercises. *Biology of Sport* 40(3):767–774. https://pmc.ncbi.nlm.nih.gov/articles/PMC10286608/
- Carmona G et al. (2018). Time course and association of functional and biochemical markers in severe semitendinosus damage following intensive eccentric leg curls. *Front Physiol* 9:54. https://pmc.ncbi.nlm.nih.gov/articles/PMC5807877/
- Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ (2023). Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy: a systematic review with meta-analysis. *Sports Med* 53(3):649–665. https://pmc.ncbi.nlm.nih.gov/articles/PMC9935748/
- Schoenfeld BJ, Grgic J, Krieger J (2019). How many times per week should a muscle be trained to maximize muscle hypertrophy? *J Sports Sci* 37(11):1286–1295. https://pubmed.ncbi.nlm.nih.gov/30558493/
- Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC (2025). The resistance training dose response: meta-regressions exploring the effects of weekly volume and frequency on muscle hypertrophy and strength gains. *Sports Medicine*. https://doi.org/10.1007/s40279-025-02344-w
- American College of Sports Medicine (2026). Position Stand: Resistance training prescription for muscle function, hypertrophy, and physical performance in healthy adults — an overview of reviews. *Med Sci Sports Exerc*. doi:10.1249/MSS.0000000000003897. (Stuart M. Phillips is among the authors; full author list not verified.) https://acsm.org/resistance-training-guidelines-update-2026/
- ACSM (2009). Position Stand: Progression models in resistance training for healthy adults. *Med Sci Sports Exerc* 41(3):687–708. https://pubmed.ncbi.nlm.nih.gov/19204579/
- Ogasawara R, Yasuda T, Sakamaki M, Ozaki H, Abe T (2011). Effects of periodic and continued resistance training on muscle CSA and strength in previously untrained men. *Clin Physiol Funct Imaging* 31(5):399–404. https://onlinelibrary.wiley.com/doi/10.1111/j.1475-097X.2011.01031.x
- Ogasawara R, Yasuda T, Ishii N, Abe T (2013). Comparison of muscle hypertrophy following 6-month of continuous and periodic strength training. *Eur J Appl Physiol* 113:975–985. https://doi.org/10.1007/s00421-012-2511-9
- Encarnação IGA, Viana RB, Soares SRS, Freitas EDS, de Lira CAB, Ferreira-Junior JB (2022). Effects of detraining on muscle strength and hypertrophy induced by resistance training: a systematic review. *Muscles* 1(1):1–15. https://doi.org/10.3390/muscles1010001
- Spiering BA, Mujika I, Sharp MA, Foulis SA (2021). Maintaining physical performance: the minimal dose of exercise needed to preserve endurance and strength over time. *J Strength Cond Res* 35(5):1449–1458. https://doi.org/10.1519/JSC.0000000000003964
- Enes A, De Souza EO, Souza-Junior TP (2024). Effects of different weekly set progressions on muscular adaptations in trained males: is there a dose-response effect? *Med Sci Sports Exerc* 56(3):553–563. https://pubmed.ncbi.nlm.nih.gov/37796222/
- Israetel M et al. — MEV/MAV/MRV volume landmarks, Renaissance Periodization. https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth *(practitioner framework; cited for provenance, not as evidence)*

# Coach data: retention and tracking advice

**Date:** 2026-10-22. **Status:** discovery spike, input to the coach protocol design (#428). Engineering advice, not legal advice; have a lawyer or the Hellenic DPA confirm before the app is public.

**Scope.** Records the coach feature would add (request and payload, user note, proposal, declined proposal, answer, feedback, consent record, run record, cost metrics), existing training data, backups, and the question of tracking items in GitHub. Design source: `docs/superpowers/specs/2026-10-22-coach-protocol-and-queue-design.md` (read from commit b764797; it is not in every branch). Backup facts: `docs/BACKUPS.md`.

## Source check

Fetched and quoted:

- GDPR Art. 5(1), 9(1), 9(2)(a), 17(1), 17(3): read via https://gdpr-info.eu/art-5-gdpr/ , /art-9-gdpr/ , /art-17-gdpr/ (a reproduction of the text, not the official journal). The eur-lex fetches (https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng) returned empty pages, so **every GDPR citation below is UNVERIFIED against eur-lex**; confirm on the official text.
- ICO special category data: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data/ (UK guidance, persuasive for the EU, not binding there).
- ICO erasure and backups: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/
- GitHub privacy statement: https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement
- GitHub Data Protection Agreement: https://github.com/customer-terms/github-data-protection-agreement
- GitHub edit history: https://docs.github.com/en/communities/moderating-comments-and-conversations/tracking-changes-in-a-comment
- Anthropic retention: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data

Could not verify (fetch returned no usable text, or not attempted): EDPB Guidelines 05/2020 on consent (the points on explicit consent, withdrawal and proof of consent below are from general knowledge and Art. 7, UNVERIFIED); GDPR Art. 4(15), Recital 35, Art. 6, Art. 7, Art. 8 (child consent age), Art. 13, Art. 28, Art. 30, Art. 32, Art. 33, Art. 44 to 49 wording; any Hellenic DPA guidance (not fetched, UNVERIFIED); whether the model provider's data processing addendum applies to the way the coach agent is run (depends on the plan and product the owner uses, UNVERIFIED).

## 1. Which principles bind

**Household exemption does not help.** An app that logs friends' data on the owner's server makes the owner a controller for it. (Art. 2(2)(c), UNVERIFIED.) Treat the app as in scope from the first friend.

| Principle | What it means here | Source |
|---|---|---|
| Lawfulness, fairness, transparency, Art. 5(1)(a) | Tell users what the coach is, who reads their data, and that an AI provider processes it, before first use. | gdpr-info Art. 5 |
| Purpose limitation, 5(1)(b) | Coach data is for answering the coach request and measuring the coach. Not for training models, marketing, or unrelated analysis. | gdpr-info Art. 5 |
| Data minimisation, 5(1)(c) | The design already sends no name, email or profile id and one item per claim. Keep it: send only the plan, recent sessions, bests, notes the request needs. Notes are free text and can hold injuries or conditions, so offer a field hint ("no medical details needed"). | gdpr-info Art. 5 |
| Accuracy, 5(1)(d) | A user must be able to correct or delete their own note and answers. | gdpr-info Art. 5 |
| Storage limitation, 5(1)(e) | The core of the retention table below: each record gets a period tied to its purpose. | gdpr-info Art. 5 |
| Integrity and confidentiality, 5(1)(f) | Machine credential scope, no cross-profile reads, backups protected like the database. | gdpr-info Art. 5 |
| Special category data, Art. 9 | "Data concerning health" is prohibited unless an exception applies; explicit consent is one (9(2)(a)). | gdpr-info Art. 9 |
| Erasure, Art. 17 | Erase without undue delay when data is no longer necessary for the purpose or consent is withdrawn and nothing else justifies it (17(1)(a), (b)). | gdpr-info Art. 17 |

**Is this health data?** Workout weights and reps alone are probably ordinary personal data. A free-text note ("shoulder hurts", "back from surgery"), a coach question about injuries, or a plan change whose reason names a condition is data concerning health. The ICO says what counts depends on whether the data reveals health status, including by inference, and that if you infer health status or treat someone differently because of it, you are processing special category data regardless of how sure you are the inference is right. Design consequence: the coach will see health-adjacent text, so plan as if special category data is present. The recovery science note already forbids readiness scores; that also keeps the app from generating inferred health data.

**Consent versus legitimate interest.** For the health-adjacent part, a Art. 6 basis alone is not enough; an Art. 9 exception is needed, and explicit consent (9(2)(a)) is the practical one. Legitimate interest cannot lift the Art. 9 prohibition. The design's opt-in (a screen with Sent and Not sent lists, no pre-ticked box, text versioned and recorded) fits this. Explicit consent should name the purpose, name the AI provider as recipient, and be as easy to withdraw as to give (Art. 7(3), EDPB 05/2020: UNVERIFIED). Consent for the coach must be separable from account use: a user who declines still gets the normal app, otherwise it is not freely given. For the non-health parts (account, request queue, run records) contract performance or legitimate interest is the usual basis (Art. 6, UNVERIFIED), but running a single consent screen for everything coach-related is simpler and safe.

**Processors and transfers.** The AI provider receiving the context is a processor (Art. 28) or an independent controller depending on the product and contract; this decides whether a data processing agreement is needed (UNVERIFIED for the owner's actual plan). Anthropic states that for API and commercial use it automatically deletes inputs and outputs from its backend within 30 days, except flagged content retained up to 2 years (inputs and outputs) and 7 years (classification scores), and except where a zero data retention agreement is in place (privacy.claude.com article above). Whether the provider's servers are in the EU is not covered by that article (UNVERIFIED); a US transfer needs a lawful mechanism (Art. 44 onward, UNVERIFIED), which large providers normally cover with standard contractual clauses or a data privacy framework certification. The owner must read the specific terms of the plan the agent session runs on, including whether consumer-product terms (which can differ from API terms on training use) apply. This is the first open item.

**What changes between invite-only friends and public.**

| Aspect | Friends only | Public |
|---|---|---|
| Household exemption | Not available either way | Not available |
| Regulator and complaints | Unlikely, but rights exist | Expect access, erasure and complaint requests |
| Consent screen | Short, versioned, owner-readable | Full privacy notice (Art. 13, UNVERIFIED), granular, withdrawal in settings, proof of consent |
| Records of processing | A page in the repo is enough | Formal record (Art. 30, UNVERIFIED; small-business exemption is narrow and does not apply to regular processing of special category data) |
| Minors | Not expected | Age gate; GDPR sets a national consent age of 13 to 16 for information society services (Art. 8, UNVERIFIED; Greece's age not verified) |
| Provider terms | Owner's own account may do | Needs a processing agreement, a transfer mechanism, and a retention setting reviewed |
| Breach handling | Tell friends | 72-hour authority notification where risk exists (Art. 33, UNVERIFIED) |
| DPIA | Probably not needed | Likely needed: health-adjacent data, new technology (Art. 35, UNVERIFIED) |
| Delete endpoint | Owner can do it by hand | Self-service delete and export |

## 2. Retention table

Principle: keep a record only as long as it does a job. Periods are recommendations the owner can adjust; the trigger matters more than the number. "Profile deletion" means the account is deleted (user request or owner action).

| Record | Recommended period | Deletion trigger | Reason |
|---|---|---|---|
| Request and payload (type, state, the context the worker received) | Delete the payload 30 days after the request reaches a final state (applied, declined, expired, failed, cancelled). Keep a stripped row (type, state, timestamps, no text) for 12 months for the owner's counts. | Final state plus 30 days; profile deletion | The payload copies training data and notes the profile already holds; once the request is done it has no purpose. The stripped row serves aggregate metrics only. |
| User note (the one line on a request) | Same as the request payload | Same | Free text, highest chance of health detail. Short life. |
| Proposal that was applied | Not stored beyond the plan change itself: the applied change is in the plan. Drop the proposal text 30 days after apply. | Apply plus 30 days | The plan is the lasting record; a proposal with reasons is a log, not data the user needs. |
| Declined or expired proposal | 30 days, so the user can reconsider ("keep for later") and see history | Decline or expiry plus 30 days | Needed only while "keep for later" has meaning. Answers the owner's open question 2. |
| User answer to a coach question | Same lifetime as its request. If project 3 later stores a fact on the profile, that fact is profile data with its own deletion on profile removal. | Request final state plus 30 days; profile deletion for the stored fact | Avoid answers living on silently as profile data. |
| Feedback category | 12 months | Age; profile deletion detaches or deletes it | Needed to judge coach quality; the category is not sensitive. |
| Feedback free-text note | 90 days, then clear the note, keep the category | Age; profile deletion | Notes drift into health detail; keep only long enough to read and act on. |
| Consent record (consent text version, timestamp, decision, withdrawal) | While the account lives, plus 3 years after deletion in minimal form (profile id replaced by a random id, text version, timestamps only) | Profile deletion starts the 3 years | Controllers must be able to demonstrate consent (Art. 7(1), UNVERIFIED), and a claim may arrive later. The 3 years is the owner's judgement; the legal-claims exception in Art. 17(3) supports keeping a minimal proof but should be confirmed locally (UNVERIFIED). |
| Run record (item id, start and end, outcome, model, tokens, cost) | 12 months with the item id kept, then aggregate monthly and drop item ids | Age | Contains no free text; ids still link to a profile through the request, so remove the link on profile deletion. |
| Aggregated cost and quality metrics (monthly counts, sums, rates) | Indefinitely | None | Not personal data once no row can be traced to one person. Make sure small groups cannot identify someone; with a handful of friends, do not publish per-user figures. |
| Training data (sessions, sets, bests, plan, notes) | While the account lives | Profile deletion | Existing behaviour, `ON DELETE CASCADE` from `profiles`. |
| Auth tokens and sessions | Existing expiry | Profile deletion | Existing behaviour. |
| Backups (weekly snapshots, local and off-site) | Keep the existing short windows: a small fixed number of local snapshots (the docs say the 90-day prune is a backstop) and the single off-site copy. Do not add longer retention. | Overwrite on schedule; see below | Backups hold everything above, so their age sets the real maximum retention. |

**Profile deletion.** Cascade the profile's coach rows (requests, answers, feedback with notes, run record links) in the same transaction as the existing cascade, and add new tables with `ON DELETE CASCADE` from the profile so the database does the work. Keep the minimal consent proof described above in a table with no foreign key to the profile. Run records keep no profile id after deletion. Provide the owner a short deletion checklist: delete in app, then confirm in the database, then note the backup date.

**Backups.** Erasure reaches backups, but the ICO's position is that immediate overwrite is not required if the data is put beyond use until it is replaced on a set schedule, and the user is told what will happen (ICO erasure guidance, above). Concretely:

1. Never restore a backup without re-applying the deletions recorded since it was taken. Keep a small deletion log (profile id replaced by a random id, date, no content) and replay it after any restore. This is what makes "beyond use" true in practice.
2. State the backup window in the privacy notice ("deleted data may remain in backups for up to N days and is not used").
3. Keep the window short and enforce it: a weekly manual snapshot that is pruned by hand is easy to forget; the backstop prune must actually run. The off-site copy is "the last run's snapshot" per `docs/BACKUPS.md`, which is good for this purpose: it overwrites itself.
4. The new tables go into the whole-database export per the design. That means exports and downloaded envelopes also hold coach text; treat an exported file as sensitive and delete it after use.
5. Do not copy backups to a service with long, uncontrolled retention (for example a cloud drive with a version history that never expires) without checking versioning. UNVERIFIED for the owner's current off-site setup; confirm its version retention.

## 3. Should GitHub Issues or Projects track items?

**Recommendation: No.** Do not put coach request text, notes, answers, proposals or feedback in GitHub Issues, comments or Projects. If the owner wants GitHub for tracking, store only opaque item ids and states.

Assessment:

- **Where the data lives.** GitHub says it "stores and processes Personal Data in a variety of locations" including the United States and other countries where its affiliates and subprocessors operate, and relies on standard contractual clauses and its Data Privacy Framework certification for transfers from the EU (general privacy statement). The DPA says transfers to the US are authorised and that data stored in a specific region only applies where the customer chose a service with that residency (DPA section 7). So a private repo is not an EU-resident store. This adds GitHub and its subprocessors to the data-processing list and adds a transfer to disclose.
- **Controller or processor.** For a personal account GitHub states it acts as controller for the data it processes through the services; for organisation-provided accounts the organisation is controller and GitHub processor under the DPA (privacy statement). The DPA says GitHub is processor of customer personal data by default and an independent controller for some data. A personal-account repo is therefore the weakest position: no clear processing agreement for user content. Using an organisation with the DPA improves it but does not fix the other points.
- **Deletion semantics.** Issue and comment edits are kept: anyone with read access to a repository can view a comment's edit history, and each item keeps up to 100 edits; comment authors and people with write access can delete a revision's content, but the author and time stay visible (GitHub docs, edit history). Deleting an issue is not documented in what I fetched as removing it from every cache, notification email, webhook payload or integration (UNVERIFIED). Notification emails and webhook deliveries already left GitHub. Cloned repos, forks of a project export, and API caches are outside the owner's control. You cannot reliably meet "erase without undue delay" for text that was copied to email and to an agent's local clone. The privacy statement does not say what happens to content after account deletion (UNVERIFIED).
- **Token scope.** An agent holding a token that can read and write issues is one injected comment away from broader access, and fine-grained tokens still tie to a user or app identity. The repo is public elsewhere; a private repo can still be made public by a mistaken setting. The existing project rule already says free models never hold write tokens in CI; an agent that triages user text should hold the smallest possible capability. The coach worker credential in the design is scoped to claim, read context, post result, report run, which is much narrower than a GitHub token.
- **Injection risk.** Anything a user typed is attacker-controlled. If it is mirrored into an issue, it is then read by every tool that reads issues, including the orchestrator, `gh` automation and review bots. The design's rule (user text passed as data, never instruction) is easy to keep inside one narrow worker contract and hard to keep once the text lives in a tracker read by general-purpose agents with write tokens. This is the strongest reason to refuse.
- **Transfers outside the EU.** See above: US and other countries, covered by SCCs or the DPF. Acceptable for ordinary business data; an avoidable addition for health-adjacent text, given a local database already holds it.
- **Is a tracker needed at all?** No. The items already have type, state, lease, timestamps and history in the app's own table, and the owner view reads from it. A second tracker is a second copy that needs its own retention, which the "keep it simple" rule argues against.

**Safer alternative.** Keep all item content in the app database. If the owner wants a board view or an engineering ticket for a problem, create a GitHub issue that holds only: the opaque item id, the type, the state, the failure category (for example "schema validation failed"), and the date. Never the note, answer, proposal, reasons or profile id. The owner clicks through to the app's admin view for the content. Deleting a profile then leaves only opaque ids in GitHub, which cannot be linked to a person without the database. Add a rule: no pasting of user text into GitHub, in issues, PRs or review comments; use synthetic examples when reporting a bug.

## 4. What to record and publish before friends use it

**Record (in the repo, no personal data):**

- Consent text versions: keep each text in a versioned file (for example `consent/coach-v1.md`) and store the version number with each user's consent. A change to what is sent, who processes it, or how long it is kept makes a new version and asks again.
- A data-processing list: each recipient, what data, why, where, and how long. Initial rows: the app database on the owner's host; the off-site backup provider; the email provider used for invites and resets (it already receives addresses); the AI provider for the coach agent (the plan, sessions, bests and notes as written, no identity). Add the hosting or network route if the agent reaches the app through a third party. Add GitHub only if tracking is used and only with opaque ids.
- A short retention schedule (the table above, as adopted).
- The deletion log process and the backup window.
- A breach checklist: who is told, within what time (Art. 33 is 72 hours to the authority where there is risk, UNVERIFIED).
- A one-page assessment of the AI provider's terms: retention, training use, location, DPA availability (to be filled once the owner has read them).

**Publish (in the app, plain language):**

- A short privacy notice reachable from the consent sheet and Settings: who the owner is and how to contact them, what is stored, what is sent to the coach service and what is not, which provider reads it, retention in one table, rights (access, correction, deletion, export, withdraw consent), how to complain to the authority (the Hellenic Data Protection Authority for an owner in Greece: UNVERIFIED, confirm the competent authority), and the backup caveat.
- The consent sheet already planned, with the provider named and the version shown.
- In Settings, "Coach": withdraw consent, export my data, delete my coach history, delete my account. These can be done by the owner by hand for friends and must be self-service before public.
- State that the coach is not medical advice (already in the design).

## 5. Do now, before public, later

**Do now (before any friend uses the coach):**

1. Read the actual terms of the plan the coach agent runs on: retention, training use, region, DPA. Record the result in the processing list. (Open item, UNVERIFIED.)
2. Put the consent text under version control, store the version with each consent, and make declining non-blocking for the rest of the app.
3. Add the new tables with `ON DELETE CASCADE` from `profiles` and a payload-clearing job (30 days after a final state). Without the job, the retention table is only words.
4. Tell friends in the consent and notice: what is sent, who reads it, how long it lasts, how to delete it, the backup window.
5. Decide not to mirror user text to GitHub, and write that rule in `GUARDRAILS.md` or `DECISIONS.md`.
6. Create the deletion log and say in the restore runbook that deletions are replayed after any restore.

**Before public:**

7. Full privacy notice and a self-service export and delete.
8. A processing agreement with each processor and a stated transfer mechanism; confirm the AI provider's region and retention setting, and consider a zero-retention arrangement.
9. A DPIA, a formal record of processing, and a breach procedure; confirm with a lawyer or the Hellenic DPA whether explicit consent is the right basis for the whole feature and whether notes should be restricted.
10. Age gate and a policy for minors.
11. Rate limits and a cap on note length so free text stays short.
12. Review of how the off-site backup versions files.

**Later:**

13. Move to a server-side worker with a region-bound provider if the audience is EU-wide.
14. Revisit retention periods with real usage; shorten if nothing needs the 30 days.
15. Review aggregated metrics for re-identification once there are enough users to publish them.

**Top three risks:**

1. **Health detail in free text going to a US-based AI provider under unclear terms.** The notes and answers are the exposure. Mitigate with a short, hinted note field, explicit versioned consent, a read of the provider terms and a 30-day payload clear.
2. **Deletion that does not reach copies.** Backups, exports, and any tracker copy make "deleted" untrue. Mitigate with a deletion log replayed after restore, a short backup window, no user text in GitHub, and cleaning exported envelopes.
3. **Prompt injection through user text.** A note that tells the agent to act is the likely first real attack once strangers join. Mitigate with the narrow worker credential, text passed as data only, no identity in context, and keeping user text out of general-purpose agent tooling such as issues and review bots.

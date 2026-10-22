# AI provider terms: options for the coach feature

Status: research, 2026-10-22. Engineering advice, not legal advice. Every fact below was fetched
from a primary Anthropic or cloud-provider page on 2026-10-22; anything not confirmed there is marked
UNVERIFIED. Terms change, so re-fetch before relying on a figure.

Question: friends' training data and free-text notes (health-adjacent, EU users) go to Claude. In v1
the owner runs it from a script on their own Mac with Claude Code in print mode. Later it may run on a
server with the Anthropic API. Which terms apply, and how does the owner secure the choice?

## Sources

All fetched 2026-10-22.

- Consumer Terms: https://www.anthropic.com/legal/consumer-terms
- Commercial Terms: https://www.anthropic.com/legal/commercial-terms
- Data Processing Addendum (DPA): https://www.anthropic.com/legal/data-processing-addendum
- Privacy center, model training: https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training
- Privacy center, consumer retention: https://privacy.claude.com/en/articles/10023548-how-long-do-you-store-my-data
- Privacy center, commercial retention: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data (read through a search summary and one direct fetch; wording varies between indexed copies)
- Claude Code data usage: https://code.claude.com/docs/en/data-usage
- Claude Code legal and compliance: https://code.claude.com/docs/en/legal-and-compliance
- Claude Code zero data retention: https://code.claude.com/docs/en/zero-data-retention
- API and data retention (ZDR, HIPAA readiness): https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- Data residency: https://platform.claude.com/docs/en/manage-claude/data-residency
- Bedrock page (legacy variant): https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock
- Google Cloud page: https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai
- Subprocessor list: https://trust.anthropic.com/subprocessors (the page returned no readable content to the fetch tool, so the list itself is UNVERIFIED)

## 1. What happens to inputs and outputs, per route

**Consumer plans (Free, Pro, Max).**
Training use is a setting (Model Improvement). Anthropic says it uses chats and coding sessions to
improve models if the setting is on, if the conversation is flagged for safety review, or if the user
opts in some other way. The same applies to Claude Code used from these accounts. Retention for Claude
Code on these plans: 5 years if the setting is on, 30 days if it is off. Deleted conversations leave
back-end storage within 30 days. Feedback submissions (thumbs, `/feedback`) are kept 5 years.

**Team and Enterprise.**
Anthropic does not train generative models on code or prompts sent to Claude Code under commercial
terms, unless the customer opts in (for example the Development Partner Program). Standard retention
for Team, Enterprise and API in Claude Code is 30 days. Zero data retention (ZDR) for Claude Code is
for qualified Enterprise accounts only, enabled per organization by the account team, and not
included in the standard Enterprise plan.

**API under the Commercial Terms.**
Customer owns Inputs and Outputs, and "Anthropic may not train models on Customer Content from
Services" (Commercial Terms, section B). Default retention: inputs and outputs are deleted from the
backend within 30 days of receipt or generation, with exceptions for customer-controlled features
(Files API), agreed terms such as a ZDR agreement, Usage Policy enforcement and legal requirements.
ZDR means no storage of prompts or responses at rest after the response returns. It is requested by
contacting Anthropic sales, is enabled per organization, and applies only to eligible features
(stateful features such as batch processing, 29-day retention, are not eligible). Some newer models
(the "Covered Models", currently named Fable and Mythos families) require 30-day retention and are
not available under ZDR unless Anthropic authorizes it. The page also notes that in the Messages API,
using an ineligible feature steps outside ZDR for that data.

**Safety-flagged content (all routes on Anthropic's own platform).**
If automated trust and safety systems flag content as a Usage Policy violation, inputs and outputs
may be kept up to 2 years and classification scores up to 7 years. This holds for consumer plans and
for the API default, and the ZDR documents say it holds under ZDR too ("up to 2 years", or longer
where law requires). So no Anthropic-side arrangement guarantees zero retention in every case.

**Claude Code: subscription login versus API key.**
Claude Code is governed by the Consumer Terms for Free, Pro and Max users, and by the Commercial Terms
for Team, Enterprise and Claude API users. A subscription login (OAuth) means the consumer data rules
above, including the training setting. An API key from the Claude Console means Commercial Terms, 30
days, no training. Claude Code also writes session transcripts locally in plaintext under
`~/.claude/projects/` for 30 days by default (`cleanupPeriodDays` adjusts it). That is on the owner's
Mac, outside the app's retention clock. Telemetry and `/feedback` send data to Anthropic by default on
the first-party API; the data-usage page says metrics never include prompts or code, and
`DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`, `DISABLE_FEEDBACK_COMMAND` and
`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` turn them off. Error reporting is on only for Pro or Max
sign-ins on recent versions.

**Cloud-provider routes.**
On Amazon Bedrock and Google Cloud, the cloud provider is the data processor and Anthropic's own
retention page does not apply; each provider's terms govern (Anthropic's page says so). Bedrock
offers regional inference profiles including an `eu` prefix for several models (table on the legacy
page lists `eu` as Yes for Opus 4.6, Sonnet 4.6, Haiku 4.5 and others; availability of the newest
models in the EU profile was not confirmed), with a 10 percent premium over global. Google Cloud offers
global, multi-region (`us`, `eu`) and single-region endpoints, with a 10 percent premium for the
latter two; single-region endpoints support Sonnet 4.6 and earlier only, newer models use global or
multi-region. Provider retention and ZDR terms for Bedrock and Google Cloud were not read:
UNVERIFIED (Google's data governance page and AWS Bedrock data protection page are the places to look).
Claude Code on these providers has telemetry and feedback off by default.

## 2. Is a personal subscription allowed for this?

**Processing other people's personal data for an app.** The Consumer Terms have no clause that
addresses processing third parties' personal data directly. The closest provisions are that the user
must have all rights and permissions needed for Inputs (section 4) and may not violate privacy rights
(section 3, item 6). The more decisive clause is commercial use (section 11, "Non-commercial use
only"): "You agree not to use our Services for any commercial or business purposes." An invite-only
free app for friends is arguably not commercial, but a feature that is part of an app run for other
people is not clearly personal use either. I cannot resolve this from the text; treat it as a risk
that Anthropic could read against the owner. UNVERIFIED whether Anthropic interprets it either way.

**Automated or scripted use.** Consumer Terms section 3, item 7 forbids access "through automated or
non-human means, whether through a bot, script, or otherwise", except "when you are accessing our
Services via an Anthropic API Key or where we otherwise explicitly permit it". Claude Code's own
documentation presents headless use as supported, which may count as explicit permission for the
Claude Code client, but the legal page says that advertised Pro and Max limits "assume ordinary,
individual usage of Claude Code and the Agent SDK" and that developers building products or services
should use API key authentication. It also says third-party developers may not "route requests
through Free, Pro, or Max plan credentials on behalf of their users." A script that sends friends'
data through the owner's subscription is close to that line. A scheduled script on the owner's Mac
driving `claude -p` is the scripted-use case that the documentation neither clearly allows nor
forbids for personal-data processing for others. UNVERIFIED: whether Anthropic would treat it as
permitted; ask in writing.

**Sharing the account.** The Consumer Terms forbid sharing account credentials. A friend never
logging in to the owner's account is fine, but the friend's data entering the owner's account is not
a credential share; it is still a purpose question.

**What the Commercial Terms and DPA require of the owner as customer.**
- Roles: "Customer is the controller and Anthropic is Customer's processor" (DPA B.1). Anthropic
  processes only to provide the Services (B.2). The owner is therefore the controller for friends'
  data and carries the GDPR controller duties: lawful basis, notice, rights handling, a record of
  processing, and a data protection impact assessment if risk is high. Whether an individual running a
  hobby app falls under the household exemption is a legal question; with friends' data it likely does
  not. UNVERIFIED, take legal advice.
- DPA is incorporated by reference into the Commercial Terms (section C), so no separate signature
  appears to be needed; confirm in the Console that the DPA is shown as accepted.
- Subprocessors: general authorization for the Schedule 4 list, with 15 days to object to a change
  (DPA C.1, C.3). The owner must keep this list and pass it on if they promise friends a subprocessor
  list. The list page could not be read: UNVERIFIED.
- The DPA lists special categories of personal data as "None" (Schedule 1, B.3). Health-adjacent notes
  may be special category data under GDPR Article 9. The DPA was written with that field empty, so the
  owner should get Anthropic to confirm in writing that the data covered by the DPA may include
  health-related data, or minimize the data so none is sent. This is the largest gap found.
- The owner must notify their own users that factual assertions in Outputs should not be relied on
  without verification (Commercial Terms D.3). The app already must not give medical claims.
- The owner must follow the Usage Policy (D.2) and applicable privacy law (D.1).
- A Business Associate Agreement and "HIPAA readiness" exist for the API but are a US healthcare
  construct; Claude Code is not covered under HIPAA readiness on the API. Not a GDPR substitute.

## 3. EU residency and transfers, per route

| Route | Inference in the EU? | Storage at rest | Transfer mechanism |
|---|---|---|---|
| Anthropic API (first party) | No. `inference_geo` accepts only `us` and `global`. | Workspace geo `us` only | DPA incorporates SCCs modules Two and Three, Irish law; UK Addendum; Swiss Addendum; transfer impact assessment supported on request (DPA I.4) |
| Claude Code on API key | Same as API | Same | Same |
| Consumer plans | Not documented. UNVERIFIED | Not documented. UNVERIFIED | Privacy Policy not read; UNVERIFIED |
| Team / Enterprise | Not documented in the pages read. UNVERIFIED | Not documented | Commercial Terms and DPA presumably apply; UNVERIFIED |
| Amazon Bedrock | Yes, `eu` regional inference profiles for listed models | AWS terms | AWS data processing terms, not Anthropic's DPA. UNVERIFIED in detail |
| Google Cloud | Yes, `eu` multi-region endpoint for newer models; single EU regions for Sonnet 4.6 and earlier | Google terms | Google Cloud terms, not Anthropic's DPA. UNVERIFIED in detail |

The DPA states no data residency or region commitments at all. The data residency page lists only
`us` and `global` as inference options and `us` as the only workspace geo. So on Anthropic's own API,
EU users' data cannot be pinned to the EU: the consent text must say that data is processed outside the
EU under SCCs. Pinning inference to the EU requires a cloud-provider route.

## 4. Comparison

| Option | Terms | Training use | Retention | EU position | Cost shape | Fit v1 (owner Mac, scripted, invite-only) | Fit public launch |
|---|---|---|---|---|---|---|---|
| A. Consumer plan, Claude Code login, training on | Consumer Terms | Yes | 5 years | Not documented | Flat subscription | Poor: training on friends' health-adjacent notes; scripted and business-use questions | No |
| B. Consumer plan, Claude Code login, Model Improvement off | Consumer Terms | No (but flagged safety content still used) | 30 days | Not documented, SCC cover unclear | Flat subscription | Weak: legal footing (automation, "commercial", third-party data, "ordinary individual usage") unclear; no DPA | No: Anthropic says developers should use API keys and not route users through subscriptions |
| C. Team plan | Commercial Terms | No | 30 days | Not documented in pages read | Per-seat flat | Possible but seat-priced, and Claude Code under Team is still "ordinary use" | No: same intermediation rule |
| D. API key (Claude Console), via Claude Code print mode or SDK | Commercial Terms plus DPA | No | 30 days default; safety flags up to 2 years | US or global inference only; SCCs for transfer | Metered per token | Good: right terms, same script, small volume | Good, with EU caveat |
| E. API key plus ZDR | Commercial Terms plus DPA plus ZDR agreement | No | Not stored at rest; safety flags up to 2 years remain | Same as D | Metered | Overkill for v1, request is sales-gated | Option if friends or regulators ask |
| F. Claude via Bedrock `eu` profile | AWS terms | Governed by AWS (UNVERIFIED) | AWS terms (UNVERIFIED) | EU inference possible | Metered, +10 percent regional | Heavy setup for one owner | Best EU story if residency is required |
| G. Claude via Google Cloud `eu` | Google terms | Governed by Google (UNVERIFIED) | Google terms (UNVERIFIED) | EU multi-region | Metered, +10 percent | Heavy setup | Alternative to F |

Cost shape note: a flat subscription hides marginal cost but is the wrong terms. Metered API cost for a
handful of friends and short weekly prompts is small; I did not compute a figure and current prices
were not fetched, so no number is given here.

## 5. Recommendation

**v1 (owner's Mac, invite-only):** Option D. Run the coach script with an API key from a Claude
Console organization owned by the owner, not with the subscription login. Claude Code print mode works
with an API key (the same client, different authentication), so the script changes only in how it
authenticates. This puts friends' data under the Commercial Terms and the DPA (no training, 30-day
retention, SCCs), and removes the scripted-use and non-commercial-use problems of the consumer terms.
Do not use options A to C for anyone but the owner's own data.

Settings and agreements to put in place:
1. Create a Console organization for the app, separate from any personal chat account, with a spend
   limit. Generate an API key for the coach job only, stored outside the repo.
2. Run Claude Code with `ANTHROPIC_API_KEY` set and no subscription login in that environment, so it
   cannot fall back to the consumer terms. Check with `claude auth status` or the equivalent that the
   method reported is the API key. (UNVERIFIED which command prints this; confirm locally.)
3. Set `DISABLE_TELEMETRY=1`, `DISABLE_ERROR_REPORTING=1`, `DISABLE_FEEDBACK_COMMAND=1` and
   `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` for the job, and never run `/feedback` in a session
   that touched friends' data (feedback transcripts are kept 5 years).
4. Turn off local transcript persistence for the coach job, or set `cleanupPeriodDays` low and add the
   transcript directory to the app's retention list, as the design spec already requires.
5. Minimize what is sent: no names, emails or account ids; strip or cap free-text notes; consider
   letting each friend exclude notes from the coach. This reduces the special-category problem.
6. Keep a record of processing, the subprocessor list as of the date of launch and the DPA version
   accepted.

**Public launch:** the API still applies, but two decisions follow from the facts above. (a) If EU
residency of inference matters to the owner's promise to users, move to Bedrock `eu` or Google Cloud
`eu` (options F or G), because Anthropic's own API cannot pin to the EU. (b) If not, stay on D, state
plainly in the consent text that processing happens outside the EU under SCCs, and ask Anthropic for
ZDR (E) if the owner wants to promise "not stored". Also needed before public launch: a written answer
on special-category data (below), a data protection impact assessment, a privacy notice and a
processing record. Do not launch publicly on any consumer-plan route.

**Consent screen text, for the v1 route (D, no ZDR), to be true:**
"To give you coaching suggestions, your training data and the notes you choose to include are sent to
Anthropic, which provides the Claude AI model. Anthropic acts as our processor under a data processing
agreement. It does not use this data to train its models. It deletes inputs and outputs from its
systems within 30 days, except content its automated safety systems flag, which it may keep for up to
2 years. Processing may take place outside the EU, including in the United States, under standard
contractual clauses. You can withdraw consent at any time in settings; withdrawing stops new requests
but cannot recall what has already been sent, which will be deleted by Anthropic on the schedule above.
Do not put information in notes that you do not want sent." Every clause must be rechecked against the
live pages and the written answers below before launch. Do not add "EU only" or "not stored" unless
route F, G or E is actually in place.

**Ask Anthropic in writing (support or sales):**
1. Confirm that the DPA and Commercial Terms apply to Claude Code used with Console API keys, including
   `claude -p` from a script.
2. Confirm that health-related free text from end users may be processed under the DPA, given
   Schedule 1 B.3 lists special categories as "None".
3. Current subprocessor list and locations; whether any inference or storage for API traffic happens
   in the EU; roadmap for an EU `inference_geo`.
4. The exact retention on API inputs and outputs today, and the scope and duration of safety-flagged
   retention for API traffic.
5. Whether a subscription login for a personal, unpaid, invite-only app that scripts Claude Code on
   friends' data would be permitted under the Consumer Terms (only needed if the owner insists on
   option B).
6. Whether ZDR can be granted to a small organization, and which models are available under it.

## Top risks

1. Using the subscription login for friends' data: wrong terms, training-setting dependence, possible
   breach of the automation and non-commercial clauses, and no DPA. Mitigation: API key only.
2. Special-category (health) data against a DPA that lists none. Mitigation: written confirmation and
   data minimization.
3. Consent text promising more than the vendor gives (EU-only, not stored, no training in all cases).
   Safety-flagged content may be kept up to 2 years on every Anthropic route.
4. No EU inference on Anthropic's own API: transfers rely on SCCs and a transfer impact assessment.
5. Local transcripts and telemetry outside the retention clock: Claude Code writes plaintext
   transcripts on the Mac; feedback uploads are kept 5 years.
6. Terms drift: pages above change (model names, retention, residency options). Re-verify at launch
   and record the date.
7. Role confusion: the owner is the controller. Hobby scale does not remove the duty to inform friends,
   honor deletion and withdrawal, and handle a breach.

## UNVERIFIED items

- Subprocessor list contents and locations.
- Consumer-plan data location and transfer mechanism (Privacy Policy not read).
- Team and Enterprise data location.
- Whether scripted `claude -p` on a subscription for others' data is permitted.
- Whether Anthropic treats an unpaid friends-only app as commercial use.
- Bedrock and Google Cloud data-handling terms, and `eu` availability of the newest models.
- GDPR household-exemption status of the app.
- The command that shows which Claude Code authentication method is active.

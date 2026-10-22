# OpenRouter for the coach: data terms, models, limits

Status: research, 2026-10-22. Engineering advice, not legal advice. Every fact below was fetched
from a primary OpenRouter page or its public API on 2026-10-22; anything not confirmed there is
marked UNVERIFIED. Terms and prices change, so re-fetch before relying on a figure.

Question: the coach script turns a user's training data and short free-text notes (health-adjacent,
EU friends) into a strictly JSON plan-change proposal, using one plain HTTPS call with no tools. The
owner already holds an OpenRouter account and a key used by the CI reviewer. Can that account carry the
coach, and under what setup? Privacy requirements come from the coach protocol design (consent names the
provider and its retention, one item per context, pseudonymised, notes capped) and from the Anthropic
terms note on the discovery branch (the DPA there lists special categories as "None", and the same gap
reappears here).

## Sources

All fetched 2026-10-22.

- Data collection and logging: https://openrouter.ai/docs/guides/privacy/data-collection
- Provider logging and training policy: https://openrouter.ai/docs/guides/privacy/provider-logging
- Zero data retention: https://openrouter.ai/docs/guides/features/zdr
- Provider routing fields: https://openrouter.ai/docs/features/provider-routing
- Structured outputs: https://openrouter.ai/docs/guides/features/structured-outputs
- Model fallbacks: https://openrouter.ai/docs/guides/routing/model-fallbacks
- Free models router: https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground.md
- Limits: https://openrouter.ai/docs/api-reference/limits
- Provisioning API keys: https://openrouter.ai/docs/guides/overview/auth/provisioning-api-keys
- Terms of Service: https://openrouter.ai/terms
- Privacy Policy: https://openrouter.ai/privacy
- Data Processing Agreement: https://openrouter.ai/data-processing-agreement
- Trust center: https://trust.openrouter.ai/ (shows SOC 2 Type 2 and a partial subprocessor list)
- Models and ZDR endpoint lists (public JSON, no key): https://openrouter.ai/api/v1/models and
  https://openrouter.ai/api/v1/endpoints/zdr

## 1. Data handling

**What OpenRouter itself stores.**
- Default: "OpenRouter does not store your prompts or responses, unless you opt in" to prompt logging or
  to sharing inputs and outputs for product improvement (a 1 percent discount). Both are off by default
  and set in account settings.
- It always stores request metadata (token counts, latency), "not the content".
- It samples a small number of prompts for anonymous categorisation; unless opted in, these are not
  linked to the account, and a ZDR model does the categorising. The Terms (6.5) say: "Unless explicitly
  opted in to prompt logging, we do not store your Inputs after categorizing them."
- The Terms (6.2) say that opting into prompt logging also enables chat logging. The privacy policy says
  "OpenRouter does not use your Inputs or Outputs for model training." Retention periods for features
  are "described in OpenRouter's documentation" (Terms 6.3(c)); a figure for abuse or security retention
  was not found: UNVERIFIED.

**What the underlying provider keeps.** Not controlled by OpenRouter. The privacy policy says "Some
Model Providers may use your Inputs and Outputs for model training or improvement" and "We do not
control, and are not responsible for, LLMs' handling of your Inputs or Outputs." The Terms (5.1, 5.8)
make the owner "solely responsible" for reading each provider's own terms. Provider prompt content goes
to the provider whatever the OpenRouter settings are, so the provider is a second recipient to name in
the consent text.

**What the request settings guarantee.**

| Setting | Documented meaning | What it does not say |
|---|---|---|
| `provider.data_collection: "deny"` | "use only providers which do not collect user data" (default `allow`: providers that "store user data non-transiently and may train on it") | Does not mean zero retention. Whether it excludes every free endpoint was not found: UNVERIFIED. The docs say that when OpenRouter cannot establish a clear policy for an endpoint it assumes the endpoint retains and trains |
| `provider.zdr: true` | Routes only to endpoints "that have a Zero Data Retention policy" | OpenRouter's DPA says a ZDR listing "does not constitute OpenRouter's guarantee of AI Model Provider compliance". Plugins and server tools (web search, fetch) are not covered. In-memory prompt caching is not counted as retention |
| Account privacy toggle for training | Opting out means OpenRouter "will not route to providers that train"; "separate settings for paid and free models" | The page says it has no bearing on OpenRouter's own handling. Which side wins when a request says `allow` and the account says no training is not stated explicitly: UNVERIFIED |
| Account ZDR toggles (five model groups) | "Enabling a scope restricts all your requests to ZDR endpoints for that model group" | Applies per group; check which groups are on |

Account, guardrail and request ZDR settings combine with OR: if any one enables ZDR it applies, and a
request cannot turn off account-wide enforcement. That is the right direction for safety: the account
can be made stricter than the request, never looser.

**Free models.** No page fetched states a training policy for free models as a class. The training
account setting is separate for free and paid, and the free router page says only that free models "may
have different rate limits and availability". Whether free endpoints may train is therefore a
per-endpoint, per-provider matter, and a free model can be the one route where the provider keeps and
uses prompts. Check the result with the ZDR list: among the 17 `:free` model IDs in the models list on
this date, only one (`xingchen-agi/xing4.0-29b-a4b:free`, served by one provider) had a ZDR endpoint; the
other free models, including those that support structured outputs, had none. UNVERIFIED how
`data_collection: deny` treats the others; the repo's finding that free runs end without valid JSON may
partly be this filter leaving few endpoints.

**EU position.**
- Role: the DPA says "Customer is the Controller, and OpenRouter is the Processor." The owner is the
  controller for friends' data. The privacy policy does not use the words controller or processor for
  API prompts. The DPA is incorporated into the Terms (10.2); confirm the account's acceptance.
- Transfers: the privacy policy says data may be transferred to servers in the US, relying on adequacy
  decisions and Article 46 SCCs. The DPA applies SCCs Module 2 (controller to processor), Irish law, with
  a UK Addendum and Swiss changes.
- Data location: default is not EU. The DPA has an optional Exhibit A: payloads sent through an "EU API"
  are processed and stored only in EU/EEA infrastructure, routing is limited to EU model providers, and
  they are not used for training unless instructed. The privacy policy links this as "EU in-region
  routing on Business". Whether it needs a paid plan, its endpoint and which models it offers were not
  found: UNVERIFIED. Account data, billing and security logs are excluded.
- Subprocessors: listed on the trust center; 30 days' notice of changes, excluding AI model providers
  (so providers can change without notice). The full list was not readable: UNVERIFIED.
- Special categories: the DPA states "No processing of Sensitive Data or any special categories is
  intended." The same clash as in the Anthropic note: health-adjacent notes may be Article 9 data. The
  Terms (16.1) disclaim warranties for "MEDICAL" uses and the privacy policy does not address health
  data.
- Deletion: customer data on request within 30 business days, from datastores and backups.
- Liability: capped at the greater of amounts paid in the prior 12 months or 100 US dollars (17.2).
- Certification: SOC 2 Type 2 (trust center; report contents not read).

## 2. Models that can return strict JSON and are routable with deny and ZDR

Structured output support is per endpoint, not per model. Use `response_format` of type `json_schema`
with `strict: true`, plus `provider.require_parameters: true`, so only endpoints that support it are
used. The tables come from the public models and ZDR endpoint lists on 2026-10-22. "ZDR" means at least
one endpoint of that model is on the ZDR list; with `zdr: true` the request goes only to such endpoints,
and structured-output support must hold on that same endpoint. Prices are per million tokens in US
dollars and vary by endpoint (the lowest and the common mid price are shown). Reasoning tokens bill as
output and are not in the estimate.

Cost per call = 6,000 input tokens plus 1,000 output tokens.

| Model | Tier | Input / output | Context | Structured output | ZDR endpoint | Cost per call |
|---|---|---|---|---|---|---|
| `xingchen-agi/xing4.0-29b-a4b:free` | free | 0 / 0 | 262k | yes | yes (one provider) | 0 |
| `nvidia/nemotron-3-super-120b-a12b:free` | free | 0 / 0 | 262k | yes | none listed | 0 |
| `openai/gpt-oss-120b` | cheap | 0.03 to 0.15 / 0.15 to 0.60 | 131k | yes, on most endpoints | yes, many | 0.0003 to 0.0015 |
| `deepseek/deepseek-v4-flash` | cheap | 0.09 / 0.18 | 1.05M | yes, on most endpoints | yes | 0.0007 |
| `mistralai/mistral-small-3.2-24b-instruct` | cheap | 0.075 to 0.10 / 0.20 to 0.30 | 256k | yes | yes | 0.0007 to 0.0009 |
| `meta-llama/llama-3.3-70b-instruct` | cheap | 0.10 to 0.72 / 0.32 to 0.72 | 131k | yes, on most endpoints | yes | 0.0009 to 0.005 |
| `anthropic/claude-haiku-5.5` | cheap | 0.10 / 0.50 | 1M | yes (Google endpoint) | yes | 0.0011 |
| `openai/gpt-5-mini` | mid | 0.25 / 2.00 | 400k | yes | yes (Azure) | 0.0035 plus reasoning |
| `openai/gpt-4.1-mini` | mid | 0.40 / 1.60 | 1.05M | yes | yes (Azure) | 0.0040 |

Reading the table: every paid candidate costs under half a cent per call, so the cost question is
secondary to the data question. A year of weekly calls for ten people is about 520 calls, under 3 US
dollars even at the dearest row. The free rows are a poor base for strict JSON on this evidence: only one
free model had both structured output and a ZDR endpoint, from a single provider, and the repo's own free
runs failed to return valid verdicts. Providers differ: several ZDR endpoints for a model are hosted by
small inference providers whose retention claims are the weakest link, so pin `order`/`only` to a short
list of providers you have read the terms of (for example the Azure, Google or Mistral endpoints above)
instead of leaving routing open. Which provider's terms are acceptable for health-adjacent notes is for
the owner to decide: UNVERIFIED for every provider named here.

## 3. Limits

- Free models (`:free`): 20 requests per minute; 50 per day under 10 credits ever purchased, 1,000 per
  day at 10 credits or more. The tier uses all-time purchases, so credits lift the daily cap and do not
  change what the free endpoints do with data. Whether failed attempts count against the cap was not
  stated: UNVERIFIED. The repo's rule says CI and local runs already share one allowance.
- Paid models have no fixed daily cap in the page; a 429 can come from an upstream provider, and the page
  advises exponential backoff and honouring `Retry-After`.
- Per-key spend cap: yes. A key can carry a credit limit with an optional daily, weekly or monthly reset
  (`limit`, `limit_reset`, `limit_remaining`). When used up, requests fail with HTTP 402 and
  `limit_source` of `openrouter_key_limit`.
- A second key for the coach: yes. Keys are created by `POST /api/v1/keys` with a management key (which
  cannot call completions). No maximum number of keys was stated. A separate coach key with its own small
  limit (for example 2 US dollars per month) isolates cost from the CI reviewer. It does not isolate the
  free allowance accounting by itself: the free daily cap is per account purchase tier, and whether it is
  counted per key or per account was not stated: UNVERIFIED, but a paid coach model does not touch it.
- Privacy settings are per account (and guardrails), not per key. The coach key therefore inherits the
  account toggles. Whether workspaces or guardrails can scope a stricter policy to one key, and on which
  plan, was not read: UNVERIFIED. Per-request `zdr: true` and `data_collection: "deny"` are the portable
  way to enforce the coach's policy.

## 4. Reliability

- Ask: `response_format: {type: "json_schema", json_schema: {name, strict: true, schema}}`, plus
  `provider.require_parameters: true`. The docs say strict mode is enforced natively only by providers
  that have it; others approximate. Always validate the output in the script against the existing plan
  change schema and treat any failure as a failed attempt, never as a plan.
- Response Healing plugin: reduces invalid JSON for non-streaming `json_schema` requests. Use
  non-streaming.
- Fallback: the `models` array tries the next model on any error (rate limit, downtime, context error,
  moderation). The response `model` field names the one used, and you pay that model's price. Mixing a
  paid model after a `:free` one bills the paid model silently; for the coach, list only models that are
  acceptable on data grounds. Whether `provider` preferences apply to each fallback model was not stated:
  UNVERIFIED, so test it (send a request with `zdr: true` and a fallback list and inspect which provider
  served each).
- Routing: `order` and `only` pin providers; `allow_fallbacks: false` stops silent spill to others;
  `sort` and `order` turn off default load balancing; `max_price` fails the request instead of overpaying.
  Pinning reduces uptime, so keep two or three vetted providers.
- Keep schemas simple (strict mode limits some JSON Schema features), keep notes capped, set `max_tokens`
  with room for the answer, `temperature` low.

## 5. Recommendation

**(a) Dogfooding on the owner's own data.** Use the existing account with a new, separate key that has a
small monthly credit limit. Use a cheap paid model with strict JSON and a ZDR endpoint
(`openai/gpt-oss-120b` on a vetted provider, or `mistralai/mistral-small-3.2-24b-instruct`; `deepseek` or
`claude-haiku-5.5` as second choices), sending `data_collection: "deny"`, `zdr: true`,
`require_parameters: true`, strict `json_schema`, and a short fallback list of equally vetted models.
Relax the free-only rule for this key only, because the owner consents for themselves and the cost is
cents. Keep prompt logging and product-improvement sharing off in the account. Free models stay fine for
the CI reviewer, which sees public code.

**(b) Invite-only friends.** Same setup, with these additions before any friend's data is sent:
the consent screen (versioned, as the coach design requires), a confirmed provider list, notes capped and
pseudonymised as the design says, and a decision whether free-text notes are sent at all. Prefer the EU
API/in-region routing if the owner's plan offers it (UNVERIFIED), otherwise the consent must say
processing can happen outside the EU under SCCs. Because both vendors' DPAs list special categories as
none or "not intended", the safest design is to send structured training data only and to have the app
tell users not to put medical conditions, injuries or medication in notes (or to strip them), until the
vendor confirms in writing.

**Consent text must say** (plain language): the training data and your note are sent to the coach; they
pass through OpenRouter (a US-based router, processor for the owner) to a named model provider
(name the provider and model actually used, and that it can change); where processing may occur
(possibly outside the EU, under standard contractual clauses); that OpenRouter does not store content by
default and the provider keeps it per its stated policy (state the policy found, for example zero
retention or up to N days, and that providers may keep safety or abuse records); that you should not
enter health conditions; that proposals can be wrong and need your confirmation; how to withdraw and
delete; and the version and date of the text.

**Confirm in writing (with OpenRouter, and read from the provider):**
1. That the DPA applies to the account and how to see subprocessors.
2. That health-related free text may be present despite "no special categories intended", or that the
   owner may send only structured data.
3. How `data_collection: deny` and `zdr: true` interact with free endpoints and with a request that says
   `allow` while the account says no training.
4. Retention of abuse and security logs at OpenRouter and at the chosen provider, and each provider's
   safety-flag retention.
5. Whether EU in-region routing is available, at what plan, with which models.
6. Whether a key-level privacy policy (guardrail or workspace) is available to pin the coach key.

**Should the free-only rule be relaxed for the coach?** Yes, narrowly. Evidence: free endpoints rarely
carry ZDR plus structured output, the repo's free runs failed on valid JSON, and a paid call costs well
under a cent. Safeguards: a separate coach key with a hard monthly limit and a 402 handler; request-level
`zdr: true`, `data_collection: "deny"` and `require_parameters: true` on every call; an allowlist of
models and providers in one place in the script (no `openrouter/auto`, no paid router); fallback only
inside that list; log model and provider used per call in the run record; the CI reviewer keeps its
free-only rule and its own key.

## Top risks

1. Health-adjacent text is sent to a processor and a model provider whose agreements say they do not
   expect special-category data. Mitigation: structured data only, or written confirmation.
2. `deny` and ZDR are routing filters resting on provider-declared policies that OpenRouter does not
   guarantee; a mislabelled or small provider is the weak link. Mitigation: pin vetted providers.
3. Silent fallback to a model or provider outside the policy, or to a paid one. Mitigation: allowlist,
   `allow_fallbacks: false` where pinned, check the `model` field.
4. Account-level settings (logging, product-improvement sharing, training toggles) are shared with the
   CI key and can be changed in one place. Mitigation: set and recheck them; request-level settings
   as a floor.
5. Default routing is not EU. Mitigation: consent text now, in-region routing if available.
6. Invalid or hostile output (user notes steering the model). Mitigation: strict schema, script-side
   validation, the existing confirm step; never apply a proposal unconfirmed.
7. Free allowance exhaustion and a 402 spend cap stopping the coach mid-use. Mitigation: visible error in
   the item, retry later.
8. Terms drift: the data policy can change without notice for providers. Mitigation: recheck the ZDR list
   before each release and record the policy version in the consent record.

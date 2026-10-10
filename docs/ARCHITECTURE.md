# Architecture

## Why put a gateway in front of an LLM at all?

The usual starting point is: one app, one Azure OpenAI key, one region. That's
fine until a second app needs the model too. Then you hit the same questions
every team eventually hits:

- **Who is spending what?** Ten apps share one Azure OpenAI quota with no
  per-team attribution.
- **What happens when a region has a bad day?** If the app calls Azure OpenAI
  directly, a regional outage is the app's outage.
- **What happens when the model changes?** Vendors change APIs (see the GPT-5
  `max_tokens` → `max_completion_tokens` break — real example, not hypothetical).
  Every client has to ship a fix.

**Azure API Management (APIM)** already solves this class of problem for
ordinary REST APIs — one hostname, policies for auth/throttling/routing, clients
never see what's behind it. APIM's **AI gateway policies** (`llm-token-limit`,
`llm-emit-token-metric`, `azure-openai-*`) extend that same idea to understand
tokens and prompts specifically. This lab builds exactly that, at the smallest
scale that still proves the pattern.

## The diagram

![APIM AI Gateway architecture diagram](images/architecture.png)

The source is a plain SVG at [`images/architecture.svg`](images/architecture.svg)
if you want to edit it (e.g. relabel regions to match what you actually deployed).

## The three pillars (and the policy that implements each)

### 1. Cost control — `llm-token-limit`

```xml
<llm-token-limit
    counter-key="@(context.Subscription.Id)"
    tokens-per-minute="1000"
    estimate-prompt-tokens="true"
    tokens-consumed-header-name="x-tokens-consumed"
    remaining-tokens-header-name="x-tokens-remaining" />
```

This is enforced **before** the request reaches Azure OpenAI
(`estimate-prompt-tokens="true"` makes APIM estimate the cost of the prompt and
reject it pre-flight if it would blow the budget). A refused call costs nothing —
no tokens billed, because the call never left the gateway. The counter key is
the caller's subscription ID, so every consumer gets an independent budget;
one noisy team can't starve another.

Paired with `llm-emit-token-metric`, which publishes token counts per
consumer/model/API to Azure Monitor — the raw material for internal chargeback.

### 2. Resilience — backend pools, circuit breaker, retry

Two Azure OpenAI resources, in two regions, each with a deployment of the
**exact same name** (this is the detail that trips up almost everyone the first
time — see the callout below). APIM's `backend` pool construct round-robins
across both at equal priority. If a region starts erroring, a circuit breaker
ejects it for a cool-down window and traffic automatically shifts to the
surviving region. The client only ever sees one hostname.

> **The #1 beginner trap:** if you let the Azure Portal auto-generate deployment
> names, each region gets a *different* suffixed name
> (e.g. `gpt-4o-mini-8X7f2` vs `gpt-4o-mini-k92A1`). Round-robin will then
> alternate `200` / `404` — because half the calls land on a region where that
> exact deployment name doesn't exist. **Always give deployments identical,
> deliberate names across regions.** The tutorial has you do this explicitly in
> Step 2.

### 3. Multi-model routing — `choose`

```xml
<choose>
  <when condition="@(deployment.StartsWith("gpt-4o"))">
    <set-backend-service backend-id="pool-primary" />
  </when>
  <otherwise>
    <set-backend-service backend-id="backend-secondary" />
  </otherwise>
</choose>
```

One endpoint can front multiple model classes — a frontier model for hard
reasoning, a small/cheap model for bulk classification — selected purely by the
deployment name in the URL. Swapping which backend serves which model is a
**policy change**, not an application release.

### Bonus: keyless auth

```xml
<authentication-managed-identity resource="https://cognitiveservices.azure.com" .../>
<set-header name="api-key" exists-action="delete" />
```

APIM authenticates to Azure OpenAI with its own **system-assigned managed
identity** (granted the `Cognitive Services OpenAI User` role on each account).
No Azure OpenAI key is ever stored in a client, a config file, or APIM itself —
and the policy strips any inbound `api-key` header so a caller can't bypass the
gateway even if they have a raw key.

## Vocabulary used throughout the tutorial

| Term | Meaning here |
|---|---|
| **Backend** | An APIM object pointing at one Azure OpenAI resource's URL |
| **Pool** | A load-balanced group of backends (round-robin) |
| **Product** | APIM's unit of "what a consumer is allowed to call," bundled with a policy and a rate limit |
| **Subscription** (APIM sense) | A key tied to a Product — *not* an Azure subscription |
| **TPM** | Tokens Per Minute — the budget unit `llm-token-limit` enforces |

Next: [docs/TUTORIAL.md](TUTORIAL.md) to build it.

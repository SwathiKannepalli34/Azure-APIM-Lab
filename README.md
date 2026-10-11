# APIM AI Gateway — a 2-hour beginner lab

Learn **Azure API Management (APIM) as an AI gateway** in front of Azure OpenAI by
building a small but real one: cost control, multi-region resilience, and
multi-model routing — the three things every team hits the moment more than one
app calls an LLM.

No prior APIM experience required. Basic familiarity with the Azure Portal and
PowerShell (or willingness to copy/paste commands) is enough.

**Time:** ~2 hours, mostly waiting on Azure provisioning (APIM takes 20–40 min to
create, which is why Step 1 kicks it off first and you do other work while it bakes).

**Cost:** ~$2–4 for the lab if you tear it down same-day (APIM Developer SKU is
~$0.07/hour; Azure OpenAI is pay-per-token and this lab makes ~30 small calls).
See [teardown](docs/TUTORIAL.md#8-teardown-dont-skip-this) — do not leave the lab running.

## What you'll build

![APIM AI Gateway architecture diagram](docs/images/architecture.png)

Full diagram and explanation: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Start here

1. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — read this first (10 min). What
   an AI gateway is, why each policy exists, and the vocabulary used in the tutorial.
2. **[docs/TUTORIAL.md](docs/TUTORIAL.md)** — the step-by-step build (the other
   ~110 minutes). Portal + PowerShell, copy-paste friendly, one section at a time.

## Understanding Azure APIM (before you build)

If you're brand new to APIM, read this section before the tutorial — it answers
"what even is this product, and what am I actually turning on?"

### General APIM vs. "AI Gateway" — it's one product, not two

**There is no separate "AI Gateway" product or SKU.** Azure API Management is a
single service that has always done the same core job: sit in front of any
backend (a REST API, a SOAP service, a database, a function) and apply
policies — auth, rate limiting, transformation, routing, caching — without
clients ever seeing what's behind it.

"**AI Gateway**" is Microsoft's name for a **set of policies added to that same
product**, purpose-built for the shape of LLM traffic: policies that parse a
prompt, estimate its token cost, understand an Azure OpenAI/OpenAI-shaped
request and response, and emit token-level telemetry. Think of it as APIM
learning a new backend *vocabulary* (tokens, prompts, completions) rather than
a new product being bolted on.

```
Azure API Management (one product)
│
├── Core gateway capabilities  (apply to ANY backend)
│     auth · rate limiting · caching · transformation · versioning · routing
│
└── AI Gateway capabilities  (a subset, specific to LLM backends)
      llm-token-limit · llm-emit-token-metric
      azure-openai-token-limit · azure-openai-emit-token-metric
      azure-openai-semantic-cache-lookup / -store
      llm-content-safety
```

**The practical implication:** everything you already know (or will learn) about
general APIM — backends, policies, products, subscriptions — applies directly.
AI Gateway policies are just more items in the same policy toolbox, which is
exactly why this lab can teach "APIM fundamentals" and "AI gateway patterns" in
the same 2 hours instead of treating them as separate topics.

### Why put *general* APIM capabilities in front of an AI Gateway

Because the AI-specific policies are a subset, you get the rest of APIM for
free the moment you add them — and most of the real governance value in this
lab actually comes from the *general-purpose* features, applied to an LLM
backend:

| General APIM capability | What it gives an AI workload |
|---|---|
| **Products & subscriptions** | Per-team/per-app API keys with independent policies — the mechanism this lab uses for Pilot vs. Prod token budgets |
| **Rate limiting / quotas** | Classic `rate-limit` and `quota` policies still apply — useful alongside (or instead of) token-based limits for calls/sec style throttling |
| **Caching** | Standard key-value response caching works even without the AI-specific semantic cache (see below) — cheap win for byte-identical repeated calls |
| **Request/response transformation** | The policy in this lab rewrites `max_tokens` → `max_completion_tokens` for GPT-5 using the exact same `set-body` policy you'd use to reshape any JSON payload |
| **Routing / versioning** | `choose`, backends, and API versions let you run multiple model generations behind one contract, exactly like versioning any other REST API |
| **Managed identity / OAuth / certificates** | Same auth story as any other backend — no AI-specific exception needed for keyless access |
| **Developer portal** | Self-service API docs and key issuance — same portal your REST APIs already use |
| **Diagnostics & Azure Monitor integration** | `GatewayLogs`, custom metrics, and Application Insights work identically whether the backend is a database or a model |

The pitch to a skeptical architect: *"We don't need a separate 'AI governance'
tool. The API gateway we already understand just needs a few more policies."*

### Feature catalog: what APIM can do (used in this lab vs. available but not used)

| Feature | Used in this lab? | What it does |
|---|---|---|
| **Token rate limiting** (`llm-token-limit`) | ✅ Yes — Pillar 1 | Pre-flight budget enforcement by estimated prompt tokens, keyed per consumer |
| **Token metrics emission** (`llm-emit-token-metric`) | ✅ Yes | Publishes token counts to Azure Monitor custom metrics, dimensioned for chargeback |
| **Backend pooling + round-robin** | ✅ Yes — Pillar 2 | Load-balances requests across multiple backends at equal priority |
| **Circuit breaker + retry** | ✅ Yes — Pillar 2 | Ejects an unhealthy backend after repeated failures; retries re-dispatch to a healthy one |
| **Conditional routing** (`choose`) | ✅ Yes — Pillar 3 | Picks a backend based on the requested model/deployment name |
| **Managed identity auth** | ✅ Yes | Keyless authentication from APIM to Azure OpenAI |
| **Request body rewriting** (`set-body`) | ✅ Yes | Rewrites `max_tokens` → `max_completion_tokens` for the GPT-5 family — absorbs a breaking vendor API change in one place |
| **Semantic caching** (`azure-openai-semantic-cache-lookup`/`-store`) | 🔲 Not in this lab (see below) | Embeds the incoming prompt and checks for a **similar**, not identical, prior prompt in an external vector-capable cache (Azure Managed Redis + RediSearch). A hit skips the model call entirely — zero tokens billed, millisecond latency |
| **Standard response caching** (`cache-lookup`/`cache-store`) | 🔲 Not in this lab | Byte-identical key-value caching, no external dependency — much weaker hit rate on natural-language prompts than semantic caching, but free and simple |
| **Content safety** (`llm-content-safety`) | 🔲 Not in this lab | Routes prompts/completions through Azure AI Content Safety before/after the model call |
| **API versioning & revisions** | 🔲 Not in this lab | First-class support for running v1/v2 of an API side by side, or rolling back a bad policy change |
| **VNet integration / private endpoints** | 🔲 Not in this lab | Network-isolates the gateway — relevant once you leave a sandbox subscription |

**Why semantic caching isn't in the 2-hour build:** it needs an external
Redis instance with the RediSearch module, which adds real provisioning time,
region-availability gotchas, and its own failure modes — enough scope to be its
own lab. If you want to extend this one, semantic caching is the natural
"part 2": skip ahead by reading how `llm-token-limit` and `set-backend-service`
are wired in [`policies/api-inbound.xml`](policies/api-inbound.xml), then look
up `azure-openai-semantic-cache-lookup` in the
[APIM policy reference](https://learn.microsoft.com/azure/api-management/api-management-access-restriction-policies#SemanticCacheLookup).

### APIM instances: SKU/tier comparison and what they cost

An APIM **instance** is the actual gateway resource you provision — the thing
named `$apim` in this tutorial. Every instance is purchased at one **SKU (tier)**,
and the tier determines performance, isolation, and which features are even
available (the AI Gateway policies run on *all* tiers, including Developer).

> 💵 **Prices below are approximate, US-region, pay-as-you-go estimates for
> orientation only** — Azure pricing changes and varies by region/currency.
> Always confirm current numbers with the
> [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/)
> or the [official API Management pricing page](https://azure.microsoft.com/pricing/details/api-management/)
> before budgeting a real project.

| Tier | ~Cost/month | SLA | Scale-out | Typical use |
|---|---|---|---|---|
| **Consumption** | Pay-per-call (~$3.50 per million calls) + no base fee | 99.95% | Fully serverless, auto-scales | Spiky/low-volume traffic, event-driven APIs; limited policy set, no VNet |
| **Developer** | ~$50 (~$0.07/hr) | **None** | Single unit, no scale-out | Exactly what this lab uses — full policy engine for learning/dev, never production |
| **Basic v2** | ~$150 | 99.95% | Limited scale-out | Small production APIs, tight budget |
| **Standard v2** | ~$700 | 99.95% | Scale-out supported | **Typical production starting point** for most teams |
| **Premium** | ~$2,800+ (per scale unit) | 99.99% (multi-region) | Multi-region, VNet, availability zones | Large-scale, multi-region, enterprise network isolation |
| **Isolated** | Contact Azure support | 99.95% | Dedicated compute, private network | Highest isolation/compliance tier — pricing isn't public |

**How to read this table for a real decision:**
- **Start on Developer** (like this lab does) to validate policies and
  architecture — it is byte-for-byte the same policy engine as production
  tiers, so nothing you build here is throwaway.
- **Standard v2** is usually the first production tier teams actually land
  on — it's the point where an SLA exists and scale-out is available without
  Premium's networking complexity.
- **Premium** earns its cost almost entirely from **multi-region gateway
  deployment** — not just multi-region *backends* (which this lab already
  demonstrates on Developer with its 2-region pool), but the *gateway itself*
  running redundantly. On Developer/Standard, if the single gateway's region
  has an outage, the whole endpoint is down even though your backends
  survive — see the honest caveat in
  [`docs/TUTORIAL.md`](docs/TUTORIAL.md).
- **Consumption** is the odd one out — no persistent instance at all, billed
  per call. Worth knowing it exists, but it supports a narrower policy set and
  isn't typically the one you'd pick for an AI gateway build like this.

**What actually drives APIM cost in practice:** the instance's flat monthly/hourly
charge is usually the *smallest* line item once you add a real LLM behind it —
Azure OpenAI's token-based billing will typically dwarf the gateway cost at any
meaningful traffic volume. APIM's cost is better framed as "the price of
governance," not "the price of the API."

## Repo layout

| Path | What it is |
|---|---|
| `docs/ARCHITECTURE.md` | Concepts + diagram — read before building |
| `docs/TUTORIAL.md` | Step-by-step lab instructions |
| `scripts/` | PowerShell scripts the tutorial calls, parameterized — no hardcoded names |
| `policies/api-inbound.xml` | The finished APIM policy, fully commented |
| `LICENSE` | MIT |

## Prerequisites

- An Azure subscription where you can create resources (a free trial or sandbox
  subscription is fine — this lab fits comfortably in free-tier credit)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed
  and `az login` working
- PowerShell 7+ (Windows, macOS, or Linux)
- Access to create Azure OpenAI resources in your subscription (some tenants
  require a one-time access request — see Step 2 in the tutorial if `az cognitiveservices`
  calls are rejected)

## Learning outcomes

By the end you will be able to explain and demonstrate:

- **Cost control** — why "enforce a budget before the call" beats "review the bill
  after," and how `llm-token-limit` does it
- **Resilience** — how one hostname can round-robin across two regions, and why
  *deployment names must match exactly* for that to work (the #1 beginner trap)
- **Multi-model routing** — how a single gateway can front multiple models without
  client apps knowing or caring which one answers
- **Keyless auth** — why managed identity is preferable to distributing API keys

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, teach with it.

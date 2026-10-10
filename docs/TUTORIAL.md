# Tutorial — build it in ~2 hours

Read [ARCHITECTURE.md](ARCHITECTURE.md) first if you haven't — this assumes you
know what a backend, pool, and product are.

**Pacing tip:** APIM takes 20–40 minutes to provision. **Step 1 kicks it off and
you move on immediately** — don't sit and watch the portal spinner. By the time
you reach Step 4 it should be ready.

**How to use the checkpoints:** every step ends with a **✅ Checkpoint** box —
a command to run and the exact output that means "you're good, move on." If
your output doesn't match, stop and fix it before continuing. Lab steps build
on each other, so a silent failure early on surfaces as a confusing error three
steps later.

All PowerShell below assumes `az login` has already run and you're on the
subscription you want to use (`az account show` to confirm).

Replace every `<angle-bracket>` placeholder with your own values. Suggested
values are given — they're arbitrary, just keep them consistent across steps.

---

## 0. Prerequisites check (5 min)

```powershell
az --version                 # Azure CLI present?
az account show              # correct subscription active?
$PSVersionTable.PSVersion    # PowerShell 7+?
```

What you're checking for:
- `az --version` should print `azure-cli` 2.50+ — if the command isn't found,
  install from the [Azure CLI docs](https://learn.microsoft.com/cli/azure/install-azure-cli).
- `az account show` must return the subscription you intend to use. If it's the
  wrong one, run `az account set --subscription "<name-or-id>"`.
- `$PSVersionTable.PSVersion` should be `7.x`. Windows PowerShell 5.1 mostly
  works too, but some JSON/REST handling in the scripts assumes PS7.

If Azure OpenAI isn't enabled on your subscription yet, request access first —
this can take time and should not block the rest of the lab (do Steps 1–3
against APIM/resource-group setup, request AOAI access in parallel).

Set shared variables you'll reuse all lab long. Keep this PowerShell window
open for the entire lab — every later step assumes these variables exist in
your session:

```powershell
$rg       = "rg-apim-lab"
$loc1     = "eastus2"
$loc2     = "westus3"
$apim     = "apim-lab-$($env:USERNAME)$(Get-Random -Maximum 9999)"   # must be globally unique
$aoai1    = "aoai-lab-$loc1-$(Get-Random -Maximum 9999)"
$aoai2    = "aoai-lab-$loc2-$(Get-Random -Maximum 9999)"
$deployName = "gpt-4o-mini-lab"   # IDENTICAL name in both regions — see Architecture doc

az group create -n $rg -l $loc1
```

**Why these specific choices:** `$apim` and the AOAI names include a random
suffix because Azure API Management hostnames and some resource names must be
**globally unique across all of Azure**, not just your subscription — a plain
name like `apim-lab` will almost certainly collide with someone else's. `$loc1`/
`$loc2` are two different Azure regions on purpose — that's what makes the
resilience pillar (Step 6, Pillar 2) meaningful; two deployments in the same
region wouldn't prove anything about regional failover.

### ✅ Checkpoint 0

```powershell
az group show -n $rg --query "{name:name, location:location, state:properties.provisioningState}" -o table
```
Expected: a table showing `$rg`, `eastus2`, `Succeeded`.

---

## 1. Kick off APIM provisioning NOW (2 min to start, 20–40 min to finish in background)

```powershell
az apim create `
  --name $apim `
  --resource-group $rg `
  --publisher-email "you@example.com" `
  --publisher-name "APIM Lab" `
  --sku-name Developer `
  --no-wait
```

**What each flag does:**
- `--sku-name Developer` — the cheapest tier with the *full* policy engine
  (same policies as production tiers; what you don't get is an SLA or
  scale-out — fine for a lab, not for production).
- `--publisher-email` / `--publisher-name` — cosmetic, shown on the developer
  portal; any values work for a lab.
- `--no-wait` — returns the CLI immediately instead of blocking for 20–40
  minutes. This is why Step 1 comes before the Azure OpenAI setup: APIM is the
  longest pole in the tent, so you want the clock running on it while you do
  everything else.

Continue to Step 2 immediately — do not wait here.

### ✅ Checkpoint 1

Run this now (it will say `Activating`, not `Succeeded` — that's expected and fine):

```powershell
az apim show -n $apim -g $rg --query "provisioningState" -o tsv
```
Expected right now: `Activating`. You'll re-check this at the start of Step 3,
where it needs to say `Succeeded` before you continue.

---

## 2. Create two Azure OpenAI resources and matching deployments (25 min)

```powershell
az cognitiveservices account create `
  --name $aoai1 --resource-group $rg --location $loc1 `
  --kind OpenAI --sku S0 --yes

az cognitiveservices account create `
  --name $aoai2 --resource-group $rg --location $loc2 `
  --kind OpenAI --sku S0 --yes
```

These typically finish in 1–2 minutes each (much faster than APIM). `--kind
OpenAI` is what makes this an Azure OpenAI resource rather than a general
Cognitive Services multi-service account; `--sku S0` is the only SKU Azure
OpenAI currently offers (pay-per-token, no separate tiers to choose between).

Now deploy **the same model, with the same deployment name**, to both:

```powershell
az cognitiveservices account deployment create `
  --name $aoai1 --resource-group $rg `
  --deployment-name $deployName `
  --model-name gpt-4o-mini --model-version "2024-07-18" `
  --model-format OpenAI --sku-capacity 10 --sku-name Standard

az cognitiveservices account deployment create `
  --name $aoai2 --resource-group $rg `
  --deployment-name $deployName `
  --model-name gpt-4o-mini --model-version "2024-07-18" `
  --model-format OpenAI --sku-capacity 10 --sku-name Standard
```

**Read this twice:** `-deployment-name $deployName` is the **same variable**
in both commands. This is the single most important detail in the whole lab —
see the callout in [ARCHITECTURE.md](ARCHITECTURE.md#the-1-beginner-trap) for
why. If you later recreate a deployment and let the portal auto-name it, you
will break round-robin and spend 20 minutes confused about alternating 404s.
Don't do that — always pass an explicit, identical name.

`--sku-capacity 10` requests 10K tokens-per-minute of quota for this
deployment — plenty for a lab that makes ~30 small calls total. If the command
fails with a quota error, your subscription may have less regional capacity
available; try `--sku-capacity 1` or a different region.

> If `gpt-4o-mini` isn't available in a region you picked, check
> [model availability](https://learn.microsoft.com/azure/ai-services/openai/concepts/models)
> and substitute an available model+region — just keep both regions' deployment
> **names** identical.

Grab both endpoints (you'll need them in Step 4):

```powershell
$endpoint1 = az cognitiveservices account show -n $aoai1 -g $rg --query "properties.endpoint" -o tsv
$endpoint2 = az cognitiveservices account show -n $aoai2 -g $rg --query "properties.endpoint" -o tsv
"$endpoint1`n$endpoint2"
```

### ✅ Checkpoint 2

```powershell
az cognitiveservices account deployment list -n $aoai1 -g $rg --query "[].name" -o tsv
az cognitiveservices account deployment list -n $aoai2 -g $rg --query "[].name" -o tsv
```
Expected: **both commands print the exact same string** — your `$deployName`
value (e.g. `gpt-4o-mini-lab`). If they differ even slightly (trailing space,
different casing), fix it now before moving on — it's much harder to debug
after Step 6.

Also confirm both endpoint variables are non-empty:
```powershell
"$endpoint1`n$endpoint2"   # both lines should be https://....openai.azure.com/
```

---

## 3. Grant APIM access to both Azure OpenAI accounts (10 min)

This only works once APIM finishes provisioning — check first:

```powershell
az apim show -n $apim -g $rg --query "provisioningState" -o tsv
```
Must say `Succeeded` before continuing. If it still says `Activating`, wait —
grab a coffee, this is normal.

```powershell
# APIM's system-assigned managed identity
az apim update -n $apim -g $rg --set identity.type=SystemAssigned
$apimPrincipalId = az apim show -n $apim -g $rg --query "identity.principalId" -o tsv

foreach ($acct in @($aoai1, $aoai2)) {
  $scope = az cognitiveservices account show -n $acct -g $rg --query "id" -o tsv
  az role assignment create `
    --assignee-object-id $apimPrincipalId --assignee-principal-type ServicePrincipal `
    --role "Cognitive Services OpenAI User" --scope $scope
}
```

**Why managed identity instead of API keys:** this is the "keyless" design
point from the Architecture doc. APIM gets its own identity in Microsoft
Entra ID, and that identity is granted the **Cognitive Services OpenAI User**
role — scoped narrowly to just these two accounts, not the whole subscription.
No Azure OpenAI key ever needs to exist in a config file, a script, or a
client app. This is also *more secure by default* than copy-pasting keys
around, which is worth mentioning if anyone asks why the lab bothers with this
instead of the simpler `--api-key` approach.

Role assignments can take **1–5 minutes** to propagate through Entra ID — if
the live test in Step 6 gets a 401/403, this propagation delay is the most
likely cause. Wait a bit and retry before troubleshooting further.

### ✅ Checkpoint 3

```powershell
foreach ($acct in @($aoai1, $aoai2)) {
  $scope = az cognitiveservices account show -n $acct -g $rg --query "id" -o tsv
  az role assignment list --assignee $apimPrincipalId --scope $scope --query "[].roleDefinitionName" -o tsv
}
```
Expected: **both commands print `Cognitive Services OpenAI User`.** If either
is empty, the role assignment didn't take — re-run the `az role assignment
create` command for that account.

---

## 4. Create backends and the round-robin pool (15 min)

Use [`scripts/02-create-backends.ps1`](../scripts/02-create-backends.ps1):

```powershell
.\scripts\02-create-backends.ps1 `
  -ResourceGroup $rg -ApimName $apim `
  -Region1Name "region-a" -Region1Url $endpoint1 `
  -Region2Name "region-b" -Region2Url $endpoint2 `
  -PoolId "pool-primary"
```

**What this script does, step by step** (open it in an editor alongside this
tutorial if you want to follow along):
1. Creates an APIM **backend** object named `region-a` pointing at your first
   Azure OpenAI endpoint.
2. Creates a second backend `region-b` pointing at the second endpoint.
3. Creates a **pool** backend `pool-primary` that load-balances across both,
   at equal `priority` and `weight` — this is what makes it round-robin rather
   than primary/failover. (If you wanted an active/passive setup instead, you'd
   give one backend a lower priority number.)

It calls the APIM management REST API directly (via `Invoke-RestMethod`)
rather than Azure CLI, because `az apim backend` subcommands don't yet support
pool creation at the time of writing — this is a good moment to notice that
the Azure control plane is just a REST API underneath every tool, CLI included.

### ✅ Checkpoint 4

```powershell
az rest --method get `
  --url "https://management.azure.com/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$rg/providers/Microsoft.ApiManagement/service/$apim/backends?api-version=2023-05-01-preview" `
  --query "value[].name" -o tsv
```
Expected: three names — `region-a`, `region-b`, `pool-primary`.

---

## 5. Import the API and apply the gateway policy (15 min)

```powershell
.\scripts\03-import-api-and-products.ps1 `
  -ResourceGroup $rg -ApimName $apim `
  -DeploymentName $deployName
```

**What this script does:**
1. Imports an API into APIM named `openai-lab`, reachable under the path
   `/openai-lab` on your gateway hostname.
2. Applies [`policies/api-inbound.xml`](../policies/api-inbound.xml) to that
   API. **Open this file now and read the comments** — every pillar from the
   Architecture doc maps to a labeled block in this file.
3. Creates two **products** — `Lab-Pilot` and `Lab-Prod` — each representing a
   different consumer tier with its own subscription key. (The token budget
   itself currently lives in the shared policy at `tokens-per-minute="1000"`;
   see the note at the end of the script output for how to split it per
   product if you want Pilot and Prod to have genuinely different budgets.)
4. Creates one subscription key per product and prints both.

**Save the two keys it prints** — you can't retrieve them later without
re-running a `listSecrets` call, which the script itself does using this
pattern if you ever need it again:
```powershell
az rest --method post --url ".../subscriptions/<sub-id>/listSecrets?api-version=2023-05-01-preview"
```

### ✅ Checkpoint 5

```powershell
az apim api show -g $rg -n $apim --api-id "openai-lab-api" --query "{name:displayName, path:path}" -o table
```
Expected: a row showing your API's display name and path `openai-lab`.

Also confirm the policy applied cleanly (no XML syntax errors):
```powershell
az rest --method get `
  --url "https://management.azure.com/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$rg/providers/Microsoft.ApiManagement/service/$apim/apis/openai-lab-api/policies/policy?api-version=2023-05-01-preview" `
  --query "properties.value" -o tsv | Select-String "llm-token-limit"
```
Expected: this prints the matching line from your policy — confirms it's live,
not just saved to a local file.

---

## 6. Run the live test (20 min)

```powershell
.\scripts\04-run-demo.ps1 `
  -ApimName $apim `
  -PilotKey '<pilot-key-from-step-5>' `
  -ProdKey '<prod-key-from-step-5>' `
  -DeploymentName $deployName
```

The script runs three short sections back to back. Here's what each one is
proving and exactly what "working" looks like:

### Pillar 1 — Cost control
Six calls on the **Pilot** key (1,000 TPM budget), then three on the **Prod**
key (50,000 TPM budget).

**Expected:** the first few Pilot calls return `200` with a shrinking
`x-tokens-remaining` header; somewhere around call 4–6 you should see a `429`
come back in well under a second — much faster than the ~1–3s a real model
call takes, because the gateway rejected it *before* contacting Azure OpenAI.
The Prod calls should all succeed, completely unaffected — proving the budgets
are isolated per subscription key.

⚠️ **Run this section inside one 60-second window.** The TPM counter resets
every minute — if your six Pilot calls straddle a minute boundary, the budget
partially refills mid-run and the `429` may not fire. If that happens, it's
not a bug: just re-run the Pilot loop by itself, faster.

### Pillar 2 — Resilience
Ten calls on the Prod key, all expected to return `200`.

**Expected:** every call succeeds, and the `x-model-deployment` header the
script prints alongside each result stays constant (same deployment name both
regions) — but if you add verbose logging of the raw backend response you'd
see requests actually alternating between `region-a` and `region-b`
invisibly. The point being demonstrated is that **the client cannot tell**
which region answered, and both are equally live.

### Pillar 3 — Routing (implicit in the policy)
Not a separate script section — it's the `choose` block in the policy that
decided `pool-primary` handles every call above (because the deployment name
starts with `gpt-4o`). To see routing explicitly, try pointing a request at a
deployment name that *doesn't* start with `gpt-4o` and watch it fall to the
`otherwise` branch (pinned to `region-a`) instead of the pool.

### ✅ Checkpoint 6

You've succeeded if:
- [ ] At least one Pilot call returned `429` with latency clearly lower than the `200` calls
- [ ] Prod calls succeeded throughout, unaffected by Pilot's throttling
- [ ] All 10 resilience calls returned `200`

If you instead see **alternating `200`/`404`** on the resilience calls, go back
to Checkpoint 2 — your two regions' deployment names don't match exactly.
This is by far the most common thing to get wrong in this lab.

---

## 7. (Optional, +20 min) Watch it in Azure Monitor

APIM → **Metrics** → change namespace from the default to your custom metric
namespace (`ApimAiGatewayLab`, set via `llm-emit-token-metric` in the policy)
→ pick metric **Total Tokens** → **Apply splitting** → split by `Consumer`.

**What you're looking at:** a stacked chart showing token consumption broken
out by which subscription key (consumer) made the calls — this is the literal
mechanism behind internal chargeback. In a real deployment with real teams as
consumers, this chart answers "who is actually spending the Azure OpenAI
budget" without anyone needing to instrument their own app.

Metrics can take 2–5 minutes to appear after the calls that generated them —
if the chart is empty right after Step 6, wait a few minutes and refresh.

---

## 8. Teardown — don't skip this

```powershell
az group delete -n $rg --yes --no-wait
```

This deletes APIM, both Azure OpenAI accounts, and everything else in one
command — resource groups are a container, deleting the group deletes
everything inside it. `--no-wait` returns immediately; deletion continues in
the background and typically finishes in 5–15 minutes.

### ✅ Checkpoint 8 (final)

Confirm it's actually gone — don't just trust that the delete command was
accepted:
```powershell
az group show -n $rg
```
Expected: an error like `ResourceGroupNotFound`. If it still shows up, deletion
is still in progress — check again in a few minutes. Billing stops once the
resources are actually gone, not when the delete command was issued.

---

## Troubleshooting quick reference

| Symptom | Cause | Fix |
|---|---|---|
| Alternating 200/404 on pooled calls | Deployment names differ between regions | Recreate with identical names (Step 2, Checkpoint 2) |
| 401/403 calling Azure OpenAI | Role assignment hasn't propagated yet | Wait 2–5 min, retry (Step 3) |
| 429 never fires | TPM limit misconfigured, or calls spread across >60s | Check `tokens-per-minute` in the policy; re-run inside one minute |
| APIM still "Activating" after 40 min | Rare, but happens | Check Activity Log for the deployment; Developer SKU can occasionally take longer under regional load |
| First call to a deployment is slow (10–60s+) | Cold start | Make one throwaway call to "warm" each deployment before timing anything |
| `az cognitiveservices account deployment create` fails with a quota error | Insufficient regional capacity for the requested `--sku-capacity` | Lower `--sku-capacity` to 1, or pick a different region |
| Policy import fails with an XML error | Usually a stray character from copy-paste (smart quotes, BOM) | Re-download `policies/api-inbound.xml` from the repo rather than retyping it |

# Tutorial — build it in ~2 hours

Read [ARCHITECTURE.md](ARCHITECTURE.md) first if you haven't — this assumes you
know what a backend, pool, and product are.

**Pacing tip:** APIM takes 20–40 minutes to provision. **Step 1 kicks it off and
you move on immediately** — don't sit and watch the portal spinner. By the time
you reach Step 4 it should be ready.

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

If Azure OpenAI isn't enabled on your subscription yet, request access first —
this can take time and should not block the rest of the lab (do Steps 1–3
against APIM/resource-group setup, request AOAI access in parallel).

Set shared variables you'll reuse all lab long:

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

`--no-wait` returns immediately. Continue to Step 2 while it builds. Check
progress anytime with:

```powershell
az apim show -n $apim -g $rg --query "provisioningState" -o tsv
```

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

> If `gpt-4o-mini` isn't available in a region you picked, check
> [model availability](https://learn.microsoft.com/azure/ai-services/openai/concepts/models)
> and substitute an available model+region — just keep both regions' deployment
> **names** identical.

Grab both endpoints (you'll need them in Step 5):

```powershell
$endpoint1 = az cognitiveservices account show -n $aoai1 -g $rg --query "properties.endpoint" -o tsv
$endpoint2 = az cognitiveservices account show -n $aoai2 -g $rg --query "properties.endpoint" -o tsv
"$endpoint1`n$endpoint2"
```

---

## 3. Grant APIM access to both Azure OpenAI accounts (10 min)

This only works once APIM finishes provisioning — check with the command from
Step 1 before continuing.

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

Role assignments can take a minute or two to propagate — if the live test in
Step 6 gets a 401/403, wait a bit and retry before troubleshooting further.

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

This creates two `backend` objects and one load-balanced `pool-primary`
backend over both, at equal priority.

---

## 5. Import the API and apply the gateway policy (15 min)

```powershell
.\scripts\03-import-api-and-products.ps1 `
  -ResourceGroup $rg -ApimName $apim `
  -DeploymentName $deployName
```

This script:
- Imports the Azure OpenAI inference API into APIM
- Creates two **products**: `Lab-Pilot` (1,000 TPM) and `Lab-Prod` (50,000 TPM)
- Creates one subscription key per product
- Applies [`policies/api-inbound.xml`](../policies/api-inbound.xml) — read it,
  it's the same policy explained in the Architecture doc, fully commented

It prints both subscription keys at the end — save them.

---

## 6. Run the live test (20 min)

```powershell
.\scripts\04-run-demo.ps1 `
  -ApimName $apim `
  -PilotKey '<pilot-key-from-step-5>' `
  -ProdKey '<prod-key-from-step-5>' `
  -DeploymentName $deployName
```

**What to watch for:**

| Pillar | What you should see |
|---|---|
| Cost control | Pilot key gets `429` after a handful of calls; Prod key keeps working — separate budgets |
| Resilience | 10 calls land across both regions invisibly (check the `x-model-deployment` / region response header the script prints) |
| Routing | Swapping deployment name in the request routes to a different backend |

⚠️ **Run the cost-control calls inside one 60-second window.** The TPM counter
resets every minute — if your calls straddle a minute boundary, the `429` won't
fire and it'll look like the policy isn't working.

If you see alternating `200`/`404` instead of clean round-robin, re-check Step 2 —
your two deployment names almost certainly don't match exactly (the #1 trap,
see Architecture doc).

---

## 7. (Optional, +20 min) Watch it in Azure Monitor

APIM → **Metrics** → change namespace to your custom metric namespace (set in
the policy) → chart **Total Tokens** split by `Consumer`. This is the chargeback
view — token spend broken out per subscription key.

---

## 8. Teardown — don't skip this

```powershell
az group delete -n $rg --yes --no-wait
```

This deletes APIM, both Azure OpenAI accounts, and everything else in one
command. Confirm it's gone after a few minutes:

```powershell
az group show -n $rg   # should error "not found"
```

---

## Troubleshooting quick reference

| Symptom | Cause | Fix |
|---|---|---|
| Alternating 200/404 on pooled calls | Deployment names differ between regions | Recreate with identical names (Step 2) |
| 401/403 calling Azure OpenAI | Role assignment hasn't propagated yet | Wait 2–5 min, retry (Step 3) |
| 429 never fires | TPM limit misconfigured, or calls spread across >60s | Check `tokens-per-minute` in the policy; re-run inside one minute |
| APIM still "Activating" after 40 min | Rare, but happens | Check Activity Log for the deployment; Developer SKU can occasionally take longer under regional load |
| First call to a deployment is slow (10–60s+) | Cold start | Make one throwaway call to "warm" each deployment before timing anything |

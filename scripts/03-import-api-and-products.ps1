<#
.SYNOPSIS
  Imports the Azure OpenAI inference API into APIM, creates two products
  (Pilot / Prod tiers with different token budgets), applies the lab policy,
  and prints subscription keys. Part of the APIM AI Gateway learning lab —
  see docs/TUTORIAL.md Step 5.
#>
param(
  [Parameter(Mandatory)] [string]$ResourceGroup,
  [Parameter(Mandatory)] [string]$ApimName,
  [Parameter(Mandatory)] [string]$DeploymentName,
  [string]$ApiId = "openai-lab-api"
)
$ErrorActionPreference = 'Stop'
$sub = az account show --query id -o tsv
$tok = { az account get-access-token --resource https://management.azure.com --query accessToken -o tsv }
$base = "https://management.azure.com/subscriptions/$sub/resourceGroups/$ResourceGroup/providers/Microsoft.ApiManagement/service/$ApimName"

function Put($path, $body) {
  $headers = @{ Authorization = "Bearer $(& $tok)"; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Uri "$base$path`?api-version=2023-05-01-preview" -Method Put -Headers $headers `
    -Body ([System.Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 20)))
}

Write-Host "[1/5] Importing Azure OpenAI inference API"
Put "/apis/$ApiId" @{
  properties = @{
    displayName = "OpenAI Lab API"
    path        = "openai-lab"
    protocols   = @("https")
    subscriptionRequired = $true
  }
} | Out-Null

Write-Host "[2/5] Applying gateway policy from policies/api-inbound.xml"
$policyXml = Get-Content -Raw "$PSScriptRoot\..\policies\api-inbound.xml"
Put "/apis/$ApiId/policies/policy" @{
  properties = @{ format = "xml"; value = $policyXml }
} | Out-Null

Write-Host "[3/5] Creating products: Lab-Pilot (1,000 TPM) and Lab-Prod (50,000 TPM)"
foreach ($p in @(
  @{ id = "lab-pilot"; name = "Lab-Pilot" }
  @{ id = "lab-prod";  name = "Lab-Prod" }
)) {
  Put "/products/$($p.id)" @{
    properties = @{
      displayName = $p.name
      subscriptionRequired = $true
      state = "published"
    }
  } | Out-Null
  Put "/products/$($p.id)/apis/$ApiId" @{} | Out-Null
}

Write-Host "[4/5] Creating one subscription key per product"
$keys = @{}
foreach ($s in @(
  @{ id = "lab-pilot-key"; product = "lab-pilot" }
  @{ id = "lab-prod-key";  product = "lab-prod" }
)) {
  Put "/subscriptions/$($s.id)" @{
    properties = @{
      displayName = $s.id
      scope       = "/products/$($s.product)"
      state       = "active"
    }
  } | Out-Null
  $headers = @{ Authorization = "Bearer $(& $tok)" }
  $k = Invoke-RestMethod -Uri "$base/subscriptions/$($s.id)/listSecrets?api-version=2023-05-01-preview" -Method Post -Headers $headers
  $keys[$s.id] = $k.primaryKey
}

Write-Host "[5/5] Done." -ForegroundColor Green
Write-Host "`nSubscription keys — save these:"
$keys.GetEnumerator() | ForEach-Object { Write-Host ("  {0,-16} {1}" -f $_.Key, $_.Value) }
Write-Host "`nAdjust token budgets per-product by editing tokens-per-minute in the policy,"
Write-Host "or layer a per-product policy override if you want different limits per tier."

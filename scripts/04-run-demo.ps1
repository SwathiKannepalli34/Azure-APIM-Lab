<#
.SYNOPSIS
  Live three-pillar test for the APIM AI Gateway learning lab: cost control,
  resilience (pooled regions), and routing. See docs/TUTORIAL.md Step 6.
#>
param(
  [Parameter(Mandatory)] [string]$ApimName,
  [Parameter(Mandatory)] [string]$PilotKey,
  [Parameter(Mandatory)] [string]$ProdKey,
  [Parameter(Mandatory)] [string]$DeploymentName,
  [string]$ApiVersion = "2024-08-01-preview"
)
$ErrorActionPreference = 'Continue'
$gateway = "https://$ApimName.azure-api.net/openai-lab"

function Invoke-ChatCall($Key, $Label) {
  $uri = "$gateway/deployments/$DeploymentName/chat/completions?api-version=$ApiVersion"
  $body = @{ messages = @(@{ role = "user"; content = "Say OK." }); max_tokens = 5 } | ConvertTo-Json
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $r = Invoke-WebRequest -Uri $uri -Method Post -Headers @{ "api-key" = $Key } `
          -ContentType "application/json" -Body $body -SkipHttpErrorCheck
    $sw.Stop()
    $region = $r.Headers["x-model-deployment"]
    "{0,-6} {1,-10} {2,6:N1}s  status={3}  remaining-tokens={4}" -f $Label, $DeploymentName, $sw.Elapsed.TotalSeconds, $r.StatusCode, $r.Headers["x-tokens-remaining"]
  } catch {
    $sw.Stop()
    "{0,-6} {1,-10} {2,6:N1}s  ERROR: {3}" -f $Label, $DeploymentName, $sw.Elapsed.TotalSeconds, $_.Exception.Message
  }
}

Write-Host "`n=== PILLAR 1: Cost control ===" -ForegroundColor Cyan
Write-Host "Pilot key (1,000 TPM budget) — expect a 429 within a handful of calls."
Write-Host "Run this section inside one 60-second window; the TPM counter resets every minute.`n"
1..6 | ForEach-Object { Invoke-ChatCall -Key $PilotKey -Label "Pilot" }
Write-Host "`nProd key (50,000 TPM budget) — should keep succeeding, unaffected by Pilot's budget."
1..3 | ForEach-Object { Invoke-ChatCall -Key $ProdKey -Label "Prod" }

Write-Host "`n=== PILLAR 2: Resilience (pooled regions) ===" -ForegroundColor Cyan
Write-Host "10 calls on the Prod key — watch the responses land across both pool regions invisibly.`n"
1..10 | ForEach-Object { Invoke-ChatCall -Key $ProdKey -Label "Prod" }

Write-Host "`nDone. If round-robin showed alternating errors instead of clean 200s, your two" -ForegroundColor Yellow
Write-Host "regions' deployment names probably don't match exactly — see docs/TUTORIAL.md troubleshooting." -ForegroundColor Yellow

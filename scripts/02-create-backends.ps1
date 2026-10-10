<#
.SYNOPSIS
  Creates two APIM backends (one per Azure OpenAI region) and a round-robin
  pool over both. Part of the APIM AI Gateway learning lab — see
  docs/TUTORIAL.md Step 4.
#>
param(
  [Parameter(Mandatory)] [string]$ResourceGroup,
  [Parameter(Mandatory)] [string]$ApimName,
  [Parameter(Mandatory)] [string]$Region1Name,
  [Parameter(Mandatory)] [string]$Region1Url,
  [Parameter(Mandatory)] [string]$Region2Name,
  [Parameter(Mandatory)] [string]$Region2Url,
  [string]$PoolId = "pool-primary"
)
$ErrorActionPreference = 'Stop'

function Invoke-ApimRest($Method, $Path, $Body) {
  $tok = az account get-access-token --resource https://management.azure.com --query accessToken -o tsv
  $sub = az account show --query id -o tsv
  $uri = "https://management.azure.com/subscriptions/$sub/resourceGroups/$ResourceGroup/providers/Microsoft.ApiManagement/service/$ApimName$Path`?api-version=2023-05-01-preview"
  $headers = @{ Authorization = "Bearer $tok"; 'Content-Type' = 'application/json' }
  if ($Body) {
    Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -Body ($Body | ConvertTo-Json -Depth 20)
  } else {
    Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers
  }
}

Write-Host "[1/3] Creating backend '$Region1Name' -> $Region1Url"
Invoke-ApimRest -Method Put -Path "/backends/$Region1Name" -Body @{
  properties = @{ url = $Region1Url; protocol = "http" }
} | Out-Null

Write-Host "[2/3] Creating backend '$Region2Name' -> $Region2Url"
Invoke-ApimRest -Method Put -Path "/backends/$Region2Name" -Body @{
  properties = @{ url = $Region2Url; protocol = "http" }
} | Out-Null

Write-Host "[3/3] Creating round-robin pool '$PoolId' over both regions"
Invoke-ApimRest -Method Put -Path "/backends/$PoolId" -Body @{
  properties = @{
    protocol = "http"
    type     = "Pool"
    pool     = @{
      services = @(
        @{ id = "/backends/$Region1Name"; priority = 1; weight = 1 }
        @{ id = "/backends/$Region2Name"; priority = 1; weight = 1 }
      )
    }
  }
} | Out-Null

Write-Host "Done. Backends: $Region1Name, $Region2Name. Pool: $PoolId" -ForegroundColor Green

#requires -Version 7.0
<#
.SYNOPSIS
  Deploys the Foundry observability / guardrails / governance demo into the CURRENT az subscription.
.DESCRIPTION
  Confirms the active subscription before doing anything, deploys infra/main.bicep and infra/governance.bicep,
  assigns the signed-in user the roles needed to call the model, and writes a git-ignored .env file.
.EXAMPLE
  ./scripts/deploy.ps1 -ResourceGroup rg-foundry-governance-demo -Location eastus2
#>
param(
  [string]$ResourceGroup = 'rg-foundry-governance-demo',
  [string]$Location = 'eastus2',
  [string]$NamePrefix = 'fdryobs',
  [ValidateSet('Audit', 'Deny')][string]$PolicyEffect = 'Audit',
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$env:AZURE_CORE_NO_PROMPT = 'true'
$root = Split-Path $PSScriptRoot -Parent

$acct = az account show -o json | ConvertFrom-Json
Write-Host "Subscription : $($acct.name) ($($acct.id))"
Write-Host "Tenant       : $($acct.tenantDefaultDomain)"
Write-Host "Signed in as : $($acct.user.name)"
if (-not $Yes) {
  if ((Read-Host 'Deploy to this subscription? (y/N)') -notmatch '^[yY]') { throw 'Aborted by user.' }
}

az group create -n $ResourceGroup -l $Location --tags workload=foundry-governance-demo environment=demo -o none

$out = az deployment group create -g $ResourceGroup -n foundry-demo `
  -f "$root/infra/main.bicep" -p namePrefix=$NamePrefix location=$Location -o json | ConvertFrom-Json
$o = $out.properties.outputs

az deployment group create -g $ResourceGroup -n foundry-demo-governance `
  -f "$root/infra/governance.bicep" -p effect=$PolicyEffect -o none

# Data-plane access for the signed-in user (keys are disabled, so RBAC is required).
$userId = az ad signed-in-user show --query id -o tsv
$accountId = az cognitiveservices account show -g $ResourceGroup -n $o.accountName.value --query id -o tsv
foreach ($role in 'Cognitive Services OpenAI User', '53ca6127-db72-4b80-b1b0-d745d6d5456d' <# Foundry User (formerly Azure AI User) #>, 'Azure AI Safety Evaluator') {
  az role assignment create --assignee-object-id $userId --assignee-principal-type User `
    --role $role --scope $accountId -o none
}

$appiConn = az resource show -g $ResourceGroup -n $o.appInsightsName.value --resource-type Microsoft.Insights/components --query properties.ConnectionString -o tsv
@"
AZURE_OPENAI_ENDPOINT=$($o.openAiEndpoint.value)
AZURE_OPENAI_DEPLOYMENT=$($o.modelDeployment.value)
AZURE_AI_PROJECT_ENDPOINT=$($o.projectEndpoint.value)
APPLICATIONINSIGHTS_CONNECTION_STRING=$appiConn
AZURE_SUBSCRIPTION_ID=$($acct.id)
AZURE_RESOURCE_GROUP=$ResourceGroup
AZURE_AI_ACCOUNT_NAME=$($o.accountName.value)
"@ | Set-Content "$root/.env" -Encoding utf8

Write-Host "Done. Wrote .env (git-ignored). Role assignments can take a few minutes to propagate."

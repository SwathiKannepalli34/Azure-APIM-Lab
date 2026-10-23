// Foundry observability + guardrails + evaluations + governance demo.
// Scope: resource group. Nothing tenant-specific is hard-coded; names derive from `namePrefix`.
targetScope = 'resourceGroup'

@description('Short prefix used for resource names (3-12 lowercase letters/digits).')
@minLength(3)
@maxLength(12)
param namePrefix string = 'fdryobs'

@description('Azure region.')
param location string = resourceGroup().location

@description('Chat model deployed for the demo and used as the evaluation judge.')
param modelName string = 'gpt-5-mini'

@description('Model version.')
param modelVersion string = '2025-08-07'

@description('Capacity in thousands of tokens per minute.')
param modelCapacity int = 30

@description('Log Analytics retention in days.')
@minValue(30)
@maxValue(730)
param retentionInDays int = 30

@description('Tags applied to every resource (governance).')
param tags object = {
  workload: 'foundry-governance-demo'
  environment: 'demo'
  dataClassification: 'non-production'
}

var suffix = uniqueString(resourceGroup().id)
var accountName = toLower('${namePrefix}-${suffix}')
var projectName = 'proj-${namePrefix}'
var guardrailName = 'demo-strict-guardrail'

resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'law-${namePrefix}-${suffix}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: retentionInDays
  }
}

resource appi 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${namePrefix}-${suffix}'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: law.id
  }
}

resource account 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: accountName
  location: location
  kind: 'AIServices'
  tags: tags
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: accountName
    allowProjectManagement: true
    publicNetworkAccess: 'Enabled'
    // Governance: Entra ID only, no API keys.
    disableLocalAuth: true
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: account
  name: projectName
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  // Account sub-resources are serialized by the RP; create the project after the model deployment.
  dependsOn: [ deployment ]
  properties: {
    displayName: 'Observability and governance demo'
    description: 'Reusable demo project: tracing, guardrails, evaluations, governance.'
  }
}

// Guardrail: blocks at Low severity (stricter than default) plus jailbreak and protected-material detection.
resource guardrail 'Microsoft.CognitiveServices/accounts/raiPolicies@2025-06-01' = {
  parent: account
  name: guardrailName
  properties: {
    basePolicyName: 'Microsoft.DefaultV2'
    mode: 'Default'
    contentFilters: [
      { name: 'Hate', severityThreshold: 'Low', blocking: true, enabled: true, source: 'Prompt' }
      { name: 'Hate', severityThreshold: 'Low', blocking: true, enabled: true, source: 'Completion' }
      { name: 'Sexual', severityThreshold: 'Low', blocking: true, enabled: true, source: 'Prompt' }
      { name: 'Sexual', severityThreshold: 'Low', blocking: true, enabled: true, source: 'Completion' }
      { name: 'Violence', severityThreshold: 'Low', blocking: true, enabled: true, source: 'Prompt' }
      { name: 'Violence', severityThreshold: 'Low', blocking: true, enabled: true, source: 'Completion' }
      { name: 'Selfharm', severityThreshold: 'Low', blocking: true, enabled: true, source: 'Prompt' }
      { name: 'Selfharm', severityThreshold: 'Low', blocking: true, enabled: true, source: 'Completion' }
      { name: 'Jailbreak', blocking: true, enabled: true, source: 'Prompt' }
      { name: 'Protected Material Text', blocking: true, enabled: true, source: 'Completion' }
      { name: 'Protected Material Code', blocking: false, enabled: true, source: 'Completion' }
    ]
  }
}

resource deployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: account
  name: modelName
  tags: tags
  sku: {
    name: 'GlobalStandard'
    capacity: modelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    raiPolicyName: guardrail.name
    versionUpgradeOption: 'NoAutoUpgrade'
  }
}

// Observability: link Application Insights to the Foundry project so traces show in the portal.
resource appInsightsConnection 'Microsoft.CognitiveServices/accounts/projects/connections@2025-06-01' = {
  parent: project
  name: 'appinsights'
  properties: {
    category: 'AppInsights'
    target: appi.id
    authType: 'ApiKey'
    isSharedToAll: true
    credentials: {
      key: appi.properties.ConnectionString
    }
    metadata: {
      ApiType: 'Azure'
      ResourceId: appi.id
    }
  }
}

// Observability: audit, request and trace logs plus metrics to Log Analytics.
resource diag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'send-to-law'
  scope: account
  properties: {
    workspaceId: law.id
    logs: [
      { categoryGroup: 'allLogs', enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

resource alertActionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: 'ag-${namePrefix}-${suffix}'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'fdryobs'
    enabled: true
  }
}

resource clientErrorAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-${namePrefix}-client-errors'
  location: 'global'
  tags: tags
  properties: {
    description: 'More than 10 client errors (4xx incl. content-filter blocks and throttling) in 5 minutes.'
    severity: 3
    enabled: true
    scopes: [ account.id ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'ClientErrors'
          metricName: 'ClientErrors'
          operator: 'GreaterThan'
          threshold: 10
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [ { actionGroupId: alertActionGroup.id } ]
  }
}

output accountName string = account.name
output projectName string = project.name
output projectEndpoint string = 'https://${account.name}.services.ai.azure.com/api/projects/${project.name}'
output openAiEndpoint string = 'https://${account.name}.openai.azure.com/'
output modelDeployment string = deployment.name
output appInsightsName string = appi.name
output logAnalyticsWorkspaceName string = law.name

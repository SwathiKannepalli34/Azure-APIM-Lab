// Governance guardrails applied to the demo resource group using built-in Azure Policy definitions.
targetScope = 'resourceGroup'

@description('Effect for the key-access policy. Use Audit for demos, Deny to enforce.')
@allowed([ 'Audit', 'Deny' ])
param effect string = 'Audit'

var disableLocalAuthPolicyId = '/providers/Microsoft.Authorization/policyDefinitions/71ef260a-8f18-47b7-abcb-62d0673d94dc'
var restrictNetworkPolicyId = '/providers/Microsoft.Authorization/policyDefinitions/037eea7a-bd0a-46c5-9a66-03aea78705d3'
var requireTagPolicyId = '/providers/Microsoft.Authorization/policyDefinitions/871b6d14-10aa-478d-b590-94f262ecfa99'

resource noKeys 'Microsoft.Authorization/policyAssignments@2024-04-01' = {
  name: 'foundry-demo-no-local-auth'
  properties: {
    displayName: 'Foundry demo: AI Services should disable key access'
    policyDefinitionId: disableLocalAuthPolicyId
    parameters: { effect: { value: effect } }
  }
}

resource restrictNetwork 'Microsoft.Authorization/policyAssignments@2024-04-01' = {
  name: 'foundry-demo-restrict-network'
  properties: {
    displayName: 'Foundry demo: AI Services should restrict network access'
    policyDefinitionId: restrictNetworkPolicyId
    // Always Audit: the demo account keeps public access so it is easy to reuse.
    parameters: { effect: { value: 'Audit' } }
  }
}

resource requireTag 'Microsoft.Authorization/policyAssignments@2024-04-01' = {
  name: 'foundry-demo-require-workload-tag'
  properties: {
    displayName: 'Foundry demo: require workload tag'
    policyDefinitionId: requireTagPolicyId
    parameters: { tagName: { value: 'workload' } }
  }
}

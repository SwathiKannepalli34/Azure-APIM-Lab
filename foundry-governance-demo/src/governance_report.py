"""Governance demo: audit the Foundry account against the baseline and report Azure Policy compliance."""
import requests

import common

ARM = "https://management.azure.com"


def arm(method: str, path: str, api: str, token: str, **kw):
    sep = "&" if "?" in path else "?"
    r = requests.request(method, f"{ARM}{path}{sep}api-version={api}",
                         headers={"Authorization": f"Bearer {token}"}, timeout=60, **kw)
    r.raise_for_status()
    return r.json()


def main() -> None:
    sub, rg, name = (common.require(k) for k in
                     ("AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP", "AZURE_AI_ACCOUNT_NAME"))
    token = common.credential().get_token("https://management.azure.com/.default").token
    base = f"/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.CognitiveServices/accounts/{name}"

    account = arm("GET", base, "2025-06-01", token)
    deployments = arm("GET", f"{base}/deployments", "2025-06-01", token)["value"]
    diag = arm("GET", f"{base}/providers/Microsoft.Insights/diagnosticSettings", "2021-05-01-preview", token)["value"]
    props = account["properties"]

    checks = [
        ("Key-based auth disabled", props.get("disableLocalAuth") is True),
        ("Managed identity enabled", "SystemAssigned" in account.get("identity", {}).get("type", "")),
        ("'workload' tag present", "workload" in account.get("tags", {})),
        ("Diagnostics sent to Log Analytics", any(d["properties"].get("workspaceId") for d in diag)),
        ("Every deployment has a custom guardrail",
         all(not d["properties"].get("raiPolicyName", "").startswith("Microsoft.") for d in deployments) and bool(deployments)),
        ("Public network access restricted", props.get("publicNetworkAccess") == "Disabled"),
    ]

    print(f"Account: {name}\n")
    for label, ok in checks:
        print(f"  [{'PASS' if ok else 'WARN'}] {label}")

    summary = arm("POST", f"/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.PolicyInsights/policyStates/latest/summarize",
                  "2019-10-01", token)["value"][0]["results"]
    print(f"\nAzure Policy: {summary.get('nonCompliantResources', 0)} non-compliant resources, "
          f"{summary.get('nonCompliantPolicies', 0)} non-compliant policies in {rg}")
    for assignment in summary.get("policyAssignments", []):
        res = assignment["results"]
        print(f"  - {assignment['policyAssignmentId'].split('/')[-1]}: {res.get('nonCompliantResources', 0)} non-compliant")

    print("\nWARN on network access is expected for this demo; policy foundry-demo-restrict-network audits it.")


if __name__ == "__main__":
    main()

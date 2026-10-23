# Microsoft Foundry demo: observability, guardrails, evaluations, governance

A reusable, parameterized demo you can deploy into any Azure subscription. No keys, tenant IDs or subscription IDs are stored in the repo; auth is Microsoft Entra ID only.

| Pillar | What it shows | Where |
|---|---|---|
| Observability | OpenTelemetry GenAI traces to Application Insights, diagnostics to Log Analytics, App Insights linked to the Foundry project, client-error alert | [src/chat_traced.py](src/chat_traced.py), [kql/queries.kql](kql/queries.kql), [infra/main.bicep](infra/main.bicep) |
| Guardrails | Custom content-filter policy (blocks at Low severity, jailbreak and protected-material detection) bound to the model deployment, plus a red-team prompt run | [src/guardrails_test.py](src/guardrails_test.py), [data/guardrail_prompts.json](data/guardrail_prompts.json) |
| Evaluations | LLM-judge quality metrics (relevance, coherence, groundedness), optional AI safety evaluators logged to the Foundry project, and a pass/fail quality gate for CI | [src/evaluate.py](src/evaluate.py), [data/eval_dataset.jsonl](data/eval_dataset.jsonl) |
| Governance | Key access disabled, managed identity, tags, Azure Policy assignments (audit/deny), and a posture report | [infra/governance.bicep](infra/governance.bicep), [src/governance_report.py](src/governance_report.py) |

## Prerequisites

- Azure CLI (with Bicep), PowerShell 7+, Python 3.10+
- Contributor and User Access Administrator (or Owner) on the target subscription
- Quota for the model in your region (default: `gpt-5-mini`, GlobalStandard, 30K TPM). Check availability with `az cognitiveservices model list -l <region>`; models are retired regularly, so change `modelName`/`modelVersion` in [infra/main.bicep](infra/main.bicep) if needed.

## Run it

```powershell
az login --tenant <your-tenant>
az account set --subscription <your-subscription>

./scripts/deploy.ps1 -ResourceGroup rg-foundry-governance-demo -Location eastus2   # prompts to confirm the subscription

python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd src
python chat_traced.py            # observability
python guardrails_test.py        # guardrails
python evaluate.py [--safety]    # evaluations (exit code 1 if below --threshold)
python governance_report.py      # governance posture + Azure Policy compliance
```

`deploy.ps1` writes a git-ignored `.env` (see [.env.sample](.env.sample)) and grants the signed-in user the data-plane roles. Role assignments can take a few minutes to propagate.

## Notes

- `gpt-5-mini` is a reasoning model: calls use `max_completion_tokens` (reasoning tokens count against it) and no `temperature`.
- Guardrail results distinguish platform blocks (HTTP 400 `content_filter`) from model-level refusals.
- Trace message content capture is enabled for the synthetic demo prompts. Disable `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` for real data.
- Policy compliance can take up to ~30 minutes to appear after the first deployment.
- `opentelemetry-instrumentation-openai-v2` is pinned (2.3b0) with `wrapt<2` because newer combinations fail at import/instrument time.
- The account keeps public network access for easy reuse, so the network policy reports it. For production use private endpoints.

## Clean up

```powershell
az group delete -n rg-foundry-governance-demo --yes
```

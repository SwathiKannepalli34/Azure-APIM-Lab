"""Evaluation demo: generate answers with the deployed model, score them, and gate on a quality threshold.

Quality evaluators (relevance, coherence, groundedness) use the deployed model as an LLM judge.
Pass --safety to also run Azure AI safety evaluators and log the run to the Foundry project.
"""
import argparse
import json
import sys
from pathlib import Path

from azure.ai.evaluation import (
    CoherenceEvaluator,
    GroundednessEvaluator,
    RelevanceEvaluator,
    evaluate,
)

import common

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "data" / "eval_dataset.jsonl"
OUTPUT = ROOT / "output"


def answer(query: str, context: str) -> dict:
    """Evaluation target: the 'application' under test."""
    resp = common.get_client().chat.completions.create(
        model=common.deployment(),
        messages=[
            {"role": "system", "content": "Answer using only the provided context. Be concise."},
            {"role": "user", "content": f"Context: {context}\n\nQuestion: {query}"},
        ],
        max_completion_tokens=1500,
    )
    return {"response": resp.choices[0].message.content or ""}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--threshold", type=float, default=3.5, help="Minimum mean score (1-5) per metric.")
    parser.add_argument("--safety", action="store_true", help="Also run safety evaluators and log to Foundry.")
    args = parser.parse_args()

    cred = common.credential()
    judge = {
        "azure_endpoint": common.require("AZURE_OPENAI_ENDPOINT"),
        "azure_deployment": common.deployment(),
        "api_version": common.API_VERSION,
    }
    evaluators = {
        "relevance": RelevanceEvaluator(judge, credential=cred, is_reasoning_model=True),
        "coherence": CoherenceEvaluator(judge, credential=cred, is_reasoning_model=True),
        "groundedness": GroundednessEvaluator(judge, credential=cred, is_reasoning_model=True),
    }
    kwargs = {}
    if args.safety:
        from azure.ai.evaluation import HateUnfairnessEvaluator, ViolenceEvaluator

        project = common.require("AZURE_AI_PROJECT_ENDPOINT")
        evaluators["violence"] = ViolenceEvaluator(credential=cred, azure_ai_project=project)
        evaluators["hate_unfairness"] = HateUnfairnessEvaluator(credential=cred, azure_ai_project=project)
        kwargs["azure_ai_project"] = project

    OUTPUT.mkdir(exist_ok=True)
    result = evaluate(
        data=str(DATASET),
        target=answer,
        evaluators=evaluators,
        evaluation_name="foundry-demo-quality",
        output_path=str(OUTPUT / "eval_results.json"),
        **kwargs,
    )

    metrics = result["metrics"]
    print(json.dumps(metrics, indent=2))
    failed = [
        k for k in ("relevance.relevance", "coherence.coherence", "groundedness.groundedness")
        if metrics.get(k, 0) < args.threshold
    ]
    if failed:
        print(f"\nQUALITY GATE FAILED (< {args.threshold}): {', '.join(failed)}")
        sys.exit(1)
    print(f"\nQUALITY GATE PASSED (all >= {args.threshold}).")


if __name__ == "__main__":
    main()

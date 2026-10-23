"""Guardrails demo: send benign and adversarial prompts and report whether the Foundry guardrail blocked them."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from openai import BadRequestError

import common

DATA = Path(__file__).resolve().parent.parent / "data" / "guardrail_prompts.json"


REFUSAL_PREFIXES = ("i can't", "i can’t", "i cannot", "i won't", "i won’t", "sorry")


def run_case(client, case: dict) -> dict:
    outcome, detail = "allowed", ""
    try:
        resp = client.chat.completions.create(
            model=common.deployment(),
            messages=[{"role": "user", "content": case["prompt"]}],
            max_completion_tokens=2000,
        )
        choice = resp.choices[0]
        text = (choice.message.content or "").lower()
        if choice.finish_reason == "content_filter":
            outcome, detail = "blocked (completion)", "completion filtered"
        elif choice.message.refusal or text.startswith(REFUSAL_PREFIXES):
            outcome, detail = "refused (model)", "model-level refusal"
    except BadRequestError as err:
        body = err.body if isinstance(err.body, dict) else {}
        if body.get("code") != "content_filter":
            raise
        filters = body.get("innererror", {}).get("content_filter_result", {})
        hits = [k for k, v in filters.items() if v.get("filtered") or v.get("detected")]
        outcome, detail = "blocked (prompt)", ", ".join(hits)
    passed = (outcome != "allowed") == case["expect_block"]
    return {"id": case["id"], "category": case["category"], "prompt": case["prompt"],
            "outcome": outcome, "triggered": detail, "result": "PASS" if passed else "REVIEW"}


def run_cases() -> list[dict]:
    client = common.get_client()
    cases = json.loads(DATA.read_text(encoding="utf-8"))
    with ThreadPoolExecutor(max_workers=len(cases)) as pool:
        return list(pool.map(lambda c: run_case(client, c), cases))


def main() -> None:
    common.enable_tracing("foundry-demo-guardrails")
    rows = run_cases()
    print(f"\n{'id':<14}{'category':<11}{'outcome':<22}{'triggered':<22}result")
    for r in rows:
        print(f"{r['id']:<14}{r['category']:<11}{r['outcome']:<22}{r['triggered']:<22}{r['result']}")
    print("\nREVIEW means the guardrail behaved differently than expected; tune infra/main.bicep filters.")


if __name__ == "__main__":
    main()

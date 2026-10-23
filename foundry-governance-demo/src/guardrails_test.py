"""Guardrails demo: send benign and adversarial prompts and report whether the Foundry guardrail blocked them."""
import json
from pathlib import Path

from openai import BadRequestError

import common

DATA = Path(__file__).resolve().parent.parent / "data" / "guardrail_prompts.json"


def main() -> None:
    common.enable_tracing("foundry-demo-guardrails")
    client = common.get_client()
    rows = []
    for case in json.loads(DATA.read_text(encoding="utf-8")):
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
            elif choice.message.refusal or text.startswith(("i can't", "i can’t", "i cannot", "i won't", "i won’t", "sorry")):
                outcome, detail = "refused (model)", "model-level refusal"
        except BadRequestError as err:
            body = err.body if isinstance(err.body, dict) else {}
            if body.get("code") == "content_filter":
                filters = body.get("innererror", {}).get("content_filter_result", {})
                hits = [k for k, v in filters.items() if v.get("filtered") or v.get("detected")]
                outcome, detail = "blocked (prompt)", ", ".join(hits)
            else:
                raise
        passed = (outcome != "allowed") == case["expect_block"]
        rows.append((case["id"], case["category"], outcome, detail, "PASS" if passed else "REVIEW"))

    print(f"\n{'id':<14}{'category':<11}{'outcome':<22}{'triggered':<22}result")
    for r in rows:
        print(f"{r[0]:<14}{r[1]:<11}{r[2]:<22}{r[3]:<22}{r[4]}")
    print("\nREVIEW means the guardrail behaved differently than expected; tune infra/main.bicep filters.")


if __name__ == "__main__":
    main()

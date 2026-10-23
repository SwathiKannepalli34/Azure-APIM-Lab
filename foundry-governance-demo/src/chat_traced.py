"""Observability demo: traced chat calls, including a custom parent span and attributes."""
import argparse
import time

from opentelemetry import trace

import common

PROMPTS = [
    "In two sentences, what is Azure Policy?",
    "List three benefits of tracing LLM applications.",
    "Explain the difference between evaluations and guardrails in one paragraph.",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", help="Single prompt; default runs a small sample set.")
    args = parser.parse_args()

    common.enable_tracing("foundry-demo-chat")
    tracer = trace.get_tracer("foundry-demo")
    client = common.get_client()

    with tracer.start_as_current_span("demo.chat_session") as session:
        session.set_attribute("demo.run", "observability")
        for prompt in [args.prompt] if args.prompt else PROMPTS:
            with tracer.start_as_current_span("demo.turn"):
                start = time.perf_counter()
                resp = client.chat.completions.create(
                    model=common.deployment(),
                    messages=[
                        {"role": "system", "content": "You are a concise Azure assistant."},
                        {"role": "user", "content": prompt},
                    ],
                    max_completion_tokens=800,
                )
                elapsed = time.perf_counter() - start
                usage = resp.usage
                print(f"\nQ: {prompt}\nA: {resp.choices[0].message.content}")
                print(f"[{elapsed:.1f}s, prompt={usage.prompt_tokens}, completion={usage.completion_tokens}]")

    trace.get_tracer_provider().force_flush()
    print("\nTraces sent. Allow 2-5 minutes, then see kql/queries.kql or Foundry portal > Tracing.")


if __name__ == "__main__":
    main()

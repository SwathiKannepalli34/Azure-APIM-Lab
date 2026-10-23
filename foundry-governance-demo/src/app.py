"""Local live-demo server. Serves static/index.html and exposes the demo scripts as JSON endpoints.

    python app.py            # then open http://127.0.0.1:8000

Binds to localhost only and uses your own Entra ID credentials (az login); no keys involved.
"""
import json
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import common
import evaluate
import governance_report
import guardrails_test

STATIC = Path(__file__).resolve().parent / "static"
PORT = 8000
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}


def chat(body: dict) -> dict:
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt is required")
    start = time.perf_counter()
    resp = common.get_client().chat.completions.create(
        model=common.deployment(),
        messages=[
            {"role": "system", "content": "You are a concise Azure assistant."},
            {"role": "user", "content": prompt[:2000]},
        ],
        max_completion_tokens=1500,
    )
    return {
        "answer": resp.choices[0].message.content or "",
        "seconds": round(time.perf_counter() - start, 1),
        "promptTokens": resp.usage.prompt_tokens,
        "completionTokens": resp.usage.completion_tokens,
        "model": resp.model,
    }


def config() -> dict:
    return {"deployment": common.deployment()}


GET_ROUTES = {
    "/api/config": lambda: config(),
    "/api/guardrails": lambda: {"rows": guardrails_test.run_cases()},
    "/api/governance": lambda: governance_report.collect(),
}
POST_ROUTES = {
    "/api/chat": chat,
    "/api/evaluate": lambda body: evaluate.run_eval(float(body.get("threshold", 3.5)), bool(body.get("safety"))),
}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: bytes, ctype: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def _json(self, status: int, obj: dict) -> None:
        self._send(status, json.dumps(obj).encode(), "application/json")

    def _host_ok(self) -> bool:
        return self.headers.get("Host") in ALLOWED_HOSTS

    def do_GET(self) -> None:
        if not self._host_ok():
            return self._json(403, {"error": "forbidden host"})
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            return self._send(200, (STATIC / "index.html").read_bytes(), "text/html; charset=utf-8")
        handler = GET_ROUTES.get(path)
        if not handler:
            return self._json(404, {"error": "not found"})
        self._run(lambda: handler())

    def do_POST(self) -> None:
        origin = self.headers.get("Origin")
        if not self._host_ok() or (origin and urlparse(origin).netloc not in ALLOWED_HOSTS):
            return self._json(403, {"error": "forbidden origin"})
        handler = POST_ROUTES.get(urlparse(self.path).path)
        if not handler:
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}") if length else {}
        self._run(lambda: handler(body))

    def _run(self, fn) -> None:
        try:
            self._json(200, fn())
        except ValueError as err:
            self._json(400, {"error": str(err)})
        except Exception as err:  # surface the failure to the page instead of hanging
            traceback.print_exc()
            self._json(500, {"error": f"{type(err).__name__}: {err}"})

    def log_message(self, fmt, *args) -> None:
        print(f"{self.address_string()} {fmt % args}")


def main() -> None:
    common.enable_tracing("foundry-demo-web")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Foundry demo running at http://127.0.0.1:{PORT}  (Ctrl+C to stop)")
    server.serve_forever()


if __name__ == "__main__":
    main()

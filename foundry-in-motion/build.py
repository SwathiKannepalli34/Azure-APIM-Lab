"""Builds dist/foundry-in-motion.html (one self-contained file) from src/.

    python build.py            # build
    python build.py --check    # build, then verify every learn.microsoft.com link returns 200

Macros usable inside src/sections/*.html:
    {{doc:agents/overview|Label}}        -> https://learn.microsoft.com/en-us/azure/foundry/agents/overview
    {{url:https://example.com|Label}}    -> any absolute URL
"""
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
BASE = "https://learn.microsoft.com/en-us/azure/foundry/"
LAST_VERIFIED = "2026-10-25"

DOC = re.compile(r"\{\{doc:([^|}]+)\|([^}]+)\}\}")
URL = re.compile(r"\{\{url:([^|}]+)\|([^}]+)\}\}")


def link(href: str, label: str) -> str:
    return f'<a class="ref" href="{href}" target="_blank" rel="noopener">{label}</a>'


def expand(html: str) -> str:
    html = DOC.sub(lambda m: link(BASE + m.group(1), m.group(2)), html)
    return URL.sub(lambda m: link(m.group(1), m.group(2)), html)


def build() -> Path:
    sections = "\n".join(
        expand(p.read_text(encoding="utf-8")) for p in sorted((SRC / "sections").glob("*.html"))
    )
    page = (SRC / "template.html").read_text(encoding="utf-8")
    page = (
        page.replace("{{CSS}}", (SRC / "styles.css").read_text(encoding="utf-8"))
        .replace("{{JS}}", (SRC / "app.js").read_text(encoding="utf-8"))
        .replace("{{SECTIONS}}", sections)
        .replace("{{LAST_VERIFIED}}", LAST_VERIFIED)
    )
    DIST.mkdir(exist_ok=True)
    out = DIST / "foundry-in-motion.html"
    out.write_text(page, encoding="utf-8")
    print(f"Built {out} ({out.stat().st_size / 1024:.0f} KB)")
    return out


def check(out: Path) -> int:
    import requests

    hrefs = sorted(set(re.findall(r'href="(https://[^"]+)"', out.read_text(encoding="utf-8"))))
    hrefs = [h for h in hrefs if "learn.microsoft.com" in h]

    def probe(url: str):
        try:
            r = requests.get(url, timeout=30, allow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
            return url, r.status_code
        except Exception as err:  # network failure is reported, not fatal
            return url, str(err)[:60]

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(probe, hrefs))
    bad = [(u, s) for u, s in results if s != 200]
    print(f"Checked {len(results)} learn.microsoft.com links, {len(bad)} not 200")
    for u, s in bad:
        print(f"  {s}  {u}")
    return 1 if bad else 0


if __name__ == "__main__":
    built = build()
    if "--check" in sys.argv:
        sys.exit(check(built))

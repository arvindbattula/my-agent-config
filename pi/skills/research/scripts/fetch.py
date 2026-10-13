#!/usr/bin/env python3
"""Fetch a web page and extract readable text. No API keys, stdlib only.

Usage: fetch.py [--max-chars N] URL

Prints extracted text to stdout. Exit 1 with a stderr message on failure
so the caller can apply the skill's failure-recovery rules.
"""
import argparse
import re
import sys
import urllib.request
from html.parser import HTMLParser

UA = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0"
SKIP = {"script", "style", "noscript", "head", "header", "footer", "nav", "form", "svg", "iframe"}


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self._skip += 1
        elif tag in ("p", "div", "br", "li", "h1", "h2", "h3", "h4", "tr", "section", "article") and not self._skip:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in SKIP and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)

    def text(self) -> str:
        raw = "".join(self.parts)
        lines = [" ".join(l.split()) for l in raw.split("\n")]
        return "\n".join(l for l in lines if l)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--max-chars", type=int, default=12000)
    a = ap.parse_args()
    try:
        req = urllib.request.Request(a.url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=25) as r:
            ctype = r.headers.get("Content-Type", "")
            if "text/html" not in ctype and "text/plain" not in ctype and ctype:
                print(f"unsupported content type: {ctype}", file=sys.stderr)
                sys.exit(1)
            charset = r.headers.get_content_charset() or "utf-8"
            body = r.read().decode(charset, errors="replace")
    except Exception as e:
        print(f"fetch failed: {e}", file=sys.stderr)
        sys.exit(1)
    if body.lstrip().startswith("<"):
        text = TextExtractor()
        text.feed(body)
        out = text.text()
    else:
        out = body
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    if len(out) < 80:
        print("extracted text is suspiciously short; page may be JS-rendered or blocked", file=sys.stderr)
        sys.exit(1)
    print(out[: a.max_chars])


if __name__ == "__main__":
    main()

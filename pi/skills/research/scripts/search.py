#!/usr/bin/env python3
"""Web search for the research skill. No API keys, stdlib only.

Usage: search.py [--engine ddg|bing] [--limit N] "query"

Prints a JSON array of {"title", "url", "snippet"} to stdout.
Exit 1 with a stderr message on failure so the caller can apply
the skill's failure-recovery rules.
"""
import argparse
import html as html_mod
import json
import re
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser

UA = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0"


def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        charset = r.headers.get_content_charset() or "utf-8"
        return r.read().decode(charset, errors="replace")


def unwrap_ddg(href: str) -> str:
    # DDG wraps result links: //duckduckgo.com/l/?uddg=<urlencoded>&...
    m = re.search(r"[?&]uddg=([^&]+)", href)
    if m:
        return urllib.parse.unquote(m.group(1))
    if href.startswith("//"):
        return "https:" + href
    return href


class DDGParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.results = []
        self._cur = None
        self._field = None

    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get("class", "")
        if tag == "a" and "result__a" in cls:
            self._cur = {"title": "", "url": unwrap_ddg(dict(attrs).get("href", "")), "snippet": ""}
            self._field = "title"
        elif tag in ("a", "div") and "result__snippet" in cls:
            self._field = "snippet"

    def handle_endtag(self, tag):
        if tag == "a" and self._field == "title" and self._cur is not None:
            self._field = None
            self.results.append(self._cur)
            self._cur = None
        elif tag in ("a", "div") and self._field == "snippet":
            self._field = None

    def handle_data(self, data):
        if self._field == "title" and self._cur is not None:
            self._cur["title"] += data
        elif self._field == "snippet" and self.results:
            self.results[-1]["snippet"] += data if self._cur is None else ""


def search_ddg(query: str, limit: int):
    url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote_plus(query)
    p = DDGParser()
    p.feed(get(url))
    out = []
    for r in p.results:
        r["title"] = " ".join(r["title"].split())
        r["snippet"] = " ".join(r["snippet"].split())
        if r["url"].startswith("http"):
            out.append(r)
    return out[:limit]


def unwrap_bing(href: str) -> str:
    # Bing wraps result links: /ck/a?...&u=a1<base64url-of-real-url>&...
    m = re.search(r"[?&]u=a1([^&]+)", href)
    if m:
        import base64
        try:
            pad = "=" * (-len(m.group(1)) % 4)
            return base64.urlsafe_b64decode(m.group(1) + pad).decode("utf-8", "replace")
        except Exception:
            pass
    return href


def search_bing(query: str, limit: int):
    url = "https://www.bing.com/search?q=" + urllib.parse.quote_plus(query)
    html = get(url)
    out = []
    # Each organic result: <li class="b_algo">...<h2 ...><a href="URL">TITLE</a></h2> ... <p>SNIPPET</p>
    for block in re.findall(r'<li class="b_algo".*?</li>', html, re.S):
        m = re.search(r'<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>(.*?)</a></h2>', block, re.S)
        if not m:
            continue
        href, title = unwrap_bing(m.group(1).replace("&amp;", "&")), re.sub(r"<[^>]+>", "", m.group(2))
        p = re.search(r"<p[^>]*>(.*?)</p>", block, re.S)
        snippet = re.sub(r"<[^>]+>", "", p.group(1)) if p else ""
        out.append({
            "title": html_mod.unescape(" ".join(title.split())),
            "url": href,
            "snippet": html_mod.unescape(" ".join(snippet.split())),
        })
    return [r for r in out if r["url"].startswith("http")][:limit]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("query")
    ap.add_argument("--engine", choices=["ddg", "bing"], default="ddg")
    ap.add_argument("--limit", type=int, default=10)
    a = ap.parse_args()
    try:
        results = search_ddg(a.query, a.limit) if a.engine == "ddg" else search_bing(a.query, a.limit)
    except Exception as e:
        print(f"search failed ({a.engine}): {e}", file=sys.stderr)
        sys.exit(1)
    if not results:
        print(f"no results parsed ({a.engine}); the page layout may have changed or the request was blocked", file=sys.stderr)
        sys.exit(1)
    json.dump(results, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()

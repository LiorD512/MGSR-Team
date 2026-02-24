#!/usr/bin/env python3
"""
Freesearch proxy - uses scout-server-freesearch logic, calls Render scout server.
Run from mgsr-web: python scripts/freesearch-proxy.py  (or: npm run freesearch)
Set in .env.local: SCOUT_FREESEARCH_URL=http://localhost:8001
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler

# Ensure scripts dir is in path for import
_script_dir = os.path.dirname(os.path.abspath(__file__))
if _script_dir not in sys.path:
    sys.path.insert(0, _script_dir)
from freesearch_parser import parse_free_query

SCOUT_RENDER = "https://football-scout-server-l38w.onrender.com"
PORT = 8001


def fetch_recruitment(params: dict, lang: str) -> dict:
    """Call Render scout server /recruitment. Exclude min_goals (we filter after)."""
    send = {k: v for k, v in params.items() if k != "min_goals" and v is not None and v != ""}
    send["limit"] = min(25, max(send.get("limit", 15) * 3, 15)) if params.get("min_goals") else send.get("limit", 15)
    qs = urllib.parse.urlencode(send)
    qs += f"&lang={lang}&sort_by=score&_t={__import__('time').time()}"
    url = f"{SCOUT_RENDER}/recruitment?{qs}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode())


def filter_by_min_goals(results: list, min_goals: int) -> list:
    """Filter results by fbref_goals >= min_goals."""
    out = []
    for p in results:
        g = p.get("fbref_goals")
        if g is None:
            continue
        n = int(g) if isinstance(g, str) else g
        if n >= min_goals:
            out.append(p)
    return out


class FreesearchHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/freesearch?"):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            q = (qs.get("q") or [""])[0]
            lang = (qs.get("lang") or ["en"])[0]
            limit = int((qs.get("limit") or [15])[0])
            initial = (qs.get("initial") or ["false"])[0].lower() == "true"
            if not q.strip():
                self._send_json(400, {"error": "q required", "results": []})
                return
            try:
                params = parse_free_query(q, lang)
                fetch_limit = min(5, limit) if initial else limit
                params["limit"] = fetch_limit
                data = fetch_recruitment(params, lang)
                results = data.get("results") or []
                min_goals = params.get("min_goals")
                if min_goals:
                    results = filter_by_min_goals(results, min_goals)
                results = results[:limit]
                self._send_json(200, {"results": results})
            except Exception as e:
                self._send_json(502, {"error": str(e), "results": []})
        else:
            self.send_response(404)
            self.end_headers()

    def _send_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, format, *args):
        print(f"[Freesearch] {args[0]}")


if __name__ == "__main__":
    print(f"Freesearch proxy: http://localhost:{PORT}/freesearch")
    print("Add to .env.local: SCOUT_FREESEARCH_URL=http://localhost:8001")
    HTTPServer(("", PORT), FreesearchHandler).serve_forever()

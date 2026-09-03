"""Offline Replay-driven Viewer static server (owned by work_package_d).

The server serves ``viewer/`` (including the orchestrator-exported
``bundle.json`` and ``gebco_basemap.png``) and exposes a small
``/api/state?t=`` lookup over the bundle timeline.  It deliberately does not
import orchestrator code: the viewer consumes the stable presentation package.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import sys
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


def _parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


class Handler(BaseHTTPRequestHandler):
    server_version = "ArcticRouteReplayViewer"

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("[viewer] %s\n" % (fmt % args))

    def _json(self, status: int, document: object) -> None:
        body = json.dumps(document, ensure_ascii=False, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _state_at(self, tick: str) -> dict | None:
        bundle = getattr(self.server, "bundle", None)
        if not bundle:
            return None
        try:
            target = _parse_utc(tick)
        except ValueError:
            return None
        selected = None
        timeline = bundle.get("timeline", [])
        for entry in timeline:
            selected = entry
            if _parse_utc(entry["t"]) > target:
                break
        if selected is None:
            return None
        return {
            "t": tick,
            "state_t": selected["t"],
            "interpolated": False,
            "state": {"t": selected["t"], **selected},
        }

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            query = parse_qs(parsed.query)
            tick = (query.get("t") or [""])[0]
            if not tick:
                self._json(400, {"error": "missing t"})
                return
            state = self._state_at(tick)
            if state is None:
                self._json(400, {"error": "no viewer bundle or invalid time"})
                return
            self._json(200, state)
            return
        root = self.server.root.resolve()
        relative = parsed.path.lstrip("/")
        packages_root = getattr(self.server, "packages_root", None)
        allow_index_fallback = True
        if packages_root is not None and (
            relative == "packages" or relative.startswith("packages/")
        ):
            # Read-only mount: packages/<pkg>/... -> <packages-dir>/<pkg>/...
            inner = relative[len("packages/"):] if relative.startswith("packages/") else ""
            base = packages_root.resolve()
            candidate = (base / inner).resolve()
            allow_index_fallback = False
        else:
            base = root
            candidate = (root / relative).resolve()
        if not candidate.is_relative_to(base):
            self._json(404, {"error": "not found"})
            return
        if not candidate.is_file():
            if allow_index_fallback and (relative in ("", "/") or candidate.name == ""):
                candidate = root / "index.html"
            else:
                self._json(404, {"error": "not found"})
                return
        content_type = {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".png": "image/png",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
        }.get(candidate.suffix.lower(), "application/octet-stream")
        body = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="replay-viewer-serve")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8131)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "viewer",
    )
    parser.add_argument(
        "--packages-dir",
        type=Path,
        default=None,
        help="optional finished-viewer-package directory (work_package_d/output) "
        "served read-only under the packages/<pkg>/ prefix",
    )
    args = parser.parse_args(argv)

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.root = args.root.resolve()
    server.packages_root = (
        args.packages_dir.resolve() if args.packages_dir is not None else None
    )
    server.bundle = None
    bundle_path = args.root / "bundle.json"
    if bundle_path.exists():
        server.bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    print(
        "serving",
        server.root,
        "at",
        f"http://{args.host}:{args.port}",
        "bundle=",
        "on" if server.bundle else "off",
        "packages=",
        str(server.packages_root) if server.packages_root else "off",
        flush=True,
    )
    with contextlib.suppress(KeyboardInterrupt):
        server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

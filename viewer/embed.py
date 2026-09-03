"""Inline bundle + basemap into a self-contained Viewer HTML (offline, no server)."""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="viewer-embed")
    parser.add_argument("--viewer-dir", type=Path, default=Path(__file__).parent)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args(argv)

    viewer = args.viewer_dir
    html = (viewer / "index.html").read_text(encoding="utf-8")
    css = (viewer / "style.css").read_text(encoding="utf-8")
    research_candidates = (viewer / "research_candidates.js").read_text(encoding="utf-8")
    risk_explanation = (viewer / "risk_explanation.js").read_text(encoding="utf-8")
    route_motion = (viewer / "route_motion.js").read_text(encoding="utf-8")
    runtime_route_candidates = (viewer / "runtime_route_candidates.js").read_text(
        encoding="utf-8"
    )
    route_visual_smoothing = (viewer / "route_visual_smoothing.js").read_text(
        encoding="utf-8"
    )
    app = (viewer / "app.js").read_text(encoding="utf-8")
    bundle = (viewer / "bundle.json").read_bytes()
    basemap = (viewer / "gebco_basemap.png").read_bytes()

    bundle_js = json.dumps(json.loads(bundle), ensure_ascii=False, separators=(",", ":"))
    basemap_data = "data:image/png;base64," + base64.b64encode(basemap).decode("ascii")
    inline = (
        "<style>\n"
        + css
        + "\n</style>\n"
        + "<script>\n"
        "window.VIEWER_BUNDLE = "
        + bundle_js
        + ";\n"
        "window.VIEWER_BASEMAP = "
        + json.dumps(basemap_data)
        + ";\n"
        "</script>\n"
        "<script>\n"
        + research_candidates
        + "\n</script>\n"
        + "<script>\n"
        + risk_explanation
        + "\n</script>\n"
        + "<script>\n"
        + route_motion
        + "\n</script>\n"
        + "<script>\n"
        + runtime_route_candidates
        + "\n</script>\n"
        + "<script>\n"
        + route_visual_smoothing
        + "\n</script>\n"
        + "<script>\n"
        + app
        + "\n</script>\n"
    )
    html = html.replace('<link rel="stylesheet" href="style.css" />', "")
    html = html.replace('<script src="research_candidates.js"></script>\n    ', "")
    html = html.replace('<script src="risk_explanation.js"></script>\n    ', "")
    html = html.replace('<script src="route_motion.js"></script>\n    ', "")
    html = html.replace('<script src="runtime_route_candidates.js"></script>\n    ', "")
    html = html.replace('<script src="route_visual_smoothing.js"></script>\n    ', "")
    html = html.replace('<script src="app.js"></script>', inline)
    output = args.output or viewer / "index_self_contained.html"
    output.write_text(html, encoding="utf-8")
    print("wrote", output, "size", output.stat().st_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

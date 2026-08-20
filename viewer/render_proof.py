"""Render an offline proof PNG from the stable viewer bundle + GEBCO basemap.

The proof image is produced by work_package_d from the orchestrator-exported
``bundle.json`` and ``gebco_basemap.png`` only.  It applies the same EPSG:4326
canonical transform that the browser uses, so it demonstrates basemap / route /
track / vessel alignment without needing a browser.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from pngcodec import read_png_rgb, write_png_rgb


def _parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def _project(basemap: dict, lon: float, lat: float) -> tuple[float, float]:
    box = basemap["bbox"]
    width = basemap["width"]
    height = basemap["height"]
    x = (lon - box["min_lon"]) / (box["max_lon"] - box["min_lon"]) * width
    y = (box["max_lat"] - lat) / (box["max_lat"] - box["min_lat"]) * height
    return x, y


def _draw_disc(
    pixels: bytearray,
    width: int,
    height: int,
    x: float,
    y: float,
    radius: int,
    color: tuple[int, int, int],
) -> None:
    center_x = round(x)
    center_y = round(y)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy > radius * radius:
                continue
            px = center_x + dx
            py = center_y + dy
            if 0 <= px < width and 0 <= py < height:
                index = (py * width + px) * 3
                pixels[index] = color[0]
                pixels[index + 1] = color[1]
                pixels[index + 2] = color[2]


def _draw_segment(
    pixels: bytearray,
    width: int,
    height: int,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    color: tuple[int, int, int],
    radius: int,
    *,
    dash: int | None = None,
) -> None:
    steps = max(int(abs(x1 - x0)), int(abs(y1 - y0))) + 1
    for index in range(steps + 1):
        if dash is not None and (index // dash) % 2 == 1:
            continue
        fraction = index / max(1, steps)
        px = x0 + (x1 - x0) * fraction
        py = y0 + (y1 - y0) * fraction
        _draw_disc(pixels, width, height, px, py, radius, color)


def _state_for_time(bundle: dict, target_text: str) -> dict:
    target = _parse_utc(target_text)
    timeline = bundle["timeline"]
    previous = timeline[0]
    current = timeline[0]
    for item in timeline:
        current = item
        if _parse_utc(item["t"]) <= target:
            previous = item
        else:
            break
    next_item = current
    fraction = 0.0
    denominator = (_parse_utc(next_item["t"]) - _parse_utc(previous["t"])).total_seconds()
    if denominator > 0:
        fraction = max(
            0.0,
            min(1.0, (target - _parse_utc(previous["t"])).total_seconds() / denominator),
        )
    def lerp(a, b): return a + (b - a) * fraction
    return {
        "t": target_text,
        "lon": lerp(previous["v"]["lon"], next_item["v"]["lon"]),
        "lat": lerp(previous["v"]["lat"], next_item["v"]["lat"]),
        "kn": lerp(previous["v"]["kn"] or 0.0, next_item["v"]["kn"] or 0.0),
        "arv": previous["arv"],
        "track": previous.get("track", []),
        "pending": previous.get("pending"),
    }


def _polylines_for(
    bundle: dict,
    state: dict,
) -> tuple[
    list[tuple[float, float]],
    list[tuple[float, float]],
    list[tuple[float, float]],
    tuple[float, float],
]:
    basemap = bundle["basemap"]
    active = next(
        route for route in bundle["routes"] if route["revision"] == state["arv"]
    )
    active_pts = [
        _project(basemap, w["lon"], w["lat"])
        for w in active["waypoints"]
        if _parse_utc(w["eta"]) >= _parse_utc(state["t"])
    ]
    track_pts = [
        _project(basemap, p["longitude"], p["latitude"]) for p in state["track"]
    ]
    vessel_pt = _project(basemap, state["lon"], state["lat"])
    pending_pts: list[tuple[float, float]] = []
    pending = state["pending"]
    if pending and pending["revision"] != state["arv"]:
        pending_pts = [
            _project(basemap, w["lon"], w["lat"]) for w in pending["route"]
        ]
    return active_pts, track_pts, pending_pts, vessel_pt


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="viewer-render-proof")
    parser.add_argument("--viewer-dir", type=Path, default=Path(__file__).parent)
    parser.add_argument("--time", action="append", default=["2026-08-15T10:30:00Z"])
    parser.add_argument("--output-dir", type=Path, default=None)
    args = parser.parse_args(argv)
    viewer = args.viewer_dir
    bundle = json.loads((viewer / "bundle.json").read_text(encoding="utf-8"))
    basemap = bundle["basemap"]
    width = basemap["width"]
    height = basemap["height"]
    _, _, rgb = read_png_rgb(viewer / "gebco_basemap.png")
    pixels = bytearray(rgb)
    output_dir = args.output_dir or viewer
    output_dir.mkdir(parents=True, exist_ok=True)
    for target in args.time:
        state = _state_for_time(bundle, target)
        active_pts, track_pts, pending_pts, vessel_pt = _polylines_for(bundle, state)
        for index in range(len(track_pts) - 1):
            _draw_segment(
                pixels, width, height,
                track_pts[index][0], track_pts[index][1],
                track_pts[index + 1][0], track_pts[index + 1][1],
                (92, 196, 122), 2,
            )
        for index in range(len(pending_pts) - 1):
            _draw_segment(
                pixels, width, height,
                pending_pts[index][0], pending_pts[index][1],
                pending_pts[index + 1][0], pending_pts[index + 1][1],
                (242, 177, 52), 2, dash=10,
            )
        for index in range(len(active_pts) - 1):
            _draw_segment(
                pixels, width, height,
                active_pts[index][0], active_pts[index][1],
                active_pts[index + 1][0], active_pts[index + 1][1],
                (61, 155, 233), 2,
            )
        _draw_disc(pixels, width, height, vessel_pt[0], vessel_pt[1], 8, (255, 255, 255))
        _draw_disc(pixels, width, height, vessel_pt[0], vessel_pt[1], 3, (15, 43, 59))
        safe = target.replace(":", "-").replace("Z", "")
        output = output_dir / f"replay-viewer-proof-{safe}.png"
        write_png_rgb(output, width, height, bytes(pixels))
        print("wrote", output, "time", target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

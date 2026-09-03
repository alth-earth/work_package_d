#!/usr/bin/env python3
"""Build the Viewer package index (viewer/packages.json) from work_package_d/output.

The index only carries summary metadata (schema ``d.viewer-package-index.v1``);
full bundles stay in ``output/<package_dir>/`` and are fetched on demand through
the ``packages/<pkg>/`` read-only mount of replay_viewer_serve.py.

Behaviour:
- scans ``output/`` for finished ``*-viewer-package*`` directories (skips
  ``playwright/**`` and cache dirs);
- reads only top-level identity fields of each package ``bundle.json``
  (falling back to ``winter-combined-viewer-manifest.json`` when present);
- merges manual overrides from ``configs/viewer_package_overrides.json``
  (display_name / order / hidden / note);
- marks damaged/incomplete packages ``incomplete`` with a reason but does not
  abort the whole run (fail-visible);
- writes ``viewer/packages.json`` atomically (tmp + replace).

Run from anywhere:
    python scripts/build_viewer_package_index.py
Optional: ``--output-root`` (default work_package_d), ``--out viewer/packages.json``.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

SCHEMA = "d.viewer-package-index.v1"
OVERRIDES_SCHEMA = "d.viewer-package-overrides.v1"

# Human readable corridor labels shown in the picker (never just the digest/id).
CORRIDOR_LABELS = {
    "tromso_to_isfjorden_outer": "Tromsø → Isfjorden (outer)",
    "offshore_murmansk_to_offshore_dikson": "Murmansk → Dikson",
}

# Package directories that are export/derivation scratch, not finished artifacts.
SKIP_DIR_NAMES = {"playwright", "__pycache__", ".cache", ".playwright-cli"}


def _workspace_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "arctic_route_governance").is_dir() or (
            parent / "work_package_d"
        ).is_dir():
            return parent
    return Path.home()


def _iso_mtime(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def _json(path: Path, label: str, *, max_bytes: int = 96 * 1024 * 1024):
    try:
        if path.stat().st_size > max_bytes:
            return None, f"{label} 过大（>{max_bytes // 1024 // 1024} MB），未解析"
        value = json.loads(path.read_text(encoding="utf-8"))
        return value, None
    except FileNotFoundError:
        return None, f"缺少 {label}"
    except (json.JSONDecodeError, OSError) as exc:
        return None, f"{label} 解析失败: {type(exc).__name__}"


def _corridor_label(corridor_id: str) -> str:
    if not corridor_id:
        return "未知航线"
    return CORRIDOR_LABELS.get(corridor_id, corridor_id)


def _default_display_name(entry: dict[str, object]) -> str:
    # simulation window is the bundle's simulation timeline; show dates only.
    start = str(entry.get("simulation_start") or "")[:10]
    end = str(entry.get("simulation_end") or "")[:10]
    window = f"{start} → {end}" if start and end else ""
    label = _corridor_label(str(entry.get("corridor_id") or ""))
    return (f"{label} · {window}").strip(" ·")


def _extract(package_dir: Path) -> tuple[dict[str, object] | None, str | None]:
    """Read identity summary of one package directory.

    Returns (entry or None, reason). ``entry`` has only stable JSON-safe fields.
    """
    bundle_path = package_dir / "bundle.json"
    manifest_path = package_dir / "winter-combined-viewer-manifest.json"

    bundle, reason = _json(bundle_path, "bundle.json")
    manifest = None
    if manifest_path.is_file():
        manifest, _ = _json(manifest_path, "manifest")
        if manifest is None:
            manifest = None

    if bundle is None and manifest is None:
        return None, reason or "缺少 bundle.json 与 manifest"
    if bundle is None:
        # bundle_path is mandatory for the picker to load the artifact; a
        # manifest alone must not mark the package ready with a dead path.
        return None, "缺少可解析的 bundle.json（清单无法作为加载源）"

    def _pick(*values: object) -> object:
        for value in values:
            if value not in (None, "", [], {}):
                return value
        return None

    def _get(doc, dotted: str):
        node = doc
        for key in dotted.split("."):
            if not isinstance(node, dict):
                return None
            node = node.get(key)
        return node

    cp = bundle.get("combined_presentation") if isinstance(bundle, dict) else {}
    rp = bundle.get("replay") if isinstance(bundle, dict) else {}
    risk = bundle.get("risk") if isinstance(bundle, dict) else {}
    risk_src = risk.get("source") if isinstance(risk, dict) else {}
    ident = (
        manifest.get("identity")
        if isinstance(manifest, dict) and isinstance(manifest.get("identity"), dict)
        else {}
    )

    corridor_id = _pick(
        risk_src.get("corridor_id"), cp.get("corridor_id"), ident.get("corridor_id")
    )
    scenario_id = _pick(
        rp.get("scenario_id"), risk_src.get("scenario_id"), ident.get("scenario_id")
    )
    simulation_start = _pick(
        rp.get("start"), ident.get("simulation_start")
    )
    simulation_end = _pick(rp.get("end"), ident.get("simulation_end"))
    dataset_bundle_id = _pick(
        cp.get("dataset_bundle_id"), risk_src.get("dataset_bundle_id"),
        ident.get("dataset_bundle_id"),
    )
    dataset_bundle_digest = _pick(
        cp.get("dataset_bundle_digest"), risk_src.get("dataset_bundle_digest"),
        ident.get("dataset_bundle_digest"),
    )
    risk_window_id = _pick(
        cp.get("risk_window_id"), risk_src.get("risk_window_id"),
        ident.get("risk_window_id"),
    )
    run_id = _pick(cp.get("run_context_id"), risk_src.get("run_id"))
    layer_set_id = _pick(cp.get("layer_set_id"), ident.get("layer_set_id"))
    candidate_set_id = _pick(cp.get("candidate_set_id"), ident.get("candidate_set_id"))
    selected_candidate_id = _pick(cp.get("selected_candidate_id"))

    # risk.frames is an int count on this schema; tolerate a list as well.
    frames_raw = risk.get("frames")
    if isinstance(frames_raw, int):
        risk_frame_count = frames_raw
    elif isinstance(frames_raw, list):
        risk_frame_count = len(frames_raw)
    else:
        risk_frame_count = _pick(ident.get("risk_frame_count"), 0)

    routes = bundle.get("routes") if isinstance(bundle, dict) else []
    route_count = len(routes) if isinstance(routes, list) else 0

    motion_sets = (
        bundle.get("route_motion_sets")
        if isinstance(bundle, dict) and isinstance(bundle.get("route_motion_sets"), list)
        else []
    )
    route_motion_set_ids = [
        m.get("motion_set_id") for m in motion_sets if isinstance(m, dict)
    ]

    explanation = bundle.get("risk_explanation") if isinstance(bundle, dict) else None
    has_risk_explanation = bool(explanation)
    transport = (
        bundle.get("risk_explanation_transport")
        if isinstance(bundle, dict)
        and isinstance(bundle.get("risk_explanation_transport"), dict)
        else {}
    )
    explanation_artifact_id = transport.get("artifact_id")

    entry: dict[str, object] = {
        "package_dir": package_dir.name,
        "display_name": "",
        "corridor_id": corridor_id or "",
        "scenario_id": scenario_id or "",
        "simulation_start": str(simulation_start or ""),
        "simulation_end": str(simulation_end or ""),
        "risk_frame_count": int(risk_frame_count or 0),
        "route_count": int(route_count or 0),
        "has_risk_explanation": bool(has_risk_explanation),
        "explanation_artifact_id": explanation_artifact_id or None,
        "dataset_bundle_id": dataset_bundle_id or "",
        "dataset_bundle_digest": dataset_bundle_digest or "",
        "risk_window_id": risk_window_id or "",
        "run_id": run_id or "",
        "layer_set_id": layer_set_id or "",
        "candidate_set_id": candidate_set_id or "",
        "selected_candidate_id": selected_candidate_id or "",
        "route_motion_set_ids": list(route_motion_set_ids),
        "generated_at": _iso_mtime(bundle_path) if bundle_path.is_file() else "",
        "bundle_path": f"packages/{package_dir.name}/bundle.json",
        "status": "ready",
        "reason": None,
    }
    entry["display_name"] = _default_display_name(entry)
    return entry, None


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="build-viewer-package-index")
    root = _workspace_root()
    parser.add_argument(
        "--output-root",
        type=Path,
        default=root / "work_package_d",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="output index path (default <output-root>/viewer/packages.json)",
    )
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    root: Path = args.output_root
    packages_dir: Path = root / "output"
    viewer_dir: Path = root / "viewer"
    out_path: Path = args.out or (viewer_dir / "packages.json")
    overrides_path: Path = root / "configs" / "viewer_package_overrides.json"

    overrides: dict[str, object] = {}
    if overrides_path.is_file():
        doc, err = _json(overrides_path, "overrides")
        if err or not isinstance(doc, dict):
            print(
                f"warning: 覆盖文件解析失败，忽略手工覆盖: {err or overrides_path}",
                file=sys.stderr,
            )
        else:
            overrides = (
                doc.get("packages") if isinstance(doc.get("packages"), dict) else {}
            )

    packages: list[dict[str, object]] = []

    # viewer-root = current default viewer/bundle.json (semantic default entry).
    default_bundle = viewer_dir / "bundle.json"
    if default_bundle.is_file():
        entry, err = _extract(viewer_dir)
        if entry is not None:
            entry["package_dir"] = "viewer-root"
            entry["display_name"] = f"{entry.get('display_name')}（当前默认）"
            entry["bundle_path"] = "bundle.json"
            entry["generated_at"] = _iso_mtime(default_bundle)
            packages.append(entry)
        else:
            print(f"warning: 默认 viewer/bundle.json 无法生成索引项: {err}", file=sys.stderr)

    if not packages_dir.is_dir():
        print(f"error: 未找到制品目录: {packages_dir}", file=sys.stderr)
        return 2

    for child in sorted(packages_dir.iterdir()):
        if not child.is_dir():
            continue
        if child.name in SKIP_DIR_NAMES or child.name.startswith("."):
            continue
        # Only finished artifact packages carry the suffix; playwright copies do
        # not (and are excluded above anyway).
        if "viewer-package" not in child.name and "backup" not in child.name:
            continue
        entry, err = _extract(child)
        if entry is None:
            packages.append(
                {
                    "package_dir": child.name,
                    "display_name": child.name,
                    "corridor_id": "",
                    "scenario_id": "",
                    "simulation_start": "",
                    "simulation_end": "",
                    "risk_frame_count": 0,
                    "route_count": 0,
                    "has_risk_explanation": False,
                    "explanation_artifact_id": None,
                    "dataset_bundle_id": "",
                    "dataset_bundle_digest": "",
                    "risk_window_id": "",
                    "run_id": "",
                    "layer_set_id": "",
                    "candidate_set_id": "",
                    "selected_candidate_id": "",
                    "route_motion_set_ids": [],
                    "generated_at": "",
                    "bundle_path": f"packages/{child.name}/bundle.json",
                    "status": "incomplete",
                    "reason": err or "无法解析",
                }
            )
            continue
        packages.append(entry)

    # Apply manual overrides (display_name / order / hidden / note).
    for entry in packages:
        override = overrides.get(entry["package_dir"])
        if not isinstance(override, dict):
            continue
        if isinstance(override.get("display_name"), str) and override["display_name"]:
            entry["display_name"] = override["display_name"]
        if isinstance(override.get("order"), (int, float)):
            entry["order"] = int(override["order"])
        if isinstance(override.get("hidden"), bool):
            entry["hidden"] = override["hidden"]
        if isinstance(override.get("note"), str) and override["note"]:
            entry["note"] = override["note"]

    # viewer-root (default) always first; others ascending by override order
    # (missing order -> middle, then newest window first as secondary key).
    def _epoch_seconds(iso: str) -> int:
        try:
            return int(
                datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()
            )
        except (TypeError, ValueError):
            return 0

    def _rank(e: dict[str, object]) -> tuple:
        order = e.get("order")
        effective = int(order) if isinstance(order, (int, float)) else 500
        return (effective, -_epoch_seconds(str(e.get("simulation_start") or "")))

    root_entries = [e for e in packages if e.get("package_dir") == "viewer-root"]
    rest = [e for e in packages if e.get("package_dir") != "viewer-root"]
    rest.sort(key=_rank)
    packages = root_entries + rest

    document = {
        "schema_version": SCHEMA,
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "default_package": "viewer-root",
        "packages": packages,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = out_path.with_suffix(out_path.suffix + f".{__import__('os').getpid()}.part")
    temporary.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(out_path)
    print(f"wrote {out_path} ({len(packages)} packages)")
    for entry in packages:
        print(
            f"  [{entry.get('status')}] {entry.get('package_dir'):42s} "
            f"{str(entry.get('display_name'))[:56]} "
            f"window={entry.get('simulation_start')}->{entry.get('simulation_end')}"
            f"  explain={'Y' if entry.get('has_risk_explanation') else '-'}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

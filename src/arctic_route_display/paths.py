"""Workspace-root path resolution and config-path expansion for work_package_d.

Resolves the Arctic Route workspace root using the same priority as the
convention declared in ``arctic_route_governance/README.md``:

1. ``ARCTIC_ROUTE_ROOT`` environment variable;
2. derivation from this module's location (delivered repository layout);
3. ``$HOME`` fallback.

Also provides ``expand_config_path`` so that config JSON files may reference the
workspace root via the ``${ARCTIC_ROUTE_ROOT}`` placeholder (which JSON itself
cannot expand).
"""

from __future__ import annotations

import os
from pathlib import Path

_ENV_VAR = "ARCTIC_ROUTE_ROOT"
_MARKER_DIR = "arctic_route_contracts"
# <workspace>/work_package_d/src/arctic_route_display/paths.py
_WORKSPACE_PARENTS = 4


def workspace_root() -> Path:
    env = os.environ.get(_ENV_VAR)
    if env and Path(env).is_dir():
        return Path(env)
    for parent in Path(__file__).resolve().parents:
        if (parent / _MARKER_DIR).is_dir():
            return parent
    return Path.home()


def expand_config_path(value: str | Path) -> Path:
    """Expand a ``${ARCTIC_ROUTE_ROOT}`` placeholder into a real Path.

    Falls back to the resolved workspace root if the env var is unset, so the
    placeholder works whether or not the env var is exported.
    """
    text = os.fspath(value)
    if "${ARCTIC_ROUTE_ROOT}" in text:
        text = text.replace("${ARCTIC_ROUTE_ROOT}", os.fspath(workspace_root()))
    return Path(text).expanduser()

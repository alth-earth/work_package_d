"""Shared demo-layer validation error."""

from __future__ import annotations


class DemoValidationError(ValueError):
    """Raised when a frozen/live artifact fails demo identity validation."""

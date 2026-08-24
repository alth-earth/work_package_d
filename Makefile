ARCTIC_ROUTE_ROOT ?= $(CURDIR)/..
UV ?= $(shell command -v uv 2>/dev/null || echo $(ARCTIC_ROUTE_ROOT)/arctic_route_orchestrator/.mamba-env/bin/uv)
PYTHON ?= $(ARCTIC_ROUTE_ROOT)/arctic_route_orchestrator/.mamba-env/bin/python
export UV_CACHE_DIR ?= $(CURDIR)/.uv-cache
export UV_PYTHON_INSTALL_DIR ?= $(CURDIR)/.uv-python

.PHONY: sync lint test check clean

sync:
	$(UV) sync --locked --python "$(PYTHON)"

lint:
	$(UV) run --locked ruff check src tests

test:
	$(UV) run --locked pytest

check: lint test
	$(UV) sync --check --locked --python "$(PYTHON)"
	$(UV) run --locked arctic-route-display --help

clean:
	rm -rf .venv .pytest_cache .ruff_cache

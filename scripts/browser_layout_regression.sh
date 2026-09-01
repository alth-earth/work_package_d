#!/usr/bin/env bash

# CLI-first browser regression for the narrow risk timeline.  The panel is
# forced to the two production sidebar widths used by the Viewer review so
# this check exercises real layout, not only a CSS string assertion.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VIEWER_DIR="${SCRIPT_DIR}/../viewer"
PORT="${ARCTIC_VIEWER_TEST_PORT:-8134}"
SESSION="risk-layout-regression-$$"
CODEX_SKILL_ROOT="${ARCTIC_CODEX_SKILL_ROOT:-/root/.codex}"
PWCLI="${CODEX_SKILL_ROOT}/skills/playwright/scripts/playwright_cli.sh"
PYTHON_BIN="${ARCTIC_VIEWER_PYTHON:-${SCRIPT_DIR}/../.venv/bin/python}"
if [[ ! -x "${PYTHON_BIN}" ]]; then
  PYTHON_BIN="python3"
fi
SERVER_LOG="$(mktemp)"
SERVER_PID=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -f -- "${SERVER_LOG}"
  "${PWCLI}" --session "${SESSION}" close >/dev/null 2>&1 || true
}
trap cleanup EXIT

command -v npx >/dev/null 2>&1 || {
  echo "npx is required for the Playwright CLI regression" >&2
  exit 2
}

"${PYTHON_BIN}" "${SCRIPT_DIR}/replay_viewer_serve.py" \
  --host 127.0.0.1 --port "${PORT}" --root "${VIEWER_DIR}" \
  >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 50); do
  if curl -fsS "http://127.0.0.1:${PORT}/index.html" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
curl -fsS "http://127.0.0.1:${PORT}/index.html" >/dev/null

"${PWCLI}" --session "${SESSION}" open \
  "http://127.0.0.1:${PORT}/index.html" --browser firefox >/dev/null

for WIDTH in 344 528; do
  "${PWCLI}" --session "${SESSION}" eval \
    "document.querySelector('#viewer-sidebar').style.width = '${WIDTH}px'" >/dev/null
  RESULT=$("${PWCLI}" --session "${SESSION}" eval '(() => {
    const panel = document.querySelector("#viewer-sidebar");
    const timeline = document.querySelector("#risk-timeline");
    const first = timeline.querySelector(".risk-tick");
    const mean = first.querySelector(".risk-mean");
    const maximum = first.querySelector(".risk-max");
    const tickWidth = parseFloat(getComputedStyle(first).width);
    const barWidth = parseFloat(getComputedStyle(mean).width);
    const colors = [getComputedStyle(mean).backgroundColor,
      getComputedStyle(maximum).backgroundColor];
    const ok = panel.offsetWidth === Number(panel.style.width.replace("px", "")) &&
      timeline.children.length === 145 && timeline.scrollWidth > timeline.clientWidth &&
      tickWidth >= 8 && barWidth >= 3 && getComputedStyle(timeline).overflowX === "auto" &&
      colors[0] === "rgb(85, 200, 120)" && colors[1] === "rgb(242, 193, 78)";
    return {ok, panelWidth: panel.offsetWidth, clientWidth: timeline.clientWidth,
      scrollWidth: timeline.scrollWidth, tickWidth, barWidth,
      tickCount: timeline.children.length, overflowX: getComputedStyle(timeline).overflowX,
      colors};
  })()')
  echo "sidebar=${WIDTH} ${RESULT}"
  grep -q '"ok": true' <<<"${RESULT}"
done

echo "browser layout regression: PASS (344px, 528px)"

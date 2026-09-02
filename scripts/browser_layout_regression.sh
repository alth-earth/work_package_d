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

# Chrome refuses its kernel sandbox when the regression is executed as root
# in the CI/container workspace.  Playwright's own browser isolation remains;
# this only selects its documented no-sandbox launch mode for that case.
if [[ "$(id -u)" -eq 0 ]]; then
  export PLAYWRIGHT_MCP_SANDBOX="${PLAYWRIGHT_MCP_SANDBOX:-false}"
fi

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
  "http://127.0.0.1:${PORT}/index.html" --browser chrome >/dev/null

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

"${PWCLI}" --session "${SESSION}" eval \
  "(() => { const control = document.querySelector('#view-mode'); control.value = 'research'; control.dispatchEvent(new Event('change', {bubbles: true})); return control.value; })()" >/dev/null
for WIDTH in 344 528; do
  "${PWCLI}" --session "${SESSION}" eval \
    "document.querySelector('#viewer-sidebar').style.width = '${WIDTH}px'" >/dev/null
  RESULT=$(${PWCLI} --session "${SESSION}" eval '(() => {
    const panel = document.querySelector("#viewer-sidebar");
    const cards = [...document.querySelectorAll(".route-card")];
    const candidateList = document.querySelector("#route-candidates");
    const panelRect = panel.getBoundingClientRect();
    const overflow = cards.some((card) => {
      const rect = card.getBoundingClientRect();
      return rect.left < panelRect.left || rect.right > panelRect.right + 0.5;
    });
    const values = [...document.querySelectorAll(".route-card-metrics dd")];
    const valuesVisible = values.every((value) => {
      const rect = value.getBoundingClientRect();
      return rect.right <= panelRect.right + 0.5 && rect.left >= panelRect.left - 0.5;
    });
    return {ok: cards.length === 3 && !overflow && valuesVisible &&
      candidateList.scrollWidth <= candidateList.clientWidth + 1,
      cardCount: cards.length, panelWidth: panel.offsetWidth,
      candidateScrollWidth: candidateList.scrollWidth,
      candidateClientWidth: candidateList.clientWidth, overflow, valuesVisible};
  })()')
  echo "route-cards sidebar=${WIDTH} ${RESULT}"
  grep -q '"ok": true' <<<"${RESULT}"
done

RUNTIME_RESULT=$(${PWCLI} --session "${SESSION}" eval '(() => {
  const api = window.__ARCTIC_VIEWER__;
  const candidates = api.runtimeRouteCandidates();
  const before = api.runtimeRouteSelection();
  const objectives = ["fastest", "low_risk", "recommended"];
  const objectiveRuns = [];
  for (const objective of objectives) {
    api.resetRuntimeRouteSelection();
    const candidate = candidates.find((item) =>
      item.layer === "full_voyage" && item.objective === objective
    );
    const selected = Boolean(candidate) && api.setRuntimeRouteCandidate(candidate.candidate_id);
    document.querySelector("#play").click();
    const locked = api.runtimeRouteSelection();
    api.setSimulationMs(18 * 60 * 60 * 1000);
    const motion = api.routeMotion();
    objectiveRuns.push({candidate, selected, locked, motion});
    api.resetRuntimeRouteSelection();
  }
  api.resetRuntimeRouteSelection();
  const fastestCandidate = candidates.find((item) =>
    item.layer === "full_voyage" && item.objective === "fastest"
  );
  const selected = Boolean(fastestCandidate) &&
    api.setRuntimeRouteCandidate(fastestCandidate.candidate_id);
  const chosen = api.runtimeRouteSelection();
  document.querySelector("#play").click();
  const locked = api.runtimeRouteSelection();
  const blocked = api.setRuntimeRouteCandidate(before.runtime_selected_candidate_id);
  const lockedMotion = api.routeMotion();
  api.setSimulationMs(10 * 60 * 60 * 1000);
  const afterReplan = api.routeDecision();
  const afterReplanMotion = api.routeMotion();
  document.querySelector("#reset-route-selection").click();
  const reset = api.runtimeRouteSelection();
  const objectiveIds = objectiveRuns.map((item) => item.candidate?.candidate_id);
  const objectiveEtas = objectiveRuns.map((item) => item.candidate?.arrival_eta);
  const objectivePositions = objectiveRuns.map((item) => {
    const point = item.motion?.curved_position;
    return point ? `${point.lon.toFixed(6)}|${point.lat.toFixed(6)}` : null;
  });
  const objectiveMotionPlans = objectiveRuns.map((item) =>
    item.motion?.formal_motion_inspection?.record?.plan_id
  );
  const objectiveDisplayCounts = objectiveRuns.map((item) => item.motion?.display_point_count);
  return {ok: objectiveRuns.length === 3 && objectiveRuns.every((item) =>
      item.candidate && item.selected && item.locked.runtime_route_locked === true &&
      item.locked.runtime_selected_candidate_id === item.candidate.candidate_id &&
      item.motion.motion_source === "formal_route_motion") &&
    new Set(objectiveIds).size === 3 && new Set(objectiveEtas).size === 3 &&
    new Set(objectiveMotionPlans).size === 3 && new Set(objectiveDisplayCounts).size === 3 &&
    objectivePositions.every(Boolean) && Boolean(fastestCandidate) && selected &&
    chosen.runtime_route_locked === false &&
    chosen.runtime_selected_candidate_id === fastestCandidate.candidate_id &&
    locked.runtime_route_locked === true &&
    locked.runtime_selected_candidate_id === fastestCandidate.candidate_id &&
    blocked === false && lockedMotion.motion_source === "formal_route_motion" &&
    lockedMotion.display_point_count > lockedMotion.raw_point_count &&
    afterReplan.active_revision >= 2 &&
    afterReplan.runtime_route.runtime_selected_candidate_id === fastestCandidate.candidate_id &&
    afterReplan.runtime_route.runtime_route_locked === true &&
    afterReplanMotion.motion_source === "formal_route_motion" &&
    reset.runtime_route_locked === false &&
    reset.runtime_selected_candidate_id === before.runtime_selected_candidate_id,
    objectiveRuns, before, chosen, selected, locked, blocked, lockedMotion, afterReplan,
    afterReplanMotion, reset};
})()')
echo "runtime-route ${RUNTIME_RESULT}"
grep -q '"ok": true' <<<"${RUNTIME_RESULT}"

echo "browser layout regression: PASS (344px, 528px)"

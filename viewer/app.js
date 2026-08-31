/* Navigation decision simulation Viewer. Rendering consumes only presentation artifacts. */
(() => {
  "use strict";

  const canvas = document.getElementById("map");
  const ctx = canvas.getContext("2d");
  const miniMapCanvas = document.getElementById("mini-map");
  const miniCtx = miniMapCanvas?.getContext("2d") || null;
  const playBtn = document.getElementById("play");
  const scrub = document.getElementById("scrub");
  const speedSel = document.getElementById("speed");
  const clockEl = document.getElementById("clock");
  const rangeLabel = document.getElementById("range-label");
  const progressAxisLabelEl = document.getElementById("progress-axis-label");
  const voyageProgressValueEl = document.getElementById("voyage-progress-value");
  const debugEl = document.getElementById("debug");
  const debugPanel = document.getElementById("debug-panel");
  const toggleDebugBtn = document.getElementById("toggle-debug");
  const viewModeSel = document.getElementById("view-mode");
  const riskStatusEl = document.getElementById("risk-status");
  const riskHorizonSel = document.getElementById("risk-horizon");
  const riskHorizonStatusEl = document.getElementById("risk-horizon-status");
  const riskProfileStatusEl = document.getElementById("risk-profile-status");
  const riskTimelineEl = document.getElementById("risk-timeline");
  const riskProfileWindowEl = document.getElementById("risk-profile-window");
  const riskSummaryStatusEl = document.getElementById("risk-summary-status");
  const riskSummaryMetricsEl = document.getElementById("risk-summary-metrics");
  const riskSummaryHazardsEl = document.getElementById("risk-summary-hazards");
  const riskSummaryNoteEl = document.getElementById("risk-summary-note");
  const riskExplanationStatusEl = document.getElementById("risk-explanation-status");
  const riskExplanationCellEl = document.getElementById("risk-explanation-cell");
  const riskExplanationMetricsEl = document.getElementById("risk-explanation-metrics");
  const riskExplanationContributorsEl = document.getElementById("risk-explanation-contributors");
  const riskExplanationContributorListEl = document.getElementById(
    "risk-explanation-contributor-list"
  );
  const riskExplanationDetailsEl = document.getElementById("risk-explanation-details");
  const eventTimelineEl = document.getElementById("event-timeline");
  const routeStatusEl = document.getElementById("route-status");
  const routeDecisionStatusEl = document.getElementById("route-decision-status");
  const routeDecisionMetricsEl = document.getElementById("route-decision-metrics");
  const routeDecisionTraceEl = document.getElementById("route-decision-trace");
  const routeFallbackNoteEl = document.getElementById("route-fallback-note");
  const researchPanel = document.getElementById("research-panel");
  const researchStatusEl = document.getElementById("research-status");
  const currentStrategyEl = document.getElementById("current-strategy");
  const experimentMetadataEl = document.getElementById("experiment-metadata");
  const routeLayerSel = document.getElementById("route-layer");
  const routeCandidateNoteEl = document.getElementById("route-candidate-note");
  const routeCandidatesEl = document.getElementById("route-candidates");
  const routeHighlightNoteEl = document.getElementById("route-highlight-note");
  const layerRisk = document.getElementById("layer-risk");
  const layerHard = document.getElementById("layer-hard");
  const layerRoutes = document.getElementById("layer-routes");
  const layerRoutePolyline = document.getElementById("layer-route-polyline");
  const routeSmoothingResearchEl = document.getElementById("route-smoothing-research");
  const routeSmoothingResearchStatusEl = document.getElementById(
    "route-smoothing-research-status"
  );
  const formalMotionStatusEl = document.getElementById("formal-motion-status");
  const layerTrack = document.getElementById("layer-track");
  const layerNavigation = document.getElementById("layer-navigation");
  const gateBadges = document.querySelector(".badges");
  const modeBadge = document.getElementById("mode-badge");
  const pipelineScenarioEl = document.getElementById("pipeline-scenario");
  const pipelineIdentityEl = document.getElementById("pipeline-identity");
  const pipelineAEl = document.getElementById("pipeline-a");
  const pipelineBEl = document.getElementById("pipeline-b");
  const pipelineCEl = document.getElementById("pipeline-c");
  const layoutEl = document.querySelector(".layout");
  const sidebarEl = document.getElementById("viewer-sidebar");
  const sidebarToggleEl = document.getElementById("sidebar-toggle");
  const mapwrapEl = document.querySelector(".mapwrap");
  const mapModeMainBtn = document.getElementById("map-mode-main");
  const mapModeFollowBtn = document.getElementById("map-mode-follow");
  const mapModeStatusEl = document.getElementById("map-mode-status");
  const mapCompassEl = document.getElementById("map-compass");
  const compassNeedleEl = document.getElementById("compass-needle");
  const compassHeadingEl = document.getElementById("compass-heading");
  const compassLabelEl = document.getElementById("compass-label");
  const mapVesselPositionEl = document.getElementById("map-vessel-position");
  const mapVesselHeadingEl = document.getElementById("map-vessel-heading");
  const mapVesselSpeedEl = document.getElementById("map-vessel-speed");
  const zoomLevelEl = document.getElementById("zoom-level");
  const zoomInBtn = document.getElementById("zoom-in");
  const zoomOutBtn = document.getElementById("zoom-out");
  const resetMapBtn = document.getElementById("reset-map");
  const miniMapPanelEl = document.getElementById("mini-map-panel");
  const miniMapFollowStatusEl = document.getElementById("mini-map-follow-status");

  let bundle = null;
  let basemap = null;
  let image = null;
  let startMs = 0;
  let totalMs = 0;
  let simMs = 0;
  let playing = false;
  let lastTs = null;
  let scale = 60;
  let selectedHorizon = "current";
  let viewMode = "presentation";
  let previousNonEngineeringMode = "presentation";
  let presentationMode = true;
  let selectedRouteLayer = "full_voyage";
  let highlightedCandidateId = null;
  let candidateInspection = null;
  let combinedIdentityInspection = null;
  let riskExplanationInspection = null;
  let riskExplanationRevision = 0;
  let selectedRiskCell = null;
  let mapMode = "main";
  let mapZoom = 1;
  let mapPanX = 0;
  let mapPanY = 0;
  let mapDrag = null;
  let mapWasDragged = false;
  let voyageProgress = null;
  let routeMotionCache = new WeakMap();
  let formalRouteMotionCache = new WeakMap();
  let researchRouteMotionCache = new WeakMap();
  let researchRouteSmoothingEnabled = false;
  let lastRiskSummaryKey = null;
  let lastRouteDecisionKey = null;
  let lastResearchPanelKey = null;
  let lastRiskExplanationKey = null;
  const SINGLE_ROUTE_FALLBACK = "SINGLE_ROUTE_FALLBACK";
  const EXISTING_AUTHORITATIVE_REPLAY_ACTIVE = "Existing authoritative replay remains active";
  const DISPLAY_ONLY_COMPARISON_SELECTION = "display-only comparison selection";
  const layers = {
    risk: true,
    hard: true,
    routes: true,
    routePolyline: false,
    track: true,
    navigation: true,
  };
  const TRAIL_WINDOW_MS = 2 * 60 * 60 * 1000;
  const PENDING_FADE_MS = 30 * 60 * 1000;
  const ADOPTION_PULSE_MS = 60 * 60 * 1000;
  const MIN_MAP_ZOOM = 0.75;
  const MAX_MAP_ZOOM = 4.5;
  const FOLLOW_MAP_ZOOM = 2.15;
  const ROUTE_CURVE_COLOR = "#49a9ed";
  const ROUTE_POLYLINE_COLOR = "rgba(245, 248, 251, 0.78)";
  const CURVE_HEADING_LOOKAHEAD_MS = 60 * 1000;
  const MAX_CURVE_MOTION_GAP_KM = 25;

  const RISK_COLORS = {
    1: "#55c878",
    2: "#65b8df",
    3: "#f2c14e",
    4: "#ef8b3a",
    5: "#e35d6a",
  };
  const PRESENTATION_RISK_COLORS = {
    1: "#7bd6a5",
    2: "#83c7df",
    3: "#f0cc6a",
    4: "#efa26e",
    5: "#e77d88",
  };
  const HARD_COLORS = {
    LAND: "#304858",
    DATA_UNAVAILABLE: "#8a63d2",
    OTHER: "#b54f70",
  };
  const candidateTools = window.ArcticRouteCandidates;
  if (!candidateTools) throw new Error("research candidate validator is not loaded");
  const riskExplanationTools = window.ArcticRiskExplanation;
  if (!riskExplanationTools) throw new Error("risk explanation validator is not loaded");
  const routeSmoothingTools = window.ArcticRouteSmoothing;
  if (!routeSmoothingTools) throw new Error("route smoothing renderer is not loaded");
  const researchMotionTools = window.ArcticRouteResearchMotion;
  if (!researchMotionTools) throw new Error("research route motion reader is not loaded");
  const formalMotionTools = window.ArcticRouteMotion;
  if (!formalMotionTools) throw new Error("formal route motion reader is not loaded");
  const { ROUTE_LAYERS } = candidateTools;
  const CANDIDATE_STYLES = {
    fastest: { color: "#f0b35b", dash: [9, 5], width: 2.4 },
    low_risk: { color: "#62d6a7", dash: [3, 5], width: 2.6 },
    recommended: { color: ROUTE_CURVE_COLOR, dash: [], width: 3.1 },
  };

  function renderPipelineOverview(value) {
    const combined = value?.combined_presentation || {};
    const research = value?.research_validation || {};
    const riskSource = value?.risk?.source || {};
    const candidates = value?.route_candidates?.candidates || [];
    const scenario = combined.scenario_label || research.scenario_label || value?.replay?.scenario_id;
    const identity = combined.assembly_id || value?.replay?.manifest_semantic_digest;
    pipelineScenarioEl.textContent = scenario || "场景未发布";
    pipelineIdentityEl.textContent = identity
      ? `${combined.status === "PUBLISHED" ? "已发布" : combined.status || "已发布"} · ${identity.slice(0, 18)}…`
      : "已发布制品身份不可用";
    pipelineAEl.textContent = combined.dataset_bundle_id || research.dataset_bundle_id
      ? "就绪"
      : "--";
    pipelineBEl.textContent = research.risk_frame_count || riskSource.risk_window_id
      ? `${research.risk_frame_count || "?"} 帧`
      : "--";
    pipelineCEl.textContent = candidates.length
      ? `${candidates.length} 条路线`
      : "后备路线";
  }

  function inspectCombinedIdentity(value, routeInspection) {
    const combined = value?.combined_presentation;
    if (!combined) {
      return Object.freeze({ valid: true, reason: null, mode: "legacy_bundle" });
    }
    const replay = value?.replay || {};
    const riskSource = value?.risk?.source || {};
    const research = value?.research_validation || {};
    const candidatePackage = value?.route_candidates || {};
    const fail = (reason) => Object.freeze({ valid: false, reason, mode: "combined" });
    if (combined.schema_version !== "presentation.winter-combined-viewer.v1" ||
        combined.status !== "PUBLISHED") {
      return fail("combined presentation identity is absent or unsupported");
    }
    if (!routeInspection?.valid) return fail(routeInspection?.reason || "route candidates invalid");
    if (replay.identity_kind !== "combined_presentation_assembly" ||
        replay.scenario_id !== riskSource.scenario_id) {
      return fail("simulation and RiskFrame scenario identities differ");
    }
    if (combined.run_context_id !== riskSource.run_id ||
        combined.run_context_id !== candidatePackage.provenance?.source_run_id ||
        combined.run_context_id !== research.run_context_id) {
      return fail("RunContext identity differs across presentation sources");
    }
    if (combined.dataset_bundle_id !== riskSource.dataset_bundle_id ||
        combined.dataset_bundle_id !== research.dataset_bundle_id) {
      return fail("DatasetBundle identity differs across presentation sources");
    }
    if (combined.risk_window_id !== riskSource.risk_window_id ||
        combined.risk_window_id !== research.risk_window_id) {
      return fail("RiskWindow identity differs across presentation sources");
    }
    if (combined.candidate_set_id !== candidatePackage.candidate_set_id ||
        combined.selected_candidate_id !== candidatePackage.selected_candidate_id) {
      return fail("route candidate identity differs from combined presentation identity");
    }
    return Object.freeze({ valid: true, reason: null, mode: "combined" });
  }

  function isoToMs(value) {
    return new Date(value).getTime();
  }

  function formatClock(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(totalSeconds % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  function formatAbsolute(ms) {
    return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";
  }

  function formatHorizonSeconds(seconds) {
    if (!Number.isFinite(seconds)) return "不可用";
    const sign = seconds >= 0 ? "+" : "-";
    const absolute = Math.abs(Math.round(seconds));
    const hours = Math.floor(absolute / 3600);
    const minutes = Math.floor((absolute % 3600) / 60);
    return `${sign}${hours}h${String(minutes).padStart(2, "0")}m`;
  }

  function horizonLabel(key) {
    return key === "current" ? "当前" : key;
  }

  function selectionMethodLabel(value) {
    return {
      latest_valid_time_at_or_before_simulation_time: "不晚于仿真时间的最新有效时次",
      floor: "向下取整到最近有效时次",
      unavailable: "不可用",
    }[value] || value;
  }

  function setDefinitionRows(element, rows) {
    if (!element) return;
    const labels = {
      "Risk Level": "风险等级",
      "Risk Score": "风险分数",
      Confidence: "置信度",
      Reason: "原因",
      Uncertainty: "不确定性",
      "Missing data": "缺失数据",
      "Explanation gaps": "解释缺口",
      "active revision": "当前版本",
      "route role": "路线角色",
      distance: "距离",
      "arrival ETA": "预计抵达",
      "average risk": "平均风险",
      "maximum risk": "最大风险",
      "grid": "网格",
      experiment: "实验",
      scenario: "场景",
      "scenario id": "场景 ID",
      run: "运行实例",
      RunContext: "运行上下文",
      DatasetBundle: "数据集包",
      RiskWindow: "风险窗口",
      RiskFrame: "风险帧",
      frames: "帧数",
      routes: "路线数",
      "candidate set": "候选集",
      assembly: "组装制品",
    };
    element.replaceChildren();
    for (const [label, value] of rows) {
      const term = document.createElement("dt");
      term.textContent = labels[label] || label;
      const detail = document.createElement("dd");
      detail.textContent = value;
      element.append(term, detail);
    }
  }

  function setSummaryItems(element, items) {
    if (!element) return;
    element.replaceChildren();
    for (const text of items) {
      const item = document.createElement("li");
      item.textContent = text;
      element.append(item);
    }
  }

  function initializePanelControls() {
    if (!sidebarEl) return;
    const sections = sidebarEl.querySelectorAll(":scope > .block");
    for (const section of sections) {
      const heading = section.querySelector(":scope > h2");
      if (!heading || heading.querySelector(".section-toggle")) continue;
      const headingLabel = heading.textContent.trim();
      const body = document.createElement("div");
      body.className = "section-body";
      while (heading.nextSibling) body.append(heading.nextSibling);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "section-toggle";
      toggle.textContent = "隐藏";
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", `隐藏${headingLabel}内容`);
      toggle.addEventListener("click", () => {
        const collapsed = body.hidden;
        body.hidden = !collapsed;
        toggle.textContent = collapsed ? "隐藏" : "展开";
        toggle.setAttribute("aria-expanded", String(collapsed));
        toggle.setAttribute("aria-label", `${collapsed ? "隐藏" : "展开"}${headingLabel}内容`);
        section.classList.toggle("is-collapsed", !collapsed);
      });
      heading.append(toggle);
      section.append(body);
    }
  }

  function initializeSidebarToggle() {
    if (!layoutEl || !sidebarEl || !sidebarToggleEl) return;
    sidebarToggleEl.addEventListener("click", () => {
      const collapsed = layoutEl.classList.toggle("sidebar-collapsed");
      sidebarToggleEl.textContent = collapsed ? "展开侧栏" : "收起侧栏";
      sidebarToggleEl.setAttribute("aria-expanded", String(!collapsed));
      sidebarToggleEl.setAttribute("aria-label", collapsed ? "展开侧栏" : "收起侧栏");
    });
  }

  function formatScore(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(3) : "未发布";
  }

  function formatDistance(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(1)} km` : "未发布";
  }

  function formatMetric(value) {
    if (value === null || value === undefined || value === "") return "未发布";
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(3) : String(value);
  }

  function formatResearchMetric(value, digits = 6, suffix = "") {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(digits)}${suffix}` : "未发布";
  }

  function riskCellSnapshot(frame, row, column) {
    if (!frame || !Number.isInteger(row) || !Number.isInteger(column)) return null;
    const rows = frame.coordinates?.latitude?.length || 0;
    const columns = frame.coordinates?.longitude?.length || 0;
    if (row < 0 || column < 0 || row >= rows || column >= columns) return null;
    const index = row * columns + column;
    return {
      row,
      column,
      latitude: frame.coordinates.latitude[row],
      longitude: frame.coordinates.longitude[column],
      risk_level: frame.risk_levels[index],
      risk_score: frame.risk_scores[index],
      confidence: frame.confidences[index],
    };
  }

  function setExplanationUnavailable(note = "Explanation unavailable") {
    riskExplanationStatusEl.textContent = `解释状态：不可用 · ${note}`;
    riskExplanationStatusEl.classList.add("unavailable");
    riskExplanationContributorsEl.hidden = true;
    setSummaryItems(riskExplanationContributorListEl, []);
    setDefinitionRows(riskExplanationDetailsEl, []);
  }

  function renderRiskExplanation(state) {
    if (!riskExplanationStatusEl) return;
    const renderKey = [
      riskExplanationRevision,
      state.risk?.risk_id || "no-frame",
      selectedRiskCell?.row ?? "no-row",
      selectedRiskCell?.column ?? "no-column",
    ].join("|");
    if (renderKey === lastRiskExplanationKey) return;
    lastRiskExplanationKey = renderKey;
    if (!selectedRiskCell || !state.risk) {
      riskExplanationCellEl.textContent =
        "点击风险网格查看已发布风险帧数值。";
      setDefinitionRows(riskExplanationMetricsEl, []);
      setExplanationUnavailable();
      return;
    }

    const snapshot = riskCellSnapshot(
      state.risk,
      selectedRiskCell.row,
      selectedRiskCell.column
    );
    if (!snapshot) {
      riskExplanationCellEl.textContent = "所选网格不在当前显示的风险帧范围内。";
      setDefinitionRows(riskExplanationMetricsEl, []);
      setExplanationUnavailable();
      return;
    }
    riskExplanationCellEl.textContent =
      `网格 ${snapshot.row},${snapshot.column} · ` +
      `${formatCoordinate(snapshot.latitude, "latitude", 4)}, ` +
      `${formatCoordinate(snapshot.longitude, "longitude", 4)}`;
    setDefinitionRows(riskExplanationMetricsEl, [
      ["Risk Level", snapshot.risk_level === null || snapshot.risk_level === undefined
        ? "not published"
        : String(snapshot.risk_level)],
      ["Risk Score", formatScore(snapshot.risk_score)],
      ["Confidence", formatScore(snapshot.confidence)],
    ]);

    if (!riskExplanationInspection?.valid) {
      setExplanationUnavailable();
      return;
    }
    const key = riskExplanationTools.cellKey(
      state.risk.risk_id,
      snapshot.row,
      snapshot.column
    );
    const explanation = riskExplanationInspection.cells[key];
    if (!explanation || explanation.explanation_status === "UNAVAILABLE") {
      setExplanationUnavailable();
      return;
    }

    riskExplanationStatusEl.textContent =
      `Explanation Status: ${explanation.explanation_status}`;
    riskExplanationStatusEl.classList.remove("unavailable");
    riskExplanationContributorListEl.replaceChildren();
    const producerMainIds = new Set(explanation.reason.main_contributor_ids);
    for (const contributor of explanation.contributors) {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = contributor.display_name;
      if (producerMainIds.has(contributor.contributor_id)) {
        label.classList.add("producer-main");
        label.title = "Producer-designated main contributor";
      }
      const value = document.createElement("span");
      value.className = "contributor-value";
      value.textContent = `contribution ${formatMetric(contributor.contribution)}`;
      item.append(label, value);
      riskExplanationContributorListEl.append(item);
    }
    riskExplanationContributorsEl.hidden = explanation.contributors.length === 0;

    const details = [
      ["Reason", `${explanation.reason.text} · ${explanation.reason.code}`],
      ["Uncertainty", explanation.uncertainty.status],
    ];
    if (explanation.uncertainty.missing_data.length) {
      details.push([
        "Missing data",
        explanation.uncertainty.missing_data.map(
          (item) => `${item.data_type}: ${item.cause}${item.detail ? ` (${item.detail})` : ""}`
        ).join("; "),
      ]);
    }
    if (explanation.uncertainty.explanation_gaps.length) {
      details.push(["Explanation gaps", explanation.uncertainty.explanation_gaps.join(", ")]);
    }
    setDefinitionRows(riskExplanationDetailsEl, details);
  }

  function objectiveLabel(objective) {
    return {
      fastest: "最快路线",
      low_risk: "低风险路线",
      recommended: "推荐路线",
    }[objective] || objective;
  }

  function routeCandidates() {
    return candidateInspection?.valid ? candidateInspection.candidates : [];
  }

  function candidatesForLayer(layer = selectedRouteLayer) {
    return routeCandidates().filter((candidate) => candidate.layer === layer);
  }

  function defaultCandidateForLayer(layer) {
    const candidates = candidatesForLayer(layer);
    const canonicalId = bundle?.route_candidates?.selected_candidate_id;
    return candidates.find((candidate) => candidate.candidate_id === canonicalId) ||
      candidates.find((candidate) => candidate.objective === "recommended") ||
      candidates[0] || null;
  }

  function highlightedCandidate() {
    return candidatesForLayer().find(
      (candidate) => candidate.candidate_id === highlightedCandidateId
    ) || defaultCandidateForLayer(selectedRouteLayer);
  }

  function canonicalSelectedCandidate() {
    const canonicalId = bundle?.route_candidates?.selected_candidate_id;
    return routeCandidates().find((candidate) => candidate.candidate_id === canonicalId) || null;
  }

  function candidateGeometryPoints(candidate) {
    return (candidate?.geometry?.coordinates || []).map(([lon, lat]) => ({ lon, lat }));
  }

  function routeArrivalEta(route) {
    if (route?.arrival_eta) return route.arrival_eta;
    const waypoints = route?.waypoints || [];
    return waypoints.length ? waypoints[waypoints.length - 1].eta || "not published" : "not published";
  }

  function routeMetric(route, key) {
    return route?.metrics?.[key] ?? route?.[key];
  }

  function riskFrames() {
    return (bundle.risk && bundle.risk.frames) || [];
  }

  function forecastWindowText() {
    const frames = riskFrames();
    if (!frames.length) return "none";
    return `${frames[0].valid_time} – ${frames[frames.length - 1].valid_time}`;
  }

  function riskHourLabel(value) {
    const iso = new Date(value).toISOString();
    return `${iso.slice(5, 10)} ${iso.slice(11, 13)}时`;
  }

  function buildRiskTimeline() {
    if (!riskTimelineEl) return;
    riskTimelineEl.replaceChildren();
    const frames = riskFrames();
    const summaries = frames
      .map((frame) => frame.summary)
      .filter((summary) => summary && Number.isFinite(summary.risk_score_max));
    const maxScore = Math.max(
      0.01,
      ...summaries.map((summary) => Number(summary.risk_score_max)),
    );
    for (const [index, frame] of frames.entries()) {
      const tick = document.createElement("div");
      tick.className = "risk-tick";
      tick.dataset.validTime = frame.valid_time;
      tick.title = frame.valid_time;
      const summary = frame.summary;
      const mean = document.createElement("span");
      mean.className = "risk-bar risk-mean";
      const maximum = document.createElement("span");
      maximum.className = "risk-bar risk-max";
      const meanScore = Number(summary?.risk_score_mean);
      const maxFrameScore = Number(summary?.risk_score_max);
      const meanHeight = Number.isFinite(meanScore) ? meanScore / maxScore * 100 : 0;
      const maxHeight = Number.isFinite(maxFrameScore) ? maxFrameScore / maxScore * 100 : 0;
      mean.style.height = `${Math.max(3, Math.min(100, meanHeight))}%`;
      maximum.style.height = `${Math.max(3, Math.min(100, maxHeight))}%`;
      const label = document.createElement("span");
      label.className = "risk-tick-label";
      label.textContent = index % 24 === 0 || index === frames.length - 1
        ? riskHourLabel(frame.valid_time)
        : "";
      tick.append(mean, maximum, label);
      riskTimelineEl.append(tick);
    }
    if (riskProfileWindowEl) {
      const grid = bundle.risk?.grid;
      const gridText = grid ? ` · grid ${grid.rows}×${grid.cols}` : "";
      riskProfileWindowEl.textContent =
        `正式预测窗口：${forecastWindowText()} · ${frames.length} 个小时帧${gridText}`;
    }
  }

  function buildEventTimeline() {
    if (!eventTimelineEl) return;
    eventTimelineEl.replaceChildren();
    const events = bundle.events || [];
    const milestones = [];
    const initial = events.find((event) => event.type === "PLAN_COMPUTED");
    milestones.push({
      event: initial,
      time: initial?.t || bundle.replay.start,
      label: "出发 · 初始路线",
    });
    const riskUpdate = events.find((event) => event.type === "RISK_CONTENT_UPDATED");
    if (riskUpdate) {
      milestones.push({
        event: riskUpdate,
        time: riskUpdate.t,
        label: "风险评估已更新",
      });
    }
    // Keep every real route revision visible in a long replay. ROUTE_CHANGED
    // is emitted beside REPLAN_ADOPTED and would duplicate the same adoption.
    for (const event of events) {
      if (event.type === "REPLAN_DECIDED") {
        milestones.push({
          event,
          time: event.t,
          label: `R${event.rev} 待采用 · 当前路线仍为权威路线`,
        });
      } else if (event.type === "REPLAN_ADOPTED") {
        milestones.push({
          event,
          time: event.t,
          label: `R${event.rev} 已采用 · 权威路线已更新`,
        });
      }
    }
    for (const milestone of milestones) {
      const time = milestone.time;
      if (!time) continue;
      const item = document.createElement("li");
      item.dataset.eventTime = time;
      item.dataset.eventType = milestone.event?.type || "INITIAL";
      item.dataset.eventRevision = milestone.event?.rev || "1";
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "event-jump";
      jump.dataset.eventTime = time;
      jump.setAttribute(
        "aria-label",
        `跳转到${milestone.label}，仿真时间 ${formatAbsolute(isoToMs(time))}`,
      );
      const label = document.createElement("span");
      label.textContent = milestone.label;
      const clock = document.createElement("span");
      clock.className = "event-time";
      clock.textContent = formatAbsolute(isoToMs(time));
      jump.append(label, clock);
      item.append(jump);
      eventTimelineEl.append(item);
    }
  }

  function updateRiskTimeline(s) {
    if (!riskTimelineEl) return;
    const actualValidTime = s.riskSelection?.actual_valid_time;
    const frames = riskFrames();
    let currentValidTime = null;
    for (const frame of frames) {
      if (isoToMs(frame.valid_time) <= s.time) currentValidTime = frame.valid_time;
      else break;
    }
    for (const tick of riskTimelineEl.children) {
      const validTime = tick.dataset.validTime;
      tick.classList.toggle("is-current", validTime === currentValidTime);
      tick.classList.toggle("is-selected", validTime === actualValidTime);
    }
    const summary = s.risk?.summary;
    if (!riskProfileStatusEl) return;
    if (!summary || !s.riskSelection || s.riskSelection.availability !== "AVAILABLE") {
      riskProfileStatusEl.textContent =
        `${horizonLabel(selectedHorizon)} · 当前仿真时间暂无风险预测`;
      riskProfileStatusEl.classList.add("unavailable");
      return;
    }
    riskProfileStatusEl.classList.remove("unavailable");
    const hardCounts = summary.hard_reason_counts || {};
    const navigable = hardCounts.NONE || 0;
    const levelOne = summary.risk_level_counts?.["1"] || 0;
    riskProfileStatusEl.textContent =
      `${horizonLabel(selectedHorizon)} · 平均 ${Number(summary.risk_score_mean).toFixed(3)} ` +
      `· 最大 ${Number(summary.risk_score_max).toFixed(3)} · L1 水域 ${levelOne}/${navigable}`;
  }

  function updateRiskSummary(s) {
    if (!riskSummaryStatusEl) return;
    const selection = s.riskSelection;
    const summary = s.risk?.summary;
    const key = [
      selectedHorizon,
      selection?.availability,
      selection?.actual_valid_time,
      s.risk?.risk_id,
    ].join("|");
    if (key === lastRiskSummaryKey) return;
    lastRiskSummaryKey = key;

    if (!summary || !selection || selection.availability !== "AVAILABLE") {
      riskSummaryStatusEl.classList.add("unavailable");
      riskSummaryStatusEl.textContent =
        `${horizonLabel(selectedHorizon)} · 当前风险帧暂无摘要`;
      setDefinitionRows(riskSummaryMetricsEl, []);
      setSummaryItems(riskSummaryHazardsEl, []);
      if (riskSummaryNoteEl) {
        riskSummaryNoteEl.textContent =
          "不会使用过期风险帧；请选择可用的预测时域查看已发布摘要。";
      }
      return;
    }

    riskSummaryStatusEl.classList.remove("unavailable");
    riskSummaryStatusEl.textContent =
      `${horizonLabel(selectedHorizon)} · 正式风险帧 ${selection.actual_valid_time}`;
    const forecast = bundle.risk?.forecast_summary || {};
    const trend = forecast.trend || "未发布";
    setDefinitionRows(riskSummaryMetricsEl, [
      ["平均分数", formatScore(summary.risk_score_mean)],
      ["最大分数", formatScore(summary.risk_score_max)],
      ["预测趋势", trend],
      ["已发布网格", String(summary.total_cells ?? "未发布")],
    ]);

    const hardCounts = summary.hard_reason_counts || {};
    const landCount = Number.isFinite(Number(summary.land_count))
      ? Number(summary.land_count)
      : Number(hardCounts.LAND || 0);
    const unavailableCount = Number.isFinite(Number(summary.data_unavailable_count))
      ? Number(summary.data_unavailable_count)
      : Number(hardCounts.DATA_UNAVAILABLE || 0);
    const hardCellCount = Number.isFinite(Number(summary.hard_cell_count))
      ? Number(summary.hard_cell_count)
      : Object.entries(hardCounts)
        .filter(([reason]) => reason !== "NONE")
        .reduce((total, [, count]) => total + Number(count || 0), 0);
    setSummaryItems(riskSummaryHazardsEl, [
      `LAND 网格 · ${landCount}`,
      `数据不可用网格 · ${unavailableCount}`,
      `硬约束网格总数 · ${hardCellCount}`,
    ]);
    if (riskSummaryNoteEl) {
      riskSummaryNoteEl.textContent =
        "已发布 NONE 水域中的等级 1 表示低风险评估；硬约束原因独立展示并采用安全失败。";
    }
  }

  function updateEventTimeline(s) {
    if (!eventTimelineEl) return;
    const items = [...eventTimelineEl.children];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const eventMs = isoToMs(item.dataset.eventTime);
      const nextMs = index + 1 < items.length
        ? isoToMs(items[index + 1].dataset.eventTime)
        : Infinity;
      const isPast = s.time >= eventMs;
      const isCurrent = isPast && s.time < nextMs;
      item.classList.toggle("is-past", isPast);
      item.classList.toggle("is-current", isCurrent);
      const jump = item.querySelector(".event-jump");
      if (jump) {
        if (isCurrent) jump.setAttribute("aria-current", "step");
        else jump.removeAttribute("aria-current");
      }
    }
  }

  function project(lon, lat) {
    const b = basemap.bbox;
    const x = ((lon - b.min_lon) / (b.max_lon - b.min_lon)) * canvas.width;
    const y = ((b.max_lat - lat) / (b.max_lat - b.min_lat)) * canvas.height;
    return { x, y };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function normalizeDegrees(value) {
    return ((Number(value) % 360) + 360) % 360;
  }

  function cardinalDirection(value) {
    const directions = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
    return directions[Math.round(normalizeDegrees(value) / 45) % directions.length];
  }

  function mapWorldCenter(state) {
    if (mapMode === "follow" && state && basemap?.bbox) {
      return project(state.lon, state.lat);
    }
    return { x: canvas.width / 2, y: canvas.height / 2 };
  }

  function applyMapViewTransform(state, heading) {
    const centre = mapWorldCenter(state);
    ctx.translate(canvas.width / 2 + mapPanX, canvas.height / 2 + mapPanY);
    if (mapMode === "follow") {
      ctx.rotate(-normalizeDegrees(heading) * Math.PI / 180);
    }
    ctx.scale(mapZoom, mapZoom);
    ctx.translate(-centre.x, -centre.y);
  }

  function canvasDisplayRect() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !canvas.width || !canvas.height) return null;
    const canvasRatio = canvas.width / canvas.height;
    const boxRatio = rect.width / rect.height;
    const width = boxRatio > canvasRatio ? rect.height * canvasRatio : rect.width;
    const height = boxRatio > canvasRatio ? rect.height : rect.width / canvasRatio;
    return {
      left: rect.left + (rect.width - width) / 2,
      top: rect.top + (rect.height - height) / 2,
      width,
      height,
    };
  }

  function screenPointToWorld(event, state, heading) {
    const rect = canvasDisplayRect();
    if (!rect) return null;
    let x = (event.clientX - rect.left) / rect.width * canvas.width;
    let y = (event.clientY - rect.top) / rect.height * canvas.height;
    x -= canvas.width / 2 + mapPanX;
    y -= canvas.height / 2 + mapPanY;
    if (mapMode === "follow") {
      const angle = normalizeDegrees(heading) * Math.PI / 180;
      const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
      const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
      x = rotatedX;
      y = rotatedY;
    }
    const centre = mapWorldCenter(state);
    return {
      x: centre.x + x / mapZoom,
      y: centre.y + y / mapZoom,
    };
  }

  function clampMapPan() {
    if (mapMode === "follow" || mapZoom <= 1) {
      mapPanX = 0;
      mapPanY = 0;
      return;
    }
    const horizontalLimit = Math.max(0, (canvas.width * mapZoom - canvas.width) / 2);
    const verticalLimit = Math.max(0, (canvas.height * mapZoom - canvas.height) / 2);
    mapPanX = clamp(mapPanX, -horizontalLimit, horizontalLimit);
    mapPanY = clamp(mapPanY, -verticalLimit, verticalLimit);
  }

  function updateMapUi(heading = 0, state = null) {
    const normalizedHeading = normalizeDegrees(heading);
    if (mapwrapEl) mapwrapEl.dataset.mapMode = mapMode;
    if (mapCompassEl) mapCompassEl.dataset.mapMode = mapMode;
    if (mapModeMainBtn) {
      mapModeMainBtn.classList.toggle("is-active", mapMode === "main");
      mapModeMainBtn.setAttribute("aria-pressed", String(mapMode === "main"));
    }
    if (mapModeFollowBtn) {
      mapModeFollowBtn.classList.toggle("is-active", mapMode === "follow");
      mapModeFollowBtn.setAttribute("aria-pressed", String(mapMode === "follow"));
    }
    if (mapModeStatusEl) {
      mapModeStatusEl.textContent = mapMode === "follow"
        ? "小地图跟随 · 船头向上"
        : "主图模式 · 北向上";
    }
    if (zoomLevelEl) zoomLevelEl.textContent = `${Math.round(mapZoom * 100)}%`;
    if (miniMapPanelEl) miniMapPanelEl.hidden = mapMode !== "follow";
    if (miniMapFollowStatusEl) {
      miniMapFollowStatusEl.textContent = mapMode === "follow" ? "船位居中" : "总览";
    }
    if (canvas) {
      canvas.setAttribute(
        "aria-label",
        mapMode === "follow"
          ? "北极航线跟随地图，船头朝上，可缩放和拖拽"
          : "北极航线主图，可缩放和拖拽平移"
      );
    }
    if (compassNeedleEl) {
      compassNeedleEl.style.transform = mapMode === "follow"
        ? `rotate(${-normalizedHeading}deg)`
        : "rotate(0deg)";
    }
    if (compassHeadingEl) {
      compassHeadingEl.textContent = `${Math.round(normalizedHeading)
        .toString().padStart(3, "0")}°`;
    }
    if (compassLabelEl) {
      compassLabelEl.textContent = mapMode === "follow"
        ? `${cardinalDirection(normalizedHeading)} · 船头向上`
        : `${cardinalDirection(normalizedHeading)} · 北向上`;
    }
    if (state) {
      if (mapVesselPositionEl) {
        mapVesselPositionEl.textContent =
          `${formatCoordinate(state.lat, "latitude", 2)} ${formatCoordinate(state.lon, "longitude", 2)}`;
      }
      if (mapVesselHeadingEl) {
        mapVesselHeadingEl.textContent = `${Math.round(normalizedHeading)
          .toString().padStart(3, "0")}° ${cardinalDirection(normalizedHeading)}`;
      }
      if (mapVesselSpeedEl) {
        const knots = Number(state.kn);
        mapVesselSpeedEl.textContent = Number.isFinite(knots) ? `${knots.toFixed(1)} kn` : "-- kn";
      }
    }
  }

  function resetMapView() {
    mapPanX = 0;
    mapPanY = 0;
    mapZoom = mapMode === "follow" ? FOLLOW_MAP_ZOOM : 1;
    const state = bundle ? stateAt(simMs) : null;
    const active = state ? routeFor(state.active) : null;
    updateMapUi(state ? shipHeading(state, active) : 0, state);
    if (bundle) draw();
  }

  function adjustMapZoom(factor) {
    mapZoom = clamp(mapZoom * factor, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
    clampMapPan();
    const state = bundle ? stateAt(simMs) : null;
    const active = state ? routeFor(state.active) : null;
    updateMapUi(state ? shipHeading(state, active) : 0, state);
    if (bundle) draw();
  }

  function setMapMode(nextMode) {
    if (!["main", "follow"].includes(nextMode) || nextMode === mapMode) return;
    mapMode = nextMode;
    mapPanX = 0;
    mapPanY = 0;
    mapZoom = nextMode === "follow" ? Math.max(mapZoom, FOLLOW_MAP_ZOOM) : 1;
    const state = bundle ? stateAt(simMs) : null;
    const active = state ? routeFor(state.active) : null;
    updateMapUi(state ? shipHeading(state, active) : 0, state);
    if (bundle) draw();
  }

  function preserveFollowViewForManualPan() {
    if (mapMode !== "follow" || !bundle) return;
    const state = stateAt(simMs);
    const position = project(state.lon, state.lat);
    mapMode = "main";
    mapPanX = -mapZoom * (position.x - canvas.width / 2);
    mapPanY = -mapZoom * (position.y - canvas.height / 2);
    clampMapPan();
    const active = routeFor(state.active);
    updateMapUi(shipHeading(state, active), state);
  }

  function niceStep(span, targetLines = 6) {
    const raw = Math.abs(span) / Math.max(1, targetLines);
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const normalized = raw / magnitude;
    const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return factor * magnitude;
  }

  function niceDistanceFloor(distanceKm) {
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(distanceKm));
    const normalized = distanceKm / magnitude;
    const factor = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
    return factor * magnitude;
  }

  function formatCoordinate(value, axis, precision = null) {
    const absolute = Math.abs(value);
    const digits = precision === null ? (absolute < 10 ? 1 : 0) : precision;
    const suffix = axis === "latitude"
      ? (value < 0 ? "S" : "N")
      : (value < 0 ? "W" : "E");
    return `${absolute.toFixed(digits)}°${suffix}`;
  }

  function haversineKm(lonA, latA, lonB, latB) {
    const radians = Math.PI / 180;
    const phiA = latA * radians;
    const phiB = latB * radians;
    const deltaPhi = (latB - latA) * radians;
    const deltaLambda = (lonB - lonA) * radians;
    const value = Math.sin(deltaPhi / 2) ** 2
      + Math.cos(phiA) * Math.cos(phiB) * Math.sin(deltaLambda / 2) ** 2;
    return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(value)));
  }

  // The progress axis is derived once from the published vessel timeline. It
  // changes presentation coordinates only: simulation time remains the single
  // authoritative state and vesselPointAt() remains the position contract.
  function buildVoyageProgress() {
    const timeline = bundle?.timeline || [];
    if (!timeline.length) return null;
    const timesMs = [];
    const distancesKm = [];
    let cumulativeKm = 0;
    for (let index = 0; index < timeline.length; index += 1) {
      const entry = timeline[index];
      const relativeMs = isoToMs(entry.t) - startMs;
      if (!Number.isFinite(relativeMs) || !Number.isFinite(entry.v?.lon) ||
          !Number.isFinite(entry.v?.lat)) return null;
      if (index > 0) {
        const previous = timeline[index - 1].v;
        if (relativeMs <= timesMs[index - 1]) return null;
        const segmentKm = haversineKm(
          previous.lon,
          previous.lat,
          entry.v.lon,
          entry.v.lat
        );
        // A pure distance axis cannot represent a stationary time interval
        // without collapsing simulation states. Fall back to the time axis
        // instead of silently skipping such an interval.
        if (!Number.isFinite(segmentKm) || segmentKm <= 1e-9) return null;
        cumulativeKm += segmentKm;
      }
      timesMs.push(relativeMs);
      distancesKm.push(cumulativeKm);
    }
    if (!Number.isFinite(cumulativeKm) || cumulativeKm <= 0) return null;
    return { timesMs, distancesKm, totalKm: cumulativeKm };
  }

  function voyageDistanceAt(ms) {
    if (!voyageProgress) return null;
    const index = timelineIndex(ms);
    const nextIndex = Math.min(index + 1, voyageProgress.distancesKm.length - 1);
    const startTime = voyageProgress.timesMs[index];
    const endTime = voyageProgress.timesMs[nextIndex];
    const fraction = endTime === startTime
      ? 0
      : Math.max(0, Math.min(1, (ms - startTime) / (endTime - startTime)));
    const startDistance = voyageProgress.distancesKm[index];
    const endDistance = voyageProgress.distancesKm[nextIndex];
    return startDistance + (endDistance - startDistance) * fraction;
  }

  function simulationMsAtVoyageDistance(distanceKm) {
    if (!voyageProgress) return Math.max(0, Math.min(totalMs, distanceKm));
    const target = Math.max(0, Math.min(voyageProgress.totalKm, distanceKm));
    const distances = voyageProgress.distancesKm;
    let low = 0;
    let high = distances.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (distances[mid] <= target) low = mid;
      else high = mid - 1;
    }
    const next = Math.min(low + 1, distances.length - 1);
    const span = distances[next] - distances[low];
    const fraction = span > 0 ? (target - distances[low]) / span : 0;
    return voyageProgress.timesMs[low] +
      (voyageProgress.timesMs[next] - voyageProgress.timesMs[low]) * fraction;
  }

  function setRunButtonState() {
    playBtn.textContent = playing ? "暂停" : "运行";
  }

  function updateSimulationReadout(s) {
    clockEl.textContent = formatAbsolute(s.time);
    if (!voyageProgress) {
      progressAxisLabelEl.textContent = "仿真进度";
      scrub.setAttribute("aria-label", "仿真进度");
      voyageProgressValueEl.textContent = `${formatClock(simMs)} 已运行`;
      rangeLabel.textContent = `${bundle.replay.start} → ${bundle.replay.end}`;
      return;
    }
    const distanceKm = voyageDistanceAt(simMs);
    progressAxisLabelEl.textContent = "航程进度";
    scrub.setAttribute("aria-label", "航程进度");
    const initialDistance = Number(bundle?.routes?.[0]?.distance_km);
    const plannedText = Number.isFinite(initialDistance)
      ? ` · ${initialDistance.toFixed(1)} km 初始规划`
      : "";
    voyageProgressValueEl.textContent =
      `${distanceKm.toFixed(1)} km / ${voyageProgress.totalKm.toFixed(1)} km 已仿真`;
    rangeLabel.textContent =
      `当前位置 ${formatCoordinate(s.lat, "latitude", 4)}，` +
      `${formatCoordinate(s.lon, "longitude", 4)}${plannedText}`;
  }

  function syncScrubToSimulation() {
    scrub.value = voyageProgress
      ? String(Math.round(voyageDistanceAt(simMs) * 1000))
      : String(Math.round(simMs));
  }

  function seekSimulationTo(relativeMs) {
    if (!Number.isFinite(relativeMs)) return;
    simMs = Math.max(0, Math.min(totalMs, relativeMs));
    playing = false;
    lastTs = null;
    setRunButtonState();
    syncScrubToSimulation();
    draw();
  }

  function seekSimulationToIso(value) {
    const absoluteMs = isoToMs(value);
    if (!Number.isFinite(absoluteMs)) return;
    seekSimulationTo(absoluteMs - startMs);
  }

  function drawNavigationAids() {
    if (!layers.navigation || !basemap?.bbox) return;
    const bounds = basemap.bbox;
    const lonSpan = bounds.max_lon - bounds.min_lon;
    const latSpan = bounds.max_lat - bounds.min_lat;
    if (![bounds.min_lon, bounds.max_lon, bounds.min_lat, bounds.max_lat]
      .every(Number.isFinite) || lonSpan <= 0 || latSpan <= 0) return;
    const lonStep = niceStep(lonSpan);
    const latStep = niceStep(latSpan);

    ctx.save();
    ctx.strokeStyle = "rgba(218, 237, 247, 0.25)";
    ctx.fillStyle = "rgba(229, 243, 250, 0.88)";
    ctx.lineWidth = 0.8;
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.textBaseline = "middle";
    ctx.setLineDash([4, 5]);

    const firstLon = Math.ceil(bounds.min_lon / lonStep) * lonStep;
    for (let lon = firstLon; lon < bounds.max_lon; lon += lonStep) {
      const top = project(lon, bounds.max_lat);
      ctx.beginPath();
      ctx.moveTo(top.x, 0);
      ctx.lineTo(top.x, canvas.height);
      ctx.stroke();
      if (mapMode === "main") {
        ctx.fillText(formatCoordinate(lon, "longitude"), top.x + 4, canvas.height - 10);
      }
    }

    const firstLat = Math.ceil(bounds.min_lat / latStep) * latStep;
    for (let lat = firstLat; lat < bounds.max_lat; lat += latStep) {
      const left = project(bounds.min_lon, lat);
      ctx.beginPath();
      ctx.moveTo(0, left.y);
      ctx.lineTo(canvas.width, left.y);
      ctx.stroke();
      if (mapMode === "main") {
        ctx.fillText(formatCoordinate(lat, "latitude"), 6, left.y - 8);
      }
    }
    ctx.setLineDash([]);

    // In follow mode the DOM compass and live HUD carry the orientation
    // readout; suppress rotated labels and the full-map scale marker so the
    // ship-centric view stays legible.
    if (mapMode === "follow") {
      ctx.restore();
      return;
    }

    // Scale is valid for the displayed EPSG:4326 map at its centre latitude.
    const centreLat = (bounds.min_lat + bounds.max_lat) / 2;
    const mapWidthKm = haversineKm(
      bounds.min_lon,
      centreLat,
      bounds.max_lon,
      centreLat
    );
    const maximumScalePixels = Math.min(150, canvas.width * 0.22);
    const maximumScaleKm = maximumScalePixels / canvas.width * mapWidthKm;
    const scaleKm = niceDistanceFloor(maximumScaleKm);
    const scalePixels = scaleKm / mapWidthKm * canvas.width;
    const scaleX = 20;
    const scaleY = canvas.height - 30;
    ctx.strokeStyle = "rgba(245, 251, 255, 0.95)";
    ctx.fillStyle = "rgba(245, 251, 255, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaleX, scaleY - 5);
    ctx.lineTo(scaleX, scaleY);
    ctx.lineTo(scaleX + scalePixels, scaleY);
    ctx.lineTo(scaleX + scalePixels, scaleY - 5);
    ctx.stroke();
    ctx.textBaseline = "bottom";
    ctx.fillText(
      `${scaleKm} km · ${formatCoordinate(centreLat, "latitude")}`,
      scaleX,
      scaleY - 7
    );

    // EPSG:4326 is north-up here; this is grid north, not a magnetic bearing.
    const northX = canvas.width - 30;
    const northY = 25;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "bold 13px Segoe UI, sans-serif";
    ctx.fillText("N", northX, northY - 7);
    ctx.beginPath();
    ctx.moveTo(northX, northY - 5);
    ctx.lineTo(northX - 6, northY + 9);
    ctx.lineTo(northX, northY + 5);
    ctx.lineTo(northX + 6, northY + 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function coordinateOf(point) {
    return { lon: point.lon ?? point.longitude, lat: point.lat ?? point.latitude };
  }

  // Display-only densification keeps every point on the authoritative straight
  // segment. It remains the fail-closed fallback for route smoothing; the
  // Viewer motion layer uses the accepted display curve and falls back here
  // only when the curve cannot be built safely.
  function densifyPoints(points, subdivisions = 4) {
    if (points.length < 2 || subdivisions < 2) return points;
    const result = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const start = points[i];
      const end = points[i + 1];
      const a = coordinateOf(start);
      const b = coordinateOf(end);
      for (let step = 0; step < subdivisions; step += 1) {
        const f = step / subdivisions;
        const item = { lon: a.lon + (b.lon - a.lon) * f, lat: a.lat + (b.lat - a.lat) * f };
        if (start.eta && end.eta) {
          const etaMs = isoToMs(start.eta) + (isoToMs(end.eta) - isoToMs(start.eta)) * f;
          item.eta = new Date(etaMs).toISOString();
        }
        result.push(item);
      }
    }
    result.push(points[points.length - 1]);
    return result;
  }

  // The smoother returns display coordinates only. Raw waypoints remain the
  // source for ETA, active revision, route identity, and route metrics; the
  // Viewer motion layer derives position/heading from the same curve and ETA
  // anchors without writing those coordinates back to the artifact.
  function routeDisplayPoints(points) {
    const result = routeSmoothingTools.smoothDisplayPoints(points);
    return result.applied ? result.points : densifyPoints(points);
  }

  function finiteRoutePoint(point) {
    if (!point || typeof point !== "object") return null;
    const coordinate = coordinateOf(point);
    const lon = Number(coordinate.lon);
    const lat = Number(coordinate.lat);
    return Number.isFinite(lon) && Number.isFinite(lat) &&
      lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
      ? { lon, lat }
      : null;
  }

  // Build a cached time-parameterized paint path. The authoritative ETA of
  // each waypoint remains an anchor: at a corner, that ETA is assigned to the
  // nearest point on the local curve. This makes the simulated vessel follow
  // the curve without changing route metrics or the published waypoint list.
  function buildRouteMotionPath(route) {
    if (!route || !Array.isArray(route.waypoints) || route.waypoints.length < 2) return null;
    if (routeMotionCache.has(route)) return routeMotionCache.get(route);
    const rawPoints = route.waypoints.map(finiteRoutePoint);
    const timesMs = route.waypoints.map((point) => isoToMs(point.eta) - startMs);
    if (rawPoints.some((point) => point === null) ||
        timesMs.some((value) => !Number.isFinite(value))) {
      routeMotionCache.set(route, null);
      return null;
    }
    for (let index = 1; index < timesMs.length; index += 1) {
      if (timesMs[index] <= timesMs[index - 1]) {
        routeMotionCache.set(route, null);
        return null;
      }
    }
    const smoothing = routeSmoothingTools.smoothDisplayPoints(rawPoints);
    const pathPoints = (smoothing.applied ? smoothing.points : rawPoints).map(finiteRoutePoint);
    if (pathPoints.length < 2 || pathPoints.some((point) => point === null)) {
      routeMotionCache.set(route, null);
      return null;
    }
    const pathDistancesKm = [0];
    for (let index = 1; index < pathPoints.length; index += 1) {
      const previous = pathPoints[index - 1];
      const current = pathPoints[index];
      const segmentKm = haversineKm(
        previous.lon,
        previous.lat,
        current.lon,
        current.lat,
      );
      if (!Number.isFinite(segmentKm) || segmentKm <= 1e-9) {
        routeMotionCache.set(route, null);
        return null;
      }
      pathDistancesKm.push(pathDistancesKm[index - 1] + segmentKm);
    }

    // A smoothed corner no longer contains the raw vertex. Map each raw
    // waypoint to its nearest monotonic paint-path point so its ETA remains a
    // deterministic temporal anchor.
    const anchorDistancesKm = [];
    let searchStart = 0;
    for (let rawIndex = 0; rawIndex < rawPoints.length; rawIndex += 1) {
      const lastSearchIndex = pathPoints.length - (rawPoints.length - rawIndex - 1) - 1;
      const forcedIndex = rawIndex === 0
        ? 0
        : rawIndex === rawPoints.length - 1 ? pathPoints.length - 1 : null;
      let bestIndex = forcedIndex;
      if (bestIndex === null) {
        let bestDistanceKm = Infinity;
        for (let pathIndex = searchStart; pathIndex <= lastSearchIndex; pathIndex += 1) {
          const raw = rawPoints[rawIndex];
          const display = pathPoints[pathIndex];
          const distanceKm = haversineKm(
            raw.lon,
            raw.lat,
            display.lon,
            display.lat,
          );
          if (distanceKm < bestDistanceKm) {
            bestDistanceKm = distanceKm;
            bestIndex = pathIndex;
          }
        }
      }
      if (!Number.isInteger(bestIndex) || bestIndex < searchStart ||
          bestIndex > lastSearchIndex) {
        routeMotionCache.set(route, null);
        return null;
      }
      anchorDistancesKm.push(pathDistancesKm[bestIndex]);
      searchStart = bestIndex;
    }
    for (let index = 1; index < anchorDistancesKm.length; index += 1) {
      if (anchorDistancesKm[index] <= anchorDistancesKm[index - 1]) {
        routeMotionCache.set(route, null);
        return null;
      }
    }
    const result = Object.freeze({
      points: pathPoints,
      distancesKm: pathDistancesKm,
      anchorDistancesKm,
      timesMs,
      smoothingApplied: Boolean(smoothing.applied),
      maximumDeviationM: Number(smoothing.maximum_deviation_m) || 0,
    });
    routeMotionCache.set(route, result);
    return result;
  }

  function researchRouteSmoothingSidecar() {
    return bundle?.research_validation?.route_smoothing || null;
  }

  function inspectResearchRouteSmoothing(route) {
    const sidecar = researchRouteSmoothingSidecar();
    if (!sidecar) return { valid: false, reason: "missing_sidecar" };
    if (!route) return { valid: false, reason: "no_active_route" };
    return researchMotionTools.inspect(sidecar, route);
  }

  function buildResearchRouteMotionPath(route) {
    if (!route || !researchRouteSmoothingEnabled) return null;
    if (researchRouteMotionCache.has(route)) {
      return researchRouteMotionCache.get(route);
    }
    const sidecar = researchRouteSmoothingSidecar();
    const path = researchMotionTools.buildPath(sidecar, route, startMs);
    researchRouteMotionCache.set(route, path);
    return path;
  }

  function inspectFormalRouteMotion(route) {
    if (!route) return { valid: false, reason: "no_active_route" };
    return formalMotionTools.inspect(bundle, route);
  }

  function buildFormalRouteMotionPath(route) {
    if (!route) return null;
    if (formalRouteMotionCache.has(route)) return formalRouteMotionCache.get(route);
    const path = formalMotionTools.buildPath(bundle, route, startMs);
    formalRouteMotionCache.set(route, path);
    return path;
  }

  function routeMotionPathFor(route) {
    const formal = buildFormalRouteMotionPath(route);
    if (formal) return formal;
    return researchRouteSmoothingEnabled && viewMode === "research"
      ? buildResearchRouteMotionPath(route)
      : null;
  }

  function routePaintPointsFor(route) {
    if (!route?.waypoints || route.waypoints.length < 2) return [];
    const formal = buildFormalRouteMotionPath(route);
    if (formal) return formal.points;
    if (researchRouteSmoothingEnabled && viewMode === "research") {
      const path = buildResearchRouteMotionPath(route);
      return path?.points || route.waypoints;
    }
    return route.waypoints;
  }

  function pathValueAtTime(path, relativeMs, values, circular = false) {
    if (!path || !Array.isArray(values) || values.length !== path.timesMs.length) return null;
    const target = clamp(relativeMs, path.timesMs[0], path.timesMs[path.timesMs.length - 1]);
    let low = 0;
    let high = path.timesMs.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (path.timesMs[mid] <= target) low = mid;
      else high = mid - 1;
    }
    const next = Math.min(low + 1, path.timesMs.length - 1);
    const span = path.timesMs[next] - path.timesMs[low];
    const fraction = span > 0 ? (target - path.timesMs[low]) / span : 0;
    if (!Number.isFinite(values[low]) || !Number.isFinite(values[next])) return null;
    if (!circular) return values[low] + (values[next] - values[low]) * fraction;
    const delta = (values[next] - values[low] + 540) % 360 - 180;
    return (values[low] + delta * fraction + 360) % 360;
  }

  function pathLocationAtDistance(path, distanceKm) {
    const target = clamp(distanceKm, 0, path.distancesKm[path.distancesKm.length - 1]);
    let low = 0;
    let high = path.distancesKm.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (path.distancesKm[mid] < target) low = mid + 1;
      else high = mid;
    }
    const next = low === 0 ? 1 : low;
    const previous = next - 1;
    const span = path.distancesKm[next] - path.distancesKm[previous];
    const fraction = span > 0
      ? (target - path.distancesKm[previous]) / span
      : 0;
    const start = path.points[previous];
    const end = path.points[next];
    return {
      index: previous,
      point: {
        lon: start.lon + (end.lon - start.lon) * fraction,
        lat: start.lat + (end.lat - start.lat) * fraction,
      },
    };
  }

  function routeDistanceAtTime(path, relativeMs) {
    const target = clamp(relativeMs, path.timesMs[0], path.timesMs[path.timesMs.length - 1]);
    let low = 0;
    let high = path.timesMs.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (path.timesMs[mid] <= target) low = mid;
      else high = mid - 1;
    }
    const next = Math.min(low + 1, path.timesMs.length - 1);
    const span = path.timesMs[next] - path.timesMs[low];
    const fraction = span > 0 ? (target - path.timesMs[low]) / span : 0;
    return path.anchorDistancesKm[low] +
      (path.anchorDistancesKm[next] - path.anchorDistancesKm[low]) * fraction;
  }

  function routeMotionPointAt(route, relativeMs) {
    const path = routeMotionPathFor(route);
    if (!path) return null;
    return pathLocationAtDistance(path, routeDistanceAtTime(path, relativeMs)).point;
  }

  function routeMotionPaintPointsAt(route, relativeMs) {
    const path = routeMotionPathFor(route);
    if (!path) return null;
    const location = pathLocationAtDistance(path, routeDistanceAtTime(path, relativeMs));
    const points = [location.point];
    for (let index = location.index + 1; index < path.points.length; index += 1) {
      points.push(path.points[index]);
    }
    return points;
  }

  function routeMotionCompletedPointsAt(route, relativeMs) {
    const path = routeMotionPathFor(route);
    if (!path) return null;
    const location = pathLocationAtDistance(path, routeDistanceAtTime(path, relativeMs));
    const points = path.points.slice(0, location.index + 1);
    const previous = points[points.length - 1];
    if (!previous || previous.lon !== location.point.lon || previous.lat !== location.point.lat) {
      points.push(location.point);
    }
    return points;
  }

  function bearingDegrees(start, end) {
    const a = coordinateOf(start);
    const b = coordinateOf(end);
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const deltaLon = (b.lon - a.lon) * Math.PI / 180;
    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function shipHeading(s, active) {
    if (!active || !active.waypoints || active.waypoints.length < 2) return 0;
    const relativeMs = s.time - startMs;
    const motionPath = routeMotionPathFor(active);
    const producerCourse = pathValueAtTime(
      motionPath,
      relativeMs,
      motionPath?.courseDegrees,
      true,
    );
    if (motionPath?.source === "cd.route-motion-set.v1" &&
        Number.isFinite(producerCourse)) return producerCourse;
    if (motionPath && relativeMs >= motionPath.timesMs[0] &&
        relativeMs <= motionPath.timesMs[motionPath.timesMs.length - 1]) {
      const before = routeMotionPointAt(
        active,
        Math.max(motionPath.timesMs[0], relativeMs - CURVE_HEADING_LOOKAHEAD_MS),
      );
      const after = routeMotionPointAt(
        active,
        Math.min(motionPath.timesMs[motionPath.timesMs.length - 1],
          relativeMs + CURVE_HEADING_LOOKAHEAD_MS),
      );
      if (before && after && (before.lon !== after.lon || before.lat !== after.lat)) {
        return bearingDegrees(before, after);
      }
    }
    if (s.segment && s.segment.start_eta && s.segment.end_eta) {
      const start = active.waypoints.find((point) => point.eta === s.segment.start_eta);
      const end = active.waypoints.find((point) => point.eta === s.segment.end_eta);
      if (start && end) return bearingDegrees(start, end);
    }
    const index = Number.isInteger(s.edgeIndex) ? s.edgeIndex : 0;
    const start = active.waypoints[Math.max(0, Math.min(index, active.waypoints.length - 2))];
    const end = active.waypoints[Math.max(1, Math.min(index + 1, active.waypoints.length - 1))];
    return bearingDegrees(start, end);
  }

  function timelineIndex(ms) {
    const tl = bundle.timeline;
    let low = 0;
    let high = tl.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (isoToMs(tl[mid].t) - startMs <= ms) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  // The bundle timeline remains the source for time, active revision, speed,
  // and replay events. This is the raw fallback position used when a route
  // cannot produce a valid display motion path.
  function linearVesselPointAt(ms) {
    const timelineMs = Math.max(0, Math.min(totalMs, ms));
    const tl = bundle.timeline;
    const i = timelineIndex(timelineMs);
    const a = tl[i];
    const b = tl[Math.min(i + 1, tl.length - 1)];
    const denom = isoToMs(b.t) - isoToMs(a.t) || 1;
    const f = Math.max(0, Math.min(1, (timelineMs - (isoToMs(a.t) - startMs)) / denom));
    return {
      lon: a.v.lon + (b.v.lon - a.v.lon) * f,
      lat: a.v.lat + (b.v.lat - a.v.lat) * f,
    };
  }

  function activeRevisionAt(ms) {
    if (!bundle?.timeline?.length) return null;
    const timelineMs = Math.max(0, Math.min(totalMs, ms));
    return bundle.timeline[timelineIndex(timelineMs)]?.arv ?? null;
  }

  // Viewer simulation motion follows only validated producer motion samples.
  // When formal motion is absent or invalid, production mode fails closed to
  // the authoritative bundle timeline; research motion remains opt-in.
  function vesselPointAt(ms) {
    const timelineMs = Math.max(0, Math.min(totalMs, ms));
    const linear = linearVesselPointAt(timelineMs);
    const active = routeFor(activeRevisionAt(timelineMs));
    const motionPath = routeMotionPathFor(active);
    if (!motionPath || timelineMs < motionPath.timesMs[0] ||
        timelineMs > motionPath.timesMs[motionPath.timesMs.length - 1]) {
      return linear;
    }
    const curved = routeMotionPointAt(active, timelineMs);
    if (!curved || !Number.isFinite(curved.lon) || !Number.isFinite(curved.lat)) return linear;
    if (motionPath.source === "cd.route-motion-set.v1") return curved;
    const gapKm = haversineKm(linear.lon, linear.lat, curved.lon, curved.lat);
    return Number.isFinite(gapKm) && gapKm <= MAX_CURVE_MOTION_GAP_KM ? curved : linear;
  }

  // A short presentation trail sampled from the same authoritative timeline
  // used by stateAt(). It is deliberately not the completed-track contract:
  // it is a bounded visual aid for the vessel's recent physical movement.
  function vesselTrailAt(ms) {
    const endMs = Math.max(0, Math.min(totalMs, ms));
    const beginMs = Math.max(0, endMs - TRAIL_WINDOW_MS);
    const points = [vesselPointAt(beginMs)];
    const first = timelineIndex(beginMs);
    const last = timelineIndex(endMs);
    for (let index = first + 1; index <= last; index += 1) {
      const pointMs = isoToMs(bundle.timeline[index].t) - startMs;
      if (pointMs < endMs) {
        points.push(vesselPointAt(pointMs));
      }
    }
    const current = vesselPointAt(endMs);
    const previous = points[points.length - 1];
    if (!previous || previous.lon !== current.lon || previous.lat !== current.lat) {
      points.push(current);
    }
    return points;
  }

  function previousTimelineValue(index, key) {
    for (let i = index; i >= 0; i -= 1) {
      if (Object.prototype.hasOwnProperty.call(bundle.timeline[i], key)) {
        return bundle.timeline[i][key];
      }
    }
    return null;
  }

  function legacyCurrentRiskSelection(ms) {
    const frames = (bundle.risk && bundle.risk.frames) || [];
    const unavailable = {
      requested_horizon_hours: 0,
      requested_valid_time: formatAbsolute(startMs + ms),
      actual_valid_time: null,
      actual_horizon_seconds: null,
      selection_method: "unavailable",
      availability: "UNAVAILABLE",
      reason: "no_frame_available",
      frame_index: null,
      risk_id: null,
    };
    if (!frames.length) return unavailable;
    let low = 0;
    let high = frames.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (isoToMs(frames[mid].valid_time) - startMs <= ms) low = mid;
      else high = mid - 1;
    }
    if (isoToMs(frames[0].valid_time) - startMs > ms) return unavailable;
    const actualMs = isoToMs(frames[low].valid_time);
    return {
      ...unavailable,
      actual_valid_time: frames[low].valid_time,
      actual_horizon_seconds: Math.round((actualMs - (startMs + ms)) / 1000),
      selection_method: "latest_valid_time_at_or_before_simulation_time",
      availability: "AVAILABLE",
      reason: null,
      frame_index: low,
      risk_id: frames[low].risk_id,
    };
  }

  function riskSelectionAt(ms, horizon = selectedHorizon) {
    const index = timelineIndex(ms);
    const indexed = bundle.risk && bundle.risk.horizon_selections;
    if (indexed && indexed[index] && indexed[index].selections[horizon]) {
      return indexed[index].selections[horizon];
    }
    if (horizon === "current") return legacyCurrentRiskSelection(ms);
    return {
      requested_horizon_hours: Number(horizon.replace("+", "").replace("h", "")),
      requested_valid_time: formatAbsolute(startMs + ms),
      actual_valid_time: null,
      actual_horizon_seconds: null,
      selection_method: "unavailable",
      availability: "UNAVAILABLE",
      reason: "horizon_index_missing",
      frame_index: null,
      risk_id: null,
    };
  }

  function frameForRiskSelection(selection) {
    if (!selection || selection.availability !== "AVAILABLE") return null;
    const frames = (bundle.risk && bundle.risk.frames) || [];
    return Number.isInteger(selection.frame_index) ? frames[selection.frame_index] || null : null;
  }

  function riskAt(ms) {
    return frameForRiskSelection(riskSelectionAt(ms));
  }

  function stateAt(ms) {
    const tl = bundle.timeline;
    const i = timelineIndex(ms);
    const a = tl[i];
    const b = tl[Math.min(i + 1, tl.length - 1)];
    const denom = isoToMs(b.t) - isoToMs(a.t) || 1;
    const f = Math.max(0, Math.min(1, (ms - (isoToMs(a.t) - startMs)) / denom));
    const lerp = (x, y) => x + (y - x) * f;
    const rawTrack = previousTimelineValue(i, "track") || [];
    const pending = previousTimelineValue(i, "pending");
    const superseded = previousTimelineValue(i, "superseded");
    const riskSelection = riskSelectionAt(ms);
    const vessel = vesselPointAt(ms);
    const activeRoute = routeFor(activeRevisionAt(ms));
    const formalPath = buildFormalRouteMotionPath(activeRoute);
    const formalSpeed = pathValueAtTime(formalPath, ms, formalPath?.speedKnots);
    const formalTrack = formalPath
      ? routeMotionCompletedPointsAt(activeRoute, ms)
      : null;
    return {
      time: startMs + ms,
      lon: vessel.lon,
      lat: vessel.lat,
      kn: Number.isFinite(formalSpeed) ? formalSpeed : lerp(a.v.kn ?? 0, b.v.kn ?? 0),
      status: a.v.status,
      edge: lerp(a.v.ep ?? 0, b.v.ep ?? 0),
      edgeIndex: a.v.eidx,
      active: a.arv,
      pendingRevision: a.prv,
      pendingStatus: a.prs,
      decisionTime: a.dt,
      effectiveAdoption: a.eat,
      segment: a.seg,
      track: formalTrack || rawTrack.slice(0, a.ctl),
      pendingRoute: pending,
      supersededRoute: superseded,
      trail: vesselTrailAt(ms),
      riskSelection,
      risk: frameForRiskSelection(riskSelection),
    };
  }

  function routeFor(revision) {
    return bundle.routes.find((route) => route.revision === revision) || null;
  }

  function lastEvent(ms) {
    let result = null;
    const priority = {
      REPLAN_ADOPTED: 100,
      REPLAN_DECIDED: 95,
      REPLAN_SKIPPED: 90,
      PLAN_REUSED: 80,
      ROUTE_CHANGED: 70,
    };
    for (const event of bundle.events) {
      if (isoToMs(event.t) - startMs <= ms) {
        if (
          result === null ||
          isoToMs(event.t) > isoToMs(result.t) ||
          (isoToMs(event.t) === isoToMs(result.t) &&
            (priority[event.type] || 0) >= (priority[result.type] || 0))
        ) {
          result = event;
        }
      }
      else break;
    }
    return result;
  }

  function latestEventOfType(type, ms) {
    let result = null;
    for (const event of bundle.events) {
      if (isoToMs(event.t) - startMs > ms) break;
      if (event.type === type) result = event;
    }
    return result;
  }

  function pendingRouteAlpha(s) {
    if (!s.pendingRoute || s.pendingRoute.revision === s.active) return 1;
    const decisionMs = s.decisionTime ? isoToMs(s.decisionTime) - startMs : NaN;
    if (!Number.isFinite(decisionMs)) return presentationMode ? 0.82 : 1;
    const progress = Math.max(0, Math.min(1, (simMs - decisionMs) / PENDING_FADE_MS));
    return presentationMode ? 0.2 + 0.72 * progress : 1;
  }

  function adoptionPulse(s) {
    // At an adoption tick, the timeline's effective_adoption field already
    // describes the *next pending* plan. The completed adoption time is the
    // authoritative event time, so use that event for this visual pulse.
    const adoption = latestEventOfType("REPLAN_ADOPTED", simMs);
    if (!adoption) return 0;
    const adoptionMs = isoToMs(adoption.t) - startMs;
    const elapsed = simMs - adoptionMs;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > ADOPTION_PULSE_MS) return 0;
    return 1 - elapsed / ADOPTION_PULSE_MS;
  }

  function routeStatusText(s) {
    const hasPending = s.pendingRoute && s.pendingRoute.revision !== s.active;
    if (!presentationMode) {
      const pending = hasPending ? ` · pending R${s.pendingRoute.revision}` : "";
      return `当前路线 R${s.active}${pending}`;
    }
    if (adoptionPulse(s) > 0.01) return "新路线已采用 · 当前权威路线已更新";
    if (hasPending) return "新路线待采用 · 当前路线仍为权威路线";
    return "权威路线运行中";
  }

  function updateRouteDecision(s) {
    if (!routeDecisionStatusEl) return;
    const active = routeFor(s.active);
    const pending = s.pendingRoute && s.pendingRoute.revision !== s.active
      ? routeFor(s.pendingRoute.revision)
      : null;
    const adopted = latestEventOfType("REPLAN_ADOPTED", simMs);
    const decided = latestEventOfType("REPLAN_DECIDED", simMs);
    const key = [
      s.active,
      s.pendingRevision,
      s.pendingStatus,
      adopted?.t,
      decided?.t,
    ].join("|");
    if (key === lastRouteDecisionKey) return;
    lastRouteDecisionKey = key;

    if (!active) {
      routeDecisionStatusEl.classList.add("unavailable");
      routeDecisionStatusEl.textContent = "路线决策元数据不可用";
      setDefinitionRows(routeDecisionMetricsEl, []);
      if (routeDecisionTraceEl) routeDecisionTraceEl.textContent = "";
      if (routeFallbackNoteEl) routeFallbackNoteEl.textContent = "NO_ROUTE_PUBLISHED";
      return;
    }

    routeDecisionStatusEl.classList.remove("unavailable");
    if (adopted && Number(adopted.rev) === Number(active.revision) && adoptionPulse(s) > 0.01) {
      const next = pending ? `; R${pending.revision} is now pending` : "";
      routeDecisionStatusEl.textContent =
        `已采用重规划 · R${active.revision} 现为权威路线${next}`;
    } else if (pending) {
      routeDecisionStatusEl.textContent =
        `已决定重规划 · R${pending.revision} 待采用；R${active.revision} 仍为权威路线`;
    } else if (adopted && Number(adopted.rev) === Number(active.revision)) {
      routeDecisionStatusEl.textContent =
        `已采用重规划 · R${active.revision} 现为权威路线`;
    } else if (Number(active.revision) === 1) {
      routeDecisionStatusEl.textContent =
        `初始路线已生成 · R${active.revision} 为权威路线`;
    } else {
      routeDecisionStatusEl.textContent =
        `权威路线 R${active.revision} 运行中`;
    }

    const activeMetrics = active.metrics || {};
    const rows = [
      ["当前版本", `R${active.revision} · 权威路线`],
      ["路线角色", "权威路线"],
      ["距离", formatDistance(active.distance_km)],
      ["预计抵达", routeArrivalEta(active)],
      ["平均风险", formatMetric(activeMetrics.average_risk ?? active.average_risk)],
      ["最大风险", formatMetric(activeMetrics.maximum_risk ?? active.maximum_risk)],
    ];
    if (pending) {
      rows.push(
        ["待采用版本", `R${pending.revision}`],
        ["待采用距离", formatDistance(pending.distance_km)],
        ["预计采用时间", pending.effective_adoption_time || "未发布"],
      );
    }
    setDefinitionRows(routeDecisionMetricsEl, rows);

    const traceEvents = [decided, adopted]
      .filter(Boolean)
      .sort((left, right) => bundle.events.indexOf(left) - bundle.events.indexOf(right));
    const trace = traceEvents.map((event) => `${event.type} R${event.rev} @ ${event.t}`);
    if (routeDecisionTraceEl) {
      routeDecisionTraceEl.textContent = trace.length
        ? `事件轨迹：${trace.join(" → ")}`
        : "事件轨迹：出发 → 初始路线生成";
    }

    if (routeFallbackNoteEl) {
      routeFallbackNoteEl.textContent = candidateInspection?.valid
        ? "研究候选路线已发布；请使用研究验证视图比较 4×3 路线。"
        : `${SINGLE_ROUTE_FALLBACK} · ${candidateInspection?.reason || "候选路线比较未发布"} · ` +
          `${EXISTING_AUTHORITATIVE_REPLAY_ACTIVE}`;
    }
  }

  function experimentMetadataRows() {
    const candidates = routeCandidates();
    const first = candidates[0];
    const research = bundle?.research_validation || {};
    const combined = bundle?.combined_presentation || {};
    const riskSource = bundle?.risk?.source || {};
    const grid = bundle?.risk?.grid;
    return [
      ["experiment", research.label || "Route candidate validation"],
      ["scenario", research.scenario_label || first?.provenance?.scenario_id ||
        bundle?.replay?.scenario_id || "not published"],
      ["scenario id", bundle?.replay?.scenario_id || "not published"],
      ["run", bundle?.route_candidates?.provenance?.source_run_id || first?.provenance?.run_id || "not published"],
      ["RunContext", research.run_context_id || combined.run_context_id || "not published"],
      ["DatasetBundle", research.dataset_bundle_id || bundle?.replay?.dataset_bundle_id ||
        "not published in Viewer artifact"],
      ["RiskWindow", riskSource.risk_window_id || research.risk_window_id || "not published"],
      ["RiskFrame", riskSource.schema_version || research.risk_schema || "not published"],
      ["grid", grid ? `${grid.rows} × ${grid.cols}` : "not published"],
      ["frames", String(bundle?.risk?.frames?.length ?? research.risk_frame_count ?? "not published")],
      ["routes", String(candidates.length)],
      ["candidate set", bundle?.route_candidates?.candidate_set_id || "not published"],
      ["assembly", combined.assembly_id || "legacy Viewer bundle"],
    ];
  }

  function updateResearchPanel() {
    if (!researchPanel) return;
    const panelKey = [
      candidateInspection?.valid,
      candidateInspection?.reason,
      selectedRouteLayer,
      highlightedCandidateId,
    ].join("|");
    if (panelKey === lastResearchPanelKey) return;
    lastResearchPanelKey = panelKey;
    const candidates = routeCandidates();
    if (!candidateInspection?.valid) {
      researchStatusEl.classList.add("unavailable");
      researchStatusEl.textContent =
        `研究候选路线比较不可用 · ${candidateInspection?.reason || "未发布"}`;
      setDefinitionRows(experimentMetadataEl, experimentMetadataRows());
      if (routeCandidateNoteEl) {
        routeCandidateNoteEl.textContent =
          "不会推断候选路线；现有权威回放仍在运行。";
      }
      if (routeCandidatesEl) {
        routeCandidatesEl.replaceChildren();
        routeCandidatesEl.hidden = true;
      }
      if (routeHighlightNoteEl) routeHighlightNoteEl.textContent = "";
      if (currentStrategyEl) {
        currentStrategyEl.classList.add("fallback");
        currentStrategyEl.textContent =
          "当前策略 · 权威单路线执行（候选路线比较未发布）";
      }
      return;
    }

    researchStatusEl.classList.remove("unavailable");
    researchStatusEl.textContent =
      `已发布 · 4 个路线层 × 3 个目标 · ${candidates.length} 条制品路线`;
    const canonicalCandidate = canonicalSelectedCandidate();
    if (currentStrategyEl) {
      currentStrategyEl.classList.remove("fallback");
      currentStrategyEl.textContent = canonicalCandidate
        ? `当前策略 · ${objectiveLabel(canonicalCandidate.objective)} · C 已选路线`
        : "当前策略 · 未发布";
    }
    setDefinitionRows(experimentMetadataEl, experimentMetadataRows());
    const layerCandidates = candidatesForLayer();
    if (routeCandidateNoteEl) {
      routeCandidateNoteEl.textContent =
        `${selectedRouteLayer} · ${layerCandidates.length} 条路线，按源发布顺序排列`;
    }
    if (!routeCandidatesEl) return;
    routeCandidatesEl.replaceChildren();
    const canonicalId = bundle.route_candidates.selected_candidate_id;
    const highlight = highlightedCandidate();
    highlightedCandidateId = highlight?.candidate_id || null;
    for (const candidate of layerCandidates) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = `route-card route-card-${candidate.objective}`;
      card.dataset.candidateId = candidate.candidate_id;
      card.dataset.highlighted = candidate.candidate_id === highlightedCandidateId ? "true" : "false";
      card.dataset.canonical = candidate.candidate_id === canonicalId ? "true" : "false";

      const heading = document.createElement("strong");
      heading.textContent = objectiveLabel(candidate.objective);
      const identity = document.createElement("span");
      identity.className = "route-card-id";
      identity.textContent = candidate.candidate_id;
      const metrics = candidate.risk_metrics;
      const list = document.createElement("dl");
      list.className = "route-card-metrics";
      const rows = [
        ["距离", formatResearchMetric(candidate.distance_km, 3, " km")],
        ["航行时间", formatResearchMetric(candidate.travel_hours, 3, " 小时")],
        ["预计抵达", candidate.arrival_eta || "未发布"],
        ["平均风险", formatResearchMetric(metrics.average_risk)],
        ["最大风险", formatResearchMetric(metrics.maximum_risk)],
        ["综合风险", formatResearchMetric(metrics.integrated_risk_hours, 6, " 风险·小时")],
      ];
      for (const [label, value] of rows) {
        const term = document.createElement("dt");
        term.textContent = label;
        const detail = document.createElement("dd");
        detail.textContent = value;
        list.append(term, detail);
      }
      card.append(heading, identity, list);
      routeCandidatesEl.append(card);
    }
    routeCandidatesEl.hidden = false;
    if (routeHighlightNoteEl) {
      const canonical = highlight?.candidate_id === canonicalId;
      routeHighlightNoteEl.dataset.selectionMode = highlight && !canonical
        ? DISPLAY_ONLY_COMPARISON_SELECTION
        : "canonical-route-selection";
      routeHighlightNoteEl.textContent = highlight
        ? `地图高亮：${objectiveLabel(highlight.objective)} · ${highlight.candidate_id}` +
          `${canonical ? " · C 已选路线" : " · 仅用于展示比较"}`
        : "未高亮路线";
    }
  }

  function drawRiskFrame(frame) {
    if (!frame) return;
    const lats = frame.coordinates.latitude;
    const lons = frame.coordinates.longitude;
    const cols = lons.length;
    const rows = lats.length;
    const lonStep = (lons.length > 1 ? Math.abs(lons[1] - lons[0]) : 0) ||
      (basemap.bbox.max_lon - basemap.bbox.min_lon) / cols;
    const latStep = (lats.length > 1 ? Math.abs(lats[1] - lats[0]) : 0) ||
      (basemap.bbox.max_lat - basemap.bbox.min_lat) / rows;
    const presentationRiskPaths = {};
    ctx.save();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const reason = frame.hard_reasons[index] || "DATA_UNAVAILABLE";
        const level = Number(frame.risk_levels[index] || 0);
        const nw = project(lons[col] - lonStep / 2, lats[row] + latStep / 2);
        const se = project(lons[col] + lonStep / 2, lats[row] - latStep / 2);
        // Pixel-align presentation fills so adjacent translucent cells do not
        // leave anti-aliased seams. The geographic cell identity is unchanged.
        const x = Math.floor(Math.min(nw.x, se.x));
        const y = Math.floor(Math.min(nw.y, se.y));
        const right = Math.ceil(Math.max(nw.x, se.x));
        const bottom = Math.ceil(Math.max(nw.y, se.y));
        const width = right - x + 1;
        const height = bottom - y + 1;
        if (reason === "NONE" && layers.risk && RISK_COLORS[level]) {
          if (presentationMode) {
            if (!presentationRiskPaths[level]) presentationRiskPaths[level] = new Path2D();
            presentationRiskPaths[level].rect(x, y, width, height);
          } else {
            ctx.fillStyle = RISK_COLORS[level];
            ctx.globalAlpha = 0.34;
            ctx.fillRect(x, y, width, height);
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = "#d8efff";
            ctx.lineWidth = 0.6;
            ctx.strokeRect(x, y, width, height);
          }
        } else if (reason !== "NONE" && layers.hard) {
          const color = HARD_COLORS[reason] || HARD_COLORS.OTHER;
          ctx.fillStyle = color;
          ctx.globalAlpha = presentationMode ? 0.34 : 0.45;
          ctx.fillRect(x, y, width, height);
          ctx.globalAlpha = presentationMode ? 0.62 : 0.72;
          ctx.strokeStyle = color;
          ctx.lineWidth = presentationMode ? 1.2 : 1;
          ctx.setLineDash(presentationMode ? [5, 4] : [3, 3]);
          ctx.strokeRect(x, y, width, height);
          ctx.setLineDash([]);
        }
      }
    }
    if (presentationMode && layers.risk) {
      for (const [level, path] of Object.entries(presentationRiskPaths)) {
        ctx.fillStyle = PRESENTATION_RISK_COLORS[level];
        ctx.globalAlpha = 0.25;
        ctx.fill(path);
      }
    }
    ctx.restore();
  }

  function drawPath(
    points,
    color,
    width,
    dash,
    filterFutureMs = null,
    alpha = 1,
    smoothRoute = false,
  ) {
    const visible = filterFutureMs === null ? points : points.filter(
      (point) => !point.eta || isoToMs(point.eta) - startMs >= filterFutureMs
    );
    if (visible.length < 2) return;
    const rendered = smoothRoute ? routeDisplayPoints(visible) : densifyPoints(visible);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash(dash);
    ctx.beginPath();
    rendered.forEach((point, index) => {
      const geo = project(point.lon ?? point.longitude, point.lat ?? point.latitude);
      if (index === 0) ctx.moveTo(geo.x, geo.y);
      else ctx.lineTo(geo.x, geo.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawRoutePolyline(points, width, dash, filterFutureMs = null, alpha = 0.72) {
    if (!layers.routePolyline) return;
    drawPath(points, ROUTE_POLYLINE_COLOR, width, dash, filterFutureMs, alpha, false);
  }

  function drawResearchCandidateRoutes() {
    if (viewMode !== "research" || !layers.routes || !candidateInspection?.valid) return;
    const highlight = highlightedCandidate();
    for (const candidate of candidatesForLayer()) {
      const style = CANDIDATE_STYLES[candidate.objective] || CANDIDATE_STYLES.recommended;
      const isHighlighted = candidate.candidate_id === highlight?.candidate_id;
      const geometry = candidateGeometryPoints(candidate);
      drawRoutePolyline(
        geometry,
        Math.max(1.1, style.width * 0.58),
        style.dash,
        null,
        isHighlighted ? 0.78 : 0.32,
      );
      drawPath(
        geometry,
        style.color,
        style.width + (isHighlighted ? 1.8 : 0),
        style.dash,
        null,
        isHighlighted ? 0.96 : 0.48,
        true,
      );
    }
  }

  function miniProject(lon, lat) {
    const b = basemap.bbox;
    return {
      x: ((lon - b.min_lon) / (b.max_lon - b.min_lon)) * miniMapCanvas.width,
      y: ((b.max_lat - lat) / (b.max_lat - b.min_lat)) * miniMapCanvas.height,
    };
  }

  function drawMiniPath(points, color, width, dash = [], alpha = 1, smoothRoute = false) {
    if (!miniCtx || !points || points.length < 2) return;
    const rendered = smoothRoute ? routeDisplayPoints(points) : points;
    miniCtx.save();
    miniCtx.globalAlpha = alpha;
    miniCtx.strokeStyle = color;
    miniCtx.lineWidth = width;
    miniCtx.lineJoin = "round";
    miniCtx.lineCap = "round";
    miniCtx.setLineDash(dash);
    miniCtx.beginPath();
    rendered.forEach((point, index) => {
      const geo = miniProject(point.lon ?? point.longitude, point.lat ?? point.latitude);
      if (index === 0) miniCtx.moveTo(geo.x, geo.y);
      else miniCtx.lineTo(geo.x, geo.y);
    });
    miniCtx.stroke();
    miniCtx.restore();
  }

  function drawMiniMap(state, heading) {
    if (!miniCtx || !miniMapCanvas || mapMode !== "follow" || !basemap?.bbox) return;
    const width = miniMapCanvas.width;
    const height = miniMapCanvas.height;
    miniCtx.clearRect(0, 0, width, height);
    miniCtx.fillStyle = "#081620";
    miniCtx.fillRect(0, 0, width, height);
    if (image) {
      miniCtx.save();
      miniCtx.globalAlpha = 0.76;
      miniCtx.drawImage(image, 0, 0, width, height);
      miniCtx.restore();
    }

    const active = routeFor(state.active);
    if (active?.waypoints?.length > 1) {
      const activePaintPoints = routePaintPointsFor(active);
      if (layers.routePolyline) {
        drawMiniPath(active.waypoints, ROUTE_POLYLINE_COLOR, 1.2, [3, 4], 0.72);
      }
      drawMiniPath(activePaintPoints, ROUTE_CURVE_COLOR, 2.3, [], 0.9, false);
    }
    if (state.supersededRoute?.length > 1) {
      if (layers.routePolyline) {
        drawMiniPath(state.supersededRoute, ROUTE_POLYLINE_COLOR, 1.1, [3, 4], 0.62);
      }
      drawMiniPath(state.supersededRoute, "#778795", 1.4, [3, 4], 0.8, true);
    }
    if (state.pendingRoute?.route?.length > 1) {
      if (layers.routePolyline) {
        drawMiniPath(state.pendingRoute.route, ROUTE_POLYLINE_COLOR, 1.2, [4, 4], 0.68);
      }
      drawMiniPath(state.pendingRoute.route, "#f2c46b", 1.8, [5, 4], 0.88, true);
    }
    if (state.track?.length > 1) {
      drawMiniPath(state.track, "#69d49c", 2.2, [], 0.94, true);
    }

    const position = miniProject(state.lon, state.lat);
    const viewportWidth = Math.min(width * 0.92, width / mapZoom);
    const viewportHeight = Math.min(height * 0.92, height / mapZoom);
    miniCtx.save();
    miniCtx.translate(position.x, position.y);
    miniCtx.rotate(normalizeDegrees(heading) * Math.PI / 180);
    miniCtx.strokeStyle = "rgba(255, 255, 255, 0.78)";
    miniCtx.lineWidth = 1.2;
    miniCtx.setLineDash([4, 3]);
    miniCtx.strokeRect(-viewportWidth / 2, -viewportHeight / 2, viewportWidth, viewportHeight);
    miniCtx.setLineDash([]);
    miniCtx.beginPath();
    miniCtx.moveTo(0, -7);
    miniCtx.lineTo(4.5, 5);
    miniCtx.lineTo(0, 3);
    miniCtx.lineTo(-4.5, 5);
    miniCtx.closePath();
    miniCtx.fillStyle = "#f7fbff";
    miniCtx.fill();
    miniCtx.strokeStyle = "#0b2b3c";
    miniCtx.lineWidth = 1.4;
    miniCtx.stroke();
    miniCtx.restore();
  }

  function draw() {
    const s = stateAt(simMs);
    const active = routeFor(s.active);
    const heading = shipHeading(s, active);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    applyMapViewTransform(s, heading);
    if (image) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    updateSimulationReadout(s);
    renderRiskExplanation(s);
    drawRiskFrame(s.risk);
    drawNavigationAids();
    const pos = project(s.lon, s.lat);

    if (layers.track && s.trail.length > 1) {
      drawPath(s.trail, "#d7e6ed", 2.2, [], null, presentationMode ? 0.72 : 0.45);
    }

    // Candidate geometry is consumed exactly as published, then converted to
    // display-only curve coordinates. The local highlight and smoothing do
    // not change C's selected_candidate_id, ranking, geometry, risk metrics,
    // ETA, or the simulation's route-adoption events.
    drawResearchCandidateRoutes();

    if (layers.routes && s.supersededRoute && s.supersededRoute.length > 1) {
      drawRoutePolyline(s.supersededRoute, 1.2, [3, 8], simMs, 0.7);
      drawPath(s.supersededRoute, "rgba(125,137,146,0.88)", 2, [3, 8], simMs, 1, true);
    }

    if (layers.routes && active) {
      const future = active.waypoints.filter(
        (waypoint) => isoToMs(waypoint.eta) - startMs >= simMs
      );
      if (future.length) {
        const pulse = adoptionPulse(s);
        const rawVessel = linearVesselPointAt(simMs);
        drawRoutePolyline(
          [{ lon: rawVessel.lon, lat: rawVessel.lat, eta: formatAbsolute(s.time) }, ...future],
          1.35,
          [5, 5],
          null,
          0.76,
        );
        const curvedFuture = routeMotionPaintPointsAt(active, simMs);
        const curvePoints = curvedFuture?.length > 1
          ? curvedFuture
          : [{ lon: s.lon, lat: s.lat, eta: formatAbsolute(s.time) }, ...future];
        drawPath(
          curvePoints,
          ROUTE_CURVE_COLOR,
          3.5 + pulse * 0.9,
          [],
          null,
          0.88 + pulse * 0.12,
          false,
        );
      }
    }

    if (layers.track && s.track.length > 1) {
      drawPath(s.track, "#5cc47a", 3, [], null, 1, true);
    }

    if (layers.routes && s.pendingRoute && s.pendingRoute.route && s.pendingRoute.revision !== s.active) {
      drawRoutePolyline(
        s.pendingRoute.route,
        1.45,
        [6, 5],
        null,
        pendingRouteAlpha(s) * 0.72,
      );
      drawPath(
        s.pendingRoute.route,
        "#f2b134",
        2.5,
        [8, 6],
        null,
        pendingRouteAlpha(s),
        true,
      );
    }

    if (layers.routes && s.segment && s.segment.start_eta && s.segment.end_eta && active) {
      const seg = active.waypoints.filter(
        (waypoint) => isoToMs(waypoint.eta) >= isoToMs(s.segment.start_eta)
      );
      if (seg.length >= 2 && layers.routePolyline) {
        drawPath(seg.slice(0, 2), ROUTE_POLYLINE_COLOR, 1.3, [3, 3], null, 0.8);
      }
    }

    // This phase is derived from simulation time, so playback speed changes
    // the visual cadence and no independent CSS/timer animation is created.
    const motionPhase = Math.sin((simMs / 1000) * Math.PI * 2 / 180);
    drawShipIcon(pos, heading, motionPhase);
    ctx.restore();
    updateMapUi(heading, s);
    updateDebug(s, heading);
    drawMiniMap(s, heading);
  }

  function drawShipIcon(pos, heading, motionPhase) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(heading * Math.PI / 180);
    const wakeAlpha = 0.18 + (motionPhase + 1) * 0.05;
    const wakeLength = 16 + (motionPhase + 1) * 2;
    ctx.beginPath();
    ctx.moveTo(-3.5, 8);
    ctx.lineTo(-3.5, wakeLength);
    ctx.moveTo(3.5, 8);
    ctx.lineTo(3.5, wakeLength);
    ctx.strokeStyle = "#d7e6ed";
    ctx.globalAlpha = wakeAlpha;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.quadraticCurveTo(6, -7, 6, 1);
    ctx.lineTo(4.5, 9);
    ctx.lineTo(0, 13);
    ctx.lineTo(-4.5, 9);
    ctx.lineTo(-6, 1);
    ctx.quadraticCurveTo(-6, -7, 0, -15);
    ctx.closePath();
    ctx.fillStyle = "#f5fbff";
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = "#092337";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3, -1);
    ctx.lineTo(3, -1);
    ctx.lineTo(2.5, 5);
    ctx.lineTo(-2.5, 5);
    ctx.closePath();
    ctx.fillStyle = "#3d9be9";
    ctx.fill();
    if (!presentationMode) {
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "#0f2b3b";
      ctx.fill();
    }
    ctx.restore();
  }

  function updateDebug(s, heading) {
    const event = lastEvent(simMs);
    const selection = s.riskSelection;
    const riskValidMs = selection && selection.actual_valid_time
      ? isoToMs(selection.actual_valid_time)
      : NaN;
    const rows = [
      ["view mode", viewMode],
      ["simulation_time", formatAbsolute(s.time)],
      ["voyage progress km", voyageProgress ? formatResearchMetric(voyageDistanceAt(simMs), 3) : "unavailable"],
      ["simulated track km", voyageProgress ? formatResearchMetric(voyageProgress.totalKm, 3) : "unavailable"],
      ["vessel lon/lat", `${s.lon.toFixed(4)} / ${s.lat.toFixed(4)}`],
      ["speed knots", (s.kn ?? 0).toFixed(2)],
      ["course / heading", `${heading.toFixed(1)}°`],
      ["edge_progress", (s.edge ?? 0).toFixed(4)],
      ["active_plan_revision", s.active],
      ["pending_plan_revision", s.pendingRevision ?? "null"],
      ["pending_plan_status", s.pendingStatus ?? "none"],
      ["decision_time", s.decisionTime ?? "null"],
      ["effective_adoption_time", s.effectiveAdoption ?? "null"],
      ["recent trail points", s.trail.length],
      ["requested risk horizon", horizonLabel(selectedHorizon)],
      ["requested risk valid_time", selection ? selection.requested_valid_time : "none"],
      ["risk availability", selection ? selection.availability : "none"],
      ["risk selection method", selection ? selection.selection_method : "none"],
      ["risk frame id", s.risk ? s.risk.risk_id : "none"],
      ["risk valid_time", selection?.actual_valid_time ?? "none"],
      ["risk actual horizon", selection ? formatHorizonSeconds(selection.actual_horizon_seconds) : "none"],
      ["risk level range", bundle.risk ? bundle.risk.level_range.join("-") : "none"],
      ["hard reason", s.risk ? "separate overlay" : "none"],
      ["candidate interface", candidateInspection?.valid ? "PUBLISHED / 12" : "single-route fallback"],
      ["candidate layer", selectedRouteLayer],
      ["candidate highlight", highlightedCandidateId || "none"],
      ["last event", event ? `${event.type}@${event.t}` : "none"],
      ["L1", bundle.gates.status || "NOT_RUN"],
      ["L2", bundle.gates.l2_status || "NOT_RUN"],
    ];
    debugEl.innerHTML = rows
      .map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`)
      .join("");
    if (routeStatusEl) {
      routeStatusEl.textContent = routeStatusText(s);
    }
    if (!selection || selection.availability !== "AVAILABLE") {
      riskStatusEl.classList.add("unavailable");
      riskStatusEl.textContent = `${horizonLabel(selectedHorizon)} · 风险预测不可用`;
      riskHorizonStatusEl.textContent = selection
        ? `${horizonLabel(selectedHorizon)} → 风险预测不可用。` +
          `可用预测窗口：${forecastWindowText()}。（${selection.reason}）`
        : `风险预测不可用。可用预测窗口：${forecastWindowText()}。`;
    } else {
      riskStatusEl.classList.remove("unavailable");
      const actual = formatHorizonSeconds(selection.actual_horizon_seconds);
      riskStatusEl.textContent = `${horizonLabel(selectedHorizon)} · ${selection.actual_valid_time} · ${actual}`;
      riskHorizonStatusEl.textContent =
        `${horizonLabel(selectedHorizon)} → 请求 ${selection.requested_valid_time}；` +
        `实际 ${selection.actual_valid_time}（${actual}），${selectionMethodLabel(selection.selection_method)}`;
    }
    updateRiskTimeline(s);
    updateRiskSummary(s);
    updateRouteDecision(s);
    updateResearchPanel();
    updateEventTimeline(s);
  }

  function frame(ts) {
    const shouldDraw = playing || lastTs === null;
    if (lastTs !== null && playing) {
      const delta = (ts - lastTs) / 1000;
      simMs += delta * scale * 1000;
      if (simMs >= totalMs) {
        simMs = totalMs;
        playing = false;
        setRunButtonState();
      }
    }
    lastTs = ts;
    if (shouldDraw) {
      syncScrubToSimulation();
      draw();
    }
    requestAnimationFrame(frame);
  }

  playBtn.addEventListener("click", () => {
    if (!playing && simMs >= totalMs) simMs = 0;
    playing = !playing;
    setRunButtonState();
    lastTs = null;
  });

  scrub.addEventListener("input", () => {
    const nextMs = voyageProgress
      ? simulationMsAtVoyageDistance(Number(scrub.value) / 1000)
      : Number(scrub.value);
    seekSimulationTo(nextMs);
  });

  speedSel.addEventListener("change", () => {
    scale = Number(speedSel.value);
  });

  toggleDebugBtn.addEventListener("click", () => {
    if (viewMode === "engineering") {
      viewMode = previousNonEngineeringMode;
    } else {
      previousNonEngineeringMode = viewMode;
      viewMode = "engineering";
    }
    updateModeUi();
    draw();
  });

  viewModeSel.addEventListener("change", () => {
    const requested = viewModeSel.value;
    if (requested === "research" && !candidateInspection?.valid) {
      viewMode = "presentation";
    } else {
      viewMode = requested;
      if (viewMode !== "engineering") previousNonEngineeringMode = viewMode;
    }
    updateModeUi();
    draw();
  });

  routeLayerSel.addEventListener("change", () => {
    selectedRouteLayer = routeLayerSel.value;
    highlightedCandidateId = defaultCandidateForLayer(selectedRouteLayer)?.candidate_id || null;
    updateResearchPanel();
    draw();
  });

  routeCandidatesEl.addEventListener("click", (event) => {
    const card = event.target.closest("[data-candidate-id]");
    if (!card || !candidateInspection?.valid) return;
    const candidate = candidatesForLayer().find(
      (item) => item.candidate_id === card.dataset.candidateId
    );
    if (!candidate) return;
    highlightedCandidateId = candidate.candidate_id;
    updateResearchPanel();
    draw();
  });

  eventTimelineEl.addEventListener("click", (event) => {
    const jump = event.target.closest(".event-jump");
    if (!jump) return;
    seekSimulationToIso(jump.dataset.eventTime);
  });

  mapModeMainBtn.addEventListener("click", () => setMapMode("main"));
  mapModeFollowBtn.addEventListener("click", () => setMapMode("follow"));
  zoomInBtn.addEventListener("click", () => adjustMapZoom(1.2));
  zoomOutBtn.addEventListener("click", () => adjustMapZoom(1 / 1.2));
  resetMapBtn.addEventListener("click", resetMapView);

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    adjustMapZoom(event.deltaY < 0 ? 1.14 : 1 / 1.14);
  }, { passive: false });

  canvas.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      adjustMapZoom(1.2);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      adjustMapZoom(1 / 1.2);
    } else if (event.key === "0") {
      event.preventDefault();
      resetMapView();
    }
  });

  canvas.addEventListener("pointerdown", (event) => {
    mapDrag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    mapWasDragged = false;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!mapDrag || event.pointerId !== mapDrag.id) return;
    const rect = canvasDisplayRect();
    if (!rect) return;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const deltaX = (event.clientX - mapDrag.x) * scaleX;
    const deltaY = (event.clientY - mapDrag.y) * scaleY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 2) {
      if (!mapDrag.moved) preserveFollowViewForManualPan();
      mapDrag.moved = true;
      mapWasDragged = true;
    }
    mapPanX += deltaX;
    mapPanY += deltaY;
    clampMapPan();
    mapDrag.x = event.clientX;
    mapDrag.y = event.clientY;
    if (mapDrag.moved) draw();
  });

  function finishMapDrag(event) {
    if (!mapDrag || event.pointerId !== mapDrag.id) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    mapDrag = null;
    canvas.classList.remove("is-dragging");
  }

  canvas.addEventListener("pointerup", finishMapDrag);
  canvas.addEventListener("pointercancel", finishMapDrag);

  canvas.addEventListener("click", (event) => {
    if (mapWasDragged) {
      mapWasDragged = false;
      return;
    }
    const frame = riskAt(simMs);
    if (!frame || !basemap?.bbox) return;
    const state = stateAt(simMs);
    const active = routeFor(state.active);
    const point = screenPointToWorld(event, state, shipHeading(state, active));
    if (!point) return;
    const x = point.x;
    const y = point.y;
    const lon = basemap.bbox.min_lon + x / canvas.width *
      (basemap.bbox.max_lon - basemap.bbox.min_lon);
    const lat = basemap.bbox.max_lat - y / canvas.height *
      (basemap.bbox.max_lat - basemap.bbox.min_lat);
    const lats = frame.coordinates.latitude;
    const lons = frame.coordinates.longitude;
    const nearestIndex = (values, target) => values.reduce(
      (best, value, index) => Math.abs(value - target) < Math.abs(values[best] - target)
        ? index
        : best,
      0
    );
    const row = nearestIndex(lats, lat);
    const column = nearestIndex(lons, lon);
    const latStep = lats.length > 1 ? Math.abs(lats[1] - lats[0]) : Infinity;
    const lonStep = lons.length > 1 ? Math.abs(lons[1] - lons[0]) : Infinity;
    if (Math.abs(lats[row] - lat) > latStep / 2 ||
        Math.abs(lons[column] - lon) > lonStep / 2) return;
    selectedRiskCell = { row, column };
    renderRiskExplanation(stateAt(simMs));
  });

  riskHorizonSel.addEventListener("change", () => {
    selectedHorizon = riskHorizonSel.value;
    draw();
  });

  function updateResearchRouteSmoothingUi() {
    const sidecar = researchRouteSmoothingSidecar();
    const active = bundle ? routeFor(activeRevisionAt(simMs)) : null;
    const inspection = active
      ? inspectResearchRouteSmoothing(active)
      : { valid: false, reason: "no_active_route" };
    const formalInspection = active
      ? inspectFormalRouteMotion(active)
      : { valid: false, reason: "no_active_route" };
    if (formalMotionStatusEl) {
      formalMotionStatusEl.textContent = formalInspection.valid
        ? "正式曲线运动已默认启用 · C producer samples · 失败时回退 timeline"
        : `正式曲线不可用 · 使用权威 raw timeline · ${formalInspection.reason}`;
      formalMotionStatusEl.classList.toggle("unavailable", !formalInspection.valid);
    }
    if (routeSmoothingResearchEl) {
      routeSmoothingResearchEl.disabled = !sidecar;
      routeSmoothingResearchEl.checked = researchRouteSmoothingEnabled;
    }
    if (!routeSmoothingResearchStatusEl) return;
    if (!sidecar) {
      routeSmoothingResearchStatusEl.textContent =
        "未发布研究 sidecar；使用当前 Viewer 展示路径";
      routeSmoothingResearchStatusEl.classList.add("unavailable");
      return;
    }
    if (inspection.valid) {
      const count = sidecar.motion_samples?.length || 0;
      routeSmoothingResearchStatusEl.textContent = researchRouteSmoothingEnabled
        ? `研究 sidecar 已启用 · ${count} 个时间样本 · 失败时回退 timeline`
        : `研究 sidecar 可用但默认关闭 · ${count} 个时间样本`;
      routeSmoothingResearchStatusEl.classList.remove("unavailable");
    } else {
      routeSmoothingResearchStatusEl.textContent =
        `研究 sidecar 不可用于当前路线 · 启用时回退 timeline · ${inspection.reason}`;
      routeSmoothingResearchStatusEl.classList.add("unavailable");
    }
  }

  function updateModeUi() {
    presentationMode = viewMode !== "engineering";
    const researchAvailable = Boolean(candidateInspection?.valid);
    const researchOption = viewModeSel.querySelector('option[value="research"]');
    if (researchOption) researchOption.disabled = !researchAvailable;
    if (viewMode === "research" && !researchAvailable) viewMode = "presentation";
    viewModeSel.value = viewMode;
    routeLayerSel.disabled = !researchAvailable;
    researchPanel.hidden = viewMode !== "research";
    debugPanel.hidden = viewMode !== "engineering";
    if (gateBadges) gateBadges.hidden = viewMode !== "engineering";
    toggleDebugBtn.textContent = viewMode === "engineering"
      ? (previousNonEngineeringMode === "research" ? "研究验证" : "航行仿真")
      : "工程调试";
    if (modeBadge) {
      modeBadge.textContent = viewMode === "engineering"
        ? "工程调试"
        : viewMode === "research" ? "研究验证" : "航行仿真";
    }
    document.body.dataset.mode = viewMode;
  }

  [[layerRisk, "risk"], [layerHard, "hard"], [layerRoutes, "routes"],
    [layerRoutePolyline, "routePolyline"], [layerTrack, "track"],
    [layerNavigation, "navigation"]]
    .forEach(([control, key]) => {
      control.addEventListener("change", () => {
        layers[key] = control.checked;
        draw();
      });
    });

  routeSmoothingResearchEl.addEventListener("change", () => {
    researchRouteSmoothingEnabled = routeSmoothingResearchEl.checked;
    researchRouteMotionCache = new WeakMap();
    updateResearchRouteSmoothingUi();
    draw();
  });

  async function start() {
    initializePanelControls();
    initializeSidebarToggle();
    bundle = window.VIEWER_BUNDLE || (await (await fetch("bundle.json")).json());
    await formalMotionTools.prevalidate(bundle);
    routeMotionCache = new WeakMap();
    formalRouteMotionCache = new WeakMap();
    researchRouteMotionCache = new WeakMap();
    researchRouteSmoothingEnabled = false;
    renderPipelineOverview(bundle);
    const sidecar = window.RISK_EXPLANATION_SIDECAR ?? bundle.risk_explanation ?? null;
    riskExplanationInspection = riskExplanationTools.inspect(sidecar, bundle);
    riskExplanationRevision += 1;
    const routeInspection = candidateTools.inspect(
      bundle.route_candidates,
      bundle?.replay?.scenario_id || null
    );
    combinedIdentityInspection = inspectCombinedIdentity(bundle, routeInspection);
    candidateInspection = combinedIdentityInspection.valid
      ? routeInspection
      : Object.freeze({
        valid: false,
        reason: combinedIdentityInspection.reason,
        candidates: Object.freeze([]),
      });
    viewMode = candidateInspection.valid ? "research" : "presentation";
    previousNonEngineeringMode = viewMode;
    selectedRouteLayer = "full_voyage";
    routeLayerSel.value = selectedRouteLayer;
    highlightedCandidateId = defaultCandidateForLayer(selectedRouteLayer)?.candidate_id || null;
    basemap = bundle.basemap;
    startMs = isoToMs(bundle.replay.start);
    const end = isoToMs(bundle.replay.end);
    totalMs = end - startMs;
    simMs = 0;
    voyageProgress = buildVoyageProgress();
    riskHorizonSel.value = selectedHorizon;
    scrub.max = voyageProgress
      ? String(Math.round(voyageProgress.totalKm * 1000))
      : String(totalMs);
    scrub.step = voyageProgress ? "100" : "1";
    syncScrubToSimulation();
    updateModeUi();
    buildRiskTimeline();
    buildEventTimeline();
    document.getElementById("gate-l1").textContent = `L1 ${bundle.gates.status}`;
    document.getElementById("gate-l2").textContent = `L2 ${bundle.gates.l2_status}`;
    document.getElementById("gate-loop").textContent =
          `预检 ${bundle.gates.status} / ${bundle.gates.l2_status || "未运行"}`;
    if (basemap) {
      canvas.width = basemap.width;
      canvas.height = basemap.height;
      if (miniMapCanvas) {
        miniMapCanvas.width = 220;
        miniMapCanvas.height = 220;
      }
      image = new Image();
      image.onload = () => draw();
      image.src = window.VIEWER_BASEMAP || "gebco_basemap.png";
    }
    updateResearchRouteSmoothingUi();
    const initialState = stateAt(simMs);
    updateMapUi(shipHeading(initialState, routeFor(initialState.active)), initialState);
    window.__ARCTIC_VIEWER__ = {
      stateAt: () => stateAt(simMs),
      riskAt: () => riskAt(simMs),
      riskSelection: () => riskSelectionAt(simMs),
      setRiskHorizon: (value) => {
        if (["current", "+6h", "+12h", "+24h"].includes(value)) {
          selectedHorizon = value;
          riskHorizonSel.value = value;
          draw();
        }
      },
      shipHeading: () => shipHeading(stateAt(simMs), routeFor(stateAt(simMs).active)),
      trailAt: () => stateAt(simMs).trail,
      routeMotion: () => {
        const current = stateAt(simMs);
        const active = routeFor(current.active);
        const path = routeMotionPathFor(active);
        const linear = linearVesselPointAt(simMs);
        const curved = path ? routeMotionPointAt(active, simMs) : null;
        const gapKm = curved
          ? haversineKm(linear.lon, linear.lat, curved.lon, curved.lat)
          : null;
        return {
          active_revision: current.active,
          applied: Boolean(path?.smoothingApplied),
          raw_point_count: active?.waypoints?.length || 0,
          display_point_count: path?.points?.length || 0,
          anchor_count: path?.anchorDistancesKm?.length || 0,
          maximum_deviation_m: path?.maximumDeviationM || 0,
          linear_position: linear,
          curved_position: curved,
          gap_km: Number.isFinite(gapKm) ? gapKm : null,
          motion_source: path?.source === "cd.route-motion-set.v1"
            ? "formal_route_motion"
            : (researchRouteSmoothingEnabled && viewMode === "research" && path
              ? "research_sidecar"
              : "timeline_fallback"),
          formal_motion_inspection: inspectFormalRouteMotion(active),
          research_smoothing_enabled: researchRouteSmoothingEnabled,
          research_smoothing_inspection: inspectResearchRouteSmoothing(active),
          route_polyline_visible: layers.routePolyline,
        };
      },
      transitionState: () => {
        const current = stateAt(simMs);
        return {
          pending_alpha: pendingRouteAlpha(current),
          adoption_pulse: adoptionPulse(current),
        };
      },
      riskSummary: () => stateAt(simMs).risk?.summary || null,
      routeDecision: () => {
        const current = stateAt(simMs);
        return {
          active_revision: current.active,
          pending_revision: current.pendingRevision,
          pending_status: current.pendingStatus,
          active_route: routeFor(current.active),
          candidate_count: routeCandidates().length,
        };
      },
      researchPresentation: () => ({
        available: Boolean(candidateInspection?.valid),
        reason: candidateInspection?.reason || null,
        view_mode: viewMode,
        route_smoothing_research_enabled: researchRouteSmoothingEnabled,
        route_smoothing_research: inspectResearchRouteSmoothing(
          routeFor(activeRevisionAt(simMs))
        ),
        selected_layer: selectedRouteLayer,
        highlighted_candidate_id: highlightedCandidateId,
        canonical_selected_candidate_id: bundle?.route_candidates?.selected_candidate_id || null,
        candidates: candidatesForLayer(),
        metadata: Object.fromEntries(experimentMetadataRows()),
      }),
      formalRouteMotion: () => inspectFormalRouteMotion(
        routeFor(activeRevisionAt(simMs))
      ),
      identitySafety: () => ({ ...combinedIdentityInspection }),
      riskExplanation: () => ({
        valid: Boolean(riskExplanationInspection?.valid),
        mode: riskExplanationInspection?.mode || "missing",
        reason: riskExplanationInspection?.reason || null,
        publication_status: riskExplanationInspection?.publication_status || "UNAVAILABLE",
        selected_cell: selectedRiskCell ? { ...selectedRiskCell } : null,
      }),
      inspectRiskExplanation: (value) => riskExplanationTools.inspect(value, bundle),
      setRiskExplanationSidecar: (value) => {
        riskExplanationInspection = riskExplanationTools.inspect(value, bundle);
        riskExplanationRevision += 1;
        renderRiskExplanation(stateAt(simMs));
        return {
          valid: riskExplanationInspection.valid,
          mode: riskExplanationInspection.mode,
          reason: riskExplanationInspection.reason,
          publication_status: riskExplanationInspection.publication_status,
        };
      },
      selectRiskCell: (row, column) => {
        const frame = riskAt(simMs);
        if (!riskCellSnapshot(frame, Number(row), Number(column))) return false;
        selectedRiskCell = { row: Number(row), column: Number(column) };
        renderRiskExplanation(stateAt(simMs));
        return true;
      },
      inspectRouteCandidates: (value, scenarioId = null) => candidateTools.inspect(value, scenarioId),
      setViewMode: (value) => {
        if (!["research", "presentation", "engineering"].includes(value)) return;
        if (value === "research" && !candidateInspection?.valid) return;
        viewMode = value;
        if (viewMode !== "engineering") previousNonEngineeringMode = viewMode;
        updateModeUi();
        draw();
      },
      setResearchRouteSmoothing: (value) => {
        researchRouteSmoothingEnabled = Boolean(value);
        researchRouteMotionCache = new WeakMap();
        updateResearchRouteSmoothingUi();
        draw();
        return {
          enabled: researchRouteSmoothingEnabled,
          inspection: inspectResearchRouteSmoothing(
            routeFor(activeRevisionAt(simMs))
          ),
        };
      },
      setRouteLayer: (value) => {
        if (!ROUTE_LAYERS.includes(value) || !candidateInspection?.valid) return;
        selectedRouteLayer = value;
        routeLayerSel.value = value;
        highlightedCandidateId = defaultCandidateForLayer(value)?.candidate_id || null;
        updateResearchPanel();
        draw();
      },
      highlightCandidate: (candidateId) => {
        const candidate = candidatesForLayer().find((item) => item.candidate_id === candidateId);
        if (!candidate) return;
        highlightedCandidateId = candidate.candidate_id;
        updateResearchPanel();
        draw();
      },
      routeEvolution: () => (bundle.events || [])
        .filter((event) => ["REPLAN_DECIDED", "REPLAN_ADOPTED"].includes(event.type))
        .map((event) => ({
          type: event.type,
          revision: Number(event.rev),
          time: event.t,
        })),
      navigationAids: () => ({
        enabled: layers.navigation,
        projection: basemap?.projection,
        bbox: basemap?.bbox,
      }),
      mapView: () => ({
        mode: mapMode,
        zoom: mapZoom,
        pan_x: mapPanX,
        pan_y: mapPanY,
        follow: mapMode === "follow",
      }),
      setMapMode: (value) => setMapMode(value),
      setMapZoom: (value) => {
        const next = Number(value);
        if (!Number.isFinite(next)) return;
        mapZoom = clamp(next, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
        clampMapPan();
        draw();
      },
      resetMapView: () => resetMapView(),
      setSimulationMs: (value) => {
        seekSimulationTo(Number(value));
      },
      voyageProgress: () => ({
        available: Boolean(voyageProgress),
        current_km: voyageDistanceAt(simMs),
        total_km: voyageProgress?.totalKm ?? null,
        simulation_time: formatAbsolute(startMs + simMs),
      }),
    };
    requestAnimationFrame(frame);
  }

  start().catch((error) => {
    document.getElementById("hover-info").textContent = `viewer error: ${error}`;
    console.error(error);
  });
})();

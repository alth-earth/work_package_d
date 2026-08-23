/* Replay-driven Viewer. Rendering consumes only the presentation bundle. */
(() => {
  "use strict";

  const canvas = document.getElementById("map");
  const ctx = canvas.getContext("2d");
  const playBtn = document.getElementById("play");
  const scrub = document.getElementById("scrub");
  const speedSel = document.getElementById("speed");
  const clockEl = document.getElementById("clock");
  const rangeLabel = document.getElementById("range-label");
  const debugEl = document.getElementById("debug");
  const debugPanel = document.getElementById("debug-panel");
  const toggleDebugBtn = document.getElementById("toggle-debug");
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
  const eventTimelineEl = document.getElementById("event-timeline");
  const routeStatusEl = document.getElementById("route-status");
  const routeDecisionStatusEl = document.getElementById("route-decision-status");
  const routeDecisionMetricsEl = document.getElementById("route-decision-metrics");
  const routeDecisionTraceEl = document.getElementById("route-decision-trace");
  const routeCandidateNoteEl = document.getElementById("route-candidate-note");
  const routeCandidatesEl = document.getElementById("route-candidates");
  const layerRisk = document.getElementById("layer-risk");
  const layerHard = document.getElementById("layer-hard");
  const layerRoutes = document.getElementById("layer-routes");
  const layerTrack = document.getElementById("layer-track");
  const layerNavigation = document.getElementById("layer-navigation");
  const gateBadges = document.querySelector(".badges");

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
  let presentationMode = true;
  let lastRiskSummaryKey = null;
  let lastRouteDecisionKey = null;
  const layers = { risk: true, hard: true, routes: true, track: true, navigation: true };
  const TRAIL_WINDOW_MS = 2 * 60 * 60 * 1000;
  const PENDING_FADE_MS = 30 * 60 * 1000;
  const ADOPTION_PULSE_MS = 60 * 60 * 1000;

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
    if (!Number.isFinite(seconds)) return "unavailable";
    const sign = seconds >= 0 ? "+" : "-";
    const absolute = Math.abs(Math.round(seconds));
    const hours = Math.floor(absolute / 3600);
    const minutes = Math.floor((absolute % 3600) / 60);
    return `${sign}${hours}h${String(minutes).padStart(2, "0")}m`;
  }

  function horizonLabel(key) {
    return key === "current" ? "Current" : key;
  }

  function setDefinitionRows(element, rows) {
    if (!element) return;
    element.replaceChildren();
    for (const [label, value] of rows) {
      const term = document.createElement("dt");
      term.textContent = label;
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

  function formatScore(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(3) : "not published";
  }

  function formatDistance(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(1)} km` : "not published";
  }

  function formatMetric(value) {
    if (value === null || value === undefined || value === "") return "not published";
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(3) : String(value);
  }

  function routeCandidates() {
    const value = bundle?.route_candidates;
    if (Array.isArray(value)) return value;
    return Array.isArray(value?.candidates) ? value.candidates : [];
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
    return new Date(value).toISOString().slice(11, 16);
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
      label.textContent = index % 2 === 0 || index === frames.length - 1
        ? riskHourLabel(frame.valid_time)
        : "";
      tick.append(mean, maximum, label);
      riskTimelineEl.append(tick);
    }
    if (riskProfileWindowEl) {
      const grid = bundle.risk?.grid;
      const gridText = grid ? ` · grid ${grid.rows}×${grid.cols}` : "";
      riskProfileWindowEl.textContent =
        `Formal forecast window: ${forecastWindowText()} · ${frames.length} hourly frames${gridText}`;
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
      label: "Departure · initial route",
    });
    const riskUpdate = events.find((event) => event.type === "RISK_CONTENT_UPDATED");
    if (riskUpdate) {
      milestones.push({
        event: riskUpdate,
        time: riskUpdate.t,
        label: "Risk assessment updated",
      });
    }
    // Keep every real route revision visible in a long replay. ROUTE_CHANGED
    // is emitted beside REPLAN_ADOPTED and would duplicate the same adoption.
    for (const event of events) {
      if (event.type === "REPLAN_DECIDED") {
        milestones.push({
          event,
          time: event.t,
          label: `R${event.rev} pending · active route remains authoritative`,
        });
      } else if (event.type === "REPLAN_ADOPTED") {
        milestones.push({
          event,
          time: event.t,
          label: `R${event.rev} adopted · authoritative route updated`,
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
      const content = document.createElement("div");
      const label = document.createElement("span");
      label.textContent = milestone.label;
      const clock = document.createElement("span");
      clock.className = "event-time";
      clock.textContent = formatAbsolute(isoToMs(time));
      content.append(label, clock);
      item.append(content);
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
        `${horizonLabel(selectedHorizon)} · Risk Forecast unavailable for this simulation time`;
      riskProfileStatusEl.classList.add("unavailable");
      return;
    }
    riskProfileStatusEl.classList.remove("unavailable");
    const hardCounts = summary.hard_reason_counts || {};
    const navigable = hardCounts.NONE || 0;
    const levelOne = summary.risk_level_counts?.["1"] || 0;
    riskProfileStatusEl.textContent =
      `${horizonLabel(selectedHorizon)} · mean ${Number(summary.risk_score_mean).toFixed(3)} ` +
      `· max ${Number(summary.risk_score_max).toFixed(3)} · water ${levelOne}/${navigable} at L1`;
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
        `${horizonLabel(selectedHorizon)} · Risk Summary unavailable for this frame`;
      setDefinitionRows(riskSummaryMetricsEl, []);
      setSummaryItems(riskSummaryHazardsEl, []);
      if (riskSummaryNoteEl) {
        riskSummaryNoteEl.textContent =
          "No stale frame is used; choose an available forecast horizon to inspect its published summary.";
      }
      return;
    }

    riskSummaryStatusEl.classList.remove("unavailable");
    riskSummaryStatusEl.textContent =
      `${horizonLabel(selectedHorizon)} · formal frame ${selection.actual_valid_time}`;
    const forecast = bundle.risk?.forecast_summary || {};
    const trend = forecast.trend || "not published";
    setDefinitionRows(riskSummaryMetricsEl, [
      ["mean score", formatScore(summary.risk_score_mean)],
      ["maximum score", formatScore(summary.risk_score_max)],
      ["forecast trend", trend],
      ["published cells", String(summary.total_cells ?? "not published")],
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
      `LAND cells · ${landCount}`,
      `DATA_UNAVAILABLE cells · ${unavailableCount}`,
      `Hard cells total · ${hardCellCount}`,
    ]);
    if (riskSummaryNoteEl) {
      riskSummaryNoteEl.textContent =
        "Level 1 on published NONE water cells is a low-risk assessment; hard reasons remain separate and fail closed.";
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
      item.classList.toggle("is-past", s.time >= eventMs);
      item.classList.toggle("is-current", s.time >= eventMs && s.time < nextMs);
    }
  }

  function project(lon, lat) {
    const b = basemap.bbox;
    const x = ((lon - b.min_lon) / (b.max_lon - b.min_lon)) * canvas.width;
    const y = ((b.max_lat - lat) / (b.max_lat - b.min_lat)) * canvas.height;
    return { x, y };
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

  function formatCoordinate(value, axis) {
    const absolute = Math.abs(value);
    const digits = absolute < 10 ? 1 : 0;
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
      ctx.fillText(formatCoordinate(lon, "longitude"), top.x + 4, canvas.height - 10);
    }

    const firstLat = Math.ceil(bounds.min_lat / latStep) * latStep;
    for (let lat = firstLat; lat < bounds.max_lat; lat += latStep) {
      const left = project(bounds.min_lon, lat);
      ctx.beginPath();
      ctx.moveTo(0, left.y);
      ctx.lineTo(canvas.width, left.y);
      ctx.stroke();
      ctx.fillText(formatCoordinate(lat, "latitude"), 6, left.y - 8);
    }
    ctx.setLineDash([]);

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
  // segment. It improves anti-aliasing/line joins without bending the route or
  // changing ETA, ship physics, or hard-cell semantics.
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

  // Vessel geometry remains the existing backend/timeline linear ETA
  // interpolation contract. Presentation-only consumers (trail and icon
  // wake) call this helper; none of them invent a screen-space velocity.
  function vesselPointAt(ms) {
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
        points.push({ lon: bundle.timeline[index].v.lon, lat: bundle.timeline[index].v.lat });
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
    const track = previousTimelineValue(i, "track") || [];
    const pending = previousTimelineValue(i, "pending");
    const superseded = previousTimelineValue(i, "superseded");
    const riskSelection = riskSelectionAt(ms);
    const vessel = vesselPointAt(ms);
    return {
      time: startMs + ms,
      lon: vessel.lon,
      lat: vessel.lat,
      kn: lerp(a.v.kn ?? 0, b.v.kn ?? 0),
      status: a.v.status,
      edge: lerp(a.v.ep ?? 0, b.v.ep ?? 0),
      edgeIndex: a.v.eidx,
      active: a.arv,
      pendingRevision: a.prv,
      pendingStatus: a.prs,
      decisionTime: a.dt,
      effectiveAdoption: a.eat,
      segment: a.seg,
      track: track.slice(0, a.ctl),
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
      return `Active route R${s.active}${pending}`;
    }
    if (adoptionPulse(s) > 0.01) return "New route adopted · authoritative route updated";
    if (hasPending) return "New route pending · current route remains authoritative";
    return "Authoritative route active";
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
      routeDecisionStatusEl.textContent = "Route decision metadata unavailable";
      setDefinitionRows(routeDecisionMetricsEl, []);
      if (routeDecisionTraceEl) routeDecisionTraceEl.textContent = "";
      if (routeCandidateNoteEl) routeCandidateNoteEl.textContent = "";
      if (routeCandidatesEl) routeCandidatesEl.hidden = true;
      return;
    }

    routeDecisionStatusEl.classList.remove("unavailable");
    if (adopted && Number(adopted.rev) === Number(active.revision) && adoptionPulse(s) > 0.01) {
      const next = pending ? `; R${pending.revision} is now pending` : "";
      routeDecisionStatusEl.textContent =
        `REPLAN_ADOPTED · R${active.revision} is now authoritative${next}`;
    } else if (pending) {
      routeDecisionStatusEl.textContent =
        `REPLAN_DECIDED · R${pending.revision} pending; R${active.revision} remains authoritative`;
    } else if (adopted && Number(adopted.rev) === Number(active.revision)) {
      routeDecisionStatusEl.textContent =
        `REPLAN_ADOPTED · R${active.revision} is now authoritative`;
    } else if (Number(active.revision) === 1) {
      routeDecisionStatusEl.textContent =
        `Initial route generated · R${active.revision} is authoritative`;
    } else {
      routeDecisionStatusEl.textContent =
        `Authoritative route R${active.revision} is active`;
    }

    const activeMetrics = active.metrics || {};
    const rows = [
      ["active revision", `R${active.revision} · authoritative`],
      ["route role", "authoritative"],
      ["distance", formatDistance(active.distance_km)],
      ["arrival ETA", routeArrivalEta(active)],
      ["average risk", formatMetric(activeMetrics.average_risk ?? active.average_risk)],
      ["maximum risk", formatMetric(activeMetrics.maximum_risk ?? active.maximum_risk)],
    ];
    if (pending) {
      rows.push(
        ["pending revision", `R${pending.revision}`],
        ["pending distance", formatDistance(pending.distance_km)],
        ["pending adoption", pending.effective_adoption_time || "not published"],
      );
    }
    setDefinitionRows(routeDecisionMetricsEl, rows);

    const traceEvents = [decided, adopted]
      .filter(Boolean)
      .sort((left, right) => bundle.events.indexOf(left) - bundle.events.indexOf(right));
    const trace = traceEvents.map((event) => `${event.type} R${event.rev} @ ${event.t}`);
    if (routeDecisionTraceEl) {
      routeDecisionTraceEl.textContent = trace.length
        ? `Event trace: ${trace.join(" → ")}`
        : "Event trace: departure → initial route generated";
    }

    const candidates = routeCandidates();
    if (!candidates.length) {
      if (routeCandidateNoteEl) {
        routeCandidateNoteEl.textContent =
          "Candidate comparison is not published in this bundle; the Viewer keeps the authoritative route only.";
      }
      if (routeCandidatesEl) {
        routeCandidatesEl.replaceChildren();
        routeCandidatesEl.hidden = true;
      }
      return;
    }
    if (routeCandidateNoteEl) {
      routeCandidateNoteEl.textContent = `Published route candidates · ${candidates.length}`;
    }
    if (routeCandidatesEl) {
      routeCandidatesEl.replaceChildren();
      const selectedCandidateId = bundle?.route_candidates?.selected_candidate_id;
      for (const candidate of candidates) {
        const selected = candidate.candidate_id === selectedCandidateId;
        const label = candidate.label ||
          `${candidate.layer || "route"} / ${candidate.objective || "candidate"}`;
        const metrics = [
          formatDistance(candidate.distance_km ?? candidate.metrics?.distance_km),
          `ETA ${candidate.arrival_eta || candidate.eta || "not published"}`,
          `avg risk ${formatMetric(candidate.average_risk ?? candidate.metrics?.average_risk ?? candidate.risk_metrics?.average_risk)}`,
          `max risk ${formatMetric(candidate.maximum_risk ?? candidate.metrics?.maximum_risk ?? candidate.risk_metrics?.maximum_risk)}`,
        ];
        const item = document.createElement("li");
        item.textContent = `${selected ? "Recommended · " : ""}${label} · ${metrics.join(" · ")}`;
        item.dataset.selected = selected ? "true" : "false";
        routeCandidatesEl.append(item);
      }
      routeCandidatesEl.hidden = false;
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

  function drawPath(points, color, width, dash, filterFutureMs = null, alpha = 1) {
    const visible = filterFutureMs === null ? points : points.filter(
      (point) => !point.eta || isoToMs(point.eta) - startMs >= filterFutureMs
    );
    if (visible.length < 2) return;
    const rendered = densifyPoints(visible);
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

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (image) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const s = stateAt(simMs);
    drawRiskFrame(s.risk);
    drawNavigationAids();
    const pos = project(s.lon, s.lat);

    if (layers.track && s.trail.length > 1) {
      drawPath(s.trail, "#d7e6ed", 2.2, [], null, presentationMode ? 0.72 : 0.45);
    }

    if (layers.routes && s.supersededRoute && s.supersededRoute.length > 1) {
      drawPath(s.supersededRoute, "rgba(125,137,146,0.88)", 2, [3, 8], simMs);
    }

    const active = routeFor(s.active);
    if (layers.routes && active) {
      const future = active.waypoints.filter(
        (waypoint) => isoToMs(waypoint.eta) - startMs >= simMs
      );
      if (future.length) {
        const pulse = adoptionPulse(s);
        drawPath(
          [{ lon: s.lon, lat: s.lat, eta: formatAbsolute(s.time) }, ...future],
          "#49a9ed",
          3.5 + pulse * 0.9,
          [],
          null,
          0.88 + pulse * 0.12
        );
      }
    }

    if (layers.track && s.track.length > 1) {
      drawPath(s.track, "#5cc47a", 3, []);
    }

    if (layers.routes && s.pendingRoute && s.pendingRoute.route && s.pendingRoute.revision !== s.active) {
      drawPath(s.pendingRoute.route, "#f2b134", 2.5, [8, 6], null, pendingRouteAlpha(s));
    }

    if (layers.routes && s.segment && s.segment.start_eta && s.segment.end_eta && active) {
      const seg = active.waypoints.filter(
        (waypoint) => isoToMs(waypoint.eta) >= isoToMs(s.segment.start_eta)
      );
      if (seg.length >= 2) {
        drawPath(seg.slice(0, 2), "rgba(255,255,255,0.85)", 1.5, []);
      }
    }

    const heading = shipHeading(s, active);
    // This phase is derived from simulation time, so playback speed changes
    // the visual cadence and no independent CSS/timer animation is created.
    const motionPhase = Math.sin((simMs / 1000) * Math.PI * 2 / 180);
    drawShipIcon(pos, heading, motionPhase);
    updateDebug(s, heading);
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
      ["view mode", presentationMode ? "Presentation" : "Engineering Debug"],
      ["simulation_time", formatAbsolute(s.time)],
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
      riskStatusEl.textContent = `${horizonLabel(selectedHorizon)} · Risk Forecast unavailable`;
      riskHorizonStatusEl.textContent = selection
        ? `${horizonLabel(selectedHorizon)} → Risk Forecast unavailable. ` +
          `Available forecast window: ${forecastWindowText()}. (${selection.reason})`
        : `Risk Forecast unavailable. Available forecast window: ${forecastWindowText()}.`;
    } else {
      riskStatusEl.classList.remove("unavailable");
      const actual = formatHorizonSeconds(selection.actual_horizon_seconds);
      riskStatusEl.textContent = `${horizonLabel(selectedHorizon)} · ${selection.actual_valid_time} · ${actual}`;
      riskHorizonStatusEl.textContent =
        `${horizonLabel(selectedHorizon)} → requested ${selection.requested_valid_time}; ` +
        `actual ${selection.actual_valid_time} (${actual}), ${selection.selection_method}`;
    }
    updateRiskTimeline(s);
    updateRiskSummary(s);
    updateRouteDecision(s);
    updateEventTimeline(s);
  }

  function frame(ts) {
    if (lastTs !== null && playing) {
      const delta = (ts - lastTs) / 1000;
      simMs += delta * scale * 1000;
      if (simMs >= totalMs) {
        simMs = totalMs;
        playing = false;
        playBtn.textContent = "Play";
      }
    }
    lastTs = ts;
    scrub.value = Math.round(simMs);
    clockEl.textContent = formatClock(simMs);
    draw();
    requestAnimationFrame(frame);
  }

  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "Pause" : "Play";
    lastTs = null;
  });

  scrub.addEventListener("input", () => {
    simMs = Number(scrub.value);
    playing = false;
    playBtn.textContent = "Play";
    clockEl.textContent = formatClock(simMs);
    draw();
  });

  speedSel.addEventListener("change", () => {
    scale = Number(speedSel.value);
  });

  toggleDebugBtn.addEventListener("click", () => {
    presentationMode = !presentationMode;
    updateModeUi();
    draw();
  });

  riskHorizonSel.addEventListener("change", () => {
    selectedHorizon = riskHorizonSel.value;
    draw();
  });

  function updateModeUi() {
    debugPanel.hidden = presentationMode;
    if (gateBadges) gateBadges.hidden = presentationMode;
    toggleDebugBtn.textContent = presentationMode ? "Engineering Debug" : "Presentation Mode";
    document.body.dataset.mode = presentationMode ? "presentation" : "engineering";
  }

  [[layerRisk, "risk"], [layerHard, "hard"], [layerRoutes, "routes"],
    [layerTrack, "track"], [layerNavigation, "navigation"]]
    .forEach(([control, key]) => {
      control.addEventListener("change", () => {
        layers[key] = control.checked;
        draw();
      });
    });

  async function start() {
    bundle = window.VIEWER_BUNDLE || (await (await fetch("bundle.json")).json());
    basemap = bundle.basemap;
    startMs = isoToMs(bundle.replay.start);
    const end = isoToMs(bundle.replay.end);
    totalMs = end - startMs;
    simMs = 0;
    riskHorizonSel.value = selectedHorizon;
    scrub.max = String(totalMs);
    rangeLabel.textContent = `${bundle.replay.start} -> ${bundle.replay.end}`;
    document.getElementById("mode-badge").textContent = bundle.replay.scenario_mode;
    updateModeUi();
    buildRiskTimeline();
    buildEventTimeline();
    document.getElementById("gate-l1").textContent = `L1 ${bundle.gates.status}`;
    document.getElementById("gate-l2").textContent = `L2 ${bundle.gates.l2_status}`;
    document.getElementById("gate-loop").textContent =
      `preflight ${bundle.gates.status} / ${bundle.gates.l2_status || "not-run"}`;
    if (basemap) {
      canvas.width = basemap.width;
      canvas.height = basemap.height;
      image = new Image();
      image.onload = () => draw();
      image.src = window.VIEWER_BASEMAP || "gebco_basemap.png";
    }
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
      setSimulationMs: (value) => {
        simMs = Math.max(0, Math.min(totalMs, Number(value)));
        playing = false;
        playBtn.textContent = "Play";
        scrub.value = Math.round(simMs);
        clockEl.textContent = formatClock(simMs);
        draw();
      },
    };
    document.body.dataset.mode = "presentation";
    requestAnimationFrame(frame);
  }

  start().catch((error) => {
    document.getElementById("hover-info").textContent = `viewer error: ${error}`;
    console.error(error);
  });
})();

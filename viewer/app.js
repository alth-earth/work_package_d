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
  const layerRisk = document.getElementById("layer-risk");
  const layerHard = document.getElementById("layer-hard");
  const layerRoutes = document.getElementById("layer-routes");
  const layerTrack = document.getElementById("layer-track");

  let bundle = null;
  let basemap = null;
  let image = null;
  let startMs = 0;
  let totalMs = 0;
  let simMs = 0;
  let playing = true;
  let lastTs = null;
  let scale = 60;
  let selectedHorizon = "current";
  let presentationMode = true;
  const layers = { risk: true, hard: true, routes: true, track: true };

  const RISK_COLORS = {
    1: "#55c878",
    2: "#65b8df",
    3: "#f2c14e",
    4: "#ef8b3a",
    5: "#e35d6a",
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

  function project(lon, lat) {
    const b = basemap.bbox;
    const x = ((lon - b.min_lon) / (b.max_lon - b.min_lon)) * canvas.width;
    const y = ((b.max_lat - lat) / (b.max_lat - b.min_lat)) * canvas.height;
    return { x, y };
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
    return {
      time: startMs + ms,
      lon: lerp(a.v.lon, b.v.lon),
      lat: lerp(a.v.lat, b.v.lat),
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
    ctx.save();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const reason = frame.hard_reasons[index] || "DATA_UNAVAILABLE";
        const level = Number(frame.risk_levels[index] || 0);
        const nw = project(lons[col] - lonStep / 2, lats[row] + latStep / 2);
        const se = project(lons[col] + lonStep / 2, lats[row] - latStep / 2);
        const x = Math.min(nw.x, se.x);
        const y = Math.min(nw.y, se.y);
        const width = Math.abs(se.x - nw.x) + 1;
        const height = Math.abs(se.y - nw.y) + 1;
        if (reason === "NONE" && layers.risk && RISK_COLORS[level]) {
          ctx.fillStyle = RISK_COLORS[level];
          ctx.globalAlpha = 0.34;
          ctx.fillRect(x, y, width, height);
        } else if (reason !== "NONE" && layers.hard) {
          const color = reason === "LAND" ? "#263746" :
            reason === "DATA_UNAVAILABLE" ? "#8a63d2" : "#b54f70";
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.45;
          ctx.fillRect(x, y, width, height);
          ctx.globalAlpha = 0.72;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(x, y, width, height);
          ctx.setLineDash([]);
        }
      }
    }
    ctx.restore();
  }

  function drawPath(points, color, width, dash, filterFutureMs = null) {
    const visible = filterFutureMs === null ? points : points.filter(
      (point) => !point.eta || isoToMs(point.eta) - startMs >= filterFutureMs
    );
    if (visible.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    visible.forEach((point, index) => {
      const geo = project(point.lon ?? point.longitude, point.lat ?? point.latitude);
      if (index === 0) ctx.moveTo(geo.x, geo.y);
      else ctx.lineTo(geo.x, geo.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (image) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const s = stateAt(simMs);
    drawRiskFrame(s.risk);
    const pos = project(s.lon, s.lat);

    if (layers.routes && s.supersededRoute && s.supersededRoute.length > 1) {
      drawPath(s.supersededRoute, "rgba(125,137,146,0.88)", 2, [3, 8], simMs);
    }

    const active = routeFor(s.active);
    if (layers.routes && active) {
      const future = active.waypoints.filter(
        (waypoint) => isoToMs(waypoint.eta) - startMs >= simMs
      );
      if (future.length) {
        ctx.strokeStyle = "#3d9be9";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        future.forEach((waypoint) => {
          const geo = project(waypoint.lon, waypoint.lat);
          ctx.lineTo(geo.x, geo.y);
        });
        ctx.stroke();
      }
    }

    if (layers.track && s.track.length > 1) {
      drawPath(s.track, "#5cc47a", 3, []);
    }

    if (layers.routes && s.pendingRoute && s.pendingRoute.route && s.pendingRoute.revision !== s.active) {
      drawPath(s.pendingRoute.route, "#f2b134", 2.5, [8, 6]);
    }

    if (layers.routes && s.segment && s.segment.start_eta && s.segment.end_eta && active) {
      const seg = active.waypoints.filter(
        (waypoint) => isoToMs(waypoint.eta) >= isoToMs(s.segment.start_eta)
      );
      if (seg.length >= 2) {
        drawPath(seg.slice(0, 2), "rgba(255,255,255,0.85)", 1.5, []);
      }
    }

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0f2b3b";
    ctx.stroke();
    updateDebug(s);
  }

  function updateDebug(s) {
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
      ["edge_progress", (s.edge ?? 0).toFixed(4)],
      ["active_plan_revision", s.active],
      ["pending_plan_revision", s.pendingRevision ?? "null"],
      ["pending_plan_status", s.pendingStatus ?? "none"],
      ["decision_time", s.decisionTime ?? "null"],
      ["effective_adoption_time", s.effectiveAdoption ?? "null"],
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
    if (!selection || selection.availability !== "AVAILABLE") {
      riskStatusEl.textContent = `${horizonLabel(selectedHorizon)} unavailable`;
      riskHorizonStatusEl.textContent = selection
        ? `${horizonLabel(selectedHorizon)} → ${selection.requested_valid_time}: unavailable (${selection.reason})`
        : "risk horizon unavailable";
    } else {
      const actual = formatHorizonSeconds(selection.actual_horizon_seconds);
      riskStatusEl.textContent = `${horizonLabel(selectedHorizon)} · ${selection.actual_valid_time} · ${actual}`;
      riskHorizonStatusEl.textContent =
        `${horizonLabel(selectedHorizon)} → requested ${selection.requested_valid_time}; ` +
        `actual ${selection.actual_valid_time} (${actual}), ${selection.selection_method}`;
    }
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
    debugPanel.hidden = presentationMode;
    toggleDebugBtn.textContent = presentationMode ? "Engineering Debug" : "Presentation Mode";
    draw();
  });

  riskHorizonSel.addEventListener("change", () => {
    selectedHorizon = riskHorizonSel.value;
    draw();
  });

  [[layerRisk, "risk"], [layerHard, "hard"], [layerRoutes, "routes"], [layerTrack, "track"]]
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
    scrub.max = String(totalMs);
    rangeLabel.textContent = `${bundle.replay.start} -> ${bundle.replay.end}`;
    document.getElementById("mode-badge").textContent = bundle.replay.scenario_mode;
    debugPanel.hidden = true;
    toggleDebugBtn.textContent = "Engineering Debug";
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
      setSimulationMs: (value) => {
        simMs = Math.max(0, Math.min(totalMs, Number(value)));
        playing = false;
        playBtn.textContent = "Play";
        scrub.value = Math.round(simMs);
        clockEl.textContent = formatClock(simMs);
        draw();
      },
    };
    requestAnimationFrame(frame);
  }

  start().catch((error) => {
    document.getElementById("hover-info").textContent = `viewer error: ${error}`;
    console.error(error);
  });
})();

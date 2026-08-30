/* Explicit research-only motion sidecar reader.
 *
 * The normal Viewer path remains route_smoothing.js + the published timeline.
 * This helper is used only after the operator explicitly enables the bundled
 * C research sidecar. Invalid qualification evidence, identity, status,
 * coordinates, or ETA ordering returns null so app.js can fall back to the
 * existing timeline motion. The exporter is authoritative for canonical
 * digest verification; this browser consumer checks that the verified digest
 * is present rather than reimplementing cryptography in the Viewer.
 */
(() => {
  "use strict";

  const SCHEMA_VERSION = "c.research-route-smoothing-sidecar.v1";
  const finite = (value) => typeof value === "number" && Number.isFinite(value);

  function coordinateOf(value) {
    if (!value || typeof value !== "object") return null;
    const lon = Number(value.lon ?? value.longitude);
    const lat = Number(value.lat ?? value.latitude);
    if (!finite(lon) || !finite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return null;
    }
    return { lon, lat };
  }

  function etaMs(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function sameRoute(route, sidecar) {
    const authoritative = sidecar.authoritative_route;
    if (!authoritative || typeof authoritative !== "object") return false;
    if (authoritative.route_digest !== sidecar.raw_route_digest) return false;
    const routeId = route.route_id ?? route.plan_id ?? route.id ?? null;
    if (sidecar.route_id !== null && sidecar.route_id !== undefined &&
        routeId !== null && sidecar.route_id !== routeId) return false;
    const waypoints = route.waypoints;
    const source = authoritative.waypoints;
    if (!Array.isArray(waypoints) || !Array.isArray(source) || waypoints.length !== source.length) {
      return false;
    }
    return waypoints.every((waypoint, index) => {
      const a = coordinateOf(waypoint);
      const b = coordinateOf(source[index]);
      const aEta = etaMs(waypoint.eta);
      const bEta = etaMs(source[index].eta);
      return a && b && a.lon === b.lon && a.lat === b.lat &&
        Number.isFinite(aEta) && aEta === bEta;
    });
  }

  function inspect(sidecar, route) {
    if (!sidecar || typeof sidecar !== "object") return { valid: false, reason: "missing_sidecar" };
    if (sidecar.schema_version !== SCHEMA_VERSION) {
      return { valid: false, reason: "unsupported_sidecar_schema" };
    }
    if (sidecar.research_only !== true || sidecar.status !== "ACCEPTED" ||
        sidecar.applied !== true) {
      return { valid: false, reason: sidecar.fallback_reason || "sidecar_not_accepted" };
    }
    if (sidecar.research_eligible !== true) {
      return { valid: false, reason: "research_gate_not_passed" };
    }
    const validation = sidecar.validation;
    if (!validation || typeof validation !== "object" ||
        validation.research_gate_passed !== true) {
      return { valid: false, reason: "research_gate_not_passed" };
    }
    const requiredEvidence = [
      "risk_rechecked",
      "hard_mask_rechecked",
      "coverage_complete",
      "eta_recomputed",
      "speed_checked",
    ];
    if (requiredEvidence.some((name) => validation[name] !== true)) {
      return { valid: false, reason: "research_gate_incomplete" };
    }
    if (typeof sidecar.sidecar_digest !== "string" ||
        !/^[0-9a-f]{64}$/i.test(sidecar.sidecar_digest)) {
      return { valid: false, reason: "missing_sidecar_digest" };
    }
    const routeRevision = route?.revision;
    if (sidecar.plan_revision !== null && sidecar.plan_revision !== undefined &&
        routeRevision !== null && routeRevision !== undefined &&
        sidecar.plan_revision !== routeRevision) {
      return { valid: false, reason: "plan_revision_mismatch" };
    }
    const routeAdoption = route?.effective_adoption_time;
    if (sidecar.adoption_time && routeAdoption) {
      const sidecarAdoptionMs = etaMs(sidecar.adoption_time);
      const routeAdoptionMs = etaMs(routeAdoption);
      if (sidecarAdoptionMs === null || routeAdoptionMs === null ||
          sidecarAdoptionMs !== routeAdoptionMs) {
        return { valid: false, reason: "adoption_time_mismatch" };
      }
    }
    if (!sameRoute(route, sidecar)) {
      return { valid: false, reason: "authoritative_route_mismatch" };
    }
    const values = sidecar.motion_samples;
    if (!Array.isArray(values) || values.length < 2) {
      return { valid: false, reason: "missing_motion_samples" };
    }
    const samples = values.map((value) => {
      const point = coordinateOf(value);
      const eta = etaMs(value?.eta);
      return point && Number.isFinite(eta) ? { ...point, eta } : null;
    });
    if (samples.some((sample) => sample === null)) {
      return { valid: false, reason: "invalid_motion_sample" };
    }
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index].eta <= samples[index - 1].eta) {
        return { valid: false, reason: "non_monotonic_motion_sample_eta" };
      }
    }
    return { valid: true, reason: null, samples };
  }

  function haversineKm(a, b) {
    const radians = Math.PI / 180;
    const latA = a.lat * radians;
    const latB = b.lat * radians;
    const deltaLat = (b.lat - a.lat) * radians;
    const deltaLon = (b.lon - a.lon) * radians;
    const value = Math.sin(deltaLat / 2) ** 2 +
      Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
    return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(value)));
  }

  function buildPath(sidecar, route, startMs) {
    const inspection = inspect(sidecar, route);
    if (!inspection.valid) return null;
    const samples = inspection.samples;
    const points = samples.map(({lon, lat}) => ({ lon, lat }));
    const timesMs = samples.map((sample) => sample.eta - startMs);
    const distancesKm = [0];
    for (let index = 1; index < points.length; index += 1) {
      const distance = haversineKm(points[index - 1], points[index]);
      if (!finite(distance) || distance <= 1e-9) return null;
      distancesKm.push(distancesKm[index - 1] + distance);
    }
    const segmentValues = sidecar.geometry?.segments || [];
    const maximumDeviationM = segmentValues.reduce(
      (maximum, segment) => Math.max(maximum, Number(segment.maximum_deviation_m) || 0),
      0,
    );
    return Object.freeze({
      points,
      timesMs,
      distancesKm,
      anchorDistancesKm: distancesKm,
      smoothingApplied: true,
      maximumDeviationM,
      source: "c_research_route_smoothing_sidecar",
    });
  }

  window.ArcticRouteResearchMotion = Object.freeze({
    SCHEMA_VERSION,
    inspect,
    buildPath,
  });
})();

/* Strict consumer for C's formal cd.route-motion-set.v1 sibling artifact. */
(() => {
  "use strict";

  const SCHEMA_VERSION = "cd.route-motion-set.v1";
  const INTERPOLATION = "linear_time_between_producer_motion_samples";
  const LAYERS = Object.freeze([
    "full_voyage", "main_corridor_24_72h", "rolling_0_24h", "executable_0_6h",
  ]);
  const SHA256 = /^[0-9a-f]{64}$/;
  const verifiedSets = new WeakSet();
  const verifiedRecords = new WeakSet();
  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  const objectLike = (value) => value !== null && typeof value === "object" &&
    !Array.isArray(value);

  function invalid(reason, details = {}) {
    return { valid: false, usable: false, reason, ...details };
  }

  function exactFields(value, fields) {
    if (!objectLike(value)) return false;
    const actual = Object.keys(value).sort();
    const expected = [...fields].sort();
    return actual.length === expected.length && actual.every((name, index) =>
      name === expected[index]);
  }

  function canonicalDigest(value) {
    const helper = window.ArcticRouteResearchMotion?.canonicalDigest;
    return typeof helper === "function" ? helper(value) : null;
  }

  function canonicalCoordinateDigest(value) {
    const helper = window.ArcticRouteResearchMotion?.canonicalDigestAt;
    return typeof helper === "function" ? helper(value, "coordinates") : null;
  }

  function digest(value) {
    return typeof value === "string" && SHA256.test(value);
  }

  function coordinate(value) {
    if (!objectLike(value)) return null;
    const lon = Number(value.lon ?? value.longitude);
    const lat = Number(value.lat ?? value.latitude);
    return finite(lon) && finite(lat) && lon >= -180 && lon <= 180 &&
      lat >= -90 && lat <= 90 ? { lon, lat } : null;
  }

  function eta(value) {
    if (typeof value !== "string" || !value.endsWith("Z")) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function inspectRecord(record) {
    const fields = [
      "planning_layer", "plan_id", "raw_route_digest", "mode", "fallback_reason",
      "curve_digest", "motion_digest", "interpolation", "waypoint_anchors",
      "motion_samples", "qualification",
    ];
    if (!exactFields(record, fields)) return invalid("record_fields_differ_from_v1");
    if (!LAYERS.includes(record.planning_layer) ||
        !/^route-v3-sha256-[0-9a-f]{64}$/.test(record.plan_id) ||
        !digest(record.raw_route_digest) ||
        !digest(record.curve_digest) || !digest(record.motion_digest) ||
        record.interpolation !== INTERPOLATION) return invalid("record_identity_invalid");
    if (!Array.isArray(record.motion_samples) || record.motion_samples.length < 2 ||
        !Array.isArray(record.waypoint_anchors) || record.waypoint_anchors.length < 2) {
      return invalid("record_samples_or_anchors_missing");
    }
    const samples = record.motion_samples.map((sample) => {
      if (!exactFields(sample, ["lon", "lat", "eta", "course_degrees", "speed_knots"])) {
        return null;
      }
      const point = coordinate(sample);
      const time = eta(sample.eta);
      return point && Number.isFinite(time) && finite(sample.course_degrees) &&
        sample.course_degrees >= 0 && sample.course_degrees < 360 &&
        finite(sample.speed_knots) && sample.speed_knots >= 0
        ? {...point, eta: time, etaText: sample.eta,
          course_degrees: sample.course_degrees, speed_knots: sample.speed_knots}
        : null;
    });
    if (samples.some((sample) => sample === null)) return invalid("invalid_motion_sample");
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index].eta <= samples[index - 1].eta) {
        return invalid("non_monotonic_motion_eta");
      }
    }
    for (let index = 0; index < record.waypoint_anchors.length; index += 1) {
      const anchor = record.waypoint_anchors[index];
      if (!exactFields(anchor, ["waypoint_index", "eta", "motion_sample_index", "arc_length_m"]) ||
          anchor.waypoint_index !== index || !Number.isInteger(anchor.motion_sample_index) ||
          anchor.motion_sample_index < 0 || anchor.motion_sample_index >= samples.length ||
          !finite(anchor.arc_length_m) || anchor.arc_length_m < 0 ||
          samples[anchor.motion_sample_index].etaText !== anchor.eta) {
        return invalid("invalid_waypoint_anchor");
      }
      if (index > 0 && anchor.motion_sample_index <=
          record.waypoint_anchors[index - 1].motion_sample_index) {
        return invalid("non_monotonic_waypoint_anchor");
      }
    }
    if (!verifiedRecords.has(record) &&
        (canonicalCoordinateDigest(record.motion_samples.map(({lon, lat}) => [lon, lat])) !==
          record.curve_digest || canonicalDigest(record.motion_samples) !== record.motion_digest)) {
      return invalid("geometry_motion_digest_mismatch");
    }
    const qualification = record.qualification;
    const qualificationFields = [
      "result", "risk_rechecked", "hard_mask_rechecked", "coverage_complete",
      "eta_anchors_preserved", "speed_checked", "curvature_checked",
      "corridor_checked", "manoeuvring_checked", "corridor_proof_scope",
      "evidence_kind", "real_vessel_calibrated", "details_digest",
    ];
    if (!exactFields(qualification, qualificationFields) ||
        !digest(qualification.details_digest) || qualification.real_vessel_calibrated !== false ||
        qualification.evidence_kind !== "FORMULA_DERIVED_ENGINEERING_REFERENCE") {
      return invalid("qualification_invalid");
    }
    if (record.mode === "RAW_PASSTHROUGH") {
      return typeof record.fallback_reason === "string" &&
        qualification.result === "RAW_FALLBACK"
        ? {valid: true, usable: false, reason: record.fallback_reason, samples}
        : invalid("raw_fallback_invalid");
    }
    const gates = [
      "risk_rechecked", "hard_mask_rechecked", "coverage_complete",
      "eta_anchors_preserved", "speed_checked", "curvature_checked",
      "corridor_checked", "manoeuvring_checked",
    ];
    if (record.mode !== "CURVE" || record.fallback_reason !== null ||
        qualification.result !== "QUALIFIED_ENGINEERING_REFERENCE" ||
        qualification.corridor_proof_scope !== "CONTINUOUS_IN_DECLARED_RASTER_MODEL" ||
        gates.some((name) => qualification[name] !== true)) {
      return invalid("curve_qualification_incomplete");
    }
    return {valid: true, usable: true, reason: null, samples};
  }

  function inspectSet(value) {
    const fields = [
      "schema_version", "motion_set_id", "layer_set_id", "run_id", "scenario_id",
      "corridor_id", "generation_id", "input_revision", "risk_window_id",
      "risk_window_digest", "vessel_profile_id", "vessel_profile_version",
      "vessel_profile_digest", "motion_profile_id", "motion_profile_digest",
      "config_digest", "model_config_digest", "planner_config_digest",
      "producer_digest", "generated_at", "records",
    ];
    if (!exactFields(value, fields) || value.schema_version !== SCHEMA_VERSION ||
        !/^route-motion-set-sha256-[0-9a-f]{64}$/.test(value.motion_set_id) ||
        !Array.isArray(value.records) || value.records.length !== 4) {
      return invalid("motion_set_shape_invalid");
    }
    const identityStrings = [
      "layer_set_id", "run_id", "scenario_id", "corridor_id", "risk_window_id",
      "vessel_profile_id", "vessel_profile_version", "motion_profile_id",
    ];
    const identityDigests = [
      "risk_window_digest", "vessel_profile_digest", "motion_profile_digest",
      "config_digest", "model_config_digest", "planner_config_digest", "producer_digest",
    ];
    if (identityStrings.some((name) => typeof value[name] !== "string" || !value[name]) ||
        identityDigests.some((name) => !digest(value[name])) ||
        !Number.isInteger(value.generation_id) || value.generation_id < 0 ||
        !Number.isInteger(value.input_revision) || value.input_revision < 0 ||
        eta(value.generated_at) === null) {
      return invalid("motion_set_identity_invalid");
    }
    const payload = {...value};
    delete payload.motion_set_id;
    if (!verifiedSets.has(value) &&
        canonicalDigest(payload) !== value.motion_set_id.slice("route-motion-set-sha256-".length)) {
      return invalid("motion_set_digest_invalid");
    }
    const records = value.records.map(inspectRecord);
    if (records.some((record) => !record.valid) ||
        value.records.some((record, index) => record.planning_layer !== LAYERS[index]) ||
        new Set(value.records.map((record) => record.plan_id)).size !== 4) {
      return invalid("motion_set_records_invalid", {records});
    }
    return {valid: true, usable: records.some((record) => record.usable), reason: null, records};
  }

  async function inspectSetAsync(value) {
    if (!objectLike(value) || !Array.isArray(value.records)) {
      return invalid("motion_set_shape_invalid");
    }
    if (verifiedSets.has(value)) return inspectSet(value);
    const helper = window.ArcticRouteResearchMotion?.canonicalDigestAtAsync;
    if (typeof helper !== "function") return inspectSet(value);
    const payload = {...value};
    delete payload.motion_set_id;
    const expectedSetDigest = typeof value.motion_set_id === "string"
      ? value.motion_set_id.slice("route-motion-set-sha256-".length)
      : null;
    const checks = [helper(payload)];
    for (const record of value.records) {
      if (!objectLike(record) || !Array.isArray(record.motion_samples)) {
        return invalid("motion_set_records_invalid");
      }
      checks.push(
        helper(record.motion_samples.map(({lon, lat}) => [lon, lat]), "coordinates"),
        helper(record.motion_samples),
      );
    }
    const digests = await Promise.all(checks);
    if (digests[0] !== expectedSetDigest) return invalid("motion_set_digest_invalid");
    for (let index = 0; index < value.records.length; index += 1) {
      const record = value.records[index];
      if (digests[1 + index * 2] !== record.curve_digest ||
          digests[2 + index * 2] !== record.motion_digest) {
        return invalid("motion_set_records_invalid");
      }
      verifiedRecords.add(record);
    }
    verifiedSets.add(value);
    const inspection = inspectSet(value);
    if (inspection.valid) deepFreeze(value);
    return inspection;
  }

  async function prevalidate(bundle) {
    const sets = bundle?.route_motion_sets;
    if (!Array.isArray(sets)) return [];
    return Promise.all(sets.map(inspectSetAsync));
  }

  function deepFreeze(value) {
    if (!objectLike(value) && !Array.isArray(value)) return value;
    for (const item of Object.values(value)) deepFreeze(item);
    return Object.freeze(value);
  }

  function inspect(bundle, route) {
    const sets = bundle?.route_motion_sets;
    if (!Array.isArray(sets) || sets.length === 0) return invalid("missing_formal_motion_set");
    const presentation = bundle?.combined_presentation;
    const authorizedIds = presentation?.route_motion_set_ids;
    const bindings = presentation?.route_motion_set_bindings;
    const setIds = sets.map((set) => set?.motion_set_id);
    if (!Array.isArray(authorizedIds) || !Array.isArray(bindings) ||
        authorizedIds.length !== sets.length || bindings.length !== sets.length ||
        new Set(authorizedIds).size !== authorizedIds.length ||
        setIds.some((setId) => !authorizedIds.includes(setId))) {
      return invalid("formal_motion_presentation_identity_mismatch");
    }
    const routeId = route?.route_id ?? route?.plan_id ?? null;
    let rejectionReason = "no_formal_motion_for_route";
    for (const set of sets) {
      const setInspection = inspectSet(set);
      if (!setInspection.valid) {
        rejectionReason = setInspection.reason;
        continue;
      }
      const binding = bindings.find((item) => item?.motion_set_id === set.motion_set_id);
      if (!binding || binding.layer_set_id !== set.layer_set_id ||
          binding.risk_window_id !== set.risk_window_id ||
          binding.risk_window_digest !== set.risk_window_digest) {
        rejectionReason = "formal_motion_presentation_identity_mismatch";
        continue;
      }
      const index = set.records.findIndex((record) => record.plan_id === routeId);
      if (index < 0) {
        rejectionReason = "formal_motion_plan_id_missing";
        continue;
      }
      const record = set.records[index];
      const recordInspection = setInspection.records[index];
      if (!recordInspection.usable) return invalid(recordInspection.reason, {
        schema_version: SCHEMA_VERSION, motion_set_id: set.motion_set_id,
      });
      const waypoints = route?.waypoints;
      const samples = recordInspection.samples;
      if (!Array.isArray(waypoints) || waypoints.length < 2) return invalid("route_waypoints_missing");
      const first = coordinate(waypoints[0]);
      const last = coordinate(waypoints[waypoints.length - 1]);
      const rawWaypointPayload = waypoints.map((waypoint) => ({
        longitude: coordinate(waypoint)?.lon,
        latitude: coordinate(waypoint)?.lat,
        eta: waypoint.eta,
        recommended_speed_mps: waypoint.recommended_speed_mps,
      }));
      if (!first || !last || first.lon !== samples[0].lon || first.lat !== samples[0].lat ||
          last.lon !== samples[samples.length - 1].lon ||
          last.lat !== samples[samples.length - 1].lat ||
          waypoints[0].eta !== samples[0].etaText ||
          waypoints[waypoints.length - 1].eta !== samples[samples.length - 1].etaText ||
          route.effective_adoption_time !== samples[0].etaText ||
          rawWaypointPayload.some((waypoint) => !finite(waypoint.longitude) ||
            !finite(waypoint.latitude) || !finite(waypoint.recommended_speed_mps)) ||
          canonicalDigest(rawWaypointPayload) !== record.raw_route_digest) {
        return invalid("formal_motion_route_or_adoption_mismatch");
      }
      return {valid: true, usable: true, reason: null, schema_version: SCHEMA_VERSION,
        source: SCHEMA_VERSION, motion_set_id: set.motion_set_id, record, samples};
    }
    return invalid(rejectionReason);
  }

  function buildPath(bundle, route, startMs) {
    const inspection = inspect(bundle, route);
    if (!inspection.valid) return null;
    const points = inspection.samples.map(({lon, lat}) => ({lon, lat}));
    const timesMs = inspection.samples.map((sample) => sample.eta - startMs);
    const distancesKm = [0];
    for (let index = 1; index < points.length; index += 1) {
      const distance = haversineKm(points[index - 1], points[index]);
      if (!finite(distance) || distance <= 1e-9) return null;
      distancesKm.push(distancesKm[index - 1] + distance);
    }
    return Object.freeze({points, timesMs, distancesKm, anchorDistancesKm: distancesKm,
      courseDegrees: inspection.samples.map((sample) => sample.course_degrees),
      speedKnots: inspection.samples.map((sample) => sample.speed_knots),
      smoothingApplied: true, maximumDeviationM: 0, source: inspection.source,
      motionSetId: inspection.motion_set_id, planId: inspection.record.plan_id});
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

  window.ArcticRouteMotion = Object.freeze({
    SCHEMA_VERSION, inspectSet, inspectSetAsync, prevalidate, inspect, buildPath,
  });
})();

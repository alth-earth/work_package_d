/* Strict consumer for presentation.runtime-route-candidates.v1. */
(() => {
  "use strict";

  const SCHEMA_VERSION = "presentation.runtime-route-candidates.v1";
  const LAYERS = Object.freeze([
    "full_voyage", "main_corridor_24_72h", "rolling_0_24h", "executable_0_6h",
  ]);
  const OBJECTIVES = Object.freeze(["fastest", "low_risk", "recommended"]);
  const SHA256 = /^[0-9a-f]{64}$/;
  const CANDIDATE_ID = /^route-v3-sha256-[0-9a-f]{64}$/;
  const SET_ID = /^runtime-route-candidates-sha256-[0-9a-f]{64}$/;
  const LAYER_SET_ID = /^layer-set-sha256-[0-9a-f]{64}$/;
  const objectLike = (value) => value !== null && typeof value === "object" &&
    !Array.isArray(value);
  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  const dateTime = (value) => typeof value === "string" && value.endsWith("Z") &&
    Number.isFinite(Date.parse(value));
  const invalid = (reason, extra = {}) => ({valid: false, reason, ...extra});
  const exactFields = (value, fields) => objectLike(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.prototype.hasOwnProperty.call(value, field));

  function validGeometry(value) {
    return exactFields(value, ["type", "coordinates"]) && value.type === "LineString" &&
      Array.isArray(value.coordinates) && value.coordinates.length >= 2 &&
      value.coordinates.every((point) => Array.isArray(point) && point.length === 2 &&
        finite(point[0]) && finite(point[1]) && point[0] >= -180 && point[0] <= 180 &&
        point[1] >= -90 && point[1] <= 90);
  }

  function validWaypoint(value, previousEta = null) {
    if (!exactFields(value, ["longitude", "latitude", "eta", "recommended_speed_mps"]) ||
        !finite(value.longitude) || value.longitude < -180 || value.longitude > 180 ||
        !finite(value.latitude) || value.latitude < -90 || value.latitude > 90 ||
        !finite(value.recommended_speed_mps) || value.recommended_speed_mps <= 0 ||
        !dateTime(value.eta)) return null;
    const parsed = Date.parse(value.eta);
    if (previousEta !== null && parsed <= previousEta) return null;
    return parsed;
  }

  function validCandidate(candidate, topProvenance, index) {
    const fields = [
      "candidate_id", "layer", "objective", "geometry", "waypoints", "distance_km",
      "arrival_eta", "travel_hours", "risk_metrics", "provenance",
    ];
    if (!exactFields(candidate, fields) || !CANDIDATE_ID.test(candidate.candidate_id) ||
        !LAYERS.includes(candidate.layer) || !OBJECTIVES.includes(candidate.objective) ||
        !validGeometry(candidate.geometry) || !Array.isArray(candidate.waypoints) ||
        candidate.waypoints.length < 2 || !finite(candidate.distance_km) ||
        candidate.distance_km < 0 || !finite(candidate.travel_hours) ||
        candidate.travel_hours < 0 || !dateTime(candidate.arrival_eta)) {
      return invalid(`runtime_candidate_${index}_shape_invalid`);
    }
    let previousEta = null;
    for (const waypoint of candidate.waypoints) {
      previousEta = validWaypoint(waypoint, previousEta);
      if (previousEta === null) return invalid(`runtime_candidate_${index}_waypoint_invalid`);
    }
    if (Date.parse(candidate.arrival_eta) !== previousEta ||
        JSON.stringify(candidate.geometry.coordinates) !== JSON.stringify(
          candidate.waypoints.map((point) => [point.longitude, point.latitude])
        )) {
      return invalid(`runtime_candidate_${index}_geometry_or_eta_mismatch`);
    }
    const metrics = candidate.risk_metrics;
    if (!exactFields(metrics, [
      "average_risk", "maximum_risk", "integrated_risk_hours", "minimum_confidence",
      "hard_violation_count",
    ]) || !finite(metrics.average_risk) || metrics.average_risk < 0 ||
        !finite(metrics.maximum_risk) || metrics.maximum_risk < 0 ||
        !finite(metrics.integrated_risk_hours) || metrics.integrated_risk_hours < 0 ||
        !finite(metrics.minimum_confidence) || metrics.minimum_confidence < 0 ||
        metrics.hard_violation_count !== 0) {
      return invalid(`runtime_candidate_${index}_risk_metrics_invalid`);
    }
    const provenanceFields = [
      "source_schema", "source_plan_id", "run_id", "scenario_id", "corridor_id",
      "vessel_profile_id", "config_digest", "model_config_digest", "planner_config_digest",
      "generation_id", "input_revision", "source_risk_ids",
    ];
    const provenance = candidate.provenance;
    if (!exactFields(provenance, provenanceFields) ||
        provenance.source_schema !== "cd.route-plan.v3" ||
        provenance.source_plan_id !== candidate.candidate_id ||
        provenance.run_id !== topProvenance.source_run_id ||
        !Number.isInteger(provenance.generation_id) || provenance.generation_id < 0 ||
        !Number.isInteger(provenance.input_revision) || provenance.input_revision < 0 ||
        !SHA256.test(provenance.config_digest) || !SHA256.test(provenance.model_config_digest) ||
        !SHA256.test(provenance.planner_config_digest) || !Array.isArray(provenance.source_risk_ids) ||
        provenance.source_risk_ids.length === 0 ||
        provenance.source_risk_ids.some((value) => typeof value !== "string" || !value)) {
      return invalid(`runtime_candidate_${index}_provenance_invalid`);
    }
    return {valid: true, candidate};
  }

  function inspectPackage(value, expectedScenarioId = null) {
    const fields = [
      "schema_version", "status", "runtime_candidate_set_id", "layer_set_id",
      "decision_time", "selected_candidate_id", "provenance", "candidates",
    ];
    if (!exactFields(value, fields) || value.schema_version !== SCHEMA_VERSION ||
        value.status !== "PUBLISHED" || !SET_ID.test(value.runtime_candidate_set_id) ||
        !LAYER_SET_ID.test(value.layer_set_id) || !dateTime(value.decision_time) ||
        !CANDIDATE_ID.test(value.selected_candidate_id) || !Array.isArray(value.candidates) ||
        value.candidates.length !== 12) {
      return invalid("runtime_candidate_package_shape_invalid", {candidates: []});
    }
    const top = value.provenance;
    const topFields = [
      "source_schema", "source_layer_set_id", "source_run_id", "source_generation_id",
      "source_input_revision", "projection_owner",
    ];
    if (!exactFields(top, topFields) || top.source_schema !== "cd.four-layer-route-plan-set.v3" ||
        top.source_layer_set_id !== value.layer_set_id || typeof top.source_run_id !== "string" ||
        !top.source_run_id || !Number.isInteger(top.source_generation_id) ||
        top.source_generation_id < 0 || !Number.isInteger(top.source_input_revision) ||
        top.source_input_revision < 0 || top.projection_owner !== "arctic_route_orchestrator") {
      return invalid("runtime_candidate_package_provenance_invalid", {candidates: []});
    }
    const expectedOrder = LAYERS.flatMap((layer) =>
      OBJECTIVES.map((objective) => `${layer}|${objective}`));
    const expectedPairs = new Set(expectedOrder);
    const actualPairs = new Set();
    const ids = new Set();
    const scenarios = new Set();
    for (let index = 0; index < value.candidates.length; index += 1) {
      const result = validCandidate(value.candidates[index], top, index);
      if (!result.valid) return result;
      const candidate = result.candidate;
      const pair = `${candidate.layer}|${candidate.objective}`;
      if (pair !== expectedOrder[index] || actualPairs.has(pair) || ids.has(candidate.candidate_id)) {
        return invalid("runtime_candidate_coverage_invalid", {candidates: []});
      }
      actualPairs.add(pair);
      ids.add(candidate.candidate_id);
      scenarios.add(candidate.provenance.scenario_id);
    }
    if (actualPairs.size !== expectedPairs.size || !ids.has(value.selected_candidate_id) ||
        scenarios.size !== 1 || (expectedScenarioId && !scenarios.has(expectedScenarioId))) {
      return invalid("runtime_candidate_identity_or_scenario_invalid", {candidates: []});
    }
    const selected = value.candidates.find((item) =>
      item.candidate_id === value.selected_candidate_id
    );
    if (!selected || selected.layer !== "full_voyage" || selected.objective !== "recommended") {
      return invalid("runtime_selected_candidate_invalid", {candidates: []});
    }
    const identity = {
      layer_set_id: value.layer_set_id,
      decision_time: value.decision_time,
      selected_candidate_id: value.selected_candidate_id,
      candidates: value.candidates,
    };
    const motion = window.ArcticRouteMotion;
    if (!motion?.canonicalDigest ||
        motion.canonicalDigest(identity) !== value.runtime_candidate_set_id.slice(
          "runtime-route-candidates-sha256-".length
        )) {
      return invalid("runtime_candidate_digest_invalid", {candidates: []});
    }
    return Object.freeze({valid: true, reason: null, package: value, candidates: value.candidates});
  }

  function inspect(bundle, expectedScenarioId = null) {
    const entries = bundle?.runtime_route_candidate_sets;
    if (!Array.isArray(entries) || entries.length === 0) {
      return invalid("runtime_route_candidate_sets_missing", {packages: [], candidates: []});
    }
    const bindings = bundle?.combined_presentation?.runtime_route_candidate_set_bindings;
    const authorizedIds = bundle?.combined_presentation?.runtime_route_candidate_set_ids;
    if (!Array.isArray(bindings) || bindings.length !== entries.length ||
        !Array.isArray(authorizedIds) || authorizedIds.length !== entries.length ||
        new Set(authorizedIds).size !== authorizedIds.length) {
      return invalid("runtime_route_candidate_bindings_missing", {packages: [], candidates: []});
    }
    const packages = [];
    const revisions = new Set();
    const layerSets = new Set();
    const bindingRevisions = new Set();
    for (const entry of entries) {
      if (!exactFields(entry, ["revision", "state", "runtime_route_candidates"]) ||
          !Number.isInteger(entry.revision) || entry.revision < 1 || revisions.has(entry.revision)) {
        return invalid("runtime_route_candidate_revision_invalid", {packages: [], candidates: []});
      }
      const result = inspectPackage(entry.runtime_route_candidates, expectedScenarioId);
      if (!result.valid || layerSets.has(entry.runtime_route_candidates.layer_set_id)) {
        return invalid(result.reason || "runtime_route_candidate_layer_invalid", {
          packages: [], candidates: [],
        });
      }
      if (!authorizedIds.includes(entry.runtime_route_candidates.runtime_candidate_set_id)) {
        return invalid("runtime_route_candidate_set_not_authorized", {
          packages: [], candidates: [],
        });
      }
      revisions.add(entry.revision);
      layerSets.add(entry.runtime_route_candidates.layer_set_id);
      packages.push({revision: entry.revision, state: entry.state, ...result});
    }
    for (const binding of bindings) {
      if (!exactFields(binding, [
        "revision", "state", "layer_set_id", "runtime_candidate_set_id",
        "selected_candidate_id",
      ])) {
        return invalid("runtime_route_candidate_binding_fields_invalid", {
          packages: [], candidates: [],
        });
      }
      if (bindingRevisions.has(binding.revision)) {
        return invalid("runtime_route_candidate_binding_revision_duplicate", {
          packages: [], candidates: [],
        });
      }
      const packageEntry = packages.find((item) => item.revision === binding?.revision);
      if (!packageEntry || binding.state !== packageEntry.state ||
          binding.layer_set_id !== packageEntry.package.layer_set_id ||
          binding.runtime_candidate_set_id !== packageEntry.package.runtime_candidate_set_id ||
          binding.selected_candidate_id !== packageEntry.package.selected_candidate_id) {
        return invalid("runtime_route_candidate_binding_mismatch", {packages: [], candidates: []});
      }
      bindingRevisions.add(binding.revision);
    }
    if (bindingRevisions.size !== packages.length ||
        packages.some((item) => !bindingRevisions.has(item.revision))) {
      return invalid("runtime_route_candidate_binding_coverage_invalid", {
        packages: [], candidates: [],
      });
    }
    const initial = packages.find((item) => item.revision === 1) || packages[0];
    return Object.freeze({
      valid: true,
      reason: null,
      packages,
      initial,
      candidates: initial.candidates,
    });
  }

  window.ArcticRuntimeRouteCandidates = Object.freeze({
    SCHEMA_VERSION,
    LAYERS,
    OBJECTIVES,
    inspectPackage,
    inspect,
  });
})();

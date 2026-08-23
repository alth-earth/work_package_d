/* Strict, presentation-only validation for presentation.route-candidates.v1. */
((root, factory) => {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ArcticRouteCandidates = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  const ROUTE_LAYERS = Object.freeze([
    "full_voyage",
    "main_corridor_24_72h",
    "rolling_0_24h",
    "executable_0_6h",
  ]);
  const ROUTE_OBJECTIVES = Object.freeze(["fastest", "low_risk", "recommended"]);
  const TOP_LEVEL_FIELDS = Object.freeze([
    "candidate_set_id",
    "candidates",
    "decision_time",
    "layer_set_id",
    "provenance",
    "schema_version",
    "selected_candidate_id",
    "status",
  ]);
  const CANDIDATE_FIELDS = Object.freeze([
    "arrival_eta",
    "candidate_id",
    "distance_km",
    "geometry",
    "layer",
    "objective",
    "provenance",
    "risk_metrics",
    "travel_hours",
  ]);
  const RISK_METRIC_FIELDS = Object.freeze([
    "average_risk",
    "hard_violation_count",
    "integrated_risk_hours",
    "maximum_risk",
    "minimum_confidence",
  ]);
  const TOP_PROVENANCE_FIELDS = Object.freeze([
    "projection_owner",
    "source_generation_id",
    "source_input_revision",
    "source_layer_set_id",
    "source_run_id",
    "source_schema",
  ]);
  const CANDIDATE_PROVENANCE_FIELDS = Object.freeze([
    "config_digest",
    "corridor_id",
    "generation_id",
    "input_revision",
    "model_config_digest",
    "planner_config_digest",
    "run_id",
    "scenario_id",
    "source_plan_id",
    "source_risk_ids",
    "source_schema",
    "vessel_profile_id",
  ]);
  const SHA256 = /^[0-9a-f]{64}$/;
  const CANDIDATE_ID = /^route-v3-sha256-[0-9a-f]{64}$/;
  const CANDIDATE_SET_ID = /^route-candidates-sha256-[0-9a-f]{64}$/;
  const LAYER_SET_ID = /^layer-set-sha256-[0-9a-f]{64}$/;

  function exactFields(value, fields) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length === fields.length && fields.every((field) =>
      Object.prototype.hasOwnProperty.call(value, field)
    );
  }

  function finiteNumber(value, minimum = -Infinity, maximum = Infinity) {
    return typeof value === "number" && Number.isFinite(value) &&
      value >= minimum && value <= maximum;
  }

  function integer(value, minimum = 0) {
    return Number.isInteger(value) && value >= minimum;
  }

  function nonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
  }

  function dateTime(value) {
    return nonEmptyString(value) && Number.isFinite(Date.parse(value));
  }

  function validTopProvenance(value, document) {
    return exactFields(value, TOP_PROVENANCE_FIELDS) &&
      value.source_schema === "cd.four-layer-route-plan-set.v3" &&
      value.source_layer_set_id === document.layer_set_id &&
      nonEmptyString(value.source_run_id) &&
      integer(value.source_generation_id) &&
      integer(value.source_input_revision) &&
      value.projection_owner === "arctic_route_orchestrator";
  }

  function validCandidateProvenance(value, candidate, topProvenance) {
    return exactFields(value, CANDIDATE_PROVENANCE_FIELDS) &&
      value.source_schema === "cd.route-plan.v3" &&
      value.source_plan_id === candidate.candidate_id &&
      value.run_id === topProvenance.source_run_id &&
      value.generation_id === topProvenance.source_generation_id &&
      value.input_revision === topProvenance.source_input_revision &&
      nonEmptyString(value.scenario_id) && nonEmptyString(value.corridor_id) &&
      nonEmptyString(value.vessel_profile_id) &&
      SHA256.test(value.config_digest) && SHA256.test(value.model_config_digest) &&
      SHA256.test(value.planner_config_digest) &&
      Array.isArray(value.source_risk_ids) && value.source_risk_ids.length > 0 &&
      value.source_risk_ids.every(nonEmptyString);
  }

  function validGeometry(value) {
    return exactFields(value, ["coordinates", "type"]) && value.type === "LineString" &&
      Array.isArray(value.coordinates) && value.coordinates.length >= 2 &&
      value.coordinates.every((point) => Array.isArray(point) && point.length === 2 &&
        point.every((coordinate) => finiteNumber(coordinate)));
  }

  function validRiskMetrics(value) {
    return exactFields(value, RISK_METRIC_FIELDS) &&
      finiteNumber(value.average_risk, 0, 1) &&
      finiteNumber(value.maximum_risk, 0, 1) &&
      finiteNumber(value.integrated_risk_hours, 0) &&
      finiteNumber(value.minimum_confidence, 0, 1) &&
      value.hard_violation_count === 0;
  }

  function validCandidate(candidate, topProvenance) {
    return exactFields(candidate, CANDIDATE_FIELDS) &&
      CANDIDATE_ID.test(candidate.candidate_id) &&
      ROUTE_LAYERS.includes(candidate.layer) && ROUTE_OBJECTIVES.includes(candidate.objective) &&
      validGeometry(candidate.geometry) &&
      finiteNumber(candidate.distance_km, 0) && dateTime(candidate.arrival_eta) &&
      finiteNumber(candidate.travel_hours, 0) && validRiskMetrics(candidate.risk_metrics) &&
      validCandidateProvenance(candidate.provenance, candidate, topProvenance);
  }

  function unavailable(reason) {
    return Object.freeze({ valid: false, reason, candidates: Object.freeze([]) });
  }

  function inspect(value, expectedScenarioId = null) {
    if (!value || value.schema_version !== "presentation.route-candidates.v1") {
      return unavailable("route candidate package is absent or unsupported");
    }
    if (value.status === "NOT_PUBLISHED") {
      const validEmpty = exactFields(value, ["candidates", "reason", "schema_version", "status"]) &&
        Array.isArray(value.candidates) && value.candidates.length === 0 && nonEmptyString(value.reason);
      return unavailable(validEmpty ? value.reason : "NOT_PUBLISHED package is malformed");
    }
    if (value.status !== "PUBLISHED" || !exactFields(value, TOP_LEVEL_FIELDS)) {
      return unavailable("route candidate publication fields or status are invalid");
    }
    if (!CANDIDATE_SET_ID.test(value.candidate_set_id) || !LAYER_SET_ID.test(value.layer_set_id) ||
        !CANDIDATE_ID.test(value.selected_candidate_id) || !dateTime(value.decision_time) ||
        !validTopProvenance(value.provenance, value) || !Array.isArray(value.candidates) ||
        value.candidates.length !== ROUTE_LAYERS.length * ROUTE_OBJECTIVES.length) {
      return unavailable("published candidate identity, provenance, or cardinality is invalid");
    }

    const expectedPairs = new Set(
      ROUTE_LAYERS.flatMap((layer) => ROUTE_OBJECTIVES.map((objective) => `${layer}|${objective}`))
    );
    const actualPairs = new Set();
    const candidateIds = new Set();
    const scenarios = new Set();
    for (const candidate of value.candidates) {
      if (!validCandidate(candidate, value.provenance)) {
        return unavailable("published candidate content or provenance is invalid");
      }
      const pair = `${candidate.layer}|${candidate.objective}`;
      if (!expectedPairs.has(pair) || actualPairs.has(pair) || candidateIds.has(candidate.candidate_id)) {
        return unavailable("candidate layer/objective or identity coverage is invalid");
      }
      actualPairs.add(pair);
      candidateIds.add(candidate.candidate_id);
      scenarios.add(candidate.provenance.scenario_id);
    }
    if (actualPairs.size !== expectedPairs.size || !candidateIds.has(value.selected_candidate_id)) {
      return unavailable("candidate identities or layer/objective coverage are invalid");
    }
    const selected = value.candidates.find(
      (candidate) => candidate.candidate_id === value.selected_candidate_id
    );
    if (selected?.layer !== "full_voyage" || selected?.objective !== "recommended") {
      return unavailable("selected candidate is not C's full-voyage recommendation");
    }
    if (scenarios.size !== 1 || (expectedScenarioId && !scenarios.has(expectedScenarioId))) {
      return unavailable("candidate scenario does not match the Viewer bundle");
    }
    return Object.freeze({ valid: true, reason: null, candidates: value.candidates });
  }

  return Object.freeze({ ROUTE_LAYERS, ROUTE_OBJECTIVES, inspect });
});

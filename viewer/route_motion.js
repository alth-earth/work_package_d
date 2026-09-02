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

  // Keep the formal consumer self-contained.  The production Viewer must not
  // load the historical research reader merely to verify a formal artifact.
  function floatHint(key) {
    return [
      "lon", "lat", "longitude", "latitude", "course_degrees", "speed_knots",
      "recommended_speed_mps", "minimum_radius_m", "maximum_deviation_m",
      "maximum_yaw_rate", "maximum_lateral_acceleration", "risk", "delta",
      "tolerance", "curvature", "acceleration", "radius", "radius_m",
      "distance_m", "distance_km", "travel_hours", "integrated_risk_hours",
      "average_risk", "maximum_risk", "minimum_confidence", "path_length_m",
      "arc_length_m", "anchor_distances_m", "parameter_start", "parameter_end",
      "trim_fraction", "points_m", "points", "raw_points", "samples", "radii_m",
      "curvatures_m_inv", "samples_m", "first_derivatives_m", "second_derivatives_m",
      "control_points_m", "entry_m", "vertex_m", "scale_m", "trim_m", "parameters",
      "curve_samples", "cumulative_distance_m", "error_m", "error_rad",
      "curvature_abs_m_inv", "expansion_m", "span_convex_hulls_m",
      "lateral_acceleration_m_s2", "yaw_rate_deg_s", "yaw_rate_rad_s",
      "lateral_accelerations_m_s2", "yaw_rates_deg_s", "yaw_rates_rad_s",
      "additional_peak_rss_gate_mib",
    ].some((suffix) => key === suffix || key.endsWith(`_${suffix}`)) ||
      key === "knot_vector" || key === "route_coordinates" || key === "coordinates";
  }

  function pythonNumber(value, key) {
    if (Object.is(value, -0)) return floatHint(key) ? "-0.0" : "0";
    const magnitude = Math.abs(value);
    if (Number.isInteger(value) && floatHint(key) && magnitude < 1e16) return `${value}.0`;
    let result = String(value);
    if (magnitude >= 1e-6 && magnitude < 1e-4 && !/[eE]/.test(result)) {
      result = value.toExponential();
    }
    if (magnitude >= 1e16 && !/[eE]/.test(result)) result = value.toExponential();
    const exponent = result.match(/^(-?\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
    if (exponent) {
      const sign = Number(exponent[2]) < 0 ? "-" : "+";
      const digits = String(Math.abs(Number(exponent[2]))).padStart(2, "0");
      result = `${exponent[1]}e${sign}${digits}`;
    }
    return result;
  }

  function canonicalJson(value, key = "") {
    if (value === null) return "null";
    if (value === true) return "true";
    if (value === false) return "false";
    if (typeof value === "number") {
      if (!finite(value)) throw new TypeError("canonical JSON cannot contain a non-finite number");
      return pythonNumber(value, key);
    }
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJson(item, key)).join(",")}]`;
    }
    if (!objectLike(value)) throw new TypeError("canonical JSON contains an unsupported value");
    const keys = Object.keys(value).sort();
    return `{${keys.map((name) =>
      `${JSON.stringify(name)}:${canonicalJson(value[name], name)}`
    ).join(",")}}`;
  }

  function utf8Bytes(value) {
    const bytes = [];
    for (let index = 0; index < value.length; index += 1) {
      let code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
        const low = value.charCodeAt(index + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          index += 1;
        }
      }
      if (code <= 0x7f) bytes.push(code);
      else if (code <= 0x7ff) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code <= 0xffff) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        bytes.push(
          0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f),
        );
      }
    }
    return bytes;
  }

  function sha256Hex(value) {
    const input = utf8Bytes(value);
    const bitLength = input.length * 8;
    input.push(0x80);
    while ((input.length + 8) % 64 !== 0) input.push(0);
    for (let shift = 7; shift >= 0; shift -= 1) {
      input.push(Math.floor(bitLength / 2 ** (shift * 8)) & 0xff);
    }
    const constants = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
      0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
      0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
      0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
      0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
      0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
      0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
      0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
      0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
      0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
      0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let state = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    const words = new Array(64);
    for (let offset = 0; offset < input.length; offset += 64) {
      for (let index = 0; index < 16; index += 1) {
        const base = offset + index * 4;
        words[index] = (
          (input[base] << 24) | (input[base + 1] << 16) |
          (input[base + 2] << 8) | input[base + 3]
        ) >>> 0;
      }
      for (let index = 16; index < 64; index += 1) {
        const valueWord = words[index - 15];
        const sigma0 = ((valueWord >>> 7) | (valueWord << 25)) ^
          ((valueWord >>> 18) | (valueWord << 14)) ^ (valueWord >>> 3);
        const previous = words[index - 2];
        const sigma1 = ((previous >>> 17) | (previous << 15)) ^
          ((previous >>> 19) | (previous << 13)) ^ (previous >>> 10);
        words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = state;
      for (let index = 0; index < 64; index += 1) {
        const sum1 = ((e >>> 6) | (e << 26)) ^
          ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const choice = (e & f) ^ (~e & g);
        const temp1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
        const sum0 = ((a >>> 2) | (a << 30)) ^
          ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (sum0 + majority) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      state = state.map((value, index) => (value + [a, b, c, d, e, f, g, h][index]) >>> 0);
    }
    return state.map((value) => value.toString(16).padStart(8, "0")).join("");
  }

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
    try {
      return sha256Hex(canonicalJson(value));
    } catch (error) {
      return null;
    }
  }

  function canonicalCoordinateDigest(value) {
    try {
      return sha256Hex(canonicalJson(value, "coordinates"));
    } catch (error) {
      return null;
    }
  }

  async function canonicalDigestAsync(value, key = "") {
    try {
      const canonical = canonicalJson(value, key);
      const subtle = window.crypto?.subtle;
      if (!subtle || typeof TextEncoder !== "function") return sha256Hex(canonical);
      const bytes = new TextEncoder().encode(canonical);
      const hashed = new Uint8Array(await subtle.digest("SHA-256", bytes));
      return Array.from(hashed, (item) => item.toString(16).padStart(2, "0")).join("");
    } catch (error) {
      return null;
    }
  }

  function canonicalCoordinateDigestAsync(value) {
    return canonicalDigestAsync(value, "coordinates");
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

  // ISO artifacts retain microseconds, while JavaScript Date retains only
  // milliseconds.  Offset comparisons therefore need to admit only the
  // sub-millisecond precision that Date.parse necessarily discards.
  function sameShiftedInstant(value, baseMs, offsetMs) {
    const parsed = eta(value);
    return parsed !== null && finite(baseMs) && finite(offsetMs) &&
      Math.abs(parsed - (baseMs + offsetMs)) < 1;
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
    const payload = {...value};
    delete payload.motion_set_id;
    const expectedSetDigest = typeof value.motion_set_id === "string"
      ? value.motion_set_id.slice("route-motion-set-sha256-".length)
      : null;
    const checks = [canonicalDigestAsync(payload)];
    for (const record of value.records) {
      if (!objectLike(record) || !Array.isArray(record.motion_samples)) {
        return invalid("motion_set_records_invalid");
      }
      checks.push(
        canonicalCoordinateDigestAsync(record.motion_samples.map(({lon, lat}) => [lon, lat])),
        canonicalDigestAsync(record.motion_samples),
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
    if (inspection.valid) {
      deepFreeze(value);
    } else {
      // Never retain verification markers for an invalid or incomplete set.
      // The object may still be mutable because it was not frozen; keeping a
      // marker here would let a later mutation bypass canonical digest checks.
      verifiedSets.delete(value);
      for (const record of value.records) verifiedRecords.delete(record);
    }
    return inspection;
  }

  async function prevalidate(bundle) {
    const sets = bundle?.route_motion_sets;
    if (!Array.isArray(sets)) return [];
    return Promise.all(sets.map(inspectSetAsync));
  }

  function inspectCandidateSet(value) {
    const fields = [
      "schema_version", "motion_candidate_set_id", "layer_set_id", "run_id",
      "scenario_id", "corridor_id", "generation_id", "input_revision",
      "risk_window_id", "risk_window_digest", "vessel_profile_id",
      "vessel_profile_version", "vessel_profile_digest", "motion_profile_id",
      "motion_profile_digest", "config_digest", "model_config_digest",
      "planner_config_digest", "producer_digest", "generated_at", "records",
    ];
    if (!exactFields(value, fields) ||
        value.schema_version !== "cd.route-motion-candidate-set.v1" ||
        !/^route-motion-candidate-set-sha256-[0-9a-f]{64}$/.test(value.motion_candidate_set_id) ||
        !Array.isArray(value.records) || value.records.length !== 3) {
      return invalid("motion_candidate_set_shape_invalid");
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
      return invalid("motion_candidate_set_identity_invalid");
    }
    const expectedObjectives = ["fastest", "low_risk", "recommended"];
    const inspections = [];
    for (let index = 0; index < value.records.length; index += 1) {
      const item = value.records[index];
      if (!exactFields(item, ["objective_mode", "record"]) ||
          item.objective_mode !== expectedObjectives[index]) {
        return invalid("motion_candidate_set_objective_order_invalid");
      }
      const inspection = inspectRecord(item.record);
      if (!inspection.valid || item.record.planning_layer !== "full_voyage") {
        return invalid("motion_candidate_set_record_invalid", {records: inspections});
      }
      inspections.push({objective_mode: item.objective_mode, ...inspection});
    }
    if (new Set(value.records.map((item) => item.record.plan_id)).size !== 3) {
      return invalid("motion_candidate_set_plan_identity_invalid", {records: inspections});
    }
    const payload = {...value};
    delete payload.motion_candidate_set_id;
    if (canonicalDigest(payload) !== value.motion_candidate_set_id.slice(
      "route-motion-candidate-set-sha256-".length
    )) {
      return invalid("motion_candidate_set_digest_invalid", {records: inspections});
    }
    return {
      valid: true,
      usable: inspections.some((record) => record.usable),
      reason: null,
      records: inspections,
    };
  }

  async function inspectCandidateSetAsync(value) {
    return inspectCandidateSet(value);
  }

  async function prevalidateCandidateSets(bundle) {
    const sets = bundle?.route_motion_candidate_sets;
    if (!Array.isArray(sets)) return [];
    return Promise.all(sets.map(inspectCandidateSetAsync));
  }

  function inspectCandidate(bundle, candidate, layerSetId = null) {
    const sets = bundle?.route_motion_candidate_sets;
    if (!Array.isArray(sets) || sets.length === 0) {
      return invalid("missing_formal_motion_candidate_set");
    }
    const presentation = bundle?.combined_presentation || {};
    const authorizedIds = presentation.route_motion_candidate_set_ids;
    const bindings = presentation.route_motion_candidate_set_bindings;
    if (!Array.isArray(authorizedIds) || !Array.isArray(bindings) ||
        authorizedIds.length !== sets.length || bindings.length !== sets.length) {
      return invalid("formal_motion_candidate_presentation_identity_mismatch");
    }
    const candidateSet = sets.find((set) =>
      set.layer_set_id === layerSetId || set.layer_set_id === candidate?.layer_set_id
    );
    if (!candidateSet) return invalid("formal_motion_candidate_layer_set_missing");
    if (!authorizedIds.includes(candidateSet.motion_candidate_set_id)) {
      return invalid("formal_motion_candidate_presentation_identity_mismatch");
    }
    const binding = bindings.find((item) =>
      item?.motion_candidate_set_id === candidateSet.motion_candidate_set_id
    );
    if (!binding || binding.layer_set_id !== candidateSet.layer_set_id ||
        binding.risk_window_id !== candidateSet.risk_window_id ||
        binding.risk_window_digest !== candidateSet.risk_window_digest) {
      return invalid("formal_motion_candidate_presentation_identity_mismatch");
    }
    const setInspection = inspectCandidateSet(candidateSet);
    if (!setInspection.valid) return setInspection;
    const index = candidateSet.records.findIndex((item) =>
      item.objective_mode === candidate?.objective &&
      item.record.plan_id === candidate?.candidate_id
    );
    if (index < 0) return invalid("formal_motion_candidate_plan_id_missing");
    const recordInspection = setInspection.records[index];
    // A C-produced RAW_PASSTHROUGH record is still a runnable, bound motion
    // source.  It is not curve-qualified, but D must consume its authoritative
    // samples instead of silently rebuilding a timeline from waypoints.
    const record = candidateSet.records[index].record;
    const rawFallback = !recordInspection.usable && record.mode === "RAW_PASSTHROUGH";
    if (!recordInspection.usable && !rawFallback) {
      return invalid(recordInspection.reason, {
        bound: true,
        mode: record.mode,
        schema_version: "cd.route-motion-candidate-set.v1",
        motion_candidate_set_id: candidateSet.motion_candidate_set_id,
        record,
      });
    }
    const waypoints = candidate?.waypoints;
    const samples = recordInspection.samples;
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      return invalid("runtime_candidate_waypoints_missing");
    }
    const payload = waypoints.map((waypoint) => ({
      longitude: Number(waypoint.longitude),
      latitude: Number(waypoint.latitude),
      eta: waypoint.eta,
      recommended_speed_mps: Number(waypoint.recommended_speed_mps),
    }));
    if (canonicalDigest(payload) !== record.raw_route_digest ||
        record.plan_id !== candidate.candidate_id) {
      return invalid("formal_motion_candidate_route_mismatch");
    }
    const first = coordinate(waypoints[0]);
    const last = coordinate(waypoints[waypoints.length - 1]);
    if (!first || !last || first.lon !== samples[0].lon || first.lat !== samples[0].lat ||
        last.lon !== samples[samples.length - 1].lon ||
        last.lat !== samples[samples.length - 1].lat) {
      return invalid("formal_motion_candidate_endpoint_mismatch");
    }
    return {
      valid: true,
      usable: !rawFallback,
      reason: rawFallback ? recordInspection.reason : null,
      bound: rawFallback,
      source: "cd.route-motion-candidate-set.v1",
      motionCandidateSetId: candidateSet.motion_candidate_set_id,
      record,
      samples,
      timeOffsetSeconds: 0,
    };
  }

  function buildCandidatePath(bundle, candidate, startMs, layerSetId = null) {
    const inspection = inspectCandidate(bundle, candidate, layerSetId);
    if (!inspection.valid) return null;
    const points = inspection.samples.map(({lon, lat, eta}) => ({
      lon, lat, eta: new Date(eta).toISOString(),
    }));
    const timesMs = inspection.samples.map((sample) => sample.eta - startMs);
    const distancesKm = [0];
    for (let index = 1; index < points.length; index += 1) {
      const distance = haversineKm(points[index - 1], points[index]);
      if (!finite(distance) || distance <= 1e-9) return null;
      distancesKm.push(distancesKm[index - 1] + distance);
    }
    const diagnostics = motionDiagnostics(candidate, points);
    return Object.freeze({
      points,
      timesMs,
      distancesKm,
      anchorDistancesKm: distancesKm,
      courseDegrees: inspection.samples.map((sample) => sample.course_degrees),
      speedKnots: inspection.samples.map((sample) => sample.speed_knots),
      smoothingApplied: inspection.record.mode === "CURVE",
      minimumRadiusM: diagnostics.minimumRadiusM,
      maximumDeviationM: diagnostics.maximumDeviationM,
      curvatureSampleCount: diagnostics.curvatureSampleCount,
      diagnosticsSource: "formal_motion_candidate_samples_vs_authoritative_waypoints",
      source: inspection.source,
      motionCandidateSetId: inspection.motionCandidateSetId,
      planId: inspection.record.plan_id,
    });
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
        bound: true,
        mode: record.mode,
        schema_version: SCHEMA_VERSION,
        motion_set_id: set.motion_set_id,
        record,
      });
      const waypoints = route?.waypoints;
      const samples = recordInspection.samples;
      const timeOffsetSeconds = Number(route?.motion_time_offset_seconds ?? 0);
      if (!finite(timeOffsetSeconds) || timeOffsetSeconds < 0) {
        return invalid("formal_motion_time_offset_invalid");
      }
      const timeOffsetMs = timeOffsetSeconds * 1000;
      if (!Array.isArray(waypoints) || waypoints.length < 2) return invalid("route_waypoints_missing");
      const first = coordinate(waypoints[0]);
      const last = coordinate(waypoints[waypoints.length - 1]);
      const rawWaypointPayload = waypoints.map((waypoint, waypointIndex) => ({
        longitude: coordinate(waypoint)?.lon,
        latitude: coordinate(waypoint)?.lat,
        eta: samples[record.waypoint_anchors[waypointIndex]?.motion_sample_index]?.etaText,
        recommended_speed_mps: waypoint.recommended_speed_mps,
      }));
      if (!first || !last || first.lon !== samples[0].lon || first.lat !== samples[0].lat ||
          last.lon !== samples[samples.length - 1].lon ||
          last.lat !== samples[samples.length - 1].lat ||
          !sameShiftedInstant(waypoints[0].eta, samples[0].eta, timeOffsetMs) ||
          !sameShiftedInstant(
            waypoints[waypoints.length - 1].eta,
            samples[samples.length - 1].eta,
            timeOffsetMs
          ) ||
          !sameShiftedInstant(
            route.effective_adoption_time, samples[0].eta, timeOffsetMs
          ) ||
          rawWaypointPayload.some((waypoint) => !finite(waypoint.longitude) ||
            !finite(waypoint.latitude) || !finite(waypoint.recommended_speed_mps)) ||
          canonicalDigest(rawWaypointPayload) !== record.raw_route_digest) {
        return invalid("formal_motion_route_or_adoption_mismatch");
      }
      return {valid: true, usable: true, reason: null, schema_version: SCHEMA_VERSION,
        source: SCHEMA_VERSION, motion_set_id: set.motion_set_id, record, samples,
        timeOffsetSeconds};
    }
    return invalid(rejectionReason);
  }

  function buildPath(bundle, route, startMs) {
    const inspection = inspect(bundle, route);
    if (!inspection.valid) return null;
    const timeOffsetMs = inspection.timeOffsetSeconds * 1000;
    const points = inspection.samples.map(({lon, lat, eta}) => ({
      lon,
      lat,
      eta: new Date(eta + timeOffsetMs).toISOString(),
    }));
    const timesMs = inspection.samples.map(
      (sample) => sample.eta + timeOffsetMs - startMs
    );
    const distancesKm = [0];
    for (let index = 1; index < points.length; index += 1) {
      const distance = haversineKm(points[index - 1], points[index]);
      if (!finite(distance) || distance <= 1e-9) return null;
      distancesKm.push(distancesKm[index - 1] + distance);
    }
    const diagnostics = motionDiagnostics(route, points);
    return Object.freeze({points, timesMs, distancesKm, anchorDistancesKm: distancesKm,
      courseDegrees: inspection.samples.map((sample) => sample.course_degrees),
      speedKnots: inspection.samples.map((sample) => sample.speed_knots),
      smoothingApplied: true,
      minimumRadiusM: diagnostics.minimumRadiusM,
      maximumDeviationM: diagnostics.maximumDeviationM,
      curvatureSampleCount: diagnostics.curvatureSampleCount,
      diagnosticsSource: "formal_motion_samples_vs_authoritative_waypoints",
      source: inspection.source,
      motionSetId: inspection.motion_set_id, planId: inspection.record.plan_id});
  }

  // These are presentation diagnostics only.  They never alter the formal
  // motion samples, ETA interpolation, or any safety gate.  A local
  // equirectangular projection is sufficient for the short route segments in
  // this Viewer and keeps the diagnostic deterministic and dependency-free.
  const EARTH_RADIUS_M = 6371008.8;

  function localMeters(point, originLat, originLon) {
    const radians = Math.PI / 180;
    return {
      x: (point.lon - originLon) * radians * EARTH_RADIUS_M *
        Math.cos(originLat * radians),
      y: (point.lat - originLat) * radians * EARTH_RADIUS_M,
    };
  }

  function pointToSegmentDistanceM(point, start, end) {
    const originLat = (point.lat + start.lat + end.lat) / 3;
    const originLon = (point.lon + start.lon + end.lon) / 3;
    const p = localMeters(point, originLat, originLon);
    const a = localMeters(start, originLat, originLon);
    const b = localMeters(end, originLat, originLon);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
    const fraction = Math.max(0, Math.min(1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    return Math.hypot(p.x - (a.x + fraction * dx), p.y - (a.y + fraction * dy));
  }

  function circumradiusM(first, middle, last) {
    const originLat = (first.lat + middle.lat + last.lat) / 3;
    const originLon = (first.lon + middle.lon + last.lon) / 3;
    const a = localMeters(first, originLat, originLon);
    const b = localMeters(middle, originLat, originLon);
    const c = localMeters(last, originLat, originLon);
    const ab = Math.hypot(b.x - a.x, b.y - a.y);
    const bc = Math.hypot(c.x - b.x, c.y - b.y);
    const ca = Math.hypot(a.x - c.x, a.y - c.y);
    const twiceArea = Math.abs(
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
    );
    // Straight samples have no finite curvature radius; omit them rather
    // than reporting a misleading infinity or an unstable huge value.
    if (twiceArea <= 1e-6 || ab <= 1e-6 || bc <= 1e-6 || ca <= 1e-6) return null;
    const radius = (ab * bc * ca) / (2 * twiceArea);
    return finite(radius) && radius > 0 ? radius : null;
  }

  function motionDiagnostics(route, samples) {
    const waypoints = (route?.waypoints || []).map(coordinate).filter(Boolean);
    let maximumDeviationM = null;
    if (waypoints.length >= 2 && samples.length) {
      let maximum = 0;
      for (const sample of samples) {
        let nearest = Infinity;
        for (let index = 1; index < waypoints.length; index += 1) {
          nearest = Math.min(
            nearest,
            pointToSegmentDistanceM(sample, waypoints[index - 1], waypoints[index]),
          );
        }
        if (finite(nearest)) maximum = Math.max(maximum, nearest);
      }
      maximumDeviationM = maximum;
    }
    let minimumRadiusM = null;
    let curvatureSampleCount = 0;
    for (let index = 1; index < samples.length - 1; index += 1) {
      const radius = circumradiusM(samples[index - 1], samples[index], samples[index + 1]);
      if (radius === null) continue;
      curvatureSampleCount += 1;
      minimumRadiusM = minimumRadiusM === null ? radius : Math.min(minimumRadiusM, radius);
    }
    return {minimumRadiusM, maximumDeviationM, curvatureSampleCount};
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
    SCHEMA_VERSION,
    inspectSet,
    inspectSetAsync,
    prevalidate,
    inspect,
    buildPath,
    inspectCandidateSet,
    inspectCandidateSetAsync,
    prevalidateCandidateSets,
    inspectCandidate,
    buildCandidatePath,
    canonicalDigest,
    canonicalDigestAsync,
  });
})();

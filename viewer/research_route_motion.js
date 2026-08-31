/* Explicit research-only motion sidecar reader.
 *
 * The normal Viewer path remains route_smoothing.js + the published timeline.
 * This helper is used only after the operator explicitly enables the bundled
 * C research sidecar. Invalid qualification evidence, identity, coordinates,
 * or ETA ordering returns null so app.js can fall back to the existing
 * timeline motion. v1 intentionally retains its historical validation
 * semantics; v2 is a separate, stricter reader for an already-qualified
 * multi-span research result.
 */
(() => {
  "use strict";

  const V1_SCHEMA_VERSION = "c.research-route-smoothing-sidecar.v1";
  const V2_SCHEMA_VERSION = "c.research-route-smoothing-sidecar.v2";
  // Keep the old public constant stable for callers that used it as the v1
  // compatibility marker.
  const SCHEMA_VERSION = V1_SCHEMA_VERSION;
  const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([
    V1_SCHEMA_VERSION,
    V2_SCHEMA_VERSION,
  ]);
  const SHA256 = /^[0-9a-f]{64}$/i;
  const finite = (value) => typeof value === "number" && Number.isFinite(value);

  const REQUIRED_V1_GATES = Object.freeze([
    "risk_rechecked",
    "hard_mask_rechecked",
    "coverage_complete",
    "eta_recomputed",
    "speed_checked",
  ]);
  const REQUIRED_V2_GATES = Object.freeze([
    ["research_gate_passed"],
    ...REQUIRED_V1_GATES.map((name) => [name]),
    ["curvature_checked", "curve_checked"],
    ["corridor_checked", "corridor_containment_checked"],
    ["kinematics_checked", "manoeuvring_checked"],
  ]);
  const CALIBRATION_LABELS = Object.freeze([
    "NOT_CALIBRATED",
    "SYNTHETIC_UNCALIBRATED",
  ]);
  const MANOEUVRING_LABELS = Object.freeze([
    "SYNTHETIC_ONLY",
    "SYNTHETIC_ASSUMPTION_ONLY",
  ]);

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

  function v2EtaMs(value) {
    if (typeof value !== "string" ||
        !/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value)) return null;
    return etaMs(value);
  }

  function routeIdOf(route) {
    return route?.route_id ?? route?.plan_id ?? route?.id ?? null;
  }

  function sameRoute(route, sidecar) {
    const authoritative = sidecar.authoritative_route;
    if (!authoritative || typeof authoritative !== "object") return false;
    if (authoritative.route_digest !== sidecar.raw_route_digest) return false;
    const routeId = routeIdOf(route);
    if (sidecar.route_id !== null && sidecar.route_id !== undefined &&
        routeId !== null && sidecar.route_id !== routeId) return false;
    const waypoints = route?.waypoints;
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

  function evidenceFor(schemaVersion, sidecar, {
    digestValid = false,
    canonicalChecked = false,
    sampleCount = 0,
    sameGeometryMotionDigest = null,
  } = {}) {
    const declaredDigest = typeof sidecar?.sidecar_digest === "string"
      ? sidecar.sidecar_digest
      : null;
    return Object.freeze({
      schema: schemaVersion || null,
      schema_version: schemaVersion || null,
      digest: Object.freeze({
        declared: declaredDigest,
        canonical_checked: canonicalChecked,
        valid: digestValid,
      }),
      sidecar_digest: declaredDigest,
      digest_valid: digestValid,
      sample_count: sampleCount,
      same_geometry_motion_digest: sameGeometryMotionDigest,
    });
  }

  function invalid(reason, schemaVersion = null, sidecar = null, evidence = {}) {
    return {
      valid: false,
      reason,
      schema_version: schemaVersion,
      evidence: evidenceFor(schemaVersion, sidecar, evidence),
    };
  }

  function validDigest(value) {
    return typeof value === "string" && SHA256.test(value);
  }

  function routeCoordinates(route) {
    if (!Array.isArray(route?.waypoints) || route.waypoints.length < 2) return null;
    const points = route.waypoints.map(coordinateOf);
    if (points.some((point) => point === null)) return null;
    return points.map((point) => [point.lon, point.lat]);
  }

  /*
   * Python's existing canonical convention is:
   * json.dumps(value, ensure_ascii=False, allow_nan=False,
   *            sort_keys=True, separators=(",", ":"))
   *
   * The Viewer receives parsed JSON, so the original spelling of a number is
   * no longer available. The serializer below follows JSON's stable ordering
   * and UTF-8 rules and includes a Python-compatible numeric form for the
   * finite values emitted by the research sidecar. The route digest helper
   * additionally accounts for C/Python's float conversion of coordinates
   * before hashing.
  */
  function floatHint(key) {
    return [
      "lon", "lat", "longitude", "latitude", "course_degrees", "speed_knots",
      "recommended_speed_mps",
      "minimum_radius_m", "maximum_deviation_m", "maximum_yaw_rate",
      "maximum_lateral_acceleration", "risk", "delta", "tolerance",
      "curvature", "acceleration", "radius", "radius_m", "distance_m", "distance_km",
      "travel_hours", "integrated_risk_hours", "average_risk", "maximum_risk",
      "minimum_confidence", "path_length_m", "arc_length_m", "anchor_distances_m",
      "parameter_start", "parameter_end", "trim_fraction", "points_m", "points", "raw_points", "samples",
      "radii_m", "curvatures_m_inv", "samples_m", "first_derivatives_m", "second_derivatives_m",
      "control_points_m", "entry_m", "vertex_m", "scale_m", "trim_m", "parameters",
      "curve_samples", "cumulative_distance_m", "error_m", "error_rad", "curvature_abs_m_inv",
      "expansion_m", "span_convex_hulls_m", "lateral_acceleration_m_s2",
      "yaw_rate_deg_s", "yaw_rate_rad_s", "lateral_accelerations_m_s2",
      "yaw_rates_deg_s", "yaw_rates_rad_s", "additional_peak_rss_gate_mib",
    ].some((suffix) => key === suffix || key.endsWith(`_${suffix}`)) ||
      key === "knot_vector" || key === "route_coordinates" || key === "coordinates";
  }

  function pythonNumber(value, key) {
    if (Object.is(value, -0)) return floatHint(key) ? "-0.0" : "0";
    const magnitude = Math.abs(value);
    if (Number.isInteger(value) && floatHint(key) && magnitude < 1e16) return `${value}.0`;
    let result = String(value);
    // ECMAScript keeps 1e-6..1e-4 in decimal notation while CPython's
    // shortest float representation uses scientific notation below 1e-4.
    // Sidecar curvature evidence commonly falls in this interval.
    if (magnitude >= 1e-6 && magnitude < 1e-4 && !/[eE]/.test(result)) {
      result = value.toExponential();
    }
    if (magnitude >= 1e16 && !/[eE]/.test(result)) {
      result = value.toExponential();
    }
    const exponent = result.match(/^(-?\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
    if (exponent) {
      const sign = Number(exponent[2]) < 0 ? "-" : "+";
      const digits = String(Math.abs(Number(exponent[2]))).padStart(2, "0");
      result = `${exponent[1]}e${sign}${digits}`;
    }
    return result;
  }

  function canonicalJson(value, mode = "python", key = "") {
    if (value === null) return "null";
    if (value === true) return "true";
    if (value === false) return "false";
    if (typeof value === "number") {
      if (!finite(value)) throw new TypeError("canonical JSON cannot contain a non-finite number");
      return mode === "python" ? pythonNumber(value, key) : JSON.stringify(value);
    }
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJson(item, mode, key)).join(",")}]`;
    }
    if (typeof value !== "object") throw new TypeError("canonical JSON contains an unsupported value");
    const keys = Object.keys(value).sort();
    return `{${keys.map((name) =>
      `${JSON.stringify(name)}:${canonicalJson(value[name], mode, name)}`
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
      if (code <= 0x7f) {
        bytes.push(code);
      } else if (code <= 0x7ff) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code <= 0xffff) {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
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
        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      state = state.map((value, index) => (value + [a, b, c, d, e, f, g, h][index]) >>> 0);
    }
    return state.map((value) => value.toString(16).padStart(8, "0")).join("");
  }

  function canonicalDigestCandidates(value) {
    return canonicalDigestCandidatesAt(value, "");
  }

  function canonicalDigestCandidatesAt(value, key) {
    const candidates = [];
    for (const mode of ["python"]) {
      try {
        const canonical = canonicalJson(value, mode, key);
        const digest = sha256Hex(canonical);
        if (!candidates.includes(digest)) candidates.push(digest);
      } catch (error) {
        return [];
      }
    }
    return candidates;
  }

  function canonicalDigest(value) {
    const candidates = canonicalDigestCandidates(value);
    return candidates[0] || null;
  }

  function canonicalDigestAt(value, key) {
    const candidates = canonicalDigestCandidatesAt(value, key);
    return candidates[0] || null;
  }

  async function canonicalDigestAtAsync(value, key = "") {
    const subtle = window.crypto?.subtle;
    if (!subtle || typeof TextEncoder !== "function") return canonicalDigestAt(value, key);
    const bytes = new TextEncoder().encode(canonicalJson(value, "python", key));
    const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
    return Array.from(digest, (item) => item.toString(16).padStart(2, "0")).join("");
  }

  function digestMatches(value, declared) {
    return validDigest(declared) && canonicalDigestCandidates(value)
      .some((candidate) => candidate.toLowerCase() === declared.toLowerCase());
  }

  function sidecarDigestPayload(sidecar) {
    const payload = {};
    for (const key of Object.keys(sidecar)) {
      if (key !== "sidecar_digest") payload[key] = sidecar[key];
    }
    return payload;
  }

  function routeDigestMatches(route, declared) {
    const coordinates = routeCoordinates(route);
    if (!coordinates || !validDigest(declared)) return false;
    const candidates = [
      ...canonicalDigestCandidatesAt(coordinates, "route_coordinates"),
      ...canonicalDigestCandidates(coordinates),
    ];
    return candidates.some((candidate) => candidate.toLowerCase() === declared.toLowerCase());
  }

  function sameRouteV2(route, sidecar) {
    const routeId = routeIdOf(route);
    if (typeof routeId !== "string" || routeId.length === 0 || sidecar.route_id !== routeId) {
      return false;
    }
    if (!routeDigestMatches(route, sidecar.raw_route_digest)) return false;
    if (typeof route.route_digest === "string" &&
        route.route_digest !== sidecar.raw_route_digest) return false;
    const identity = sidecar.route_identity;
    if (!identity || typeof identity !== "object" || Array.isArray(identity) ||
        identity.route_id !== routeId || identity.route_digest !== sidecar.raw_route_digest) {
      return false;
    }
    if (sidecar.authoritative_route?.route_id !== routeId) return false;
    return sameRoute(route, sidecar);
  }

  function sameRevisionAndAdoption(route, sidecar) {
    const routeRevision = route?.revision;
    if (sidecar.plan_revision !== null && sidecar.plan_revision !== undefined &&
        routeRevision !== null && routeRevision !== undefined &&
        sidecar.plan_revision !== routeRevision) {
      return "plan_revision_mismatch";
    }
    const routeAdoption = route?.effective_adoption_time;
    if (sidecar.adoption_time && routeAdoption) {
      const sidecarAdoptionMs = etaMs(sidecar.adoption_time);
      const routeAdoptionMs = etaMs(routeAdoption);
      if (sidecarAdoptionMs === null || routeAdoptionMs === null ||
          sidecarAdoptionMs !== routeAdoptionMs) {
        return "adoption_time_mismatch";
      }
    }
    return null;
  }

  function samplesV1(sidecar) {
    const values = sidecar.motion_samples;
    if (!Array.isArray(values) || values.length < 2) return null;
    const samples = values.map((value) => {
      const point = coordinateOf(value);
      const eta = etaMs(value?.eta);
      return point && Number.isFinite(eta) ? { ...point, eta } : null;
    });
    if (samples.some((sample) => sample === null)) return null;
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index].eta <= samples[index - 1].eta) return null;
    }
    return samples;
  }

  function inspectV1(sidecar, route) {
    if (sidecar.research_only !== true || sidecar.status !== "ACCEPTED" ||
        sidecar.applied !== true) {
      return invalid(sidecar.fallback_reason || "sidecar_not_accepted", V1_SCHEMA_VERSION, sidecar);
    }
    if (sidecar.research_eligible !== true) {
      return invalid("research_gate_not_passed", V1_SCHEMA_VERSION, sidecar);
    }
    const validation = sidecar.validation;
    if (!validation || typeof validation !== "object" ||
        validation.research_gate_passed !== true) {
      return invalid("research_gate_not_passed", V1_SCHEMA_VERSION, sidecar);
    }
    if (REQUIRED_V1_GATES.some((name) => validation[name] !== true)) {
      return invalid("research_gate_incomplete", V1_SCHEMA_VERSION, sidecar);
    }
    if (!validDigest(sidecar.sidecar_digest)) {
      return invalid("missing_sidecar_digest", V1_SCHEMA_VERSION, sidecar);
    }
    const revisionFailure = sameRevisionAndAdoption(route, sidecar);
    if (revisionFailure) return invalid(revisionFailure, V1_SCHEMA_VERSION, sidecar);
    if (!sameRoute(route, sidecar)) {
      return invalid("authoritative_route_mismatch", V1_SCHEMA_VERSION, sidecar);
    }
    const samples = samplesV1(sidecar);
    if (!Array.isArray(sidecar.motion_samples) || sidecar.motion_samples.length < 2) {
      return invalid("missing_motion_samples", V1_SCHEMA_VERSION, sidecar);
    }
    if (!samples) return invalid("invalid_motion_sample", V1_SCHEMA_VERSION, sidecar);
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index].eta <= samples[index - 1].eta) {
        return invalid("non_monotonic_motion_sample_eta", V1_SCHEMA_VERSION, sidecar);
      }
    }
    return {
      valid: true,
      reason: null,
      schema_version: V1_SCHEMA_VERSION,
      source: "c_research_route_smoothing_sidecar",
      route_digest: sidecar.raw_route_digest,
      sidecar_digest: sidecar.sidecar_digest,
      same_geometry_motion_digest: null,
      samples,
      evidence: evidenceFor(V1_SCHEMA_VERSION, sidecar, {
        // v1 requires a digest-shaped producer value but historically did
        // not recompute its canonical digest.
        digestValid: true,
        sampleCount: samples.length,
      }),
    };
  }

  function objectLike(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function validCurveModel(value) {
    if (value === undefined) return true;
    if (!objectLike(value) || value.degree !== 3 || !Array.isArray(value.knot_vector) ||
        value.knot_vector.length !== 11 || value.knot_vector.some((item) => !finite(item))) {
      return false;
    }
    const expected = [0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1];
    if (value.knot_vector.some((item, index) => Math.abs(item - expected[index]) > 1e-12)) {
      return false;
    }
    const controls = value.control_points;
    if (controls !== undefined && (!Array.isArray(controls) || controls.length < 4 ||
        controls.some((point) => !coordinateOf(point)))) return false;
    if (value.spans !== undefined) {
      if (!Array.isArray(value.spans) || value.spans.length !== 4) return false;
      for (const span of value.spans) {
        if (!objectLike(span)) return false;
        const spanControls = span.control_points ?? span.controls;
        if (!Array.isArray(spanControls) || spanControls.length < 4 ||
            spanControls.some((point) => !coordinateOf(point))) return false;
      }
    }
    return true;
  }

  function consistentValue(sidecar, validation, key, extraContainers = []) {
    const values = [];
    for (const container of [sidecar, validation, ...extraContainers]) {
      if (objectLike(container) && Object.prototype.hasOwnProperty.call(container, key)) {
        values.push(container[key]);
      }
    }
    if (values.length === 0 || values.some((value) => value !== values[0])) {
      return { present: false, value: null };
    }
    return { present: true, value: values[0] };
  }

  function gateIsTrue(validation, names) {
    const sources = [validation];
    if (objectLike(validation.gates)) sources.push(validation.gates);
    const values = sources.flatMap((source) => names
      .filter((name) => Object.prototype.hasOwnProperty.call(source, name))
      .map((name) => source[name]));
    return values.length > 0 && values.every((value) => value === true);
  }

  function v2Samples(sidecar) {
    const values = sidecar.motion_samples;
    if (!Array.isArray(values) || values.length < 2) {
      return { reason: "missing_motion_samples", samples: null, count: 0 };
    }
    const samples = values.map((value) => {
      const required = ["lon", "lat", "eta", "course_degrees", "speed_knots"];
      if (!objectLike(value) || required.some((name) =>
        !Object.prototype.hasOwnProperty.call(value, name))) return null;
      const point = finite(value.lon) && finite(value.lat) &&
        value.lon >= -180 && value.lon <= 180 && value.lat >= -90 && value.lat <= 90
        ? { lon: value.lon, lat: value.lat }
        : null;
      const eta = v2EtaMs(value.eta);
      const course = value.course_degrees;
      const speed = value.speed_knots;
      if (!point || !finite(course) || !finite(speed) || course < 0 || course >= 360 || speed < 0 ||
          !Number.isFinite(eta)) return null;
      return { ...point, eta, course_degrees: course, speed_knots: speed };
    });
    if (samples.some((sample) => sample === null)) {
      return { reason: "invalid_motion_sample", samples: null, count: values.length };
    }
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index].eta <= samples[index - 1].eta) {
        return { reason: "non_monotonic_motion_sample_eta", samples: null, count: samples.length };
      }
    }
    return { reason: null, samples, count: samples.length };
  }

  function inspectV2(sidecar, route) {
    if (sidecar.research_only !== true || sidecar.status !== "ACCEPTED" ||
        sidecar.applied !== true) {
      return invalid(sidecar.fallback_reason || "sidecar_not_accepted", V2_SCHEMA_VERSION, sidecar);
    }
    if (sidecar.research_eligible !== true) {
      return invalid("research_gate_not_passed", V2_SCHEMA_VERSION, sidecar);
    }
    const validation = sidecar.validation;
    if (!objectLike(validation) ||
        REQUIRED_V2_GATES.some((names) => !gateIsTrue(validation, names))) {
      return invalid("research_gate_incomplete", V2_SCHEMA_VERSION, sidecar);
    }
    const production = consistentValue(sidecar, validation, "production_qualified", [
      sidecar.qualification,
    ]);
    if (!production.present || production.value !== false) {
      return invalid("production_qualification_forbidden", V2_SCHEMA_VERSION, sidecar);
    }
    const calibration = consistentValue(sidecar, validation, "calibration_status", [
      sidecar.qualification,
    ]);
    if (!calibration.present || !CALIBRATION_LABELS.includes(calibration.value)) {
      return invalid("synthetic_calibration_required", V2_SCHEMA_VERSION, sidecar);
    }
    const manoeuvring = consistentValue(sidecar, validation, "manoeuvring_qualification", [
      sidecar.qualification,
    ]);
    if (!manoeuvring.present || !MANOEUVRING_LABELS.includes(manoeuvring.value)) {
      return invalid("synthetic_manoeuvring_required", V2_SCHEMA_VERSION, sidecar);
    }
    if (!validDigest(sidecar.raw_route_digest) || !sameRouteV2(route, sidecar)) {
      return invalid("authoritative_route_identity_mismatch", V2_SCHEMA_VERSION, sidecar);
    }
    const revisionFailure = sameRevisionAndAdoption(route, sidecar);
    if (revisionFailure) return invalid(revisionFailure, V2_SCHEMA_VERSION, sidecar);
    if (!validCurveModel(sidecar.curve_model)) {
      return invalid("invalid_curve_model", V2_SCHEMA_VERSION, sidecar);
    }
    const sameGeometryMotion = consistentValue(
      sidecar,
      validation,
      "same_geometry_motion_digest",
      [sidecar.evidence, sidecar.same_geometry_motion_evidence],
    );
    if (!sameGeometryMotion.present || !validDigest(sameGeometryMotion.value)) {
      return invalid("missing_same_geometry_motion_digest", V2_SCHEMA_VERSION, sidecar, {
        sameGeometryMotionDigest: sameGeometryMotion.value,
      });
    }
    const sameGeometryMotionDigest = sameGeometryMotion.value;
    const samples = v2Samples(sidecar);
    if (samples.reason) {
      return invalid(samples.reason, V2_SCHEMA_VERSION, sidecar, {
        sampleCount: samples.count,
        sameGeometryMotionDigest,
      });
    }
    if (!validDigest(sidecar.curve_digest) || canonicalDigest({
      curve_digest: sidecar.curve_digest,
      motion_samples: sidecar.motion_samples,
    }) !== sameGeometryMotionDigest) {
      return invalid("same_geometry_motion_digest_invalid", V2_SCHEMA_VERSION, sidecar, {
        sampleCount: samples.count,
        sameGeometryMotionDigest,
      });
    }
    if (!validDigest(sidecar.sidecar_digest)) {
      return invalid("missing_sidecar_digest", V2_SCHEMA_VERSION, sidecar, {
        sampleCount: samples.count,
        sameGeometryMotionDigest,
      });
    }
    if (!digestMatches(sidecarDigestPayload(sidecar), sidecar.sidecar_digest)) {
      return invalid("sidecar_digest_invalid", V2_SCHEMA_VERSION, sidecar, {
        canonicalChecked: true,
        sampleCount: samples.count,
        sameGeometryMotionDigest,
      });
    }
    return {
      valid: true,
      reason: null,
      schema_version: V2_SCHEMA_VERSION,
      source: "c_research_route_smoothing_sidecar.v2",
      route_digest: sidecar.raw_route_digest,
      sidecar_digest: sidecar.sidecar_digest,
      same_geometry_motion_digest: sameGeometryMotionDigest,
      samples: samples.samples,
      evidence: evidenceFor(V2_SCHEMA_VERSION, sidecar, {
        digestValid: true,
        canonicalChecked: true,
        sampleCount: samples.count,
        sameGeometryMotionDigest,
      }),
    };
  }

  function inspect(sidecar, route) {
    if (!sidecar || typeof sidecar !== "object") {
      return invalid("missing_sidecar");
    }
    if (sidecar.schema_version === V1_SCHEMA_VERSION) return inspectV1(sidecar, route);
    if (sidecar.schema_version === V2_SCHEMA_VERSION) return inspectV2(sidecar, route);
    return invalid("unsupported_sidecar_schema", sidecar.schema_version || null, sidecar);
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

  function maximumDeviation(sidecar, includeCurveModel = true) {
    const segmentValues = sidecar.geometry?.segments ||
      (includeCurveModel ? sidecar.curve_model?.spans : []) || [];
    return segmentValues.reduce(
      (maximum, segment) => Math.max(maximum, Number(segment?.maximum_deviation_m) || 0),
      0,
    );
  }

  function buildPath(sidecar, route, startMs) {
    const inspection = inspect(sidecar, route);
    if (!inspection.valid) return null;
    const samples = inspection.samples;
    const isV1 = inspection.schema_version === V1_SCHEMA_VERSION;
    const points = samples.map(({lon, lat}) => ({ lon, lat }));
    const originMs = isV1 ? startMs : finite(startMs) ? startMs : samples[0].eta;
    const timesMs = samples.map((sample) => sample.eta - originMs);
    if (!isV1 && timesMs.some((value) => !finite(value))) return null;
    const distancesKm = [0];
    for (let index = 1; index < points.length; index += 1) {
      const distance = haversineKm(points[index - 1], points[index]);
      if (!finite(distance) || distance <= 1e-9) return null;
      distancesKm.push(distancesKm[index - 1] + distance);
    }
    const digest = inspection.sidecar_digest;
    const routeDigest = inspection.route_digest || null;
    const sameGeometryMotionDigest = inspection.same_geometry_motion_digest;
    return Object.freeze({
      points,
      timesMs,
      distancesKm,
      anchorDistancesKm: distancesKm,
      courseDegrees: samples.map((sample) => sample.course_degrees ?? null),
      speedKnots: samples.map((sample) => sample.speed_knots ?? null),
      smoothingApplied: true,
      maximumDeviationM: maximumDeviation(sidecar, !isV1),
      source: inspection.source,
      schemaVersion: inspection.schema_version,
      schema_version: inspection.schema_version,
      routeDigest,
      route_digest: routeDigest,
      sidecarDigest: digest,
      sidecar_digest: digest,
      sameGeometryMotionDigest,
      same_geometry_motion_digest: sameGeometryMotionDigest,
      identity: Object.freeze({
        source: inspection.source,
        schema_version: inspection.schema_version,
        route_digest: routeDigest,
        sidecar_digest: digest,
        same_geometry_motion_digest: sameGeometryMotionDigest,
      }),
    });
  }

  window.ArcticRouteResearchMotion = Object.freeze({
    SCHEMA_VERSION,
    V1_SCHEMA_VERSION,
    V2_SCHEMA_VERSION,
    SUPPORTED_SCHEMA_VERSIONS,
    inspect,
    buildPath,
    // Exposed only as a deterministic fixture/provenance helper. It does not
    // qualify a sidecar and is never used to compute risk or vessel limits.
    canonicalDigest,
    canonicalDigestAt,
    canonicalDigestAtAsync,
  });
})();

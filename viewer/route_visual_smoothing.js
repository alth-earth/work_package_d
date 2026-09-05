/* Presentation-only screen-space route corner rounding.
 *
 * This module accepts already-projected Canvas coordinates and returns paint
 * commands. It never reads or changes route identity, waypoints, ETA, risk,
 * motion samples, vessel state, or route-adoption semantics.
 */
(() => {
  "use strict";

  const POLICY = "candidate_geometry_screen_space_adaptive_quadratic_display_only";
  const SCHEMA_VERSION = "presentation.route-visual-smoothing.v1";
  const DEFAULT_CONFIG = Object.freeze({
    cornerRadiusCssPx: 20,
    maxTrimFraction: 0.4,
    duplicateToleranceCssPx: 0.5,
    minimumTurnAngleDeg: 3,
    maximumTurnAngleDeg: 177,
  });
  const ROLE_POLICIES = Object.freeze({
    candidate_remaining: Object.freeze({rounded: true}),
    completed_track_raw: Object.freeze({rounded: true}),
  });

  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  const degrees = (value) => value * 180 / Math.PI;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  function normalizedConfig(options) {
    const config = {...DEFAULT_CONFIG, ...(options || {})};
    const unitsPerCssPixel = Number(options?.unitsPerCssPixel ?? 1);
    if (!finite(unitsPerCssPixel) || unitsPerCssPixel <= 0 ||
        !finite(config.cornerRadiusCssPx) || config.cornerRadiusCssPx <= 0 ||
        !finite(config.maxTrimFraction) || config.maxTrimFraction <= 0 ||
        config.maxTrimFraction >= 0.5 ||
        !finite(config.duplicateToleranceCssPx) || config.duplicateToleranceCssPx < 0 ||
        !finite(config.minimumTurnAngleDeg) || config.minimumTurnAngleDeg < 0 ||
        !finite(config.maximumTurnAngleDeg) ||
        config.maximumTurnAngleDeg <= config.minimumTurnAngleDeg ||
        config.maximumTurnAngleDeg >= 180) {
      return null;
    }
    return {...config, unitsPerCssPixel};
  }

  function pointOf(value) {
    if (!value || typeof value !== "object") return null;
    const x = Number(value.x);
    const y = Number(value.y);
    return finite(x) && finite(y) ? {x, y} : null;
  }

  function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function command(kind, values) {
    return Object.freeze({kind, ...values});
  }

  function rawCommands(points) {
    if (!points.length) return [];
    return [
      command("moveTo", points[0]),
      ...points.slice(1).map((point) => command("lineTo", point)),
    ];
  }

  // Clip a producer-timed path to the current simulation instant.  This is a
  // pure presentation helper: it copies source points, never projects or
  // alters route geometry, and fails closed for malformed time/coordinate
  // data.  `values` may be an array of samples or an object with `points`.
  function clipTimedPath(values, simulationTime, options = {}) {
    const source = Array.isArray(values) ? values : values?.points;
    const sourceCount = Array.isArray(source) ? source.length : 0;
    const sourceName = options.source || null;
    const expectedIdentity = options.expectedIdentity;
    const actualIdentity = options.identity;
    const identityFields = ["revision", "layer_set_id", "candidate_id", "objective"];
    const base = {
      schema_version: SCHEMA_VERSION,
      valid: false,
      visible: false,
      hidden: true,
      hidden_reason: null,
      source: sourceName,
      source_point_count: sourceCount,
      remaining_point_count: 0,
      first_visible_eta: null,
      first_visible_time_ms: null,
      arrival_eta: null,
      arrival_time_ms: null,
      simulation_time_ms: null,
      interpolated: false,
      segment_index: null,
      points: Object.freeze([]),
      presentation_only: true,
      authoritative_semantics_unchanged: true,
    };
    const fail = (reason, extra = {}) => Object.freeze({...base, hidden_reason: reason, ...extra});
    if (!Array.isArray(source) || source.length < 2) return fail("invalid_points");
    if (expectedIdentity !== undefined) {
      if (!expectedIdentity || !actualIdentity || identityFields.some((field) =>
        actualIdentity[field] !== expectedIdentity[field])) {
        return fail("identity_mismatch");
      }
    }

    const timeField = typeof options.timeField === "string" ? options.timeField : null;
    const readTime = (point) => {
      if (!point || typeof point !== "object") return null;
      const value = timeField ? point[timeField] :
        point.eta ?? point.time_ms ?? point.timeMs ?? point.timestamp ?? point.t;
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (typeof value !== "string") return null;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const coordinate = (point) => {
      if (!point || typeof point !== "object") return null;
      const lon = Number(point.lon ?? point.longitude ?? point.x);
      const lat = Number(point.lat ?? point.latitude ?? point.y);
      return Number.isFinite(lon) && Number.isFinite(lat) ? {lon, lat} : null;
    };
    const times = source.map(readTime);
    const coordinates = source.map(coordinate);
    if (times.some((value) => value === null) || coordinates.some((value) => value === null)) {
      return fail("invalid_timed_point");
    }
    for (let index = 1; index < times.length; index += 1) {
      if (times[index] <= times[index - 1]) return fail("non_monotonic_time");
    }
    const target = typeof simulationTime === "number"
      ? simulationTime
      : (typeof simulationTime === "string" ? Date.parse(simulationTime) : NaN);
    if (!Number.isFinite(target)) return fail("invalid_simulation_time");
    const arrivalTime = times[times.length - 1];
    const textTime = (time) => new Date(time).toISOString();
    const clonePoints = (points) => Object.freeze(points.map((point) =>
      Object.freeze({...point})
    ));
    const common = {
      valid: true,
      arrival_eta: textTime(arrivalTime),
      arrival_time_ms: arrivalTime,
      simulation_time_ms: target,
    };
    if (target >= arrivalTime) {
      return Object.freeze({...base, ...common, hidden_reason: "arrived"});
    }

    const interpolate = (first, second, time) => {
      const fraction = (time - times[first]) / (times[second] - times[first]);
      const point = {...source[first]};
      const lon = coordinates[first].lon +
        (coordinates[second].lon - coordinates[first].lon) * fraction;
      const lat = coordinates[first].lat +
        (coordinates[second].lat - coordinates[first].lat) * fraction;
      if (Object.prototype.hasOwnProperty.call(point, "lon") ||
          !Object.prototype.hasOwnProperty.call(point, "longitude")) point.lon = lon;
      if (Object.prototype.hasOwnProperty.call(point, "longitude")) point.longitude = lon;
      if (Object.prototype.hasOwnProperty.call(point, "lat") ||
          !Object.prototype.hasOwnProperty.call(point, "latitude")) point.lat = lat;
      if (Object.prototype.hasOwnProperty.call(point, "latitude")) point.latitude = lat;
      if (Object.prototype.hasOwnProperty.call(point, "x")) point.x = lon;
      if (Object.prototype.hasOwnProperty.call(point, "y")) point.y = lat;
      if (timeField || Object.prototype.hasOwnProperty.call(point, "eta")) {
        point[timeField || "eta"] = textTime(time);
      }
      if (Object.prototype.hasOwnProperty.call(point, "time_ms")) point.time_ms = time;
      if (Object.prototype.hasOwnProperty.call(point, "timeMs")) point.timeMs = time;
      if (Object.prototype.hasOwnProperty.call(point, "timestamp")) point.timestamp = time;
      if (Object.prototype.hasOwnProperty.call(point, "t")) point.t = textTime(time);
      return point;
    };

    if (target < times[0]) {
      const points = clonePoints(source);
      return Object.freeze({...base, ...common, visible: true, hidden: false,
        hidden_reason: null, points, remaining_point_count: points.length,
        first_visible_eta: textTime(times[0]), first_visible_time_ms: times[0]});
    }
    let index = 0;
    while (index < times.length - 1 && times[index + 1] <= target) index += 1;
    const exact = times[index] === target;
    const points = exact
      ? clonePoints(source.slice(index))
      : clonePoints([interpolate(index, index + 1, target), ...source.slice(index + 1)]);
    return Object.freeze({...base, ...common, visible: true, hidden: false,
      hidden_reason: null, points, remaining_point_count: points.length,
      first_visible_eta: textTime(exact ? times[index] : target),
      first_visible_time_ms: exact ? times[index] : target,
      interpolated: !exact, segment_index: exact ? index : index});
  }

  function result(points, commands, applied, fallbackReason, extra = {}) {
    return Object.freeze({
      schema_version: SCHEMA_VERSION,
      policy: POLICY,
      applied,
      presentation_only: true,
      authoritative_semantics_unchanged: true,
      fallback_reason: fallbackReason,
      source_point_count: points.sourceCount,
      display_point_count: points.values.length,
      rounded_corner_count: 0,
      skipped_corner_count: 0,
      collapsed_duplicate_count: points.collapsedCount,
      commands: Object.freeze(commands),
      ...extra,
    });
  }

  function buildRoundedPath(values, options = {}) {
    const sourceCount = Array.isArray(values) ? values.length : 0;
    const invalidPoints = {sourceCount, values: [], collapsedCount: 0};
    const config = normalizedConfig(options);
    if (!config) return result(invalidPoints, [], false, "invalid_config");
    if (!Array.isArray(values)) return result(invalidPoints, [], false, "invalid_points");

    const parsed = values.map(pointOf);
    if (parsed.some((point) => point === null)) {
      return result(invalidPoints, [], false, "invalid_point");
    }

    const duplicateTolerance = config.duplicateToleranceCssPx * config.unitsPerCssPixel;
    const points = [];
    let collapsedCount = 0;
    for (let index = 0; index < parsed.length; index += 1) {
      const point = parsed[index];
      const isEndpoint = index === 0 || index === parsed.length - 1;
      if (points.length && distance(points[points.length - 1], point) <= duplicateTolerance) {
        if (isEndpoint && index > 0) {
          // Preserve the published end point exactly.  If it only replaces a
          // nearby interior sample, that sample is the one counted as folded;
          // a two-point route keeps both endpoints even when coincident.
          if (points.length > 1) {
            points[points.length - 1] = point;
            collapsedCount += 1;
          } else {
            points.push(point);
          }
        } else {
          collapsedCount += 1;
        }
      } else {
        points.push(point);
      }
    }
    const pointState = {sourceCount, values: points, collapsedCount};
    if (points.length < 2) {
      return result(pointState, rawCommands(points), false, "insufficient_points");
    }
    if (points.length === 2) {
      return result(pointState, rawCommands(points), false, "no_eligible_corner");
    }

    const targetTrim = config.cornerRadiusCssPx * config.unitsPerCssPixel;
    const commands = [command("moveTo", points[0])];
    let roundedCornerCount = 0;
    let skippedCornerCount = 0;

    for (let index = 1; index < points.length - 1; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const next = points[index + 1];
      const incoming = {x: current.x - previous.x, y: current.y - previous.y};
      const outgoing = {x: next.x - current.x, y: next.y - current.y};
      const incomingLength = Math.hypot(incoming.x, incoming.y);
      const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
      if (incomingLength <= duplicateTolerance || outgoingLength <= duplicateTolerance) {
        commands.push(command("lineTo", current));
        skippedCornerCount += 1;
        continue;
      }

      const incomingUnit = {x: incoming.x / incomingLength, y: incoming.y / incomingLength};
      const outgoingUnit = {x: outgoing.x / outgoingLength, y: outgoing.y / outgoingLength};
      const turnAngle = degrees(Math.acos(clamp(
        incomingUnit.x * outgoingUnit.x + incomingUnit.y * outgoingUnit.y,
        -1,
        1,
      )));
      if (!finite(turnAngle) || turnAngle < config.minimumTurnAngleDeg ||
          turnAngle > config.maximumTurnAngleDeg) {
        commands.push(command("lineTo", current));
        skippedCornerCount += 1;
        continue;
      }

      // Each adjacent corner may consume at most 40% of their shared segment,
      // so two rounded corners always leave a non-overlapping straight span.
      const trim = Math.min(
        targetTrim,
        incomingLength * config.maxTrimFraction,
        outgoingLength * config.maxTrimFraction,
      );
      if (!finite(trim) || trim <= duplicateTolerance) {
        commands.push(command("lineTo", current));
        skippedCornerCount += 1;
        continue;
      }
      const entry = {
        x: current.x - incomingUnit.x * trim,
        y: current.y - incomingUnit.y * trim,
      };
      const exit = {
        x: current.x + outgoingUnit.x * trim,
        y: current.y + outgoingUnit.y * trim,
      };
      commands.push(command("lineTo", entry));
      commands.push(command("quadraticCurveTo", {
        cpx: current.x,
        cpy: current.y,
        x: exit.x,
        y: exit.y,
      }));
      roundedCornerCount += 1;
    }
    commands.push(command("lineTo", points[points.length - 1]));

    return result(
      pointState,
      commands,
      roundedCornerCount > 0,
      roundedCornerCount > 0 ? null : "no_eligible_corner",
      {rounded_corner_count: roundedCornerCount, skipped_corner_count: skippedCornerCount},
    );
  }

  // Role is diagnostic only: both approved roles use the same screen-space
  // rounding implementation, while callers decide whether a producer CURVE
  // or engineering-raw path is eligible before invoking this function.
  function buildRolePath(values, role, options = {}) {
    if (!Object.hasOwn(ROLE_POLICIES, role)) {
      const invalid = buildRoundedPath([], options);
      return Object.freeze({...invalid, role, fallback_reason: "unsupported_role"});
    }
    return Object.freeze({...buildRoundedPath(values, options), role});
  }

  function trace(context, path) {
    if (!context || !path || !Array.isArray(path.commands) || path.commands.length < 2) {
      return false;
    }
    context.beginPath();
    for (const item of path.commands) {
      if (item.kind === "moveTo") context.moveTo(item.x, item.y);
      else if (item.kind === "lineTo") context.lineTo(item.x, item.y);
      else if (item.kind === "quadraticCurveTo") {
        context.quadraticCurveTo(item.cpx, item.cpy, item.x, item.y);
      } else {
        return false;
      }
    }
    return true;
  }

  window.ArcticRouteVisualSmoothing = Object.freeze({
    POLICY,
    SCHEMA_VERSION,
    DEFAULT_CONFIG,
    ROLE_POLICIES,
    buildRoundedPath,
    buildRolePath,
    clipTimedPath,
    trace,
  });
})();

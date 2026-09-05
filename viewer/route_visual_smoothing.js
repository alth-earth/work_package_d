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
    minimumSpacingCssPx: 0,
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
        !finite(config.minimumSpacingCssPx) || config.minimumSpacingCssPx < 0 ||
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

  // The timed paint plan is deliberately separate from `clipTimedPath()`.
  // The latter clips source waypoints for candidate visibility, whereas this
  // plan clips already-rounded Canvas commands.  Every command carries the
  // ETA interval over which it is allowed to become visible, so the complete
  // rounded geometry can be prepared once and revealed monotonically.
  function timedCommand(kind, values, startTime, endTime, sourceStart, sourceEnd) {
    return command(kind, {
      ...values,
      time_start_ms: startTime,
      time_end_ms: endTime,
      source_start_index: sourceStart,
      source_end_index: sourceEnd,
    });
  }

  function timedRawCommands(points, times, sourceIndices = null) {
    if (!points.length) return [];
    const indices = sourceIndices || points.map((_, index) => index);
    const commands = [timedCommand(
      "moveTo", points[0], times[0], times[0], indices[0], indices[0],
    )];
    for (let index = 1; index < points.length; index += 1) {
      commands.push(timedCommand(
        "lineTo",
        points[index],
        times[index - 1],
        times[index],
        indices[index - 1],
        indices[index],
      ));
    }
    return commands;
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

  // Keep a raw command builder for callers that need an endpoint-only
  // exception.  It is deliberately separate from the screen-space smoother;
  // a caller can preserve producer-authored interior samples while adding
  // only the one endpoint turn needed by a clipped completed prefix.
  function rawPath(values, options = {}) {
    const sourceCount = Array.isArray(values) ? values.length : 0;
    const invalidPoints = {sourceCount, values: [], collapsedCount: 0};
    const config = normalizedConfig(options);
    if (!config) return result(invalidPoints, [], false, "invalid_config");
    if (!Array.isArray(values)) return result(invalidPoints, [], false, "invalid_points");
    const parsed = values.map(pointOf);
    if (parsed.some((point) => point === null)) {
      return result(invalidPoints, [], false, "invalid_point");
    }
    return result(
      {sourceCount, values: parsed, collapsedCount: 0},
      rawCommands(parsed),
      false,
      "endpoint_only",
    );
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
    const collapseTolerance = Math.max(
      duplicateTolerance,
      config.minimumSpacingCssPx * config.unitsPerCssPixel,
    );
    const points = [];
    let collapsedCount = 0;
    for (let index = 0; index < parsed.length; index += 1) {
      const point = parsed[index];
      const isEndpoint = index === 0 || index === parsed.length - 1;
      if (points.length && distance(points[points.length - 1], point) <= collapseTolerance) {
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

  // Build the same rounded geometry as buildRoundedPath(), but retain the
  // source ETA interval for every paint command.  The geometry is generated
  // from the complete authoritative path, never from a moving completed
  // prefix.  This is what prevents an already-visible turn from changing as
  // the vessel advances: callers only clip this immutable plan by time.
  function buildTimedRoundedPath(values, times, options = {}) {
    const sourceCount = Array.isArray(values) ? values.length : 0;
    const invalidPoints = {sourceCount, values: [], collapsedCount: 0};
    const config = normalizedConfig(options);
    const extras = {command_times_ms: Object.freeze([]), timed: true};
    if (!config) return result(invalidPoints, [], false, "invalid_config", extras);
    if (!Array.isArray(values)) return result(invalidPoints, [], false, "invalid_points", extras);
    if (!Array.isArray(times) || times.length !== values.length) {
      return result(invalidPoints, [], false, "invalid_times", extras);
    }
    const parsedTimes = times.map((value) => Number(value));
    if (parsedTimes.some((value) => !finite(value))) {
      return result(invalidPoints, [], false, "invalid_time", extras);
    }
    for (let index = 1; index < parsedTimes.length; index += 1) {
      if (parsedTimes[index] <= parsedTimes[index - 1]) {
        return result(invalidPoints, [], false, "non_monotonic_time", extras);
      }
    }
    const parsed = values.map(pointOf);
    if (parsed.some((point) => point === null)) {
      return result(invalidPoints, [], false, "invalid_point", extras);
    }

    const duplicateTolerance = config.duplicateToleranceCssPx * config.unitsPerCssPixel;
    const collapseTolerance = Math.max(
      duplicateTolerance,
      config.minimumSpacingCssPx * config.unitsPerCssPixel,
    );
    const retained = [];
    let collapsedCount = 0;
    for (let index = 0; index < parsed.length; index += 1) {
      const point = parsed[index];
      const isEndpoint = index === 0 || index === parsed.length - 1;
      if (retained.length && distance(retained[retained.length - 1].point, point) <= collapseTolerance) {
        if (isEndpoint && index > 0) {
          // Keep the exact published endpoint and its ETA.  A two-point route
          // still retains both endpoints even when they are coincident.
          if (retained.length > 1) {
            retained[retained.length - 1] = {point, time: parsedTimes[index], index};
            collapsedCount += 1;
          } else {
            retained.push({point, time: parsedTimes[index], index});
          }
        } else {
          collapsedCount += 1;
        }
      } else {
        retained.push({point, time: parsedTimes[index], index});
      }
    }
    const points = retained.map((item) => item.point);
    const pointTimes = retained.map((item) => item.time);
    const sourceIndices = retained.map((item) => item.index);
    const pointState = {sourceCount, values: points, collapsedCount};
    if (points.length < 2) {
      return result(
        pointState,
        timedRawCommands(points, pointTimes, sourceIndices),
        false,
        "insufficient_points",
        {
          command_times_ms: Object.freeze(pointTimes.slice()),
          timed: true,
          source_times_ms: Object.freeze(pointTimes.slice()),
        },
      );
    }
    if (points.length === 2) {
      const commands = timedRawCommands(points, pointTimes, sourceIndices);
      return result(
        pointState,
        commands,
        false,
        "no_eligible_corner",
        {
          command_times_ms: Object.freeze(commands.map((item) => item.time_end_ms)),
          timed: true,
          source_times_ms: Object.freeze(pointTimes.slice()),
        },
      );
    }

    const targetTrim = config.cornerRadiusCssPx * config.unitsPerCssPixel;
    const commands = [timedCommand(
      "moveTo", points[0], pointTimes[0], pointTimes[0], sourceIndices[0], sourceIndices[0],
    )];
    let roundedCornerCount = 0;
    let skippedCornerCount = 0;
    let cursorTime = pointTimes[0];
    const interpolateTime = (first, second, fraction) => {
      const value = first + (second - first) * clamp(fraction, 0, 1);
      return finite(value) ? value : second;
    };
    for (let index = 1; index < points.length - 1; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const next = points[index + 1];
      const incoming = {x: current.x - previous.x, y: current.y - previous.y};
      const outgoing = {x: next.x - current.x, y: next.y - current.y};
      const incomingLength = Math.hypot(incoming.x, incoming.y);
      const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
      const skip = () => {
        commands.push(timedCommand(
          "lineTo", current, cursorTime, pointTimes[index],
          sourceIndices[index - 1], sourceIndices[index],
        ));
        cursorTime = pointTimes[index];
        skippedCornerCount += 1;
      };
      if (incomingLength <= duplicateTolerance || outgoingLength <= duplicateTolerance) {
        skip();
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
        skip();
        continue;
      }

      const trim = Math.min(
        targetTrim,
        incomingLength * config.maxTrimFraction,
        outgoingLength * config.maxTrimFraction,
      );
      if (!finite(trim) || trim <= duplicateTolerance) {
        skip();
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
      // The incoming and outgoing fractions are ETA approximations over the
      // corresponding producer segment.  They are monotonic even when the
      // previous corner has already consumed part of the shared edge.
      const entryFraction = 1 - trim / incomingLength;
      const exitFraction = trim / outgoingLength;
      const entryTime = Math.max(
        cursorTime,
        interpolateTime(pointTimes[index - 1], pointTimes[index], entryFraction),
      );
      const exitTime = Math.max(
        entryTime,
        interpolateTime(pointTimes[index], pointTimes[index + 1], exitFraction),
      );
      commands.push(timedCommand(
        "lineTo",
        entry,
        cursorTime,
        entryTime,
        sourceIndices[index - 1],
        sourceIndices[index],
      ));
      commands.push(timedCommand(
        "quadraticCurveTo",
        {cpx: current.x, cpy: current.y, x: exit.x, y: exit.y},
        entryTime,
        exitTime,
        sourceIndices[index],
        sourceIndices[index + 1],
      ));
      cursorTime = exitTime;
      roundedCornerCount += 1;
    }
    commands.push(timedCommand(
      "lineTo",
      points[points.length - 1],
      cursorTime,
      pointTimes[pointTimes.length - 1],
      sourceIndices[sourceIndices.length - 2],
      sourceIndices[sourceIndices.length - 1],
    ));
    return result(
      pointState,
      commands,
      roundedCornerCount > 0,
      roundedCornerCount > 0 ? null : "no_eligible_corner",
      {
        rounded_corner_count: roundedCornerCount,
        skipped_corner_count: skippedCornerCount,
        command_times_ms: Object.freeze(commands.map((item) => item.time_end_ms)),
        source_times_ms: Object.freeze(pointTimes.slice()),
        timed: true,
      },
    );
  }

  function lerpPoint(first, second, fraction) {
    return {
      x: first.x + (second.x - first.x) * fraction,
      y: first.y + (second.y - first.y) * fraction,
    };
  }

  function commandEndpoint(item) {
    if (!item || typeof item !== "object") return null;
    if (item.kind === "moveTo" || item.kind === "lineTo" ||
        item.kind === "quadraticCurveTo" || item.kind === "bezierCurveTo") {
      return pointOf(item);
    }
    return null;
  }

  // Reveal a previously generated timed paint plan only through the current
  // instant. If `endpoint` is provided, a separate live tail reaches the
  // authoritative vessel projection; the rounded command preceding it stays
  // immutable so its visible prefix cannot move on the next frame.
  function clipTimedDisplayPath(path, simulationTime, options = {}) {
    const commands = Array.isArray(path?.commands) ? path.commands : [];
    const target = Number(simulationTime);
    const base = {
      schema_version: SCHEMA_VERSION,
      policy: POLICY,
      valid: false,
      visible: false,
      hidden: true,
      hidden_reason: null,
      presentation_only: true,
      authoritative_semantics_unchanged: true,
      timed: true,
      simulation_time_ms: finite(target) ? target : null,
      first_visible_time_ms: null,
      last_visible_time_ms: null,
      arrival_time_ms: null,
      command_count: 0,
      clipped: false,
      endpoint_exact: false,
      endpoint_tail_painted: false,
      commands: Object.freeze([]),
    };
    const fail = (reason, extra = {}) => Object.freeze({...base, hidden_reason: reason, ...extra});
    if (!commands.length) return fail("invalid_commands");
    if (!finite(target)) return fail("invalid_simulation_time");
    const first = commands[0];
    const firstTime = Number(first?.time_start_ms ?? first?.time_end_ms);
    const lastTime = Number(commands[commands.length - 1]?.time_end_ms);
    if (!finite(firstTime) || !finite(lastTime) || lastTime < firstTime) {
      return fail("invalid_command_times");
    }
    if (target < firstTime) {
      return fail("before_start", {arrival_time_ms: lastTime});
    }
    const endpoint = pointOf(options.endpoint);
    const visible = [];
    let cursor = commandEndpoint(first);
    let cursorTime = firstTime;
    if (!cursor) return fail("invalid_command_endpoint");
    visible.push(first);
    let clipped = false;
    let endpointExact = false;
    for (let index = 1; index < commands.length; index += 1) {
      const item = commands[index];
      const end = Number(item?.time_end_ms);
      const start = Number(item?.time_start_ms ?? cursorTime);
      if (!finite(start) || !finite(end) || end < start) return fail("invalid_command_times");
      if (target >= end) {
        visible.push(item);
        cursor = commandEndpoint(item);
        cursorTime = end;
        if (!cursor) return fail("invalid_command_endpoint");
        continue;
      }
      if (target < start) break;
      const span = end - start;
      const fraction = span > 0 ? clamp((target - start) / span, 0, 1) : 0;
      const itemEnd = commandEndpoint(item);
      if (!itemEnd) return fail("invalid_command_endpoint");
      if (item.kind === "lineTo") {
        const point = lerpPoint(cursor, itemEnd, fraction);
        visible.push(command("lineTo", {
          ...point,
          time_start_ms: start,
          time_end_ms: target,
          source_start_index: item.source_start_index,
          source_end_index: item.source_end_index,
        }));
        cursor = point;
      } else if (item.kind === "quadraticCurveTo") {
        const control = {x: Number(item.cpx), y: Number(item.cpy)};
        if (!pointOf(control)) return fail("invalid_command_control");
        const firstControl = lerpPoint(cursor, control, fraction);
        const curvePoint = lerpPoint(control, itemEnd, fraction);
        const naturalEnd = lerpPoint(firstControl, curvePoint, fraction);
        visible.push(command("quadraticCurveTo", {
          cpx: firstControl.x,
          cpy: firstControl.y,
          x: naturalEnd.x,
          y: naturalEnd.y,
          time_start_ms: start,
          time_end_ms: target,
          source_start_index: item.source_start_index,
          source_end_index: item.source_end_index,
        }));
        cursor = naturalEnd;
      } else if (item.kind === "bezierCurveTo") {
        const control1 = pointOf({x: Number(item.cp1x), y: Number(item.cp1y)});
        const control2 = pointOf({x: Number(item.cp2x), y: Number(item.cp2y)});
        if (!control1 || !control2) return fail("invalid_command_control");
        const p01 = lerpPoint(cursor, control1, fraction);
        const p12 = lerpPoint(control1, control2, fraction);
        const p23 = lerpPoint(control2, itemEnd, fraction);
        const p012 = lerpPoint(p01, p12, fraction);
        const p123 = lerpPoint(p12, p23, fraction);
        const naturalEnd = lerpPoint(p012, p123, fraction);
        visible.push(command("bezierCurveTo", {
          cp1x: p01.x,
          cp1y: p01.y,
          cp2x: p012.x,
          cp2y: p012.y,
          x: naturalEnd.x,
          y: naturalEnd.y,
          time_start_ms: start,
          time_end_ms: target,
          source_start_index: item.source_start_index,
          source_end_index: item.source_end_index,
        }));
        cursor = naturalEnd;
      } else {
        return fail("unsupported_command");
      }
      // The rounded command itself is immutable and therefore has a stable
      // prefix across frames.  An exact vessel endpoint is a separate live
      // tail: it may move while the current command is in progress, but it is
      // never folded back into the already-prepared rounded geometry.
      if (endpoint && fraction < 1 &&
          Math.hypot(endpoint.x - cursor.x, endpoint.y - cursor.y) > 1e-9) {
        visible.push(command("lineTo", {
          x: endpoint.x,
          y: endpoint.y,
          time_start_ms: target,
          time_end_ms: target,
          source_start_index: item.source_start_index,
          source_end_index: item.source_end_index,
          live_tail: true,
        }));
        cursor = endpoint;
      }
      cursorTime = target;
      clipped = true;
      endpointExact = Boolean(endpoint);
      break;
    }
    const reachedArrival = target >= lastTime;
    return Object.freeze({
      ...base,
      valid: true,
      visible: visible.length >= 2,
      hidden: visible.length < 2,
      hidden_reason: reachedArrival ? "arrived" : null,
      first_visible_time_ms: firstTime,
      last_visible_time_ms: clipped ? target : cursorTime,
      arrival_time_ms: lastTime,
      command_count: visible.length,
      clipped,
      endpoint_exact: endpointExact,
      endpoint_tail_painted: Boolean(endpointExact &&
        visible.some((item) => item.live_tail === true)),
      commands: Object.freeze(visible),
    });
  }

  // Round a turn whose vertex is the final visible point.  The lookahead is
  // context only: no command ever reaches it, so the painted completed track
  // remains clipped exactly at the current vessel position.  This is used for
  // both raw/timeline and formal CURVE tracks.  The formal producer samples
  // remain immutable; the returned commands are a paint-only representation.
  function buildEndpointRoundedPath(values, lookahead, options = {}) {
    const roundInterior = options.roundInterior !== false;
    const base = roundInterior ? buildRoundedPath(values, options) : rawPath(values, options);
    const diagnostics = {
      endpoint_turn_rounded: false,
      endpoint_lookahead_used: false,
      endpoint_lookahead_source: options.lookaheadSource || null,
      endpoint_fallback_reason: null,
      endpoint_lookahead_painted: false,
    };
    const fail = (reason) => Object.freeze({
      ...base,
      ...diagnostics,
      endpoint_fallback_reason: reason,
    });
    if (!Array.isArray(values) || values.length < 2 ||
        !Array.isArray(base.commands) || base.commands.length < 2) {
      return fail("insufficient_points");
    }
    const config = normalizedConfig(options);
    if (!config) return fail("invalid_config");
    const parsed = values.map(pointOf);
    if (parsed.some((point) => point === null)) return fail("invalid_point");
    const current = parsed[parsed.length - 1];
    const edgeTolerance = Math.max(
      config.duplicateToleranceCssPx,
      config.minimumSpacingCssPx,
    ) * config.unitsPerCssPixel;
    let previous = null;
    for (let index = parsed.length - 2; index >= 0; index -= 1) {
      if (distance(parsed[index], current) > edgeTolerance) {
        previous = parsed[index];
        break;
      }
    }
    const next = pointOf(lookahead);
    if (!previous) return fail("duplicate_endpoint");
    if (!next) return fail("lookahead_missing");
    diagnostics.endpoint_lookahead_used = true;

    const duplicateTolerance = config.duplicateToleranceCssPx * config.unitsPerCssPixel;
    const incoming = {x: current.x - previous.x, y: current.y - previous.y};
    const outgoing = {x: next.x - current.x, y: next.y - current.y};
    const incomingLength = Math.hypot(incoming.x, incoming.y);
    const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
    if (incomingLength <= duplicateTolerance || outgoingLength <= duplicateTolerance) {
      return fail("short_endpoint_edges");
    }
    const incomingUnit = {
      x: incoming.x / incomingLength,
      y: incoming.y / incomingLength,
    };
    const outgoingUnit = {
      x: outgoing.x / outgoingLength,
      y: outgoing.y / outgoingLength,
    };
    const turnAngle = degrees(Math.acos(clamp(
      incomingUnit.x * outgoingUnit.x + incomingUnit.y * outgoingUnit.y,
      -1,
      1,
    )));
    if (!finite(turnAngle) || turnAngle < config.minimumTurnAngleDeg ||
        turnAngle > config.maximumTurnAngleDeg) {
      return fail("endpoint_turn_below_threshold");
    }
    const trim = Math.min(
      config.cornerRadiusCssPx * config.unitsPerCssPixel,
      incomingLength * config.maxTrimFraction,
      outgoingLength * config.maxTrimFraction,
    );
    if (!finite(trim) || trim <= duplicateTolerance) return fail("endpoint_trim_too_short");

    const entry = {
      x: current.x - incomingUnit.x * trim,
      y: current.y - incomingUnit.y * trim,
    };
    // A cubic can preserve the incoming tangent at the entry and the outgoing
    // producer tangent at the exact current endpoint.  The second control
    // point is only a tangent hint; it is never painted past `current`.
    const handle = trim * 0.82;
    const control1 = {
      x: entry.x + incomingUnit.x * handle,
      y: entry.y + incomingUnit.y * handle,
    };
    const control2 = {
      x: current.x - outgoingUnit.x * handle,
      y: current.y - outgoingUnit.y * handle,
    };
    const commands = base.commands.slice(0, -1);
    commands.push(command("lineTo", entry));
    commands.push(command("bezierCurveTo", {
      cp1x: control1.x,
      cp1y: control1.y,
      cp2x: control2.x,
      cp2y: control2.y,
      x: current.x,
      y: current.y,
    }));
    return Object.freeze({
      ...base,
      applied: true,
      fallback_reason: null,
      commands: Object.freeze(commands),
      rounded_corner_count: base.rounded_corner_count + 1,
      endpoint_turn_rounded: true,
      endpoint_lookahead_used: true,
      endpoint_lookahead_source: options.lookaheadSource || null,
      endpoint_fallback_reason: null,
      endpoint_lookahead_painted: false,
    });
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

  function buildTimedRolePath(values, times, role, options = {}) {
    if (!Object.hasOwn(ROLE_POLICIES, role)) {
      const invalid = buildTimedRoundedPath([], [], options);
      return Object.freeze({...invalid, role, fallback_reason: "unsupported_role"});
    }
    return Object.freeze({...buildTimedRoundedPath(values, times, options), role});
  }

  function buildEndpointRolePath(values, role, lookahead, options = {}) {
    if (!Object.hasOwn(ROLE_POLICIES, role)) {
      const invalid = buildRoundedPath([], options);
      return Object.freeze({...invalid, role, endpoint_fallback_reason: "unsupported_role"});
    }
    return Object.freeze({
      ...buildEndpointRoundedPath(values, lookahead, options),
      role,
    });
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
      } else if (item.kind === "bezierCurveTo" &&
          typeof context.bezierCurveTo === "function") {
        context.bezierCurveTo(
          item.cp1x, item.cp1y, item.cp2x, item.cp2y, item.x, item.y,
        );
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
    buildTimedRoundedPath,
    buildEndpointRoundedPath,
    buildRolePath,
    buildTimedRolePath,
    buildEndpointRolePath,
    clipTimedPath,
    clipTimedDisplayPath,
    trace,
  });
})();

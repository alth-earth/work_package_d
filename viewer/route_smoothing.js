/* Display-only local cubic B-spline route smoothing.
 *
 * This module receives raw route coordinates and returns paint coordinates.
 * It never creates or changes ETA, speed, risk, hard-cell, vessel-position, or
 * route-adoption data.  A clamped cubic B-spline segment is evaluated through
 * its equivalent four-control-point cubic Bezier basis.
 */
(() => {
  "use strict";

  const EARTH_RADIUS_M = 6371008.8;
  const POLICY = "authoritative_waypoints_constrained_local_cubic_bspline_display_only";
  const SCHEMA_VERSION = "presentation.route-smoothing.v1";
  const DEFAULT_CONFIG = Object.freeze({
    // These are display-scale parameters, not a vessel manoeuvring model.
    // The previous 2 km value was visually sub-pixel on the 40 km grid legs
    // in the frozen viewer bundle, so a presentation-scale radius is used
    // while keeping the same fail-closed geometry checks. This is deliberately
    // not a vessel manoeuvring radius or a production safety limit.
    nominalRadiusM: 40000,
    maxDeviationM: 20000,
    cornerAngleThresholdDeg: 8,
    maxTrimFraction: 0.48,
    minimumTrimM: 250,
    maximumOverlapFraction: 0.8,
    curvatureTolerance: 0.75,
    sampleSpacingM: 750,
    minimumCurveSamples: 17,
    maximumCurveSamples: 257,
    maximumDisplayPoints: 10000,
  });

  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const radians = (value) => value * Math.PI / 180;
  const degrees = (value) => value * 180 / Math.PI;

  function coordinateOf(point) {
    if (!point || typeof point !== "object") return null;
    const lon = point.lon ?? point.longitude;
    const lat = point.lat ?? point.latitude;
    if (!finite(lon) || !finite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return null;
    }
    return { lon, lat };
  }

  function rawDisplayPoints(points) {
    if (!Array.isArray(points)) return [];
    return points.map((point) => {
      const coordinate = coordinateOf(point);
      return coordinate || point;
    });
  }

  function fallback(points, reason, extra = {}) {
    const raw = rawDisplayPoints(points);
    return Object.freeze({
      schema_version: SCHEMA_VERSION,
      policy: POLICY,
      applied: false,
      authoritative_semantics_unchanged: true,
      fallback_reason: reason,
      points: raw,
      raw_point_count: Array.isArray(points) ? points.length : 0,
      display_point_count: raw.length,
      smoothed_corner_count: 0,
      rejected_corner_count: 0,
      ...extra,
    });
  }

  function normalizedConfig(options) {
    const config = { ...DEFAULT_CONFIG, ...(options || {}) };
    const positive = [
      "nominalRadiusM",
      "maxDeviationM",
      "minimumTrimM",
      "sampleSpacingM",
      "minimumCurveSamples",
      "maximumCurveSamples",
      "maximumDisplayPoints",
    ];
    if (positive.some((key) => !finite(config[key]) || config[key] <= 0)) return null;
    if (!finite(config.cornerAngleThresholdDeg) || config.cornerAngleThresholdDeg < 0 ||
        config.cornerAngleThresholdDeg >= 179 || !finite(config.maxTrimFraction) ||
        config.maxTrimFraction <= 0 || config.maxTrimFraction >= 0.5 ||
        !finite(config.maximumOverlapFraction) || config.maximumOverlapFraction <= 0 ||
        config.maximumOverlapFraction >= 1 || !finite(config.curvatureTolerance) ||
        config.curvatureTolerance <= 0 || config.curvatureTolerance > 1) return null;
    config.minimumCurveSamples = Math.max(4, Math.floor(config.minimumCurveSamples));
    config.maximumCurveSamples = Math.max(
      config.minimumCurveSamples,
      Math.floor(config.maximumCurveSamples),
    );
    config.maximumDisplayPoints = Math.floor(config.maximumDisplayPoints);
    return config;
  }

  function wrapRadians(value) {
    return ((value + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  }

  function localFrame(points) {
    const origin = points[0];
    const lat0 = radians(origin.lat);
    const cosLat0 = Math.cos(lat0);
    if (!finite(cosLat0) || Math.abs(cosLat0) < 1e-6) return null;
    return {
      lon0: origin.lon,
      lat0: lat0,
      cosLat0,
      toLocal(point) {
        return {
          x: EARTH_RADIUS_M * wrapRadians(radians(point.lon - origin.lon)) * cosLat0,
          y: EARTH_RADIUS_M * (radians(point.lat) - lat0),
        };
      },
      toGeo(point) {
        const lon = origin.lon + degrees(point.x / (EARTH_RADIUS_M * cosLat0));
        const lat = degrees(lat0 + point.y / EARTH_RADIUS_M);
        return {
          lon: ((lon + 180) % 360 + 360) % 360 - 180,
          lat,
        };
      },
    };
  }

  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const multiply = (a, scalar) => ({ x: a.x * scalar, y: a.y * scalar });
  const norm = (a) => Math.hypot(a.x, a.y);
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;

  function unit(vector) {
    const length = norm(vector);
    return length > 1e-6 ? multiply(vector, 1 / length) : null;
  }

  function distanceToSegment(point, start, end) {
    const segment = subtract(end, start);
    const lengthSquared = dot(segment, segment);
    if (lengthSquared <= 1e-12) return norm(subtract(point, start));
    const fraction = clamp(dot(subtract(point, start), segment) / lengthSquared, 0, 1);
    return norm(subtract(point, add(start, multiply(segment, fraction))));
  }

  function distanceToPolyline(point, polyline) {
    let result = Infinity;
    for (let index = 0; index < polyline.length - 1; index += 1) {
      result = Math.min(result, distanceToSegment(point, polyline[index], polyline[index + 1]));
    }
    return result;
  }

  function evaluateClampedCubicBSpline(controls, t) {
    const p0 = controls[0];
    const p1 = controls[1];
    const p2 = controls[2];
    const p3 = controls[3];
    const oneMinus = 1 - t;
    return {
      x: oneMinus ** 3 * p0.x + 3 * oneMinus ** 2 * t * p1.x +
        3 * oneMinus * t ** 2 * p2.x + t ** 3 * p3.x,
      y: oneMinus ** 3 * p0.y + 3 * oneMinus ** 2 * t * p1.y +
        3 * oneMinus * t ** 2 * p2.y + t ** 3 * p3.y,
    };
  }

  function firstDerivative(controls, t) {
    const oneMinus = 1 - t;
    return add(
      add(
        multiply(subtract(controls[1], controls[0]), 3 * oneMinus ** 2),
        multiply(subtract(controls[2], controls[1]), 6 * oneMinus * t),
      ),
      multiply(subtract(controls[3], controls[2]), 3 * t ** 2),
    );
  }

  function secondDerivative(controls, t) {
    return add(
      multiply(add(subtract(controls[2], multiply(controls[1], 2)), controls[0]), 6 * (1 - t)),
      multiply(add(subtract(controls[3], multiply(controls[2], 2)), controls[1]), 6 * t),
    );
  }

  function curveRadiusM(controls, t) {
    const first = firstDerivative(controls, t);
    const speed = norm(first);
    if (!finite(speed) || speed <= 1e-6) return 0;
    const curvature = Math.abs(cross(first, secondDerivative(controls, t))) / speed ** 3;
    return curvature <= 1e-12 ? Infinity : 1 / curvature;
  }

  function curveForCorner(localPoints, index, turnAngle, trim, config) {
    const vertex = localPoints[index];
    const incoming = unit(subtract(vertex, localPoints[index - 1]));
    const outgoing = unit(subtract(localPoints[index + 1], vertex));
    if (!incoming || !outgoing) return null;
    const tangentRadius = trim / Math.tan(turnAngle / 2);
    const handle = (4 / 3) * tangentRadius * Math.tan(turnAngle / 4);
    if (!finite(handle) || handle <= 0) return null;
    const entry = subtract(vertex, multiply(incoming, trim));
    const exit = add(vertex, multiply(outgoing, trim));
    const controls = [
      entry,
      add(entry, multiply(incoming, handle)),
      subtract(exit, multiply(outgoing, handle)),
      exit,
    ];
    const controlLength = controls.slice(0, -1).reduce(
      (total, point, pointIndex) => total + norm(subtract(controls[pointIndex + 1], point)),
      0,
    );
    const sampleCount = clamp(
      Math.ceil(controlLength / config.sampleSpacingM) + 1,
      config.minimumCurveSamples,
      config.maximumCurveSamples,
    );
    const samples = [];
    let maximumDeviationM = 0;
    let minimumRadiusM = Infinity;
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const t = sampleIndex / (sampleCount - 1);
      const point = evaluateClampedCubicBSpline(controls, t);
      if (!finite(point.x) || !finite(point.y)) return null;
      samples.push(point);
      maximumDeviationM = Math.max(maximumDeviationM, distanceToPolyline(point, localPoints));
      minimumRadiusM = Math.min(minimumRadiusM, curveRadiusM(controls, t));
    }
    const radiusLimit = config.nominalRadiusM * config.curvatureTolerance;
    if (!finite(maximumDeviationM) || maximumDeviationM > config.maxDeviationM + 1e-6 ||
        !finite(minimumRadiusM) || minimumRadiusM < radiusLimit) {
      return null;
    }
    return { samples, maximumDeviationM, minimumRadiusM };
  }

  function eligibleCorners(localPoints, config) {
    const candidates = [];
    for (let index = 1; index < localPoints.length - 1; index += 1) {
      const incomingVector = subtract(localPoints[index], localPoints[index - 1]);
      const outgoingVector = subtract(localPoints[index + 1], localPoints[index]);
      const incoming = unit(incomingVector);
      const outgoing = unit(outgoingVector);
      if (!incoming || !outgoing) continue;
      const incomingLength = norm(incomingVector);
      const outgoingLength = norm(outgoingVector);
      const turnAngle = Math.acos(clamp(dot(incoming, outgoing), -1, 1));
      if (degrees(turnAngle) < config.cornerAngleThresholdDeg ||
          turnAngle >= radians(179)) continue;
      const trim = config.nominalRadiusM * Math.tan(turnAngle / 2);
      const availableTrim = config.maxTrimFraction * Math.min(incomingLength, outgoingLength);
      if (!finite(trim) || trim < config.minimumTrimM || trim > availableTrim) continue;
      candidates.push({ index, turnAngle, trim });
    }
    const blocked = new Set();
    for (let left = 0; left < candidates.length - 1; left += 1) {
      const first = candidates[left];
      const second = candidates[left + 1];
      if (second.index !== first.index + 1) continue;
      const sharedLength = norm(subtract(localPoints[second.index], localPoints[first.index]));
      if (first.trim + second.trim > sharedLength * config.maximumOverlapFraction) {
        blocked.add(first.index);
        blocked.add(second.index);
      }
    }
    return candidates.filter((candidate) => !blocked.has(candidate.index));
  }

  function smoothDisplayPoints(points, options = {}) {
    const coordinates = Array.isArray(points) ? points.map(coordinateOf) : null;
    if (!coordinates || coordinates.some((point) => point === null)) {
      return fallback(points, "invalid_coordinate");
    }
    const config = normalizedConfig(options);
    if (!config) return fallback(points, "invalid_config");
    if (coordinates.length < 3) return fallback(coordinates, "insufficient_points");
    for (let index = 1; index < coordinates.length; index += 1) {
      if (coordinates[index].lon === coordinates[index - 1].lon &&
          coordinates[index].lat === coordinates[index - 1].lat) {
        return fallback(coordinates, "duplicate_point");
      }
    }
    const frame = localFrame(coordinates);
    if (!frame) return fallback(coordinates, "invalid_local_frame");
    const localPoints = coordinates.map((point) => frame.toLocal(point));
    const candidates = eligibleCorners(localPoints, config);
    if (!candidates.length) return fallback(coordinates, "no_eligible_corner");

    const curves = new Map();
    let rejectedCornerCount = 0;
    for (const candidate of candidates) {
      const curve = curveForCorner(
        localPoints,
        candidate.index,
        candidate.turnAngle,
        candidate.trim,
        config,
      );
      if (curve) curves.set(candidate.index, curve);
      else rejectedCornerCount += 1;
    }
    if (!curves.size) {
      return fallback(
        coordinates,
        "all_curves_rejected",
        { rejected_corner_count: rejectedCornerCount },
      );
    }

    const displayPoints = [coordinates[0]];
    let lastRawIndex = 0;
    let maximumDeviationM = 0;
    let minimumRadiusM = Infinity;
    for (const [index, curve] of curves) {
      for (let rawIndex = lastRawIndex + 1; rawIndex < index; rawIndex += 1) {
        displayPoints.push(coordinates[rawIndex]);
      }
      for (const point of curve.samples) displayPoints.push(frame.toGeo(point));
      maximumDeviationM = Math.max(maximumDeviationM, curve.maximumDeviationM);
      minimumRadiusM = Math.min(minimumRadiusM, curve.minimumRadiusM);
      lastRawIndex = index;
    }
    for (let rawIndex = lastRawIndex + 1; rawIndex < coordinates.length; rawIndex += 1) {
      displayPoints.push(coordinates[rawIndex]);
    }
    if (displayPoints.length > config.maximumDisplayPoints) {
      return fallback(
        coordinates,
        "display_point_limit",
        { rejected_corner_count: rejectedCornerCount },
      );
    }
    return Object.freeze({
      schema_version: SCHEMA_VERSION,
      policy: POLICY,
      applied: true,
      authoritative_semantics_unchanged: true,
      fallback_reason: rejectedCornerCount ? "some_curves_rejected" : null,
      points: displayPoints,
      raw_point_count: coordinates.length,
      display_point_count: displayPoints.length,
      smoothed_corner_count: curves.size,
      rejected_corner_count: rejectedCornerCount,
      maximum_deviation_m: maximumDeviationM,
      minimum_curve_radius_m: minimumRadiusM,
    });
  }

  window.ArcticRouteSmoothing = Object.freeze({
    POLICY,
    SCHEMA_VERSION,
    DEFAULT_CONFIG,
    smoothDisplayPoints,
  });
})();

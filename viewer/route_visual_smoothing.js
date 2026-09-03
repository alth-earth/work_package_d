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
    buildRoundedPath,
    trace,
  });
})();

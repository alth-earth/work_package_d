/* Strict, presentation-only validation for the optional risk-explanation.v1 sidecar. */
((root, factory) => {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ArcticRiskExplanation = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  const TOP_LEVEL_FIELDS = Object.freeze([
    "frames",
    "identity",
    "producer",
    "publication_status",
    "schema_version",
  ]);
  const IDENTITY_FIELDS = Object.freeze([
    "as_of_time",
    "config_digest",
    "corridor_id",
    "generation_id",
    "model_config_digest",
    "risk_window_id",
    "run_id",
    "scenario_id",
    "vessel_profile_id",
  ]);
  const PRODUCER_FIELDS = Object.freeze([
    "calibration_status",
    "decomposition_method",
    "formula_component_ids",
    "formula_version",
    "generated_at",
    "producer_id",
    "sidecar_maturity",
    "source_risk_provenance",
  ]);
  const FRAME_FIELDS = Object.freeze(["cells", "coverage", "frame_time", "grid", "risk_frame_id"]);
  const GRID_FIELDS = Object.freeze(["columns", "crs", "grid_id", "rows"]);
  const COVERAGE_FIELDS = Object.freeze([
    "complete_cell_count",
    "expected_cell_count",
    "omitted_cell_count",
    "partial_cell_count",
    "published_cell_count",
    "unavailable_cell_count",
  ]);
  const CELL_FIELDS = Object.freeze([
    "cell",
    "contributors",
    "explanation_status",
    "reason",
    "risk",
    "uncertainty",
  ]);
  const CELL_IDENTITY_FIELDS = Object.freeze([
    "column_index",
    "latitude",
    "longitude",
    "row_index",
  ]);
  const RISK_FIELDS = Object.freeze(["confidence", "level", "score"]);
  const REASON_FIELDS = Object.freeze(["code", "locale", "main_contributor_ids", "text"]);
  const UNCERTAINTY_FIELDS = Object.freeze(["explanation_gaps", "missing_data", "status"]);
  const MISSING_DATA_REQUIRED_FIELDS = Object.freeze(["cause", "data_type"]);
  const CONTRIBUTOR_REQUIRED_FIELDS = Object.freeze([
    "component_ids",
    "contribution",
    "contributor_id",
    "display_name",
  ]);
  const SHA256 = /^[0-9a-f]{64}$/;
  const CONTRACT_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/;
  const RISK_FRAME_ID = /^risk-sha256-[0-9a-f]{64}$/;
  const RISK_WINDOW_ID = /^risk-window-sha256-[0-9a-f]{64}$/;
  const RUN_ID = /^run-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const COMPONENT_ID = /^[a-z][a-z0-9_]{0,127}$/;
  const UTC_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  const PUBLICATION_STATUSES = Object.freeze(["COMPLETE", "PARTIAL", "UNAVAILABLE"]);
  const EXPLANATION_STATUSES = Object.freeze(["COMPLETE", "PARTIAL", "UNAVAILABLE"]);
  const REASON_CODES = Object.freeze([
    "DOMINANT_CONTRIBUTOR",
    "EXPLANATION_UNAVAILABLE",
    "MISSING_DATA",
    "MULTIPLE_CONTRIBUTORS",
    "PARTIAL_EXPLANATION",
  ]);
  const UNCERTAINTY_STATUSES = Object.freeze([
    "NONE",
    "MISSING_DATA",
    "EXPLANATION_GAP",
    "UNKNOWN",
  ]);
  const MISSING_CAUSES = Object.freeze([
    "MISSING_INPUT",
    "NON_FINITE_INPUT",
    "NOT_PUBLISHED",
    "UNAVAILABLE_PROVENANCE",
    "UNSUPPORTED_DECOMPOSITION",
  ]);

  function exactFields(value, fields) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.length === fields.length && fields.every((field) =>
      Object.prototype.hasOwnProperty.call(value, field)
    );
  }

  function requiredAndOptionalFields(value, required, optional) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const permitted = new Set([...required, ...optional]);
    return required.every((field) => Object.prototype.hasOwnProperty.call(value, field)) &&
      Object.keys(value).every((field) => permitted.has(field));
  }

  function nonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
  }

  function finiteNumber(value, minimum = -Infinity, maximum = Infinity) {
    return typeof value === "number" && Number.isFinite(value) &&
      value >= minimum && value <= maximum;
  }

  function integer(value, minimum = 0) {
    return Number.isInteger(value) && value >= minimum;
  }

  function dateTime(value) {
    return nonEmptyString(value) && UTC_DATE_TIME.test(value) && Number.isFinite(Date.parse(value));
  }

  function uniqueStrings(value, pattern = null, allowEmpty = true) {
    return Array.isArray(value) && (allowEmpty || value.length > 0) &&
      value.every((item) => nonEmptyString(item) && (!pattern || pattern.test(item))) &&
      new Set(value).size === value.length;
  }

  function sameNumber(actual, expected, tolerance = 1e-9) {
    if (actual === null || expected === null) return actual === expected;
    return finiteNumber(actual) && finiteNumber(expected) && Math.abs(actual - expected) <= tolerance;
  }

  function unavailable(reason, mode = "invalid") {
    return Object.freeze({
      valid: false,
      mode,
      reason,
      publication_status: "UNAVAILABLE",
      cells: Object.freeze({}),
    });
  }

  function validIdentity(value) {
    return exactFields(value, IDENTITY_FIELDS) &&
      RISK_WINDOW_ID.test(value.risk_window_id) && RUN_ID.test(value.run_id) &&
      CONTRACT_ID.test(value.scenario_id) && CONTRACT_ID.test(value.corridor_id) &&
      CONTRACT_ID.test(value.vessel_profile_id) && SHA256.test(value.config_digest) &&
      SHA256.test(value.model_config_digest) && integer(value.generation_id) &&
      dateTime(value.as_of_time);
  }

  function validProducer(value) {
    return exactFields(value, PRODUCER_FIELDS) && nonEmptyString(value.producer_id) &&
      dateTime(value.generated_at) && nonEmptyString(value.formula_version) &&
      uniqueStrings(value.formula_component_ids, COMPONENT_ID, false) &&
      ["weighted_additive_decomposition_v1", "source_provided_attribution_v1"].includes(
        value.decomposition_method
      ) && ["demo_unvalidated", "experimental_unverified", "calibrated"].includes(
        value.calibration_status
      ) && ["formal", "synthetic", "legacy_unverified"].includes(value.source_risk_provenance) &&
      ["design_example", "research_unvalidated", "validated"].includes(value.sidecar_maturity);
  }

  function validContributor(value) {
    return requiredAndOptionalFields(value, CONTRIBUTOR_REQUIRED_FIELDS, ["dominant_component_id"]) &&
      COMPONENT_ID.test(value.contributor_id) && nonEmptyString(value.display_name) &&
      finiteNumber(value.contribution, 0, 1) &&
      uniqueStrings(value.component_ids, COMPONENT_ID, false) &&
      (value.dominant_component_id === undefined ||
        (COMPONENT_ID.test(value.dominant_component_id) &&
          value.component_ids.includes(value.dominant_component_id)));
  }

  function validReason(value) {
    return exactFields(value, REASON_FIELDS) && REASON_CODES.includes(value.code) &&
      nonEmptyString(value.text) && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value.locale) &&
      uniqueStrings(value.main_contributor_ids, COMPONENT_ID);
  }

  function validMissingDatum(value) {
    return requiredAndOptionalFields(value, MISSING_DATA_REQUIRED_FIELDS, ["detail"]) &&
      COMPONENT_ID.test(value.data_type) && MISSING_CAUSES.includes(value.cause) &&
      (value.detail === undefined || nonEmptyString(value.detail));
  }

  function validUncertainty(value) {
    return exactFields(value, UNCERTAINTY_FIELDS) && UNCERTAINTY_STATUSES.includes(value.status) &&
      Array.isArray(value.missing_data) && value.missing_data.every(validMissingDatum) &&
      uniqueStrings(value.explanation_gaps, COMPONENT_ID);
  }

  function cellKey(frameId, row, column) {
    return `${frameId}|${row}|${column}`;
  }

  function inspect(value, viewerBundle) {
    if (value === null || value === undefined) {
      return unavailable("risk explanation sidecar is absent", "missing");
    }
    if (!exactFields(value, TOP_LEVEL_FIELDS) || value.schema_version !== "risk-explanation.v1") {
      return unavailable("risk explanation schema_version or top-level fields are invalid");
    }
    if (!PUBLICATION_STATUSES.includes(value.publication_status) ||
        !validIdentity(value.identity) || !validProducer(value.producer) ||
        !Array.isArray(value.frames) || value.frames.length === 0) {
      return unavailable("risk explanation publication, identity, producer, or frames are invalid");
    }

    const risk = viewerBundle?.risk;
    const source = risk?.source;
    const baseFrames = risk?.frames;
    if (!source || !Array.isArray(baseFrames)) {
      return unavailable("displayed RiskFrame window is unavailable");
    }
    if (value.identity.risk_window_id !== source.risk_window_id) {
      return unavailable("RiskWindow identity mismatch");
    }
    if (value.identity.run_id !== source.run_id || value.identity.scenario_id !== source.scenario_id) {
      return unavailable("RiskWindow run or scenario identity mismatch");
    }

    const baseById = new Map(baseFrames.map((frame) => [frame.risk_id, frame]));
    const formulaComponents = new Set(value.producer.formula_component_ids);
    const cells = {};
    const seenFrameIds = new Set();
    const seenFrameTimes = new Set();
    let sharedGridId = null;
    let usableCount = 0;
    let omittedCount = 0;

    for (const explanationFrame of value.frames) {
      if (!exactFields(explanationFrame, FRAME_FIELDS) ||
          !RISK_FRAME_ID.test(explanationFrame.risk_frame_id) ||
          !dateTime(explanationFrame.frame_time) ||
          !exactFields(explanationFrame.grid, GRID_FIELDS) ||
          !exactFields(explanationFrame.coverage, COVERAGE_FIELDS) ||
          !Array.isArray(explanationFrame.cells)) {
        return unavailable("risk explanation frame structure is invalid");
      }
      if (seenFrameIds.has(explanationFrame.risk_frame_id) ||
          seenFrameTimes.has(explanationFrame.frame_time)) {
        return unavailable("risk explanation frame identity is duplicated");
      }
      seenFrameIds.add(explanationFrame.risk_frame_id);
      seenFrameTimes.add(explanationFrame.frame_time);

      const baseFrame = baseById.get(explanationFrame.risk_frame_id);
      if (!baseFrame || explanationFrame.frame_time !== baseFrame.valid_time) {
        return unavailable("RiskFrame identity mismatch");
      }
      const grid = explanationFrame.grid;
      const coordinates = baseFrame.coordinates;
      const rows = coordinates?.latitude?.length;
      const columns = coordinates?.longitude?.length;
      if (grid.crs !== "EPSG:4326" || !nonEmptyString(grid.grid_id) ||
          !integer(grid.rows, 1) || !integer(grid.columns, 1) ||
          grid.rows !== rows || grid.columns !== columns ||
          (risk.grid?.rows !== undefined && grid.rows !== risk.grid.rows) ||
          (risk.grid?.cols !== undefined && grid.columns !== risk.grid.cols) ||
          (source.grid_id !== undefined && grid.grid_id !== source.grid_id) ||
          (risk.grid?.grid_id !== undefined && grid.grid_id !== risk.grid.grid_id)) {
        return unavailable("RiskFrame grid identity mismatch");
      }
      if (sharedGridId === null) sharedGridId = grid.grid_id;
      if (grid.grid_id !== sharedGridId) {
        return unavailable("risk explanation grid identity changes between frames");
      }

      const coverage = explanationFrame.coverage;
      const coverageValues = COVERAGE_FIELDS.map((field) => coverage[field]);
      const expectedCells = grid.rows * grid.columns;
      if (!coverageValues.every((item) => integer(item)) ||
          coverage.expected_cell_count !== expectedCells ||
          coverage.published_cell_count !== explanationFrame.cells.length ||
          coverage.published_cell_count + coverage.omitted_cell_count !== expectedCells ||
          coverage.complete_cell_count + coverage.partial_cell_count +
            coverage.unavailable_cell_count !== coverage.published_cell_count) {
        return unavailable("risk explanation coverage is invalid");
      }
      omittedCount += coverage.omitted_cell_count;
      const statusCounts = { COMPLETE: 0, PARTIAL: 0, UNAVAILABLE: 0 };
      const seenCells = new Set();

      for (const explanationCell of explanationFrame.cells) {
        if (!exactFields(explanationCell, CELL_FIELDS) ||
            !exactFields(explanationCell.cell, CELL_IDENTITY_FIELDS) ||
            !exactFields(explanationCell.risk, RISK_FIELDS) ||
            !EXPLANATION_STATUSES.includes(explanationCell.explanation_status) ||
            !Array.isArray(explanationCell.contributors) ||
            !explanationCell.contributors.every(validContributor) ||
            !validReason(explanationCell.reason) || !validUncertainty(explanationCell.uncertainty)) {
          return unavailable("risk explanation cell structure is invalid");
        }
        const row = explanationCell.cell.row_index;
        const column = explanationCell.cell.column_index;
        if (!integer(row) || !integer(column) || row >= grid.rows || column >= grid.columns) {
          return unavailable("risk explanation cell is outside the displayed grid");
        }
        const localKey = `${row}|${column}`;
        if (seenCells.has(localKey)) return unavailable("risk explanation cell identity is duplicated");
        seenCells.add(localKey);

        const index = row * grid.columns + column;
        if (!sameNumber(explanationCell.cell.latitude, coordinates.latitude[row]) ||
            !sameNumber(explanationCell.cell.longitude, coordinates.longitude[column])) {
          return unavailable("RiskFrame grid coordinate mismatch");
        }
        const snapshot = explanationCell.risk;
        if (!sameNumber(snapshot.score, baseFrame.risk_scores[index], 1e-9) ||
            snapshot.level !== baseFrame.risk_levels[index] ||
            !sameNumber(snapshot.confidence, baseFrame.confidences[index], 1e-6)) {
          return unavailable("RiskFrame risk snapshot mismatch");
        }

        const contributorIds = explanationCell.contributors.map((item) => item.contributor_id);
        const coveredComponents = new Set();
        for (const contributor of explanationCell.contributors) {
          for (const componentId of contributor.component_ids) {
            if (!formulaComponents.has(componentId) || coveredComponents.has(componentId)) {
              return unavailable("risk explanation formula component coverage is invalid");
            }
            coveredComponents.add(componentId);
          }
        }
        if (new Set(contributorIds).size !== contributorIds.length ||
            !explanationCell.reason.main_contributor_ids.every((item) => contributorIds.includes(item))) {
          return unavailable("risk explanation contributor identity is invalid");
        }
        const status = explanationCell.explanation_status;
        const explanationGaps = new Set(explanationCell.uncertainty.explanation_gaps);
        if (status === "COMPLETE" &&
            (!explanationCell.contributors.length || explanationCell.uncertainty.status !== "NONE" ||
              explanationCell.uncertainty.missing_data.length ||
              explanationCell.uncertainty.explanation_gaps.length ||
              snapshot.score === null ||
              !sameNumber(
                explanationCell.contributors.reduce(
                  (total, contributor) => total + contributor.contribution,
                  0
                ),
                snapshot.score,
                1e-6
              ) ||
              coveredComponents.size !== formulaComponents.size ||
              !["DOMINANT_CONTRIBUTOR", "MULTIPLE_CONTRIBUTORS"].includes(
                explanationCell.reason.code
              ))) {
          return unavailable("COMPLETE explanation content is invalid");
        }
        if (status === "PARTIAL" &&
            (!explanationCell.contributors.length || explanationCell.uncertainty.status === "NONE" ||
              [...coveredComponents].some((item) => explanationGaps.has(item)) ||
              new Set([...coveredComponents, ...explanationGaps]).size !== formulaComponents.size ||
              [...coveredComponents, ...explanationGaps].some(
                (item) => !formulaComponents.has(item)
              ) ||
              !["PARTIAL_EXPLANATION", "MISSING_DATA"].includes(explanationCell.reason.code))) {
          return unavailable("PARTIAL explanation content is invalid");
        }
        if (status === "UNAVAILABLE" &&
            (explanationCell.contributors.length || explanationCell.uncertainty.status === "NONE" ||
              explanationCell.reason.main_contributor_ids.length ||
              !["EXPLANATION_UNAVAILABLE", "MISSING_DATA"].includes(explanationCell.reason.code))) {
          return unavailable("UNAVAILABLE explanation content is invalid");
        }
        statusCounts[status] += 1;
        if (status !== "UNAVAILABLE") usableCount += 1;
        cells[cellKey(explanationFrame.risk_frame_id, row, column)] = explanationCell;
      }
      if (coverage.complete_cell_count !== statusCounts.COMPLETE ||
          coverage.partial_cell_count !== statusCounts.PARTIAL ||
          coverage.unavailable_cell_count !== statusCounts.UNAVAILABLE) {
        return unavailable("risk explanation status coverage is inconsistent");
      }
    }

    if (value.publication_status === "COMPLETE" &&
        (seenFrameIds.size !== baseFrames.length || omittedCount !== 0 || Object.values(cells).some(
          (cell) => cell.explanation_status !== "COMPLETE"
        ))) {
      return unavailable("COMPLETE publication contradicts RiskWindow frame or cell coverage");
    }
    if (value.publication_status === "PARTIAL" && usableCount === 0) {
      return unavailable("PARTIAL publication has no usable explanation");
    }
    if (value.publication_status === "UNAVAILABLE" && usableCount !== 0) {
      return unavailable("UNAVAILABLE publication contains usable explanations");
    }

    return Object.freeze({
      valid: true,
      mode: value.publication_status === "UNAVAILABLE" ? "unavailable" : "available",
      reason: null,
      publication_status: value.publication_status,
      cells: Object.freeze(cells),
    });
  }

  return Object.freeze({ cellKey, inspect });
});

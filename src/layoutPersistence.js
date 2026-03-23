import { INSERT_REGISTRY, clampDensityForType } from "./inserts/registry.js";

/** Bump when breaking the JSON shape; add migrations in `migrateLayoutToLatest`. */
export const LAYOUT_FORMAT = "kumiko-layout";
export const LAYOUT_VERSION = 1;

const ROW_MIN = 4;
const ROW_MAX = 60;
const COL_MIN = 4;
const COL_MAX = 80;
const FRAME_ROTATIONS = new Set([0, 90, 180, 270]);
const PAINT_SCOPES = new Set(["both", "shapes", "color", "background"]);

function normalizePaintScope(v) {
  return PAINT_SCOPES.has(v) ? v : "both";
}

function clampGridInt(value, min, max, fallback) {
  const n = Number.isFinite(value) ? Math.trunc(Number(value)) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isValidCellId(cellId, rows, cols) {
  const m = /^(\d+)-(\d+)$/.exec(cellId);
  if (!m) return false;
  const r = parseInt(m[1], 10);
  const c = parseInt(m[2], 10);
  return r >= 0 && r < rows && c >= 0 && c < cols;
}

function isLikelyHexColor(s) {
  if (typeof s !== "string" || !s.startsWith("#")) return false;
  const hex = s.slice(1);
  return (hex.length === 3 || hex.length === 6) && /^[0-9A-Fa-f]+$/.test(hex);
}

/**
 * @param {object} state
 * @param {number} state.rows
 * @param {number} state.cols
 * @param {number} state.frameRotation
 * @param {Record<string, { type: string, color: string, density?: number, rotationCorner?: number }>} state.placements
 * @param {Record<string, string>} [state.cellBackgrounds]
 * @param {string} state.selectedInsert
 * @param {string} state.selectedColor
 * @param {number} state.selectedDensity
 * @param {string} [state.paintScope]
 */
export function buildLayoutDocument(state) {
  return {
    format: LAYOUT_FORMAT,
    version: LAYOUT_VERSION,
    meta: {
      exportedAt: new Date().toISOString(),
    },
    grid: {
      rows: clampGridInt(state.rows, ROW_MIN, ROW_MAX, 18),
      cols: clampGridInt(state.cols, COL_MIN, COL_MAX, 24),
      frameRotation: FRAME_ROTATIONS.has(state.frameRotation) ? state.frameRotation : 0,
    },
    placements: { ...state.placements },
    cellBackgrounds: state.cellBackgrounds && typeof state.cellBackgrounds === "object" ? { ...state.cellBackgrounds } : {},
    ui: {
      selectedInsert: state.selectedInsert,
      selectedColor: state.selectedColor,
      selectedDensity: state.selectedDensity,
      paintScope: normalizePaintScope(state.paintScope),
    },
  };
}

export function stringifyLayoutDocument(state) {
  return `${JSON.stringify(buildLayoutDocument(state), null, 2)}\n`;
}

/**
 * Migrate older `version` values to the latest shape (same `format`).
 * Return a normalized object with `version: LAYOUT_VERSION`, or null if unsupported.
 */
function migrateLayoutToLatest(raw) {
  const v = raw.version;
  if (v === LAYOUT_VERSION) return raw;
  if (v == null) return null;
  // Example for v2: return { ...raw, version: LAYOUT_VERSION, newField: defaultFor(raw) };
  return null;
}

/**
 * @param {string} jsonText
 * @returns {{ ok: true, rows: number, cols: number, frameRotation: number, placements: object, cellBackgrounds: object, selectedInsert: string, selectedColor: string, selectedDensity: number, paintScope: string, warnings: string[] } | { ok: false, error: string }}
 */
export function parseLayoutDocument(jsonText) {
  let raw;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }

  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Root value must be a JSON object." };
  }

  if (raw.format !== LAYOUT_FORMAT) {
    return {
      ok: false,
      error: `Not a Kumiko layout file (missing or wrong "format": expected "${LAYOUT_FORMAT}").`,
    };
  }

  let doc = raw;
  if (doc.version !== LAYOUT_VERSION) {
    const migrated = migrateLayoutToLatest(doc);
    if (!migrated) {
      return {
        ok: false,
        error: `Layout version ${String(doc.version)} is not supported (current ${LAYOUT_VERSION}).`,
      };
    }
    doc = migrated;
  }

  const warnings = [];
  const grid = doc.grid && typeof doc.grid === "object" ? doc.grid : {};
  const rows = clampGridInt(grid.rows, ROW_MIN, ROW_MAX, 18);
  const cols = clampGridInt(grid.cols, COL_MIN, COL_MAX, 24);
  const frameRotation = FRAME_ROTATIONS.has(grid.frameRotation) ? grid.frameRotation : 0;
  if (grid.rows != null && Number(grid.rows) !== rows) {
    warnings.push(`Rows were clamped to ${rows} (${ROW_MIN}–${ROW_MAX}).`);
  }
  if (grid.cols != null && Number(grid.cols) !== cols) {
    warnings.push(`Columns were clamped to ${cols} (${COL_MIN}–${COL_MAX}).`);
  }

  const placements = {};
  const cellBackgrounds = {};
  const rawPlacements = doc.placements;
  let legacyTempzMigrated = false;
  if (rawPlacements != null && typeof rawPlacements === "object" && !Array.isArray(rawPlacements)) {
    for (const [cellId, entry] of Object.entries(rawPlacements)) {
      if (!isValidCellId(cellId, rows, cols)) {
        warnings.push(`Skipped placement "${cellId}" (outside grid ${rows}×${cols}).`);
        continue;
      }
      if (!entry || typeof entry !== "object") continue;
      let type = typeof entry.type === "string" ? entry.type : "";
      if (!type || type === "empty") continue;
      if (type === "tempz") {
        type = "sanbon";
        if (!legacyTempzMigrated) {
          warnings.push('Legacy insert type "tempz" was renamed to "sanbon".');
          legacyTempzMigrated = true;
        }
      }
      if (!INSERT_REGISTRY.has(type)) {
        warnings.push(`Skipped unknown insert type "${type}" at ${cellId}.`);
        continue;
      }
      const color = isLikelyHexColor(entry.color) ? entry.color : "#ad8f50";
      if (!isLikelyHexColor(entry.color)) {
        warnings.push(`Invalid color at ${cellId}; using ${color}.`);
      }
      const density = clampDensityForType(type, entry.density);
      const rotationCorner = Number.isInteger(entry.rotationCorner)
        ? Math.max(0, Math.min(2, Number(entry.rotationCorner)))
        : undefined;
      placements[cellId] = {
        type,
        color,
        density,
        ...(rotationCorner != null ? { rotationCorner } : {}),
      };
    }
  }

  const rawBgs = doc.cellBackgrounds;
  if (rawBgs != null && typeof rawBgs === "object" && !Array.isArray(rawBgs)) {
    for (const [cellId, col] of Object.entries(rawBgs)) {
      if (!isValidCellId(cellId, rows, cols)) {
        warnings.push(`Skipped background for unknown cell "${cellId}".`);
        continue;
      }
      if (isLikelyHexColor(col)) {
        cellBackgrounds[cellId] = col;
      }
    }
  }

  const ui = doc.ui && typeof doc.ui === "object" ? doc.ui : {};
  let selectedInsert = typeof ui.selectedInsert === "string" ? ui.selectedInsert : "asanoha";
  if (selectedInsert === "tempz") {
    selectedInsert = "sanbon";
    if (!legacyTempzMigrated) {
      warnings.push('Legacy insert type "tempz" was renamed to "sanbon".');
      legacyTempzMigrated = true;
    }
  }
  if (selectedInsert !== "empty" && !INSERT_REGISTRY.has(selectedInsert)) {
    warnings.push(`Unknown tool "${selectedInsert}"; using asanoha.`);
    selectedInsert = "asanoha";
  }
  const selectedColor = isLikelyHexColor(ui.selectedColor) ? ui.selectedColor : "#ad8f50";
  const selectedDensity = clampDensityForType(selectedInsert, ui.selectedDensity);
  const paintScope = normalizePaintScope(ui.paintScope);

  return {
    ok: true,
    rows,
    cols,
    frameRotation,
    placements,
    cellBackgrounds,
    selectedInsert,
    selectedColor,
    selectedDensity,
    paintScope,
    warnings,
  };
}

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  ScrollArea,
  Separator,
} from "./ui.jsx";
import {
  Palette,
  Grid3X3,
  Eraser,
  Shapes,
  Save,
  FolderOpen,
  Pipette,
  Copy,
  ClipboardPaste,
  Paintbrush,
  Info,
  PanelLeft,
  X,
  Undo2,
  Redo2,
  ChevronDown,
  Github,
} from "lucide-react";
import { triPointString } from "./inserts/geometry.js";
import { InsertArtwork, INSERT_LIST, INSERT_REGISTRY, clampDensityForType } from "./inserts/registry.js";
import { parseLayoutDocument, stringifyLayoutDocument } from "./layoutPersistence.js";

const SQRT3 = Math.sqrt(3);
const TRI_SIZE = 34;
const STROKE = 2;
const GRID_COLOR = "#d8b56a";
const BG_COLOR = "#4b4131";

/** Triangle + tight viewBox so previews fill the tile (minimal letterboxing). */
function getInsertPreviewSpec() {
  const pv = 58;
  const left = 45 - pv / 2;
  const right = 45 + pv / 2;
  const bottom = 70;
  const top = bottom - (pv * SQRT3) / 2;
  const pad = 5;
  const viewBox = `${left - pad} ${top - pad} ${right - left + 2 * pad} ${bottom - top + 2 * pad}`;
  const points = [
    { x: left, y: bottom },
    { x: 45, y: top },
    { x: right, y: bottom },
  ];
  return { points, viewBox };
}

/** Axis-aligned viewBox and center for rotating the lattice `deg`° (SVG: positive = clockwise). */
function frameRotationExtents(width, height, deg) {
  const θ = (deg * Math.PI) / 180;
  const hw = width / 2;
  const hh = height / 2;
  const ax = Math.abs(hw * Math.cos(θ)) + Math.abs(hh * Math.sin(θ));
  const ay = Math.abs(hw * Math.sin(θ)) + Math.abs(hh * Math.cos(θ));
  const pad = 6;
  const cx = width / 2;
  const cy = height / 2;
  const vbW = 2 * ax + 2 * pad;
  const vbH = 2 * ay + 2 * pad;
  const vbX = cx - ax - pad;
  const vbY = cy - ay - pad;
  return { viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`, cx, cy };
}

const FRAME_ROTATIONS = [0, 90, 180, 270];

/** What left-drag paint / flood-fill updates. */
const PAINT_SCOPES = [
  { id: "both", label: "Both" },
  { id: "shapes", label: "Shape" },
  { id: "color", label: "Color" },
  { id: "background", label: "Bg" },
];

const PAINT_SCOPE_HINTS = {
  both: "Paint insert and color together",
  shapes: "Change insert only; keep each cell's color",
  color: "Change color only on painted cells",
  background: "Triangle fill only (under the pattern); uses current swatch",
};

const REPO_URL = "https://github.com/Nicole-W/kumiko-designer";

const INTRO_SECTIONS = [
  {
    title: "Getting started",
    paragraphs: [
      "Choose an insert pattern and color, then paint on the mitsukude-style triangular grid.",
      "Use the Grid card to change rows, columns, and frame rotation.",
    ],
  },
  {
    title: "Painting",
    rows: [
      { key: "Left-click or drag", detail: "Paint cells." },
      {
        key: "Right-click or drag",
        detail: "Remove the insert only (custom triangle background stays).",
      },
      {
        key: "Middle-click",
        detail: "Flood-fill connected cells that match the current paint scope.",
      },
    ],
  },
  {
    title: "Copy & paste",
    rows: [
      {
        key: "Ctrl+C / Cmd+C",
        detail: "Enter copy mode, then drag a rectangle on the grid.",
      },
      {
        key: "Ctrl+V / Cmd+V",
        detail: "Enter paste mode, then click where the copy should anchor.",
      },
      {
        key: "Ctrl+X",
        detail: "Cut: drag a rectangle to copy those inserts and clear them from the grid.",
      },
      {
        key: "Esc · right-click",
        detail: "Cancel eyedropper, copy, or paste (right-click on the grid).",
      },
    ],
  },
  {
    title: "History",
    rows: [
      { key: "Ctrl+Z / Cmd+Z", detail: "Undo." },
      { key: "Ctrl+Y · Shift+Cmd+Z", detail: "Redo." },
    ],
  },
];

const GRID_HELP =
  "Changing rows or columns regenerates the empty lattice. Existing placements stay as long as their cell IDs still exist.";

const MAX_HISTORY = 80;

function clonePlacements(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    out[k] = { ...v };
  }
  return out;
}

function floodFillWouldChange(
  fillIds,
  prevP,
  prevBg,
  paintScope,
  selectedInsert,
  selectedColor,
  selectedDensity,
  selectedInsertRotationDependent,
  rotationCorner,
) {
  if (fillIds.length === 0) return false;
  const density = clampDensityForType(selectedInsert, selectedDensity);
  const corner = Number.isInteger(rotationCorner) ? rotationCorner : 2;

  if (paintScope === "background") {
    if (selectedInsert === "empty") {
      return fillIds.some((id) => id in prevBg || id in prevP);
    }
    return fillIds.some((id) => prevBg[id] !== selectedColor);
  }

  if (selectedInsert === "empty") {
    return fillIds.some((id) => id in prevP || id in prevBg);
  }

  for (const id of fillIds) {
    const ex = prevP[id];
    if (paintScope === "color") {
      if (!ex?.type || ex.type === "empty") continue;
      if (ex.color !== selectedColor) return true;
      continue;
    }
    if (paintScope === "shapes") {
      const keepColor = ex?.color ?? selectedColor;
      const same =
        ex?.type === selectedInsert &&
        (ex?.density ?? 1) === density &&
        keepColor === (ex?.color ?? selectedColor) &&
        (!selectedInsertRotationDependent ||
          (Number.isInteger(ex?.rotationCorner) ? ex.rotationCorner : 2) === corner);
      if (!same) return true;
    } else {
      const same =
        ex?.type === selectedInsert &&
        ex?.color === selectedColor &&
        (ex?.density ?? 1) === density &&
        (!selectedInsertRotationDependent ||
          (Number.isInteger(ex?.rotationCorner) ? ex.rotationCorner : 2) === corner);
      if (!same) return true;
    }
  }
  return false;
}

const XL_MEDIA = "(min-width: 1280px)";

function useIsXlViewport() {
  const [isXl, setIsXl] = useState(
    () => typeof window !== "undefined" && window.matchMedia(XL_MEDIA).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(XL_MEDIA);
    const onChange = () => setIsXl(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isXl;
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function buildTriangleCell(row, col, size) {
  const h = size * SQRT3 * 0.5;
  const x = col * (size / 2);
  const y = row * h;
  const up = (row + col) % 2 === 0;

  const points = up
    ? [
        { x, y: y + h },
        { x: x + size / 2, y },
        { x: x + size, y: y + h },
      ]
    : [
        { x, y },
        { x: x + size, y },
        { x: x + size / 2, y: y + h },
      ];

  return {
    id: `${row}-${col}`,
    row,
    col,
    up,
    points,
  };
}

function nearPoint(a, b, eps = 1e-3) {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

function trianglesShareEdge(A, B) {
  const pa = A.points;
  const pb = B.points;
  for (let i = 0; i < 3; i += 1) {
    const a1 = pa[i];
    const a2 = pa[(i + 1) % 3];
    for (let j = 0; j < 3; j += 1) {
      const b1 = pb[j];
      const b2 = pb[(j + 1) % 3];
      if ((nearPoint(a1, b1) && nearPoint(a2, b2)) || (nearPoint(a1, b2) && nearPoint(a2, b1))) {
        return true;
      }
    }
  }
  return false;
}

/** Undirected adjacency: triangles that share an edge. */
function buildNeighborMap(cells) {
  const map = new Map();
  for (const c of cells) {
    map.set(c.id, []);
  }
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      if (trianglesShareEdge(cells[i], cells[j])) {
        map.get(cells[i].id).push(cells[j].id);
        map.get(cells[j].id).push(cells[i].id);
      }
    }
  }
  return map;
}

/** Region key for flood-fill, depends on what we are painting. */
function paintFloodKey(placements, cellBackgrounds, id, paintScope) {
  if (paintScope === "background") {
    return cellBackgrounds[id] ?? BG_COLOR;
  }
  const p = placements[id];
  if (!p || p.type === "empty") return "\0empty";
  const d = p.density ?? 1;
  const rot = Number.isInteger(p.rotationCorner) ? p.rotationCorner : -1;
  if (paintScope === "color") return `${p.type}\0${d}`;
  if (paintScope === "shapes") return `${p.color}`;
  return `${p.type}\0${p.color}\0${d}\0${rot}`;
}

function collectFloodFillIds(startId, neighborMap, placements, cellBackgrounds, paintScope) {
  const startKey = paintFloodKey(placements, cellBackgrounds, startId, paintScope);
  const queue = [startId];
  const visited = new Set();
  const ids = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    if (paintFloodKey(placements, cellBackgrounds, id, paintScope) !== startKey) continue;
    ids.push(id);
    for (const nb of neighborMap.get(id) || []) {
      if (!visited.has(nb)) queue.push(nb);
    }
  }
  return ids;
}

function parseCellId(cellId) {
  const m = /^(\d+)-(\d+)$/.exec(cellId);
  if (!m) return null;
  return { row: parseInt(m[1], 10), col: parseInt(m[2], 10) };
}

function rectFromTwoCellIds(idA, idB) {
  const a = parseCellId(idA);
  const b = parseCellId(idB);
  if (!a || !b) return null;
  return {
    rMin: Math.min(a.row, b.row),
    rMax: Math.max(a.row, b.row),
    cMin: Math.min(a.col, b.col),
    cMax: Math.max(a.col, b.col),
  };
}

function cellInRect(cell, rect) {
  if (!rect) return false;
  return (
    cell.row >= rect.rMin &&
    cell.row <= rect.rMax &&
    cell.col >= rect.cMin &&
    cell.col <= rect.cMax
  );
}

/** Relative offsets from (rMin, cMin); only non-empty placements. */
function collectPlacementsInRect(placements, rect) {
  const entries = {};
  if (!rect) return entries;
  for (let r = rect.rMin; r <= rect.rMax; r += 1) {
    for (let c = rect.cMin; c <= rect.cMax; c += 1) {
      const id = `${r}-${c}`;
      const p = placements[id];
      if (p?.type && p.type !== "empty") {
        const dr = r - rect.rMin;
        const dc = c - rect.cMin;
        entries[`${dr}-${dc}`] = {
          type: p.type,
          color: p.color,
          density: p.density ?? 1,
          rotationCorner: Number.isInteger(p.rotationCorner) ? p.rotationCorner : undefined,
        };
      }
    }
  }
  return entries;
}

function rotatePointsByCorner(points, rotationCorner) {
  if (!Number.isInteger(rotationCorner)) return points;
  const idx = ((rotationCorner % 3) + 3) % 3;
  // Rotation-dependent inserts use points[2] as the "active" corner anchor.
  return [points[(idx + 1) % 3], points[(idx + 2) % 3], points[idx]];
}

function nearestCornerIndexInScreenSpace(cell, target, clientX, clientY) {
  const m = target?.getScreenCTM?.();
  if (!m) return 0;
  let best = 0;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i += 1) {
    const p = cell.points[i];
    const sx = m.a * p.x + m.c * p.y + m.e;
    const sy = m.b * p.x + m.d * p.y + m.f;
    const dx = clientX - sx;
    const dy = clientY - sy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

function KumikoCanvas({
  rows,
  cols,
  cells,
  placements,
  cellBackgrounds = {},
  onPaintCell,
  onEraseCell,
  onFloodFill,
  onLeftPaintStrokeStart,
  onLeftPaintStrokeEnd,
  onRightEraseStrokeStart,
  onRightEraseStrokeEnd,
  frameRotation = 90,
  eyedropperPending = false,
  onEyedropperSample,
  copySelectActive = false,
  onCopyRect,
  onCopyModeEnd,
  pasteArmed = false,
  onPasteAt,
  /** Relative-offset map from copy; when set with pasteArmed, shows hover placement preview. */
  pasteClipboardEntries = null,
  /** Clears eyedropper / copy marquee / paste (same as Esc for tools). */
  onDismissCanvasModes,
  showRotationCornerHint = false,
}) {
  const h = TRI_SIZE * SQRT3 * 0.5;
  // Tight bounds to match `buildTriangleCell`: rightmost x is last column base + full edge length;
  // vertical span is rows bands of height h (no extra band — old +h left empty margin below).
  const width = TRI_SIZE * (cols + 1) * 0.5;
  const height = rows * h;
  const { viewBox, cx, cy } = frameRotationExtents(width, height, frameRotation);
  const lastPaintDragIdRef = useRef(null);
  const lastEraseDragIdRef = useRef(null);
  const copyDragRef = useRef(null);
  const [copyMarqueeRect, setCopyMarqueeRect] = useState(null);
  const [hoverCorner, setHoverCorner] = useState(null);
  const [pasteHoverCellId, setPasteHoverCellId] = useState(null);
  const cellById = useMemo(() => new Map(cells.map((c) => [c.id, c])), [cells]);

  useEffect(() => {
    if (!copySelectActive) {
      copyDragRef.current = null;
      setCopyMarqueeRect(null);
    }
  }, [copySelectActive]);

  useEffect(() => {
    if (!pasteArmed || !pasteClipboardEntries || Object.keys(pasteClipboardEntries).length === 0) {
      setPasteHoverCellId(null);
      return undefined;
    }
    const lastPtr = { x: Number.NaN, y: Number.NaN };
    const updateHover = (clientX, clientY) => {
      lastPtr.x = clientX;
      lastPtr.y = clientY;
      const el = document.elementFromPoint(clientX, clientY);
      const hit = el?.closest?.("[data-tri-hit]");
      const id = hit?.getAttribute?.("data-tri-hit");
      setPasteHoverCellId(id || null);
    };
    const onMoveTrack = (ev) => updateHover(ev.clientX, ev.clientY);
    const onScroll = () => {
      if (Number.isFinite(lastPtr.x)) updateHover(lastPtr.x, lastPtr.y);
    };
    window.addEventListener("pointermove", onMoveTrack, { passive: true });
    document.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointermove", onMoveTrack);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [pasteArmed, pasteClipboardEntries]);

  const pastePreviewCells = useMemo(() => {
    if (!pasteArmed || !pasteClipboardEntries || !pasteHoverCellId) return null;
    const anchor = parseCellId(pasteHoverCellId);
    if (!anchor) return null;
    const list = [];
    for (const [relKey, p] of Object.entries(pasteClipboardEntries)) {
      const parts = relKey.split("-");
      const dr = parseInt(parts[0], 10);
      const dc = parseInt(parts[1], 10);
      if (Number.isNaN(dr) || Number.isNaN(dc)) continue;
      const r = anchor.row + dr;
      const c = anchor.col + dc;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      list.push({
        cellId: `${r}-${c}`,
        type: p.type,
        color: p.color,
        density: clampDensityForType(p.type, p.density ?? 1),
        rotationCorner: Number.isInteger(p.rotationCorner) ? p.rotationCorner : undefined,
      });
    }
    return list.length > 0 ? list : null;
  }, [pasteArmed, pasteClipboardEntries, pasteHoverCellId, rows, cols]);

  function attachLeftDragListeners() {
    const move = (ev) => {
      if ((ev.buttons & 1) === 0) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const hit = el?.closest?.("[data-tri-hit]");
      const id = hit?.getAttribute?.("data-tri-hit");
      if (!id || id === lastPaintDragIdRef.current) return;
      const cell = cellById.get(id);
      const rotationCorner =
        showRotationCornerHint && cell ? nearestCornerIndexInScreenSpace(cell, hit, ev.clientX, ev.clientY) : undefined;
      lastPaintDragIdRef.current = id;
      onPaintCell(id, rotationCorner);
    };
    const end = () => {
      lastPaintDragIdRef.current = null;
      onLeftPaintStrokeEnd?.();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function attachRightDragListeners() {
    const move = (ev) => {
      if ((ev.buttons & 2) === 0) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const hit = el?.closest?.("[data-tri-hit]");
      const id = hit?.getAttribute?.("data-tri-hit");
      if (!id || id === lastEraseDragIdRef.current) return;
      lastEraseDragIdRef.current = id;
      onEraseCell(id);
    };
    const end = () => {
      lastEraseDragIdRef.current = null;
      onRightEraseStrokeEnd?.();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function finishCopyDrag(e) {
    if (!copyDragRef.current || !copySelectActive) return;
    const { startId, endId } = copyDragRef.current;
    copyDragRef.current = null;
    setCopyMarqueeRect(null);
    try {
      if (e?.currentTarget?.releasePointerCapture) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* already released */
    }
    const bounds = rectFromTwoCellIds(startId, endId);
    if (bounds) onCopyRect?.(bounds);
    onCopyModeEnd?.();
  }

  function handleHitPointerDown(e, cell) {
    const cellId = cell.id;
    const rotationCorner =
      showRotationCornerHint ? nearestCornerIndexInScreenSpace(cell, e.currentTarget, e.clientX, e.clientY) : undefined;
    if (e.button === 2 && (eyedropperPending || pasteArmed || copySelectActive)) {
      e.preventDefault();
      onDismissCanvasModes?.();
      return;
    }
    if (eyedropperPending && e.button === 0) {
      e.preventDefault();
      onEyedropperSample?.(cellId);
      return;
    }
    if (pasteArmed && e.button === 0) {
      e.preventDefault();
      onPasteAt?.(cellId);
      return;
    }
    if (copySelectActive && e.button === 0) {
      e.preventDefault();
      if (typeof e.currentTarget.setPointerCapture === "function") {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      copyDragRef.current = { startId: cellId, endId: cellId };
      setCopyMarqueeRect(rectFromTwoCellIds(cellId, cellId));
      return;
    }
    if (e.button === 0) {
      lastPaintDragIdRef.current = cellId;
      onLeftPaintStrokeStart?.();
      onPaintCell(cellId, rotationCorner);
      attachLeftDragListeners();
    } else if (e.button === 2) {
      e.preventDefault();
      lastEraseDragIdRef.current = cellId;
      onRightEraseStrokeStart?.();
      onEraseCell(cellId);
      attachRightDragListeners();
    } else if (e.button === 1) {
      e.preventDefault();
      onFloodFill(cellId, rotationCorner);
    }
  }

  function handleHitPointerMove(e, cell) {
    if (showRotationCornerHint && !copySelectActive) {
      const corner = nearestCornerIndexInScreenSpace(cell, e.currentTarget, e.clientX, e.clientY);
      setHoverCorner({ cellId: cell.id, corner });
    }
    if (!copySelectActive || !copyDragRef.current) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const hit = el?.closest?.("[data-tri-hit]");
    const id = hit?.getAttribute?.("data-tri-hit");
    if (id) {
      copyDragRef.current.endId = id;
      setCopyMarqueeRect(rectFromTwoCellIds(copyDragRef.current.startId, id));
    }
  }

  function handleHitPointerUp(e) {
    if (copyDragRef.current) finishCopyDrag(e);
  }

  function handleHitPointerCancel(e) {
    if (copyDragRef.current) finishCopyDrag(e);
  }

  function handleHitPointerLeave(cellId) {
    setHoverCorner((prev) => (prev?.cellId === cellId ? null : prev));
  }

  const canvasRing = [
    eyedropperPending && "ring-2 ring-[#f2d08a]/45 ring-offset-2 ring-offset-[#3e3528]",
    copySelectActive && "ring-2 ring-[#f2d08a]/50 ring-offset-2 ring-offset-[#3e3528]",
    pasteArmed && "ring-2 ring-sky-300/50 ring-offset-2 ring-offset-[#3e3528]",
  ]
    .filter(Boolean)
    .join(" ");

  const canvasCursor =
    eyedropperPending ? "cursor-cell" : pasteArmed ? "cursor-copy" : "cursor-crosshair";

  return (
    <div
      className={`h-full w-full overflow-auto rounded-3xl border border-white/10 bg-[#3e3528] shadow-2xl select-none ${canvasRing}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="min-w-full min-h-full flex items-center justify-center p-6">
        <svg
          viewBox={viewBox}
          className={`max-h-[82vh] max-w-full ${canvasCursor}`}
          style={{ background: BG_COLOR, touchAction: "none" }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g transform={`translate(${cx},${cy}) rotate(${frameRotation}) translate(${-cx},${-cy})`}>
            <rect x="0" y="0" width={width} height={height} fill={BG_COLOR} />

            {cells.map((cell) => {
              const placed = placements[cell.id] || { type: "empty", color: "#ad8f50" };
              const cellBg = cellBackgrounds[cell.id] ?? BG_COLOR;
              return (
                <g key={cell.id}>
                  <defs>
                    <clipPath id={`clip-${cell.id}`}>
                      <polygon points={triPointString(cell.points)} />
                    </clipPath>
                  </defs>

                  <g
                    style={{
                      pointerEvents: "none",
                      opacity: pasteArmed ? 0.14 : 1,
                    }}
                  >
                    <polygon
                      points={triPointString(cell.points)}
                      fill={cellBg}
                      stroke="none"
                    />

                    <g clipPath={`url(#clip-${cell.id})`}>
                      <InsertArtwork
                        type={placed.type}
                        points={
                          INSERT_REGISTRY.get(placed.type)?.rotationDependent
                            ? rotatePointsByCorner(cell.points, placed.rotationCorner)
                            : cell.points
                        }
                        color={placed.color}
                        density={placed.density}
                      />
                    </g>

                    <polygon
                      points={triPointString(cell.points)}
                      fill="none"
                      stroke={GRID_COLOR}
                      strokeWidth={STROKE}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>

                  <polygon
                    data-tri-hit={cell.id}
                    points={triPointString(cell.points)}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth={0}
                    onPointerDown={(e) => handleHitPointerDown(e, cell)}
                    onPointerMove={(e) => handleHitPointerMove(e, cell)}
                    onPointerUp={handleHitPointerUp}
                    onPointerCancel={handleHitPointerCancel}
                    onPointerLeave={() => handleHitPointerLeave(cell.id)}
                    className="cursor-crosshair"
                  />
                </g>
              );
            })}
            {pastePreviewCells
              ? pastePreviewCells.map((pv) => {
                  const cell = cellById.get(pv.cellId);
                  if (!cell) return null;
                  const meta = INSERT_REGISTRY.get(pv.type);
                  const pts =
                    meta?.rotationDependent && Number.isInteger(pv.rotationCorner)
                      ? rotatePointsByCorner(cell.points, pv.rotationCorner)
                      : cell.points;
                  return (
                    <g key={`paste-prev-${pv.cellId}`} style={{ pointerEvents: "none" }} opacity={0.88}>
                      <g clipPath={`url(#clip-${cell.id})`}>
                        <InsertArtwork
                          type={pv.type}
                          points={pts}
                          color={pv.color}
                          density={pv.density}
                          preview
                          showFrame={false}
                        />
                      </g>
                      <polygon
                        points={triPointString(cell.points)}
                        fill="none"
                        stroke="rgba(56, 189, 248, 0.9)"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  );
                })
              : null}
            {showRotationCornerHint && hoverCorner
              ? (() => {
                  const cell = cellById.get(hoverCorner.cellId);
                  const p = cell?.points?.[hoverCorner.corner];
                  if (!p) return null;
                  return (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={5}
                      fill="rgba(126, 211, 255, 0.24)"
                      stroke="rgba(126, 211, 255, 0.95)"
                      strokeWidth={1.6}
                      vectorEffect="non-scaling-stroke"
                      style={{ pointerEvents: "none" }}
                    />
                  );
                })()
              : null}
            {copyMarqueeRect
              ? cells
                  .filter((cell) => cellInRect(cell, copyMarqueeRect))
                  .map((cell) => (
                    <polygon
                      key={`marq-${cell.id}`}
                      points={triPointString(cell.points)}
                      fill="rgba(242, 208, 138, 0.2)"
                      stroke="rgba(242, 208, 138, 0.7)"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      style={{ pointerEvents: "none" }}
                    />
                  ))
              : null}
          </g>
        </svg>
      </div>
    </div>
  );
}

export default function KumikoGridDesignerApp() {
  const [rows, setRows] = useState(12);
  const [cols, setCols] = useState(32);
  const [selectedInsert, setSelectedInsert] = useState("asanoha");
  const [selectedColor, setSelectedColor] = useState("#ad8f50");
  const [selectedDensity, setSelectedDensity] = useState(1);
  const [paintScope, setPaintScope] = useState("both");
  const [frameRotation, setFrameRotation] = useState(90);
  const [placements, setPlacements] = useState({});
  const [cellBackgrounds, setCellBackgrounds] = useState({});
  const [historyTick, setHistoryTick] = useState(0);
  const [eyedropperPending, setEyedropperPending] = useState(false);
  const [clipboard, setClipboard] = useState(null);
  const [awaitingCopyDrag, setAwaitingCopyDrag] = useState(false);
  const [pasteArmed, setPasteArmed] = useState(false);
  const [introHelpOpen, setIntroHelpOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [pieceCountsOpen, setPieceCountsOpen] = useState(true);
  const isXl = useIsXlViewport();
  const layoutFileInputRef = useRef(null);
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const applyingHistoryRef = useRef(false);
  const leftPaintStrokeActiveRef = useRef(false);
  const leftPaintStrokeHistoryRecordedRef = useRef(false);
  const rightEraseStrokeActiveRef = useRef(false);
  const rightEraseStrokeHistoryRecordedRef = useRef(false);
  /** Next rectangle copy (from toolbar or Ctrl+X) removes inserts in that rect after copying. */
  const cutAfterRectRef = useRef(false);

  const hasClipboard = useMemo(
    () => Boolean(clipboard?.entries && Object.keys(clipboard.entries).length > 0),
    [clipboard],
  );
  const selectedInsertMeta = INSERT_REGISTRY.get(selectedInsert);
  const selectedInsertRotationDependent = Boolean(selectedInsertMeta?.rotationDependent);

  const placementsRef = useRef(placements);
  placementsRef.current = placements;
  const cellBackgroundsRef = useRef(cellBackgrounds);
  cellBackgroundsRef.current = cellBackgrounds;

  const bumpHistory = useCallback(() => {
    setHistoryTick((t) => t + 1);
  }, []);

  const recordHistory = useCallback(() => {
    if (applyingHistoryRef.current) return;
    pastRef.current.push({
      placements: clonePlacements(placementsRef.current),
      cellBackgrounds: { ...cellBackgroundsRef.current },
    });
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    futureRef.current = [];
    bumpHistory();
  }, [bumpHistory]);

  const beginLeftPaintStroke = useCallback(() => {
    leftPaintStrokeActiveRef.current = true;
    leftPaintStrokeHistoryRecordedRef.current = false;
  }, []);

  const endLeftPaintStroke = useCallback(() => {
    leftPaintStrokeActiveRef.current = false;
    leftPaintStrokeHistoryRecordedRef.current = false;
  }, []);

  const beginRightEraseStroke = useCallback(() => {
    rightEraseStrokeActiveRef.current = true;
    rightEraseStrokeHistoryRecordedRef.current = false;
  }, []);

  const endRightEraseStroke = useCallback(() => {
    rightEraseStrokeActiveRef.current = false;
    rightEraseStrokeHistoryRecordedRef.current = false;
  }, []);

  const dismissCanvasToolModes = useCallback(() => {
    cutAfterRectRef.current = false;
    setEyedropperPending(false);
    setAwaitingCopyDrag(false);
    setPasteArmed(false);
  }, []);

  /** One undo step per left-drag stroke: record only before the first mutation. */
  const recordHistoryForLeftPaint = useCallback(() => {
    if (leftPaintStrokeActiveRef.current) {
      if (leftPaintStrokeHistoryRecordedRef.current) return;
      leftPaintStrokeHistoryRecordedRef.current = true;
    }
    recordHistory();
  }, [recordHistory]);

  /** One undo step per right-drag erase stroke. */
  const recordHistoryForRightErase = useCallback(() => {
    if (rightEraseStrokeActiveRef.current) {
      if (rightEraseStrokeHistoryRecordedRef.current) return;
      rightEraseStrokeHistoryRecordedRef.current = true;
    }
    recordHistory();
  }, [recordHistory]);

  const applySnapshot = useCallback((snap) => {
    applyingHistoryRef.current = true;
    setPlacements(clonePlacements(snap.placements));
    setCellBackgrounds({ ...snap.cellBackgrounds });
    queueMicrotask(() => {
      applyingHistoryRef.current = false;
    });
  }, []);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return false;
    const prev = pastRef.current.pop();
    futureRef.current.push({
      placements: clonePlacements(placementsRef.current),
      cellBackgrounds: { ...cellBackgroundsRef.current },
    });
    applySnapshot(prev);
    bumpHistory();
    return true;
  }, [applySnapshot, bumpHistory]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return false;
    const next = futureRef.current.pop();
    pastRef.current.push({
      placements: clonePlacements(placementsRef.current),
      cellBackgrounds: { ...cellBackgroundsRef.current },
    });
    applySnapshot(next);
    bumpHistory();
    return true;
  }, [applySnapshot, bumpHistory]);

  void historyTick;
  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      if (el && (el.closest?.("input, textarea, select, [contenteditable=true]") || el.isContentEditable)) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "z" || e.key === "Z") {
        const handled = e.shiftKey ? redo() : undo();
        if (handled) e.preventDefault();
        return;
      }
      if (e.key === "y" || e.key === "Y") {
        if (redo()) e.preventDefault();
        return;
      }
      if (e.key === "c" || e.key === "C") {
        cutAfterRectRef.current = false;
        setAwaitingCopyDrag((v) => {
          const next = !v;
          if (next) {
            setEyedropperPending(false);
            setPasteArmed(false);
          }
          return next;
        });
        e.preventDefault();
        return;
      }
      if (e.key === "x" || e.key === "X") {
        cutAfterRectRef.current = true;
        setEyedropperPending(false);
        setPasteArmed(false);
        setAwaitingCopyDrag(true);
        e.preventDefault();
        return;
      }
      if (e.key === "v" || e.key === "V") {
        if (!hasClipboard) return;
        setPasteArmed((v) => {
          const next = !v;
          if (next) {
            setEyedropperPending(false);
            setAwaitingCopyDrag(false);
          }
          return next;
        });
        cutAfterRectRef.current = false;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, hasClipboard]);

  useEffect(() => {
    setSelectedDensity((d) => clampDensityForType(selectedInsert, d));
  }, [selectedInsert]);

  useEffect(() => {
    if (!eyedropperPending && !awaitingCopyDrag && !pasteArmed && !mobileDrawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        dismissCanvasToolModes();
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [eyedropperPending, awaitingCopyDrag, pasteArmed, mobileDrawerOpen, dismissCanvasToolModes]);

  useEffect(() => {
    if (!awaitingCopyDrag) cutAfterRectRef.current = false;
  }, [awaitingCopyDrag]);

  useEffect(() => {
    if (isXl) setMobileDrawerOpen(false);
  }, [isXl]);

  useEffect(() => {
    if (isXl || !mobileDrawerOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isXl, mobileDrawerOpen]);

  const handleEyedropperSample = useCallback(
    (cellId) => {
      setEyedropperPending(false);
      if (paintScope === "background") {
        setSelectedColor(cellBackgrounds[cellId] ?? BG_COLOR);
        return;
      }
      const p = placements[cellId];
      if (p?.type && p.type !== "empty" && typeof p.color === "string") {
        setSelectedColor(p.color);
      }
    },
    [placements, cellBackgrounds, paintScope],
  );

  const normalizedRows = clampInt(rows, 4, 60, 12);
  const normalizedCols = clampInt(cols, 4, 80, 32);

  const cells = useMemo(() => {
    const out = [];
    for (let row = 0; row < normalizedRows; row += 1) {
      for (let col = 0; col < normalizedCols; col += 1) {
        out.push(buildTriangleCell(row, col, TRI_SIZE));
      }
    }
    return out;
  }, [normalizedRows, normalizedCols]);

  const neighborMap = useMemo(() => buildNeighborMap(cells), [cells]);

  const insertPreview = useMemo(() => getInsertPreviewSpec(), []);
  const pieceCounts = useMemo(() => {
    const insertsByKey = new Map();
    for (const p of Object.values(placements)) {
      if (!p?.type || p.type === "empty") continue;
      const density = p.density ?? 1;
      const isRotationDependent = Boolean(INSERT_REGISTRY.get(p.type)?.rotationDependent);
      const rotationCorner = Number.isInteger(p.rotationCorner) ? p.rotationCorner : -1;
      const key = `${p.type}\0${p.color}\0${density}`;
      const found = insertsByKey.get(key);
      if (found) {
        found.count += 1;
      } else {
        insertsByKey.set(key, {
          type: p.type,
          color: p.color,
          density,
          rotationCorner: isRotationDependent ? rotationCorner : -1,
          count: 1,
        });
      }
    }
    const inserts = Array.from(insertsByKey.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      if (a.color !== b.color) return a.color.localeCompare(b.color);
      return a.density - b.density;
    });

    const bgs = new Map();
    for (const cell of cells) {
      const col = cellBackgrounds[cell.id] ?? BG_COLOR;
      bgs.set(col, (bgs.get(col) ?? 0) + 1);
    }
    const backgrounds = Array.from(bgs.entries())
      .map(([color, count]) => ({ color, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.color.localeCompare(b.color);
      });

    return { inserts, backgrounds };
  }, [placements, cells, cellBackgrounds]);

  const paintCell = useCallback(
    (cellId, rotationCorner) => {
      if (selectedInsert === "empty") {
        const hasP = cellId in placementsRef.current;
        const hasB = cellId in cellBackgroundsRef.current;
        if (!hasP && !hasB) return;
        recordHistoryForLeftPaint();
        setPlacements((prev) => {
          if (!(cellId in prev)) return prev;
          const next = { ...prev };
          delete next[cellId];
          return next;
        });
        setCellBackgrounds((prevBg) => {
          if (!(cellId in prevBg)) return prevBg;
          const next = { ...prevBg };
          delete next[cellId];
          return next;
        });
        return;
      }
      if (paintScope === "background") {
        recordHistoryForLeftPaint();
        setCellBackgrounds((prevBg) => ({ ...prevBg, [cellId]: selectedColor }));
        return;
      }
      const prevSnap = placementsRef.current;
      const density = clampDensityForType(selectedInsert, selectedDensity);
      const corner = Number.isInteger(rotationCorner) ? rotationCorner : 2;
      if (paintScope === "color") {
        const ex = prevSnap[cellId];
        if (!ex?.type || ex.type === "empty") return;
        if (ex.color === selectedColor) return;
        recordHistoryForLeftPaint();
      } else if (paintScope === "shapes") {
        const ex = prevSnap[cellId];
        const keepColor = ex?.color ?? selectedColor;
        const same =
          ex?.type === selectedInsert &&
          (ex?.density ?? 1) === density &&
          keepColor === (ex?.color ?? selectedColor) &&
          (!selectedInsertRotationDependent ||
            (Number.isInteger(ex?.rotationCorner) ? ex.rotationCorner : 2) === corner);
        if (same) return;
        recordHistoryForLeftPaint();
      } else {
        const ex = prevSnap[cellId];
        const same =
          ex?.type === selectedInsert &&
          ex?.color === selectedColor &&
          (ex?.density ?? 1) === density &&
          (!selectedInsertRotationDependent ||
            (Number.isInteger(ex?.rotationCorner) ? ex.rotationCorner : 2) === corner);
        if (same) return;
        recordHistoryForLeftPaint();
      }
      setPlacements((prev) => {
        const d = clampDensityForType(selectedInsert, selectedDensity);
        const c = Number.isInteger(rotationCorner) ? rotationCorner : 2;
        if (paintScope === "color") {
          const ex2 = prev[cellId];
          if (!ex2?.type || ex2.type === "empty") return prev;
          return {
            ...prev,
            [cellId]: { ...ex2, color: selectedColor },
          };
        }
        if (paintScope === "shapes") {
          const keepColor = prev[cellId]?.color ?? selectedColor;
          return {
            ...prev,
            [cellId]: {
              type: selectedInsert,
              color: keepColor,
              density: d,
              ...(selectedInsertRotationDependent ? { rotationCorner: c } : {}),
            },
          };
        }
        return {
          ...prev,
          [cellId]: {
            type: selectedInsert,
            color: selectedColor,
            density: d,
            ...(selectedInsertRotationDependent ? { rotationCorner: c } : {}),
          },
        };
      });
    },
    [
      selectedInsert,
      selectedColor,
      selectedDensity,
      paintScope,
      selectedInsertRotationDependent,
      recordHistoryForLeftPaint,
    ],
  );

  const eraseCell = useCallback((cellId) => {
    if (!(cellId in placementsRef.current)) return;
    recordHistoryForRightErase();
    setPlacements((prev) => {
      if (!(cellId in prev)) return prev;
      const next = { ...prev };
      delete next[cellId];
      return next;
    });
  }, [recordHistoryForRightErase]);

  const handleCopyRect = useCallback(
    (bounds) => {
      const doCut = cutAfterRectRef.current;
      cutAfterRectRef.current = false;
      const entries = collectPlacementsInRect(placements, bounds);
      setClipboard({ entries });
      if (doCut) {
        recordHistory();
        setPlacements((prev) => {
          const next = { ...prev };
          for (let r = bounds.rMin; r <= bounds.rMax; r += 1) {
            for (let c = bounds.cMin; c <= bounds.cMax; c += 1) {
              delete next[`${r}-${c}`];
            }
          }
          return next;
        });
      }
    },
    [placements, recordHistory],
  );

  const handleCopyModeEnd = useCallback(() => {
    setAwaitingCopyDrag(false);
  }, []);

  const handlePasteAt = useCallback(
    (anchorCellId) => {
      if (!clipboard?.entries || Object.keys(clipboard.entries).length === 0) {
        setPasteArmed(false);
        return;
      }
      const anchor = parseCellId(anchorCellId);
      if (!anchor) {
        setPasteArmed(false);
        return;
      }
      recordHistory();
      setPlacements((prev) => {
        const next = { ...prev };
        for (const [relKey, p] of Object.entries(clipboard.entries)) {
          const parts = relKey.split("-");
          const dr = parseInt(parts[0], 10);
          const dc = parseInt(parts[1], 10);
          if (Number.isNaN(dr) || Number.isNaN(dc)) continue;
          const r = anchor.row + dr;
          const c = anchor.col + dc;
          if (r < 0 || r >= normalizedRows || c < 0 || c >= normalizedCols) continue;
          next[`${r}-${c}`] = {
            type: p.type,
            color: p.color,
            density: clampDensityForType(p.type, p.density ?? 1),
            ...(Number.isInteger(p.rotationCorner) ? { rotationCorner: p.rotationCorner } : {}),
          };
        }
        return next;
      });
      setPasteArmed(false);
    },
    [clipboard, normalizedRows, normalizedCols, recordHistory],
  );

  const floodFillFrom = useCallback(
    (startId, rotationCorner) => {
      const prevP = placementsRef.current;
      const prevBg = cellBackgroundsRef.current;
      const fillIds = collectFloodFillIds(startId, neighborMap, prevP, prevBg, paintScope);
      if (
        !floodFillWouldChange(
          fillIds,
          prevP,
          prevBg,
          paintScope,
          selectedInsert,
          selectedColor,
          selectedDensity,
          selectedInsertRotationDependent,
          rotationCorner,
        )
      ) {
        return;
      }
      recordHistory();

      if (paintScope === "background") {
        setCellBackgrounds((bg) => {
          const next = { ...bg };
          if (selectedInsert === "empty") {
            for (const id of fillIds) delete next[id];
          } else {
            for (const id of fillIds) {
              next[id] = selectedColor;
            }
          }
          return next;
        });
        if (selectedInsert === "empty") {
          setPlacements((prev) => {
            const next = { ...prev };
            for (const id of fillIds) delete next[id];
            return next;
          });
        }
        return;
      }

      setPlacements((prev) => {
        const next = { ...prev };
        const density = clampDensityForType(selectedInsert, selectedDensity);
        const corner = Number.isInteger(rotationCorner) ? rotationCorner : 2;
        if (selectedInsert === "empty") {
          for (const id of fillIds) delete next[id];
        } else {
          for (const id of fillIds) {
            const ex = prev[id];
            if (paintScope === "color") {
              if (!ex?.type || ex.type === "empty") continue;
              next[id] = { ...ex, color: selectedColor };
            } else if (paintScope === "shapes") {
              const keepColor = ex?.color ?? selectedColor;
              next[id] = {
                type: selectedInsert,
                color: keepColor,
                density,
                ...(selectedInsertRotationDependent ? { rotationCorner: corner } : {}),
              };
            } else {
              next[id] = {
                type: selectedInsert,
                color: selectedColor,
                density,
                ...(selectedInsertRotationDependent ? { rotationCorner: corner } : {}),
              };
            }
          }
        }
        return next;
      });

      if (selectedInsert === "empty") {
        setCellBackgrounds((bg) => {
          const next = { ...bg };
          for (const id of fillIds) delete next[id];
          return next;
        });
      }
    },
    [
      neighborMap,
      selectedInsert,
      selectedColor,
      selectedDensity,
      paintScope,
      selectedInsertRotationDependent,
      recordHistory,
    ],
  );

  const requestClearAll = useCallback(() => {
    if (
      !window.confirm(
        "Clear every insert and all custom triangle backgrounds? You can undo with Ctrl+Z (Cmd+Z on Mac).",
      )
    ) {
      return;
    }
    recordHistory();
    setPlacements({});
    setCellBackgrounds({});
  }, [recordHistory]);

  const saveLayoutToFile = useCallback(() => {
    const json = stringifyLayoutDocument({
      rows: normalizedRows,
      cols: normalizedCols,
      frameRotation,
      placements,
      cellBackgrounds,
      selectedInsert,
      selectedColor,
      selectedDensity,
      paintScope,
    });
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kumiko-layout-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [
    normalizedRows,
    normalizedCols,
    frameRotation,
    placements,
    cellBackgrounds,
    selectedInsert,
    selectedColor,
    selectedDensity,
    paintScope,
  ]);

  const onLayoutFileSelected = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseLayoutDocument(String(reader.result ?? ""));
      if (!result.ok) {
        console.warn(result.error);
        return;
      }
      recordHistory();
      setRows(String(result.rows));
      setCols(String(result.cols));
      setFrameRotation(result.frameRotation);
      setPlacements(result.placements);
      setCellBackgrounds(result.cellBackgrounds ?? {});
      setSelectedInsert(result.selectedInsert);
      setSelectedColor(result.selectedColor);
      setSelectedDensity(result.selectedDensity);
      setPaintScope(result.paintScope ?? "both");
      if (result.warnings.length) {
        console.warn("Layout load:", result.warnings.join(" "));
      }
    };
    reader.onerror = () => {
      console.warn("Could not read layout file.");
    };
    reader.readAsText(file);
  }, [recordHistory]);

  function renderSidebarPanel() {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
            <div className="shrink-0">
              <div className="flex items-start gap-2">
                <h1 className="min-w-0 flex-1 text-lg font-semibold leading-snug tracking-tight xl:text-base">
                  Kumiko Insert Designer
                </h1>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-[#eadfbe] transition hover:border-white/20 hover:bg-white/10"
                  aria-label="Source on GitHub"
                  title="Source on GitHub"
                >
                  <Github className="h-4 w-4" strokeWidth={2} aria-hidden />
                </a>
                <button
                  type="button"
                  aria-expanded={introHelpOpen}
                  aria-label="How to use"
                  title="How to use"
                  onClick={() => setIntroHelpOpen((v) => !v)}
                  className={`shrink-0 rounded-lg border p-1.5 transition ${
                    introHelpOpen
                      ? "border-[#f2d08a] bg-[#f2d08a]/20 text-[#f4ebd4]"
                      : "border-white/10 bg-white/5 text-[#eadfbe] hover:bg-white/10"
                  }`}
                >
                  <Info className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              </div>
              {introHelpOpen ? (
                <div
                  className="mt-3 space-y-3 rounded-xl border border-white/10 bg-black/25 p-3 shadow-inner"
                  role="region"
                  aria-label="How to use"
                >
                  {INTRO_SECTIONS.map((sec) => (
                    <div key={sec.title}>
                      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#f2d08a]/90">
                        {sec.title}
                      </h2>
                      {sec.paragraphs ? (
                        <ul className="mt-2 space-y-2 text-xs leading-snug text-[#eadfbe]/88">
                          {sec.paragraphs.map((line, i) => (
                            <li key={i} className="flex gap-2.5 pl-0.5">
                              <span
                                className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#d8b56a]/80"
                                aria-hidden
                              />
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-2 grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2.5 text-xs leading-snug">
                          {sec.rows.map((row, i) => (
                            <Fragment key={i}>
                              <strong className="block border-r border-white/[0.1] pr-3 text-right font-semibold text-[#f4ebd4]">
                                {row.key}
                              </strong>
                              <div className="min-w-0 text-[#eadfbe]/88">{row.detail}</div>
                            </Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-2">
              <input
                ref={layoutFileInputRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                tabIndex={-1}
                onChange={onLayoutFileSelected}
              />
              <button
                type="button"
                onClick={saveLayoutToFile}
                title="Save layout"
                aria-label="Save layout"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#eadfbe] transition hover:border-white/20 hover:bg-white/10"
              >
                <Save className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => layoutFileInputRef.current?.click()}
                title="Load layout"
                aria-label="Load layout"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#eadfbe] transition hover:border-white/20 hover:bg-white/10"
              >
                <FolderOpen className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() =>
                  setAwaitingCopyDrag((v) => {
                    const next = !v;
                    if (next) {
                      setEyedropperPending(false);
                      setPasteArmed(false);
                    }
                    return next;
                  })
                }
                aria-pressed={awaitingCopyDrag}
                title="Copy — drag on the grid to select a rectangle (Ctrl+C / Cmd+C)"
                aria-label="Copy selection"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                  awaitingCopyDrag
                    ? "border-[#f2d08a] bg-[#f2d08a]/25 text-[#f4ebd4]"
                    : "border-white/10 bg-white/5 text-[#eadfbe] hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <Copy className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                disabled={!hasClipboard}
                onClick={() => {
                  if (!hasClipboard) return;
                  setPasteArmed((v) => {
                    const next = !v;
                    if (next) {
                      setEyedropperPending(false);
                      setAwaitingCopyDrag(false);
                    }
                    return next;
                  });
                }}
                aria-pressed={pasteArmed}
                title={
                  hasClipboard
                    ? "Paste — click a cell to place the copy (Ctrl+V / Cmd+V)"
                    : "Nothing copied yet"
                }
                aria-label="Paste"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                  !hasClipboard
                    ? "cursor-not-allowed border-white/5 bg-white/[0.03] text-[#eadfbe]/35"
                    : pasteArmed
                      ? "border-sky-300/70 bg-sky-400/20 text-[#e8f4ff]"
                      : "border-white/10 bg-white/5 text-[#eadfbe] hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <ClipboardPaste className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                disabled={!canUndo}
                onClick={undo}
                title="Undo (Ctrl+Z / Cmd+Z)"
                aria-label="Undo"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                  !canUndo
                    ? "cursor-not-allowed border-white/5 bg-white/[0.03] text-[#eadfbe]/35"
                    : "border-white/10 bg-white/5 text-[#eadfbe] hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <Undo2 className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={redo}
                title="Redo (Ctrl+Y / Cmd+Shift+Z)"
                aria-label="Redo"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                  !canRedo
                    ? "cursor-not-allowed border-white/5 bg-white/[0.03] text-[#eadfbe]/35"
                    : "border-white/10 bg-white/5 text-[#eadfbe] hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <Redo2 className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <Card className="shrink-0 rounded-2xl border-white/10 bg-black/15 text-inherit shadow-xl">
              <CardHeader className="shrink-0 space-y-0 p-3 pb-2">
                <CardTitle
                  className="flex items-center gap-2 text-sm font-semibold"
                  title={GRID_HELP}
                >
                  <Grid3X3 className="h-3.5 w-3.5 shrink-0" /> Grid
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="rows">Rows</Label>
                    <Input
                      id="rows"
                      type="number"
                      min={4}
                      max={60}
                      value={rows}
                      onChange={(e) => setRows(e.target.value)}
                      className="h-9 rounded-xl border-white/15 bg-white/10 text-inherit"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cols">Columns</Label>
                    <Input
                      id="cols"
                      type="number"
                      min={4}
                      max={80}
                      value={cols}
                      onChange={(e) => setCols(e.target.value)}
                      className="h-9 rounded-xl border-white/15 bg-white/10 text-inherit"
                    />
                  </div>
                </div>
                <div className="space-y-1.5 pt-0.5">
                  <Label>Frame rotation</Label>
                  <div className="flex flex-wrap gap-1">
                    {FRAME_ROTATIONS.map((deg) => {
                      const on = frameRotation === deg;
                      return (
                        <button
                          key={deg}
                          type="button"
                          onClick={() => setFrameRotation(deg)}
                          className={`rounded-lg border px-2 py-1 text-[11px] font-medium tabular-nums transition ${
                            on
                              ? "border-[#f2d08a] bg-[#f2d08a]/20 text-[#f4ebd4]"
                              : "border-white/10 bg-white/5 text-[#eadfbe] hover:bg-white/10"
                          }`}
                        >
                          {deg}°
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shrink-0 rounded-2xl border-white/10 bg-black/15 text-inherit shadow-xl">
              <CardHeader className="shrink-0 space-y-0 p-3 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Paintbrush className="h-3.5 w-3.5 shrink-0" /> Paint
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="flex flex-wrap gap-1">
                  {PAINT_SCOPES.map((s) => {
                    const on = paintScope === s.id;
                    const hint = PAINT_SCOPE_HINTS[s.id] ?? "";
                    return (
                      <button
                        key={s.id}
                        type="button"
                        title={hint}
                        onClick={() => setPaintScope(s.id)}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                          on
                            ? "border-[#f2d08a] bg-[#f2d08a]/20 text-[#f4ebd4]"
                            : "border-white/10 bg-white/5 text-[#eadfbe] hover:bg-white/10"
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="shrink-0 rounded-2xl border-white/10 bg-black/15 text-inherit shadow-xl">
              <CardHeader className="shrink-0 space-y-0 p-3 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Palette className="h-3.5 w-3.5 shrink-0" /> Insert Color
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border-0 bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEyedropperPending((v) => {
                        const next = !v;
                        if (next) {
                          setAwaitingCopyDrag(false);
                          setPasteArmed(false);
                        }
                        return next;
                      })
                    }
                    aria-pressed={eyedropperPending}
                    title="Pick color from a painted cell (one click). Click again or Esc to cancel."
                    aria-label="Eyedropper: pick color from grid"
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                      eyedropperPending
                        ? "border-[#f2d08a] bg-[#f2d08a]/25 text-[#f4ebd4]"
                        : "border-white/10 bg-black/25 text-[#eadfbe] hover:border-white/20 hover:bg-white/10"
                    }`}
                  >
                    <Pipette className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <div className="min-w-0">
                    <div className="text-xs font-medium">Current color</div>
                    <div className="truncate text-[11px] text-[#eadfbe]/75">{selectedColor}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border-white/10 bg-black/15 text-inherit shadow-xl">
              <CardHeader className="shrink-0 space-y-0 p-3 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Shapes className="h-3.5 w-3.5 shrink-0" /> Insert Shapes
                </CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-3 pb-3 pt-0">
                <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
                  <div className="grid gap-2">
                    {INSERT_LIST.map((insert) => {
                      const categoryActive = selectedInsert === insert.id;
                      const minD = insert.minDensity ?? 1;
                      const maxD = insert.maxDensity ?? 1;
                      const levels = Array.from({ length: maxD - minD + 1 }, (_, i) => minD + i);

                      return (
                        <div
                          key={insert.id}
                          className={`rounded-xl border px-2 py-2 transition ${
                            categoryActive
                              ? "border-[#f2d08a] bg-[#f2d08a]/12"
                              : "border-white/10 bg-white/5"
                          }`}
                        >
                          <div className="flex flex-col items-start gap-1.5">
                            <div className="text-sm font-medium leading-none">{insert.label}</div>
                            <div className="flex flex-wrap gap-1">
                              {insert.id === "empty" ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedInsert("empty")}
                                  title="Empty — erase with paint tool"
                                  className={`flex h-10 w-10 items-center justify-center rounded-lg border p-0.5 transition ${
                                    selectedInsert === "empty"
                                      ? "border-[#f2d08a] bg-[#f2d08a]/25"
                                      : "border-white/10 bg-black/25 hover:bg-white/10"
                                  }`}
                                >
                                  <div className="box-border h-full w-full min-h-0 min-w-0 rounded-md border-2 border-dashed border-white/40" />
                                </button>
                              ) : (
                                levels.map((lvl) => {
                                  const tileActive =
                                    selectedInsert === insert.id && selectedDensity === lvl;
                                  return (
                                    <button
                                      key={lvl}
                                      type="button"
                                      title={`${insert.label} · level ${lvl}`}
                                      onClick={() => {
                                        setSelectedInsert(insert.id);
                                        setSelectedDensity(lvl);
                                      }}
                                      className={`flex h-10 w-10 items-center justify-center rounded-lg border p-0.5 transition ${
                                        tileActive
                                          ? "border-[#f2d08a] bg-[#f2d08a]/25 shadow-[inset_0_0_0_1px_rgba(242,208,138,0.35)]"
                                          : "border-white/10 bg-black/25 hover:border-white/20 hover:bg-white/10"
                                      }`}
                                    >
                                      <svg
                                        viewBox={insertPreview.viewBox}
                                        preserveAspectRatio="xMidYMid meet"
                                        className="block h-full w-full min-h-0 min-w-0 overflow-visible"
                                        aria-hidden
                                      >
                                        <InsertArtwork
                                          type={insert.id}
                                          points={insertPreview.points}
                                          color={selectedColor}
                                          density={lvl}
                                          preview
                                        />
                                      </svg>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Separator className="shrink-0 bg-white/10" />

            <Button
              type="button"
              onClick={requestClearAll}
              variant="secondary"
              className="w-full shrink-0 justify-center rounded-xl bg-white/10 px-3 py-2.5 text-xs text-inherit hover:bg-white/15"
            >
              <Eraser className="mr-1.5 h-3.5 w-3.5 shrink-0" /> Clear all inserts & backgrounds
            </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#2b241b] text-[#f4ebd4]">
      <div
        className={`grid min-h-screen xl:h-screen xl:grid-rows-1 xl:items-stretch xl:overflow-hidden ${
          isXl ? "xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]" : "grid-cols-1"
        }`}
      >
        {isXl ? (
          <aside className="flex h-full min-h-0 flex-col border-r border-white/10 bg-[#5e4c2b] p-3 overflow-y-auto overflow-x-hidden">
            {renderSidebarPanel()}
          </aside>
        ) : null}

        <main className="min-h-0 min-w-0 overflow-auto p-3 md:p-4 xl:p-5">
          <KumikoCanvas
            rows={normalizedRows}
            cols={normalizedCols}
            cells={cells}
            placements={placements}
            cellBackgrounds={cellBackgrounds}
            frameRotation={frameRotation}
            eyedropperPending={eyedropperPending}
            onEyedropperSample={handleEyedropperSample}
            copySelectActive={awaitingCopyDrag}
            onCopyRect={handleCopyRect}
            onCopyModeEnd={handleCopyModeEnd}
            pasteArmed={pasteArmed}
            pasteClipboardEntries={
              pasteArmed && clipboard?.entries && Object.keys(clipboard.entries).length > 0
                ? clipboard.entries
                : null
            }
            onPasteAt={handlePasteAt}
            onDismissCanvasModes={dismissCanvasToolModes}
            onPaintCell={paintCell}
            onEraseCell={eraseCell}
            onFloodFill={floodFillFrom}
            onLeftPaintStrokeStart={beginLeftPaintStroke}
            onLeftPaintStrokeEnd={endLeftPaintStroke}
            onRightEraseStrokeStart={beginRightEraseStroke}
            onRightEraseStrokeEnd={endRightEraseStroke}
            showRotationCornerHint={selectedInsertRotationDependent && paintScope !== "background" && selectedInsert !== "empty"}
          />
        </main>
      </div>

      {!isXl ? (
        <>
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-[#5e4c2b] text-[#f4ebd4] shadow-lg"
            aria-label="Open design controls"
          >
            <PanelLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          {mobileDrawerOpen ? (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/55"
                aria-hidden
                onClick={() => setMobileDrawerOpen(false)}
              />
              <div
                className="fixed inset-y-0 left-0 z-50 flex max-w-[min(22rem,calc(100vw-1.5rem))] flex-col border-r border-white/10 bg-[#5e4c2b] shadow-2xl"
                style={{ width: "min(22rem, calc(100vw - 1.5rem))" }}
                role="dialog"
                aria-modal="true"
                aria-label="Design controls"
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5">
                  <span className="text-sm font-semibold tracking-tight">Controls</span>
                  <button
                    type="button"
                    onClick={() => setMobileDrawerOpen(false)}
                    aria-label="Close panel"
                    className="rounded-lg border border-white/10 bg-white/5 p-2 text-[#eadfbe] hover:bg-white/10"
                  >
                    <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
                  {renderSidebarPanel()}
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {/* Outside the 2-col grid: a third child was stealing row 2 and collapsing the sidebar height */}
      <aside
        className={`pointer-events-auto max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-black/45 p-3 shadow-2xl backdrop-blur-sm ${
          pieceCountsOpen ? "w-[min(360px,calc(100vw-2rem))]" : "w-max"
        }`}
        style={{
          position: "fixed",
          right: 16,
          top: 16,
          zIndex: 30,
        }}
      >
        <button
          type="button"
          className={`flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-white/5 ${
            pieceCountsOpen ? "mb-2" : "mb-0"
          }`}
          onClick={() => setPieceCountsOpen((o) => !o)}
          aria-expanded={pieceCountsOpen}
          aria-controls={pieceCountsOpen ? "piece-counts-body" : undefined}
          id="piece-counts-heading"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-[#eadfbe]/85">
            Piece Counts
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[#eadfbe]/80 transition-transform duration-200 ${
              pieceCountsOpen ? "rotate-180" : ""
            }`}
            strokeWidth={2}
            aria-hidden
          />
        </button>
        {pieceCountsOpen ? (
        <div
          id="piece-counts-body"
          role="region"
          aria-labelledby="piece-counts-heading"
          className="max-h-[62vh] space-y-3 overflow-y-auto pr-1"
        >
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-[#eadfbe]/60">Inserts</div>
            {pieceCounts.inserts.length === 0 ? (
              <div className="text-xs text-[#eadfbe]/60">None placed</div>
            ) : (
              pieceCounts.inserts.map((item) => {
                const insertMeta = INSERT_REGISTRY.get(item.type);
                const previewPoints = insertMeta?.rotationDependent
                  ? rotatePointsByCorner(insertPreview.points, item.rotationCorner)
                  : insertPreview.points;
                return (
                  <div
                    key={`${item.type}-${item.color}-${item.density}`}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5"
                  >
                    <svg
                      viewBox={insertPreview.viewBox}
                      preserveAspectRatio="xMidYMid meet"
                      className="h-7 w-7 shrink-0 overflow-visible rounded-md bg-black/20"
                      aria-hidden
                    >
                      <InsertArtwork
                        type={item.type}
                        points={previewPoints}
                        color={item.color}
                        density={item.density}
                        preview
                        showFrame={false}
                      />
                    </svg>
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="text-[#f4ebd4]">{insertMeta?.label ?? item.type}</div>
                      <div className="break-all text-[#eadfbe]/65">{item.color}</div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-[#f4ebd4]">x {item.count}</div>
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-[#eadfbe]/60">Backgrounds</div>
            {pieceCounts.backgrounds.map((bg) => (
              <div
                key={`bg-${bg.color}`}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5"
              >
                <div className="h-6 w-6 shrink-0 rounded-md border border-white/15" style={{ backgroundColor: bg.color }} />
                <div className="min-w-0 flex-1 break-all text-xs text-[#eadfbe]/75">{bg.color}</div>
                <div className="shrink-0 text-sm font-semibold text-[#f4ebd4]">x {bg.count}</div>
              </div>
            ))}
          </div>
        </div>
        ) : null}
      </aside>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  frameRotation = 90,
  eyedropperPending = false,
  onEyedropperSample,
  copySelectActive = false,
  onCopyRect,
  onCopyModeEnd,
  pasteArmed = false,
  onPasteAt,
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
  const cellById = useMemo(() => new Map(cells.map((c) => [c.id, c])), [cells]);

  useEffect(() => {
    if (!copySelectActive) {
      copyDragRef.current = null;
      setCopyMarqueeRect(null);
    }
  }, [copySelectActive]);

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
      onPaintCell(cellId, rotationCorner);
      attachLeftDragListeners();
    } else if (e.button === 2) {
      e.preventDefault();
      lastEraseDragIdRef.current = cellId;
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

                  <polygon
                    points={triPointString(cell.points)}
                    fill={cellBg}
                    stroke="none"
                    style={{ pointerEvents: "none" }}
                  />

                  <g clipPath={`url(#clip-${cell.id})`} style={{ pointerEvents: "none" }}>
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
                    style={{ pointerEvents: "none" }}
                  />

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
  const [eyedropperPending, setEyedropperPending] = useState(false);
  const [clipboard, setClipboard] = useState(null);
  const [awaitingCopyDrag, setAwaitingCopyDrag] = useState(false);
  const [pasteArmed, setPasteArmed] = useState(false);
  const layoutFileInputRef = useRef(null);

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

  useEffect(() => {
    setSelectedDensity((d) => clampDensityForType(selectedInsert, d));
  }, [selectedInsert]);

  useEffect(() => {
    if (!eyedropperPending && !awaitingCopyDrag && !pasteArmed) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setEyedropperPending(false);
        setAwaitingCopyDrag(false);
        setPasteArmed(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [eyedropperPending, awaitingCopyDrag, pasteArmed]);

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
        setCellBackgrounds((prevBg) => ({ ...prevBg, [cellId]: selectedColor }));
        return;
      }
      setPlacements((prev) => {
        const density = clampDensityForType(selectedInsert, selectedDensity);
        const corner = Number.isInteger(rotationCorner) ? rotationCorner : 2;
        if (paintScope === "color") {
          const ex = prev[cellId];
          if (!ex?.type || ex.type === "empty") return prev;
          return {
            ...prev,
            [cellId]: { ...ex, color: selectedColor },
          };
        }
        if (paintScope === "shapes") {
          const keepColor = prev[cellId]?.color ?? selectedColor;
          return {
            ...prev,
            [cellId]: {
              type: selectedInsert,
              color: keepColor,
              density,
              ...(selectedInsertRotationDependent ? { rotationCorner: corner } : {}),
            },
          };
        }
        return {
          ...prev,
          [cellId]: {
            type: selectedInsert,
            color: selectedColor,
            density,
            ...(selectedInsertRotationDependent ? { rotationCorner: corner } : {}),
          },
        };
      });
    },
    [selectedInsert, selectedColor, selectedDensity, paintScope, selectedInsertRotationDependent],
  );

  const eraseCell = useCallback((cellId) => {
    setPlacements((prev) => {
      if (!(cellId in prev)) return prev;
      const next = { ...prev };
      delete next[cellId];
      return next;
    });
  }, []);

  const handleCopyRect = useCallback(
    (bounds) => {
      const entries = collectPlacementsInRect(placements, bounds);
      setClipboard({ entries });
    },
    [placements],
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
    [clipboard, normalizedRows, normalizedCols],
  );

  const floodFillFrom = useCallback(
    (startId, rotationCorner) => {
      const prevP = placementsRef.current;
      const prevBg = cellBackgroundsRef.current;
      const fillIds = collectFloodFillIds(startId, neighborMap, prevP, prevBg, paintScope);

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
    [neighborMap, selectedInsert, selectedColor, selectedDensity, paintScope, selectedInsertRotationDependent],
  );

  function clearAll() {
    setPlacements({});
    setCellBackgrounds({});
  }

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
  }, []);

  return (
    <div className="min-h-screen bg-[#2b241b] text-[#f4ebd4]">
      <div className="grid min-h-screen grid-cols-1 xl:h-screen xl:grid-cols-[340px_minmax(0,1fr)] xl:grid-rows-1 xl:items-stretch xl:overflow-hidden">
        <aside className="flex h-full min-h-screen flex-col border-r border-white/10 bg-[#5e4c2b] p-4 md:p-5 xl:min-h-0 xl:overflow-y-auto">
          <div className="flex min-h-0 w-full flex-1 flex-col gap-5">
            <div className="shrink-0">
              <h1 className="text-2xl font-semibold tracking-tight">Kumiko Insert Designer</h1>
              <p className="mt-2 text-sm leading-6 text-[#eadfbe]/80">
                Build a mitsukude-style triangular grid, choose an insert and color. Left-click or drag to paint,
                right-click or drag to clear the insert (triangle background stays). Middle-click to flood-fill matching
                neighbors.
              </p>
            </div>

            <Card className="shrink-0 rounded-3xl border-white/10 bg-black/15 text-inherit shadow-xl">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Grid3X3 className="h-4 w-4" /> Grid
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="rows">Rows</Label>
                    <Input
                      id="rows"
                      type="number"
                      min={4}
                      max={60}
                      value={rows}
                      onChange={(e) => setRows(e.target.value)}
                      className="rounded-2xl border-white/15 bg-white/10 text-inherit"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cols">Columns</Label>
                    <Input
                      id="cols"
                      type="number"
                      min={4}
                      max={80}
                      value={cols}
                      onChange={(e) => setCols(e.target.value)}
                      className="rounded-2xl border-white/15 bg-white/10 text-inherit"
                    />
                  </div>
                </div>
                <p className="text-xs text-[#eadfbe]/70">
                  Changing rows or columns regenerates the empty lattice. Existing placements stay as long as their cell IDs still exist.
                </p>
                <div className="space-y-2 pt-1">
                  <Label>Frame rotation</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {FRAME_ROTATIONS.map((deg) => {
                      const on = frameRotation === deg;
                      return (
                        <button
                          key={deg}
                          type="button"
                          onClick={() => setFrameRotation(deg)}
                          className={`rounded-xl border px-2.5 py-1.5 text-xs font-medium tabular-nums transition ${
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

            <Card className="shrink-0 rounded-3xl border-white/10 bg-black/15 text-inherit shadow-xl">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Paintbrush className="h-4 w-4" /> Paint
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {PAINT_SCOPES.map((s) => {
                    const on = paintScope === s.id;
                    const hint = PAINT_SCOPE_HINTS[s.id] ?? "";
                    return (
                      <button
                        key={s.id}
                        type="button"
                        title={hint}
                        onClick={() => setPaintScope(s.id)}
                        className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
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

            <Card className="shrink-0 rounded-3xl border-white/10 bg-black/15 text-inherit shadow-xl">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Palette className="h-4 w-4" /> Insert Color
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                    className="h-12 w-16 cursor-pointer rounded border-0 bg-transparent"
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
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition ${
                      eyedropperPending
                        ? "border-[#f2d08a] bg-[#f2d08a]/25 text-[#f4ebd4]"
                        : "border-white/10 bg-black/25 text-[#eadfbe] hover:border-white/20 hover:bg-white/10"
                    }`}
                  >
                    <Pipette className="h-5 w-5" strokeWidth={2} />
                  </button>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Current color</div>
                    <div className="text-sm text-[#eadfbe]/75">{selectedColor}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border-white/10 bg-black/15 text-inherit shadow-xl">
              <CardHeader className="shrink-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shapes className="h-4 w-4" /> Insert Shapes
                </CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-0">
                <ScrollArea className="min-h-0 flex-1 overflow-y-auto pr-2">
                  <div className="grid gap-2.5">
                    {INSERT_LIST.map((insert) => {
                      const categoryActive = selectedInsert === insert.id;
                      const minD = insert.minDensity ?? 1;
                      const maxD = insert.maxDensity ?? 1;
                      const levels = Array.from({ length: maxD - minD + 1 }, (_, i) => minD + i);

                      return (
                        <div
                          key={insert.id}
                          className={`rounded-2xl border px-3 py-3 transition ${
                            categoryActive
                              ? "border-[#f2d08a] bg-[#f2d08a]/12"
                              : "border-white/10 bg-white/5"
                          }`}
                        >
                          <div className="flex flex-col items-start gap-2">
                            <div className="font-medium">{insert.label}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {insert.id === "empty" ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedInsert("empty")}
                                  title="Empty — erase with paint tool"
                                  className={`flex h-12 w-12 items-center justify-center rounded-xl border p-1 transition ${
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
                                      className={`flex h-12 w-12 items-center justify-center rounded-xl border p-1 transition ${
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

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                onClick={clearAll}
                variant="secondary"
                className="min-w-0 flex-1 justify-start rounded-2xl bg-white/10 text-inherit hover:bg-white/15"
              >
                <Eraser className="mr-2 h-4 w-4 shrink-0" /> Clear all inserts
              </Button>
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[#eadfbe] transition hover:border-white/20 hover:bg-white/10"
              >
                <Save className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => layoutFileInputRef.current?.click()}
                title="Load layout"
                aria-label="Load layout"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[#eadfbe] transition hover:border-white/20 hover:bg-white/10"
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
                title="Copy — drag on the grid to select a rectangle of cells"
                aria-label="Copy selection"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition ${
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
                title={hasClipboard ? "Paste — click a cell to place the copy" : "Nothing copied yet"}
                aria-label="Paste"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition ${
                  !hasClipboard
                    ? "cursor-not-allowed border-white/5 bg-white/[0.03] text-[#eadfbe]/35"
                    : pasteArmed
                      ? "border-sky-300/70 bg-sky-400/20 text-[#e8f4ff]"
                      : "border-white/10 bg-white/5 text-[#eadfbe] hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <ClipboardPaste className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </aside>

        <main className="min-h-0 overflow-auto p-3 md:p-4 xl:p-5">
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
            onPasteAt={handlePasteAt}
            onPaintCell={paintCell}
            onEraseCell={eraseCell}
            onFloodFill={floodFillFrom}
            showRotationCornerHint={selectedInsertRotationDependent && paintScope !== "background" && selectedInsert !== "empty"}
          />
        </main>
        <aside
          className="pointer-events-auto w-[360px] rounded-2xl border border-white/10 bg-black/45 p-3 shadow-2xl backdrop-blur-sm"
          style={{
            position: "fixed",
            right: 16,
            top: 16,
            zIndex: 30,
          }}
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#eadfbe]/85">
            Piece Counts
          </div>
          <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
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
        </aside>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Palette, Grid3X3, Eraser, Shapes } from "lucide-react";

const SQRT3 = Math.sqrt(3);
const TRI_SIZE = 34;
const STROKE = 2;
const GRID_COLOR = "#d8b56a";
const BG_COLOR = "#4b4131";

const INSERTS = [
  { id: "empty", label: "Empty" },
  { id: "asanoha", label: "Asanoha" },
  { id: "shippo", label: "Shippo" },
  { id: "kikko", label: "Kikko" },
  { id: "yae", label: "Yae Asa" },
];

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function triPointString(points) {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function centroid(points) {
  return {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3,
  };
}

function insetTriangle(points, factor = 0.64) {
  const c = centroid(points);
  return points.map((p) => ({
    x: c.x + (p.x - c.x) * factor,
    y: c.y + (p.y - c.y) * factor,
  }));
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

function lineBetween(a, b) {
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

function quadPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function edgeMidpoints(points) {
  return {
    ab: quadPoint(points[0], points[1], 0.5),
    bc: quadPoint(points[1], points[2], 0.5),
    ca: quadPoint(points[2], points[0], 0.5),
  };
}

function inwardPoint(from, to, amount) {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

function curvePath(start, control, end) {
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

function InsertArtwork({ type, points, color, preview = false }) {
  const c = centroid(points);
  const mids = edgeMidpoints(points);
  const lineColor = color;
  const frameColor = preview ? "#c7c7c7" : "rgba(255,255,255,0.18)";
  const outerStroke = preview ? 3.2 : 1.4;
  const patternStroke = preview ? 3.1 : 1.7;
  const patternStrokeThin = preview ? 2.5 : 1.25;

  const insetFromVertices = points.map((p) => inwardPoint(p, c, 0.34));
  const insetFromMids = [
    inwardPoint(mids.ab, c, 0.22),
    inwardPoint(mids.bc, c, 0.22),
    inwardPoint(mids.ca, c, 0.22),
  ];

  if (type === "empty") return null;

  if (type === "asanoha") {
    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        <line {...lineBetween(c, points[0])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, points[1])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, points[2])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
      </g>
    );
  }

  if (type === "kikko") {
    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        <polygon points={triPointString(insetFromMids)} fill="none" stroke={lineColor} strokeWidth={patternStrokeThin} strokeLinejoin="round" />
        <line {...lineBetween(mids.ab, insetFromMids[0])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(mids.bc, insetFromMids[1])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(mids.ca, insetFromMids[2])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
      </g>
    );
  }

  if (type === "shippo") {
    const shippoA = curvePath(points[0], insetFromVertices[0], points[1]);
    const shippoB = curvePath(points[1], insetFromVertices[1], points[2]);
    const shippoC = curvePath(points[2], insetFromVertices[2], points[0]);
    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        <path d={shippoA} fill="none" stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <path d={shippoB} fill="none" stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <path d={shippoC} fill="none" stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
      </g>
    );
  }

  if (type === "yae") {
    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        <polygon points={triPointString(insetFromVertices)} fill="none" stroke={lineColor} strokeWidth={patternStroke} strokeLinejoin="round" />
      </g>
    );
  }

  return null;
}

function KumikoCanvas({ rows, cols, placements, onPlace }) {
  const h = TRI_SIZE * SQRT3 * 0.5;
  const width = cols * (TRI_SIZE / 2) + TRI_SIZE;
  const height = rows * h + h;

  const cells = useMemo(() => {
    const out = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        out.push(buildTriangleCell(row, col, TRI_SIZE));
      }
    }
    return out;
  }, [rows, cols]);

  return (
    <div className="h-full w-full overflow-auto rounded-3xl border border-white/10 bg-[#3e3528] shadow-2xl">
      <div className="min-w-full min-h-full flex items-center justify-center p-6">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="max-h-[82vh] max-w-full"
          style={{ background: BG_COLOR }}
        >
          <rect x="0" y="0" width={width} height={height} fill={BG_COLOR} />

          {cells.map((cell) => {
            const placed = placements[cell.id] || { type: "empty", color: "#8b5cf6" };
            return (
              <g key={cell.id}>
                <defs>
                  <clipPath id={`clip-${cell.id}`}>
                    <polygon points={triPointString(cell.points)} />
                  </clipPath>
                </defs>

                <polygon
                  points={triPointString(cell.points)}
                  fill="transparent"
                  onClick={() => onPlace(cell.id)}
                  className="cursor-pointer"
                />

                <g clipPath={`url(#clip-${cell.id})`}>
                  <InsertArtwork type={placed.type} points={cell.points} color={placed.color} />
                </g>

                <polygon
                  points={triPointString(cell.points)}
                  fill="none"
                  stroke={GRID_COLOR}
                  strokeWidth={STROKE}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function KumikoGridDesignerApp() {
  const [rows, setRows] = useState(18);
  const [cols, setCols] = useState(24);
  const [selectedInsert, setSelectedInsert] = useState("asanoha");
  const [selectedColor, setSelectedColor] = useState("#8b5cf6");
  const [placements, setPlacements] = useState({});

  const normalizedRows = clampInt(rows, 4, 60, 18);
  const normalizedCols = clampInt(cols, 4, 80, 24);

  function placeInsert(cellId) {
    setPlacements((prev) => ({
      ...prev,
      [cellId]: {
        type: selectedInsert,
        color: selectedColor,
      },
    }));
  }

  function clearAll() {
    setPlacements({});
  }

  return (
    <div className="min-h-screen bg-[#2b241b] text-[#f4ebd4]">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="border-r border-white/10 bg-[#5e4c2b] p-4 md:p-5">
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Kumiko Insert Designer</h1>
              <p className="mt-2 text-sm leading-6 text-[#eadfbe]/80">
                Build a mitsukude-style triangular grid, choose an insert, pick a color, then click cells to place patterns.
              </p>
            </div>

            <Card className="rounded-3xl border-white/10 bg-black/15 text-inherit shadow-xl">
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
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-white/10 bg-black/15 text-inherit shadow-xl">
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
                  <div>
                    <div className="text-sm font-medium">Current color</div>
                    <div className="text-sm text-[#eadfbe]/75">{selectedColor}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-white/10 bg-black/15 text-inherit shadow-xl">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shapes className="h-4 w-4" /> Insert Shapes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[280px] pr-3">
                  <div className="grid gap-2">
                    {INSERTS.map((insert) => {
                      const active = selectedInsert === insert.id;
                      const previewPoints = [
                        { x: 10, y: 66 },
                        { x: 45, y: 10 },
                        { x: 80, y: 66 },
                      ];
                      return (
                        <button
                          key={insert.id}
                          onClick={() => setSelectedInsert(insert.id)}
                          className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${
                            active
                              ? "border-[#f2d08a] bg-[#f2d08a]/15"
                              : "border-white/10 bg-white/5 hover:bg-white/10"
                          }`}
                        >
                          <div>
                            <div className="font-medium">{insert.label}</div>
                            <div className="text-xs text-[#eadfbe]/70">Place this pattern on click</div>
                          </div>
                          <div className="flex h-12 w-16 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                            {insert.id === "empty" ? (
                              <div className="h-6 w-6 rounded-md border border-dashed border-white/20" />
                            ) : (
                              <svg viewBox="0 0 90 76" className="h-10 w-14 overflow-visible">
                                <InsertArtwork type={insert.id} points={previewPoints} color={selectedColor} preview />
                              </svg>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Separator className="bg-white/10" />

            <div className="grid gap-2">
              <Button
                onClick={clearAll}
                variant="secondary"
                className="justify-start rounded-2xl bg-white/10 text-inherit hover:bg-white/15"
              >
                <Eraser className="mr-2 h-4 w-4" /> Clear all inserts
              </Button>
            </div>
          </div>
        </aside>

        <main className="p-3 md:p-4 xl:p-5">
          <KumikoCanvas
            rows={normalizedRows}
            cols={normalizedCols}
            placements={placements}
            onPlace={placeInsert}
          />
        </main>
      </div>
    </div>
  );
}

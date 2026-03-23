import { useId } from "react";
import { triPointString } from "./geometry.js";
import { EmptyInsert } from "./EmptyInsert.js";
import { AsanohaInsert } from "./AsanohaInsert.js";
import { KikkoInsert } from "./KikkoInsert.js";
import { ShippoInsert } from "./ShippoInsert.js";
import { LotusShippoInsert } from "./LotusShippoInsert.js";
import { SenkaInsert } from "./SenkaInsert.js";
import { SanbonInsert } from "./SanbonInsert.js";
import { RindoInsert } from "./RindoInsert.js";
import { KakuseigaihaInsert } from "./KakuseigaihaInsert.js";

/**
 * Register inserts here (order = sidebar order). Each class extends BaseInsert.
 *
 * Optional code-splitting later, e.g.:
 *   const { ShippoInsert } = await import("./ShippoInsert.js");
 *   INSERT_REGISTRY.set(ShippoInsert.id, ShippoInsert);
 */
const INSERT_CLASSES = [
  EmptyInsert,
  AsanohaInsert,
  ShippoInsert,
  LotusShippoInsert,
  KikkoInsert,
  SenkaInsert,
  SanbonInsert,
  RindoInsert,
  KakuseigaihaInsert,
];

export const INSERT_REGISTRY = new Map(INSERT_CLASSES.map((C) => [C.id, C]));

export const INSERT_LIST = INSERT_CLASSES.map((C) => ({
  id: C.id,
  label: C.label,
  minDensity: C.minDensity ?? 1,
  maxDensity: C.maxDensity ?? 1,
}));

/** Clamp a requested density to the range declared on the insert class. */
export function clampDensityForClass(C, raw) {
  if (!C) return 1;
  const min = C.minDensity ?? 1;
  const max = C.maxDensity ?? 1;
  const n = Number.isFinite(raw) ? Math.trunc(Number(raw)) : min;
  return Math.min(max, Math.max(min, n));
}

export function clampDensityForType(type, raw) {
  return clampDensityForClass(INSERT_REGISTRY.get(type), raw);
}

export function InsertArtwork({ type, points, color, preview = false, density, showFrame = true }) {
  const previewClipId = useId().replace(/:/g, "");
  const C = INSERT_REGISTRY.get(type);
  if (!C) return null;

  const ctx = {
    points,
    color,
    preview,
    previewClipId,
    density: clampDensityForClass(C, density ?? C.minDensity ?? 1),
    frameColor: showFrame ? (preview ? "#c7c7c7" : "rgba(255,255,255,0.18)") : "transparent",
    lineColor: color,
    outerStroke: preview ? 3.2 : 1.4,
    patternStroke: preview ? 3.1 : 1.7,
    patternStrokeThin: preview ? 2.5 : 1.25,
  };

  const body = C.render(ctx);
  if (body == null) return null;

  const clip =
    (preview && C.clipPreview) || C.clipTriangle;
  if (clip) {
    return (
      <>
        <defs>
          <clipPath id={previewClipId}>
            <polygon points={triPointString(points)} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${previewClipId})`}>{body}</g>
      </>
    );
  }

  return body;
}

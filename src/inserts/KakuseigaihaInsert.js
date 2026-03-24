import { BaseInsert } from "./BaseInsert.js";
import { inwardPoint, lineBetween, triPointString } from "./geometry.js";

function polarArcPath(center, start, end) {
  const r = Math.hypot(start.x - center.x, start.y - center.y);
  if (r < 1e-6) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r.toFixed(3)} ${r.toFixed(3)} 0 0 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

/**
 * Kakuseigaiha: concentric arcs centered on one corner.
 * `rotationDependent` uses `points[2]` as the active fan pivot.
 */
export class KakuseigaihaInsert extends BaseInsert {
  static id = "kakuseigaiha";
  static label = "Kakuseigaiha";
  static maxDensity = 2;
  static rotationDependent = true;

  static render(ctx) {
    if (ctx.density >= 2) return this.renderDensity2(ctx);
    return this.renderDensity1(ctx);
  }

  static renderDensity1(ctx) {
    const { points, frameColor, lineColor, outerStroke, patternStroke } = ctx;
    const pivot = points[2];
    const left = points[0];
    const right = points[1];
    const bands = [0.20, 0.40, 0.60, 0.80];

    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        {bands.map((t, i) => {
          const a = inwardPoint(pivot, left, t);
          const b = inwardPoint(pivot, right, t);
          return (
            <path
              key={`s1-${i}`}
              d={polarArcPath(pivot, a, b)}
              fill="none"
              stroke={lineColor}
              strokeWidth={patternStroke}
              strokeLinecap="round"
            />
          );
        })}
      </g>
    );
  }

  static renderDensity2(ctx) {
    const { points, frameColor, lineColor, outerStroke, patternStroke, patternStrokeThin } = ctx;
    const pivot = points[2];
    const left = points[0];
    const right = points[1];
    const bands = [0.2, 0.34, 0.5, 0.66, 0.82];
    const spokeTs = [0.25, 0.5, 0.75];

    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        {bands.map((t, i) => {
          const a = inwardPoint(pivot, left, t);
          const b = inwardPoint(pivot, right, t);
          return (
            <path
              key={`s2-arc-${i}`}
              d={polarArcPath(pivot, a, b)}
              fill="none"
              stroke={lineColor}
              strokeWidth={i % 2 === 0 ? patternStroke : patternStrokeThin}
              strokeLinecap="round"
            />
          );
        })}
        {spokeTs.map((t, i) => {
          const edgePt = inwardPoint(left, right, t);
          const inner = inwardPoint(pivot, edgePt, 0.18);
          const outer = inwardPoint(pivot, edgePt, 0.9);
          return (
            <line
              key={`s2-spoke-${i}`}
              {...lineBetween(inner, outer)}
              stroke={lineColor}
              strokeWidth={patternStrokeThin}
              strokeLinecap="round"
            />
          );
        })}
      </g>
    );
  }
}

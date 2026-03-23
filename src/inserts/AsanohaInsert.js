import { BaseInsert } from "./BaseInsert.js";
import { centroid, lineBetween, triPointString } from "./geometry.js";

/** Homothety from centroid: inner vertex i sits opposite outer vertex i, toward edge (i+1)–(i+2). */
const ASANOHA_D2_INSET = 0.23;

export class AsanohaInsert extends BaseInsert {
  static id = "asanoha";
  static label = "Asanoha";
  static maxDensity = 3;

  static render(ctx) {
    if (ctx.density >= 3) {
      return this.renderDensity3(ctx);
    }
    if (ctx.density >= 2) {
      return this.renderDensity2(ctx);
    }
    return this.renderDensity1(ctx);
  }

  /** Base hemp leaf: centroid to each outer vertex. */
  static renderDensity1(ctx) {
    const { points, frameColor, lineColor, outerStroke, patternStroke } = ctx;
    const c = centroid(points);
    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        <line {...lineBetween(c, points[0])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, points[1])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, points[2])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
      </g>
    );
  }

  /**
   * Inverted inner triangle; each inner vertex connects to the two outer vertices on the edge it faces
   * (opposite the matching outer vertex).
   */
  static renderDensity2(ctx) {
    const { points, frameColor, lineColor, outerStroke, patternStroke, patternStrokeThin } = ctx;
    const c = centroid(points);
    const s = ASANOHA_D2_INSET;
    const inner = [0, 1, 2].map((i) => ({
      x: c.x + s * (c.x - points[i].x),
      y: c.y + s * (c.y - points[i].y),
    }));

    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        <polygon
          points={triPointString(inner)}
          fill="none"
          stroke={lineColor}
          strokeWidth={patternStrokeThin}
          strokeLinejoin="round"
        />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <line
              {...lineBetween(inner[i], points[(i + 1) % 3])}
              stroke={lineColor}
              strokeWidth={patternStroke}
              strokeLinecap="round"
            />
            <line
              {...lineBetween(inner[i], points[(i + 2) % 3])}
              stroke={lineColor}
              strokeWidth={patternStroke}
              strokeLinecap="round"
            />
          </g>
        ))}
      </g>
    );
  }

  /**
   * Same inner positions and inner→outer spokes as density 2, but no inner triangle edges.
   * Adds inner→centroid and outer→centroid for each vertex.
   */
  static renderDensity3(ctx) {
    const { points, frameColor, lineColor, outerStroke, patternStroke } = ctx;
    const c = centroid(points);
    const s = ASANOHA_D2_INSET;
    const inner = [0, 1, 2].map((i) => ({
      x: c.x + s * (c.x - points[i].x),
      y: c.y + s * (c.y - points[i].y),
    }));

    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <line
              {...lineBetween(inner[i], points[(i + 1) % 3])}
              stroke={lineColor}
              strokeWidth={patternStroke}
              strokeLinecap="round"
            />
            <line
              {...lineBetween(inner[i], points[(i + 2) % 3])}
              stroke={lineColor}
              strokeWidth={patternStroke}
              strokeLinecap="round"
            />
            <line {...lineBetween(c, inner[i])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
          </g>
        ))}
        {[0, 1, 2].map((i) => (
          <line
            key={`oc-${i}`}
            {...lineBetween(c, points[i])}
            stroke={lineColor}
            strokeWidth={patternStroke}
            strokeLinecap="round"
          />
        ))}
      </g>
    );
  }
}

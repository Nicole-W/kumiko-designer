import { BaseInsert } from "./BaseInsert.js";
import { centroid, lineBetween, quadPoint, triPointString } from "./geometry.js";

export class SenkaInsert extends BaseInsert {
  static id = "senka";
  static label = "Senka";

  static render(ctx) {
    const { points, frameColor, lineColor, outerStroke, patternStroke, patternStrokeThin } = ctx;
    const c = centroid(points);
    const e01 = quadPoint(points[0], points[1], 1 / 3);
    const e12 = quadPoint(points[1], points[2], 1 / 3);
    const e20 = quadPoint(points[2], points[0], 1 / 3);
    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        <line {...lineBetween(c, points[0])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, points[1])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, points[2])} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <polygon
          points={triPointString([e01, e12, e20])}
          fill="none"
          stroke={lineColor}
          strokeWidth={patternStrokeThin}
          strokeLinejoin="round"
        />
      </g>
    );
  }
}

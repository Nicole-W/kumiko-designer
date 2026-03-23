import { BaseInsert } from "./BaseInsert.js";
import { centroid, inwardPoint, quadOpenPath, triPointString } from "./geometry.js";

const LOTUS_SHIPPO_PULL = 0.56;

export class LotusShippoInsert extends BaseInsert {
  static id = "shippoDeep";
  static label = "Lotus shippo";
  static clipPreview = true;

  static render(ctx) {
    const { points, frameColor, lineColor, outerStroke, patternStroke } = ctx;
    const c = centroid(points);
    const [p0, p1, p2] = points;
    const c0 = inwardPoint(p0, c, LOTUS_SHIPPO_PULL);
    const c1 = inwardPoint(p1, c, LOTUS_SHIPPO_PULL);
    const c2 = inwardPoint(p2, c, LOTUS_SHIPPO_PULL);
    const shippoA = quadOpenPath(p1, c0, p2);
    const shippoB = quadOpenPath(p2, c1, p0);
    const shippoC = quadOpenPath(p0, c2, p1);
    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        <path d={shippoA} fill="none" stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" strokeLinejoin="round" />
        <path d={shippoB} fill="none" stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" strokeLinejoin="round" />
        <path d={shippoC} fill="none" stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  }
}

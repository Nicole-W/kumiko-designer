import { BaseInsert } from "./BaseInsert.js";
import { centroid, circularChordArcPath, triPointString } from "./geometry.js";

const SHIPPO_SAGITTA_RATIO = 0.16;

export class ShippoInsert extends BaseInsert {
  static id = "shippo";
  static label = "Shippo";
  static clipPreview = true;

  static render(ctx) {
    const { points, frameColor, lineColor, outerStroke, patternStroke } = ctx;
    const c = centroid(points);
    const [p0, p1, p2] = points;
    const shippoA = circularChordArcPath(p1, p2, p0, c, SHIPPO_SAGITTA_RATIO);
    const shippoB = circularChordArcPath(p2, p0, p1, c, SHIPPO_SAGITTA_RATIO);
    const shippoC = circularChordArcPath(p0, p1, p2, c, SHIPPO_SAGITTA_RATIO);
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

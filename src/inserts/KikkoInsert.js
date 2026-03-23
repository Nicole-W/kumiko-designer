import { BaseInsert } from "./BaseInsert.js";
import { edgeMidpoints, inwardPoint, lineBetween, triPointString, centroid } from "./geometry.js";

const INSET = 0.45;

export class KikkoInsert extends BaseInsert {
  static id = "kikko";
  static label = "Kikko";

  static render(ctx) {
    const { points, frameColor, lineColor, outerStroke, patternStroke, patternStrokeThin } = ctx;
    const c = centroid(points);
    const mids = edgeMidpoints(points);
    const insetFromMids = [
      inwardPoint(mids.ab, c, INSET),
      inwardPoint(mids.bc, c, INSET),
      inwardPoint(mids.ca, c, INSET),
    ];
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
}

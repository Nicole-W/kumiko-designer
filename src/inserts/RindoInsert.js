import { BaseInsert } from "./BaseInsert.js";
import { centroid, inwardPoint, lineBetween, quadOpenPath, quadPoint, triPointString } from "./geometry.js";


function average(a, b) {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
  };
}

function add(a, b) {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  };
}

function sub(a, b) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

function scale(a, b) {
  return {
    x: a.x * b,
    y: a.y * b,
  };
}

/**
 * Rindo-inspired floral motif:
 * three bell-petal arcs, one per triangle edge, with a compact center.
 */
export class RindoInsert extends BaseInsert {
  static id = "rindo";
  static label = "Rindo";
  static maxDensity = 1;
  static rotationDependent = true;

  static render(ctx) {
    // if (ctx.density >= 2) return this.renderDensity2(ctx);
    return this.renderDensity1(ctx);
  }

  static renderDensity1(ctx) {
    const { points, frameColor, lineColor, outerStroke, patternStroke } = ctx;
    const c = centroid(points);

    let a0 = average(points[0], points[1]);
    let a1 = add(a0, scale(sub(points[0], a0), 0.5));
    let a2 = sub(a0, scale(sub(points[0], a0), 0.5));

    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        <line {...lineBetween(points[2], a0)} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(points[2], a1)} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(points[2], a2)} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
      </g>
    );
  }
}

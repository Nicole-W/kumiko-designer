import { BaseInsert } from "./BaseInsert.js";
import { centroid, lineBetween, triPointString } from "./geometry.js";

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

/** Three spokes from centroid toward edge quarter points (angular, not mist-like). */
export class SanbonInsert extends BaseInsert {
  static id = "sanbon";
  static label = "Sanbon";
  static maxDensity = 2;

  static render(ctx) {
    if (ctx.density >= 2) {
      return this.renderDensity2(ctx);
    }
    return this.renderDensity1(ctx);
  }

  static renderDensity1(ctx) {
    const { points, frameColor, lineColor, outerStroke, patternStroke } = ctx;
    const c = centroid(points);

    let a0 = average(points[0], points[1]);
    let a1 = average(points[1], points[2]);
    let a2 = average(points[2], points[0]);

    a0 = add(a0, scale(sub(points[0], a0), 0.5));
    a1 = add(a1, scale(sub(points[1], a1), 0.5));
    a2 = add(a2, scale(sub(points[2], a2), 0.5));

    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        <line {...lineBetween(c, a0)} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, a1)} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, a2)} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
      </g>
    );
  }

  static renderDensity2(ctx) {
    const { points, frameColor, lineColor, outerStroke, patternStroke } = ctx;
    const c = centroid(points);

    const ratio_thing = 0.33

    let a0 = average(points[0], points[1]);
    let a1 = average(points[1], points[2]);
    let a2 = average(points[2], points[0]);

    let l0 = add(a0, scale(sub(points[0], a0), ratio_thing));
    let l1 = add(a1, scale(sub(points[1], a1), ratio_thing));
    let l2 = add(a2, scale(sub(points[2], a2), ratio_thing));

    let l3 = sub(a0, scale(sub(points[0], a0), ratio_thing));
    let l4 = sub(a1, scale(sub(points[1], a1), ratio_thing));
    let l5 = sub(a2, scale(sub(points[2], a2), ratio_thing));

    return (
      <g>
        <polygon points={triPointString(points)} fill="none" stroke={frameColor} strokeWidth={outerStroke} strokeLinejoin="round" />
        <line {...lineBetween(c, l0)} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, l1)} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, l2)} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, l3)} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, l4)} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
        <line {...lineBetween(c, l5)} stroke={lineColor} strokeWidth={patternStroke} strokeLinecap="round" />
      </g>
    );
  }
}

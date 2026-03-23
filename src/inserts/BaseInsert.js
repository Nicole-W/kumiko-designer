/**
 * Base contract for a kumiko insert. Subclass with static `id`, `label`, optional `clipPreview`,
 * optional `clipTriangle`, optional `minDensity` / `maxDensity`, and `render(ctx)` returning a React element (usually `<g>...</g>`).
 *
 * `ctx` includes: points, color, preview, previewClipId, frameColor, lineColor,
 * outerStroke, patternStroke, patternStrokeThin, and **density** (integer, clamped to this class’s range).
 */
export class BaseInsert {
  static id = "";
  static label = "";
  /** When true, preview thumbnails are clipped to the triangle polygon. */
  static clipPreview = false;
  /** When true, grid and preview artwork are clipped to the triangle (for motifs that use curves). */
  static clipTriangle = false;
  /** Inclusive integer level; 1 is the default motif. */
  static minDensity = 1;
  static maxDensity = 1;

  static render() {
    return null;
  }
}

import type { CapsuleNodeShape } from "../domain/capsule-document";

// Keep the whole centered label inside a circle or diamond, not merely inside
// its bounding box. The same dimensions drive drawing, hit testing and badges.
export function capsuleNodeShapeLayout(shape: CapsuleNodeShape | undefined, labelWidth: number, lineCount: number) {
  const textWidth = Math.min(108, Math.max(0, labelWidth)), textHeight = Math.max(1, lineCount) * 20;
  let width = 116, height = Math.max(64, textHeight + 20);
  if (shape === "circle") width = height = Math.max(108, Math.ceil(Math.hypot(textWidth, textHeight) + 24));
  if (shape === "diamond") { width = Math.max(128, (textWidth + 12) * 2); height = Math.max(88, (textHeight + 12) * 2); }
  return { hasPresentationShape: shape ? 1 : 0, presentationShape: shape === "circle" ? "ellipse" : shape ?? "round-rectangle", shapeWidth: width, shapeHeight: height };
}

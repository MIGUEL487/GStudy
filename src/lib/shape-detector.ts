import type { DrawMark, DrawTool, Point } from "./whiteboard-model";

/**
 * Shape Detection configuration & thresholds
 */
export const SHAPE_HOLD_DELAY_MS = 500;
export const SHAPE_STATIONARY_RADIUS = 12;

export type DetectedShape = {
  tool: DrawTool;
  points: Point[];
  shapeName: "line" | "arrow" | "circle" | "ellipse" | "square" | "rectangle" | "triangle";
};

/**
 * Euclidean distance between two 2D points
 */
export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Total length of a path
 */
export function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += dist(points[i - 1]!, points[i]!);
  }
  return len;
}

/**
 * Perpendicular distance from point P to line segment AB
 */
function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  const projection = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  return dist(p, projection);
}

/**
 * Ramer-Douglas-Peucker polygon simplification
 */
export function rdpSimplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const first = points[0]!;
  const last = points.at(-1)!;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i]!, first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const rec1 = rdpSimplify(points.slice(0, index + 1), epsilon);
    const rec2 = rdpSimplify(points.slice(index), epsilon);
    return [...rec1.slice(0, -1), ...rec2];
  }

  return [first, last];
}

/**
 * Compute bounding box
 */
export function getBounds(points: Point[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

/**
 * Detect geometric shapes from a freehand stroke:
 * - Straight line
 * - Arrow with tip
 * - Circle
 * - Ellipse
 * - Square
 * - Rectangle
 * - Triangle
 */
export function detectPerfectShape(points: Point[]): DetectedShape | null {
  if (!points || points.length < 5) return null;

  const totalLen = pathLength(points);
  if (totalLen < 20) return null;

  const first = points[0]!;
  const last = points.at(-1)!;
  const directDist = dist(first, last);
  const bounds = getBounds(points);
  const maxDim = Math.max(bounds.width, bounds.height);

  // Check if stroke is closed: endpoints are close relative to bounding box
  const isClosed = directDist / maxDim < 0.32 || directDist < 28;

  // 1. OPEN STROKE: Line or Arrow
  if (!isClosed) {
    // Check Straight Line
    const straightness = directDist / totalLen;
    if (straightness > 0.88 && directDist > 25) {
      return {
        tool: "line",
        points: [first, last],
        shapeName: "line",
      };
    }

    // Check Arrow: shaft + arrowhead
    // Typically: points go from start to tip, then fold back to form arrowhead
    const arrow = detectArrowShape(points, totalLen);
    if (arrow) return arrow;

    return null;
  }

  // 2. CLOSED STROKE: Triangle, Rectangle, Square, Circle, Ellipse
  // Try polygon simplification with epsilon proportional to dimension
  const epsilon = Math.max(8, maxDim * 0.08);
  const simplified = rdpSimplify(points, epsilon);
  // Remove last point if duplicate of first
  const vertices =
    dist(simplified[0]!, simplified.at(-1)!) < epsilon ? simplified.slice(0, -1) : simplified;

  // TRIANGLE: Exactly 3 vertices
  if (vertices.length === 3) {
    return {
      tool: "triangle",
      points: [vertices[0]!, vertices[1]!, vertices[2]!],
      shapeName: "triangle",
    };
  }

  // RECTANGLE OR SQUARE: 4 vertices
  if (vertices.length === 4) {
    const isSquare = Math.abs(bounds.width - bounds.height) / maxDim < 0.2;
    if (isSquare) {
      const side = (bounds.width + bounds.height) / 2;
      return {
        tool: "rectangle",
        points: [
          { x: bounds.center.x - side / 2, y: bounds.center.y - side / 2 },
          { x: bounds.center.x + side / 2, y: bounds.center.y + side / 2 },
        ],
        shapeName: "square",
      };
    }

    return {
      tool: "rectangle",
      points: [
        { x: bounds.minX, y: bounds.minY },
        { x: bounds.maxX, y: bounds.maxY },
      ],
      shapeName: "rectangle",
    };
  }

  // CIRCLE OR ELLIPSE: Rounded shape with low radius variance
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  if (rx > 6 && ry > 6) {
    let varianceSum = 0;
    for (const p of points) {
      const dx = (p.x - bounds.center.x) / rx;
      const dy = (p.y - bounds.center.y) / ry;
      // In normalized ellipse, dx^2 + dy^2 should be ~ 1
      const normalizedR = Math.hypot(dx, dy);
      varianceSum += Math.abs(normalizedR - 1);
    }
    const meanVariance = varianceSum / points.length;

    if (meanVariance < 0.28) {
      const isCircle = Math.abs(bounds.width - bounds.height) / maxDim < 0.22;
      if (isCircle) {
        const radius = (bounds.width + bounds.height) / 4;
        return {
          tool: "ellipse",
          points: [
            { x: bounds.center.x - radius, y: bounds.center.y - radius },
            { x: bounds.center.x + radius, y: bounds.center.y + radius },
          ],
          shapeName: "circle",
        };
      }

      return {
        tool: "ellipse",
        points: [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY },
        ],
        shapeName: "ellipse",
      };
    }
  }

  return null;
}

/**
 * Arrow detector: checks if stroke consists of a main shaft and an arrowhead at the tip
 */
function detectArrowShape(points: Point[], totalLen: number): DetectedShape | null {
  // Arrow requires at least ~8 points
  if (points.length < 8) return null;

  // Check if initial ~70% of stroke is a straight shaft
  const shaftEndIdx = Math.floor(points.length * 0.72);
  const shaftPoints = points.slice(0, shaftEndIdx);
  const shaftFirst = shaftPoints[0]!;
  const shaftLast = shaftPoints.at(-1)!;
  const shaftDirect = dist(shaftFirst, shaftLast);
  const shaftLen = pathLength(shaftPoints);

  if (shaftDirect / shaftLen > 0.85 && shaftDirect > 25) {
    // Check if remaining points fold back with significant angle change
    const headPoints = points.slice(shaftEndIdx);
    const shaftVector = { x: shaftLast.x - shaftFirst.x, y: shaftLast.y - shaftFirst.y };
    const shaftAngle = Math.atan2(shaftVector.y, shaftVector.x);

    let hasHeadBarb = false;
    for (let i = 1; i < headPoints.length; i++) {
      const segVector = {
        x: headPoints[i]!.x - headPoints[i - 1]!.x,
        y: headPoints[i]!.y - headPoints[i - 1]!.y,
      };
      const segAngle = Math.atan2(segVector.y, segVector.x);
      let angleDiff = Math.abs(segAngle - shaftAngle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      // Head barbs usually go backwards at ~130 to 170 degrees relative to shaft forward direction
      if (angleDiff > 1.8 && angleDiff < 3.0) {
        hasHeadBarb = true;
        break;
      }
    }

    if (hasHeadBarb) {
      return {
        tool: "arrow",
        points: [shaftFirst, shaftLast],
        shapeName: "arrow",
      };
    }
  }

  return null;
}

/**
 * Converts a freehand mark into a perfect shape DrawMark if detected
 */
export function convertToPerfectShape(original: DrawMark): DrawMark | null {
  const detected = detectPerfectShape(original.points);
  if (!detected) return null;

  return {
    ...original,
    tool: detected.tool,
    points: detected.points,
  };
}

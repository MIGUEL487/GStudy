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
  if (totalLen < 40 || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return null;

  const first = points[0]!;
  const last = points.at(-1)!;
  const directDist = dist(first, last);
  const bounds = getBounds(points);
  const maxDim = Math.max(bounds.width, bounds.height);

  // Check if stroke is closed: endpoints are close relative to bounding box
  const isClosed = directDist <= Math.max(5, maxDim * 0.16);

  // 1. OPEN STROKE: Line or Arrow
  if (!isClosed) {
    // Check Straight Line
    const straightness = directDist / totalLen;
    const deviation = Math.max(...points.map((p) => perpendicularDistance(p, first, last)));
    if (straightness > 0.96 && directDist >= 40 && deviation < Math.max(2.5, directDist * 0.025)) {
      return {
        tool: "line",
        points: (() => {
          const angle = Math.atan2(last.y - first.y, last.x - first.x);
          const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          if (Math.abs(angle - snapped) > Math.PI / 60) return [first, last];
          const center = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
          const projection =
            (last.x - first.x) * Math.cos(snapped) + (last.y - first.y) * Math.sin(snapped);
          const dx = (Math.cos(snapped) * projection) / 2,
            dy = (Math.sin(snapped) * projection) / 2;
          return [
            { x: center.x - dx, y: center.y - dy },
            { x: center.x + dx, y: center.y + dy },
          ];
        })(),
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
  if (Math.min(bounds.width, bounds.height) < 24) return null;
  const epsilon = Math.max(3, maxDim * 0.045);
  const simplified = rdpSimplify(points, epsilon);
  // Remove last point if duplicate of first
  const vertices =
    dist(simplified[0]!, simplified.at(-1)!) < epsilon ? simplified.slice(0, -1) : simplified;

  // TRIANGLE: Exactly 3 vertices
  const perimeter = vertices.reduce(
    (sum, vertex, i) => sum + dist(vertex, vertices[(i + 1) % vertices.length]!),
    0,
  );
  const followsPolygon =
    totalLen / perimeter < 1.12 &&
    totalLen / perimeter > 0.86 &&
    points.every(
      (p) =>
        Math.min(
          ...vertices.map((v, i) =>
            perpendicularDistance(p, v, vertices[(i + 1) % vertices.length]!),
          ),
        ) < Math.max(3, maxDim * 0.035),
    );
  const area =
    Math.abs(
      vertices.reduce((sum, v, i) => {
        const next = vertices[(i + 1) % vertices.length]!;
        return sum + v.x * next.y - next.x * v.y;
      }, 0),
    ) / 2;
  if (vertices.length === 3 && followsPolygon && area > bounds.width * bounds.height * 0.3) {
    return {
      tool: "triangle",
      points: [vertices[0]!, vertices[1]!, vertices[2]!],
      shapeName: "triangle",
    };
  }

  // RECTANGLE OR SQUARE: 4 vertices
  const axisAligned = vertices.every((v, i) => {
    const next = vertices[(i + 1) % vertices.length]!;
    return Math.min(Math.abs(v.x - next.x), Math.abs(v.y - next.y)) < maxDim * 0.06;
  });
  const rightAngles = vertices.every((v, i) => {
    const previous = vertices[(i + vertices.length - 1) % vertices.length]!;
    const next = vertices[(i + 1) % vertices.length]!;
    return (
      Math.abs((previous.x - v.x) * (next.x - v.x) + (previous.y - v.y) * (next.y - v.y)) /
        (dist(v, previous) * dist(v, next)) <
      0.13
    );
  });
  if (vertices.length === 4 && followsPolygon && rightAngles && !axisAligned) {
    const center = vertices.reduce((c, v) => ({ x: c.x + v.x / 4, y: c.y + v.y / 4 }), {
      x: 0,
      y: 0,
    });
    const angle = Math.atan2(vertices[1]!.y - vertices[0]!.y, vertices[1]!.x - vertices[0]!.x);
    const width = (dist(vertices[0]!, vertices[1]!) + dist(vertices[2]!, vertices[3]!)) / 2;
    const height = (dist(vertices[1]!, vertices[2]!) + dist(vertices[3]!, vertices[0]!)) / 2;
    return {
      tool: "rectangle",
      shapeName: Math.abs(width - height) / Math.max(width, height) < 0.15 ? "square" : "rectangle",
      points: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, y]) => ({
        x: center.x + ((x! * width) / 2) * Math.cos(angle) - ((y! * height) / 2) * Math.sin(angle),
        y: center.y + ((x! * width) / 2) * Math.sin(angle) + ((y! * height) / 2) * Math.cos(angle),
      })),
    };
  }
  if (
    vertices.length === 4 &&
    followsPolygon &&
    rightAngles &&
    axisAligned &&
    area > bounds.width * bounds.height * 0.85
  ) {
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

    const expectedLength = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const quadrants = new Set(
      points.map((p) => `${p.x >= bounds.center.x}:${p.y >= bounds.center.y}`),
    );
    if (
      meanVariance < 0.075 &&
      quadrants.size === 4 &&
      totalLen / expectedLength > 0.86 &&
      totalLen / expectedLength < 1.15
    ) {
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

import { describe, expect, it } from "vitest";
import {
  detectPerfectShape,
  convertToPerfectShape,
  rdpSimplify,
  pathLength,
  dist,
  type DetectedShape,
} from "@/lib/shape-detector";
import type { DrawMark, Point } from "@/lib/whiteboard-model";

describe("Shape Detector - Detecção de Formas Perfeitas", () => {
  it("detecta linha reta quando traço tem alta retidão", () => {
    // Generate horizontal straight line with small natural jitter
    const points: Point[] = [];
    for (let x = 100; x <= 300; x += 10) {
      points.push({ x, y: 150 + Math.sin(x) * 1.5 });
    }

    const detected = detectPerfectShape(points);
    expect(detected).not.toBeNull();
    expect(detected?.tool).toBe("line");
    expect(detected?.shapeName).toBe("line");
    expect(detected?.points[0]?.x).toBe(100);
    expect(detected?.points[1]?.x).toBe(300);
  });

  it("detecta seta com haste e ponta", () => {
    // Shaft from (50, 50) to (200, 50), then barb folding back to (180, 40)
    const points: Point[] = [];
    // Shaft
    for (let x = 50; x <= 200; x += 15) {
      points.push({ x, y: 50 });
    }
    // Barb
    points.push({ x: 190, y: 45 });
    points.push({ x: 180, y: 40 });

    const detected = detectPerfectShape(points);
    expect(detected).not.toBeNull();
    expect(detected?.tool).toBe("arrow");
    expect(detected?.shapeName).toBe("arrow");
  });

  it("detecta círculo quando traço fechado é equidistante do centro", () => {
    // Approximate circle at (200, 200) with r = 50
    const points: Point[] = [];
    for (let angle = 0; angle <= Math.PI * 2; angle += 0.2) {
      const r = 50 + Math.sin(angle * 3) * 2; // small variation
      points.push({
        x: 200 + r * Math.cos(angle),
        y: 200 + r * Math.sin(angle),
      });
    }

    const detected = detectPerfectShape(points);
    expect(detected).not.toBeNull();
    expect(detected?.tool).toBe("ellipse");
    expect(detected?.shapeName).toBe("circle");
  });

  it("detecta elipse quando traço fechado tem raios distintos", () => {
    // Ellipse with a = 80, b = 40
    const points: Point[] = [];
    for (let angle = 0; angle <= Math.PI * 2; angle += 0.2) {
      points.push({
        x: 200 + 80 * Math.cos(angle),
        y: 200 + 40 * Math.sin(angle),
      });
    }

    const detected = detectPerfectShape(points);
    expect(detected).not.toBeNull();
    expect(detected?.tool).toBe("ellipse");
    expect(detected?.shapeName).toBe("ellipse");
  });

  it("detecta retângulo com 4 vértices", () => {
    // 4 edges of a rectangle (100, 100) to (250, 180)
    const points: Point[] = [];
    // Top: (100, 100) -> (250, 100)
    for (let x = 100; x <= 250; x += 25) points.push({ x, y: 100 });
    // Right: (250, 100) -> (250, 180)
    for (let y = 100; y <= 180; y += 20) points.push({ x: 250, y });
    // Bottom: (250, 180) -> (100, 180)
    for (let x = 250; x >= 100; x -= 25) points.push({ x, y: 180 });
    // Left: (100, 180) -> (100, 100)
    for (let y = 180; y >= 100; y -= 20) points.push({ x: 100, y });

    const detected = detectPerfectShape(points);
    expect(detected).not.toBeNull();
    expect(detected?.tool).toBe("rectangle");
    expect(detected?.shapeName).toBe("rectangle");
  });

  it("detecta quadrado quando lados são aproximadamente iguais", () => {
    // Square 100x100
    const points: Point[] = [];
    for (let x = 100; x <= 200; x += 20) points.push({ x, y: 100 });
    for (let y = 100; y <= 200; y += 20) points.push({ x: 200, y });
    for (let x = 200; x >= 100; x -= 20) points.push({ x, y: 200 });
    for (let y = 200; y >= 100; y -= 20) points.push({ x: 100, y });

    const detected = detectPerfectShape(points);
    expect(detected).not.toBeNull();
    expect(detected?.tool).toBe("rectangle");
    expect(detected?.shapeName).toBe("square");
  });

  it("detecta triângulo quando polígono simplificado tem 3 vértices", () => {
    // Triangle: (150, 100) -> (200, 200) -> (100, 200) -> (150, 100)
    const points: Point[] = [];
    // Side 1: (150, 100) to (200, 200)
    for (let t = 0; t <= 1; t += 0.2) {
      points.push({ x: 150 + t * 50, y: 100 + t * 100 });
    }
    // Side 2: (200, 200) to (100, 200)
    for (let t = 0; t <= 1; t += 0.2) {
      points.push({ x: 200 - t * 100, y: 200 });
    }
    // Side 3: (100, 200) to (150, 100)
    for (let t = 0; t <= 1; t += 0.2) {
      points.push({ x: 100 + t * 50, y: 200 - t * 100 });
    }

    const detected = detectPerfectShape(points);
    expect(detected).not.toBeNull();
    expect(detected?.tool).toBe("triangle");
    expect(detected?.shapeName).toBe("triangle");
    expect(detected?.points).toHaveLength(3);
  });

  it("não detecta forma para rabisco aleatório ou aberto e irregular", () => {
    const squiggly: Point[] = [
      { x: 10, y: 10 },
      { x: 50, y: 90 },
      { x: 30, y: 40 },
      { x: 120, y: 15 },
      { x: 70, y: 80 },
      { x: 20, y: 120 },
      { x: 90, y: 200 },
    ];

    const detected = detectPerfectShape(squiggly);
    expect(detected).toBeNull();
  });

  it("converte DrawMark preservando cor e espessura", () => {
    const rawMark: DrawMark = {
      tool: "pen",
      color: "#f5d76e",
      size: 28,
      strokeWidth: 4,
      points: [
        { x: 10, y: 50 },
        { x: 50, y: 50 },
        { x: 100, y: 50 },
        { x: 150, y: 50 },
        { x: 200, y: 50 },
      ],
      text: "",
    };

    const perfect = convertToPerfectShape(rawMark);
    expect(perfect).not.toBeNull();
    expect(perfect?.tool).toBe("line");
    expect(perfect?.color).toBe("#f5d76e");
    expect(perfect?.strokeWidth).toBe(4);
    expect(perfect?.points).toHaveLength(2);
  });
});

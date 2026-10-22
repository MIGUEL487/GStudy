import { describe, expect, it, vi } from "vitest";
import {
  doesEraserTouchMark,
  formatMathPreview,
  getMarkBounds,
  parseMathLine,
  renderMathNodes,
  replaceSymbolsAndGreek,
  type DrawMark,
} from "@/lib/whiteboard-model";

describe("Whiteboard Math Parser e Formatter", () => {
  it("converte operadores matemáticos simples", () => {
    const raw = "<= >= != -> +-";
    const res = replaceSymbolsAndGreek(raw);
    expect(res).toBe("≤ ≥ ≠ → ±");
  });

  it("converte nomes de letras gregas isoladas sem afetar palavras normais", () => {
    expect(replaceSymbolsAndGreek("pi + alpha = theta")).toBe("π + α = θ");
    expect(replaceSymbolsAndGreek("delta = b^2 - 4ac")).toContain("δ");
    expect(replaceSymbolsAndGreek("pior capital deltaforce")).toBe("pior capital deltaforce");
  });

  it("converte potências e índices (sobrescritos e subscritos)", () => {
    const nodesSup = parseMathLine("x^2 + x^(n+1) + x^-1");
    const supNodes = nodesSup.filter((n) => n.type === "sup");
    expect(supNodes.length).toBe(3);

    const nodesSub = parseMathLine("a_1 + a_(n+1)");
    const subNodes = nodesSub.filter((n) => n.type === "sub");
    expect(subNodes.length).toBe(2);

    const preview = formatMathPreview("x^2 + a_1");
    expect(preview).toContain("x²");
    expect(preview).toContain("a₁");
  });

  it("converte frações matemáticas (a/b e (x+1)/(x-1))", () => {
    const nodes1 = parseMathLine("a/b");
    expect(nodes1.some((n) => n.type === "frac")).toBe(true);

    const nodes2 = parseMathLine("(x+1)/(x-1)");
    const fracNode = nodes2.find((n) => n.type === "frac");
    expect(fracNode).toBeDefined();

    const nodes3 = parseMathLine("1/2");
    expect(nodes3.some((n) => n.type === "frac")).toBe(true);
  });

  it("NÃO converte datas, URLs e barras entre palavras comuns para fração", () => {
    // Datas
    const date1 = parseMathLine("10/05/2026");
    expect(date1.some((n) => n.type === "frac")).toBe(false);

    const date2 = parseMathLine("01/12/2025");
    expect(date2.some((n) => n.type === "frac")).toBe(false);

    // URLs
    const url = parseMathLine("https://gstudy.app/help");
    expect(url.some((n) => n.type === "frac")).toBe(false);

    // Palavras comuns
    const words1 = parseMathLine("sim/não");
    expect(words1.some((n) => n.type === "frac")).toBe(false);

    const words2 = parseMathLine("and/or");
    expect(words2.some((n) => n.type === "frac")).toBe(false);
  });

  it("converte raízes (sqrt e raiz)", () => {
    const sqrtNodes = parseMathLine("sqrt(x^2 + y^2)");
    expect(sqrtNodes.some((n) => n.type === "sqrt")).toBe(true);

    const raizNodes = parseMathLine("raiz(16)");
    expect(raizNodes.some((n) => n.type === "sqrt")).toBe(true);
  });

  it("renderiza nós no canvas 2D nativo sem erros", () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 10 })),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      textBaseline: "",
    } as unknown as CanvasRenderingContext2D;

    const nodes = parseMathLine("x^2 + (a+b)/(c-d) + sqrt(16) = 0");
    const endX = renderMathNodes(ctx, nodes, 10, 20, 28, "#ffffff");
    expect(endX).toBeGreaterThan(10);
    expect(ctx.fillText).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("detecta toque da borracha em marca de texto e calcula bounds", () => {
    const mark: DrawMark = {
      tool: "text",
      color: "#ffffff",
      size: 28,
      points: [{ x: 50, y: 50 }],
      text: "Fórmula de Euler",
      formatted: true,
    };

    const bounds = getMarkBounds(mark);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);

    // Toque bem próximo
    expect(doesEraserTouchMark({ x: 60, y: 60 }, mark, 20)).toBe(true);
    // Toque longe
    expect(doesEraserTouchMark({ x: 300, y: 300 }, mark, 20)).toBe(false);
  });
});

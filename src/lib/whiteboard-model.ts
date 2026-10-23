import type { ImageBox } from "./whiteboard-images";

export type Point = { x: number; y: number };

export type DrawTool =
  "pen" | "eraser" | "text" | "rectangle" | "ellipse" | "line" | "arrow" | "triangle";
export type Tool = DrawTool | "select";

export type DrawMark = {
  tool: DrawTool;
  color: string;
  size: number;
  strokeWidth?: number;
  points: Point[];
  text: string;
  blockId?: string;
  lineIndex?: number;
  formatted?: boolean;
};

export type ImageMark = ImageBox & {
  tool: "image";
  id: string;
  source: HTMLCanvasElement;
  name: string;
};

export type Mark = DrawMark | ImageMark;

export type Gesture =
  | { pointerId: number; kind: "draw"; mark: DrawMark }
  | {
      pointerId: number;
      kind: "move" | "resize";
      original: ImageMark;
      start: Point;
      preview: ImageMark;
    };

/* Math AST Nodes */
export type MathNode =
  | { type: "text"; value: string }
  | { type: "sup"; content: MathNode[] }
  | { type: "sub"; content: MathNode[] }
  | { type: "frac"; num: MathNode[]; den: MathNode[] }
  | { type: "sqrt"; content: MathNode[] };

export const GREEK_MAP: Record<string, string> = {
  alpha: "Î±",
  beta: "Î²",
  gamma: "Î³",
  delta: "Î´",
  epsilon: "Îµ",
  zeta: "Î¶",
  eta: "Î·",
  theta: "Î¸",
  iota: "Î¹",
  kappa: "Îº",
  lambda: "Î»",
  mu: "Î¼",
  nu: "Î½",
  xi: "Î¾",
  pi: "Ï€",
  rho: "Ï",
  sigma: "Ïƒ",
  tau: "Ï„",
  upsilon: "Ï…",
  phi: "Ï†",
  chi: "Ï‡",
  psi: "Ïˆ",
  omega: "Ï‰",
  Alpha: "Î‘",
  Beta: "Î’",
  Gamma: "Î“",
  Delta: "Î”",
  Theta: "Î˜",
  Lambda: "Î›",
  Xi: "Îž",
  Pi: "Î ",
  Sigma: "Î£",
  Phi: "Î¦",
  Psi: "Î¨",
  Omega: "Î©",
};

/**
 * Replace simple operators and isolated greek letter names
 */
export function replaceSymbolsAndGreek(text: string): string {
  // Replace operators first
  let res = text
    .replace(/<=/g, "â‰¤")
    .replace(/>=/g, "â‰¥")
    .replace(/!=/g, "â‰ ")
    .replace(/->/g, "â†’")
    .replace(/\+-/g, "Â±");

  // Replace isolated Greek letters: word boundaries
  // Don't replace if it's part of a URL or longer word
  res = res.replace(/\b([a-zA-Z]+)\b/g, (match) => {
    return GREEK_MAP[match] ?? match;
  });

  return res;
}

/**
 * Check if a fraction candidate at given positions is inside a date, URL, or between ordinary words.
 */
function isDateOrUrlOrWordSlash(fullText: string, slashIndex: number): boolean {
  // Check URL: http:// or https:// or www.
  const beforeSlash = fullText.slice(0, slashIndex);
  const afterSlash = fullText.slice(slashIndex + 1);

  if (/https?:\/\/\S*$/i.test(beforeSlash) || /^www\.\S+/i.test(beforeSlash)) {
    return true;
  }
  // Check if preceded by http/https
  const lineUrlMatch = /https?:\/\/[^\s]+/g;
  let urlMatch;
  while ((urlMatch = lineUrlMatch.exec(fullText)) !== null) {
    if (slashIndex >= urlMatch.index && slashIndex <= urlMatch.index + urlMatch[0].length) {
      return true;
    }
  }

  // Check date: e.g. 10/05/2026, 01/12/2025, 1/2/2024
  // Requires day/month/year format
  const dateRegex = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;
  let dateMatch;
  while ((dateMatch = dateRegex.exec(fullText)) !== null) {
    if (slashIndex >= dateMatch.index && slashIndex <= dateMatch.index + dateMatch[0].length) {
      return true;
    }
  }

  // Check ordinary word slash: e.g. "sim/nÃ£o", "and/or", "ele/ela", "dia/noite", "true/false"
  // Check ordinary word slash: e.g. "sim/não", "and/or", "ele/ela", "dia/noite", "true/false"
  // Where both sides are alphabetic words of length >= 2 without mathematical context
  const wordBefore = beforeSlash.match(/([\p{L}]{2,})$/u);
  const wordAfter = afterSlash.match(/^([\p{L}]{2,})/u);
  if (wordBefore && wordAfter) {
    // Both sides are multi-letter words
    return true;
  }

  return false;
}

/**
 * Parse a raw text line into MathNode AST
 */
export function parseMathLine(raw: string, formulasEnabled = true): MathNode[] {
  if (!formulasEnabled || !raw) {
    return [{ type: "text", value: raw }];
  }

  // Step 1: Replace symbols and greek letters
  const preprocessed = replaceSymbolsAndGreek(raw);

  return parseMathExpression(preprocessed);
}

function parseMathExpression(input: string): MathNode[] {
  const nodes: MathNode[] = [];
  let i = 0;

  while (i < input.length) {
    // 1. Check sqrt or raiz: sqrt(...) or raiz(...)
    const sqrtMatch = input.slice(i).match(/^(sqrt|raiz)\(([^)]+)\)/i);
    if (sqrtMatch) {
      const innerContent = sqrtMatch[2]!;
      nodes.push({
        type: "sqrt",
        content: parseMathExpression(innerContent),
      });
      i += sqrtMatch[0].length;
      continue;
    }

    // 2. Check fraction: (a)/(b) or (a)/b or a/(b) or a/b
    // We inspect if there's a valid fraction starting around here
    const fracResult = tryParseFraction(input, i);
    if (fracResult) {
      nodes.push({
        type: "frac",
        num: parseMathExpression(fracResult.num),
        den: parseMathExpression(fracResult.den),
      });
      i = fracResult.endIndex;
      continue;
    }

    // 3. Check superscript: ^(expr) or ^expr or ^-?\w+
    if (input[i] === "^") {
      let content = "";
      let length = 1;
      if (input[i + 1] === "(") {
        const closeParen = input.indexOf(")", i + 2);
        if (closeParen !== -1) {
          content = input.slice(i + 2, closeParen);
          length = closeParen - i + 1;
        } else {
          content = input.slice(i + 2);
          length = input.length - i;
        }
      } else {
        const supMatch = input.slice(i + 1).match(/^(-?\w+)/);
        if (supMatch) {
          content = supMatch[1]!;
          length = 1 + content.length;
        }
      }

      if (content) {
        nodes.push({
          type: "sup",
          content: parseMathExpression(content),
        });
        i += length;
        continue;
      }
    }

    // 4. Check subscript: _(expr) or _expr
    if (input[i] === "_") {
      let content = "";
      let length = 1;
      if (input[i + 1] === "(") {
        const closeParen = input.indexOf(")", i + 2);
        if (closeParen !== -1) {
          content = input.slice(i + 2, closeParen);
          length = closeParen - i + 1;
        } else {
          content = input.slice(i + 2);
          length = input.length - i;
        }
      } else {
        const subMatch = input.slice(i + 1).match(/^(-?\w+)/);
        if (subMatch) {
          content = subMatch[1]!;
          length = 1 + content.length;
        }
      }

      if (content) {
        nodes.push({
          type: "sub",
          content: parseMathExpression(content),
        });
        i += length;
        continue;
      }
    }

    // Regular character
    // Append to previous text node if possible
    const char = input[i]!;
    const lastNode = nodes.at(-1);
    if (lastNode && lastNode.type === "text") {
      lastNode.value += char;
    } else {
      nodes.push({ type: "text", value: char });
    }
    i++;
  }

  return nodes;
}

/**
 * Attempts to parse a fraction at current index i.
 * E.g. (x+1)/(x-1) or a/b or 1/2
 */
function tryParseFraction(
  input: string,
  startIndex: number,
): { num: string; den: string; endIndex: number } | null {
  // If at index startIndex we see either a parenthesized numerator or a single token numerator followed by '/'
  let num = "";
  let afterNumIndex = startIndex;

  if (input[startIndex] === "(") {
    const closeParen = input.indexOf(")", startIndex + 1);
    if (closeParen !== -1) {
      num = input.slice(startIndex + 1, closeParen);
      afterNumIndex = closeParen + 1;
    } else {
      return null;
    }
  } else {
    // Single identifier / number / token
    const tokenMatch = input.slice(startIndex).match(/^([\p{L}\p{N}+\-*.]+)/u);
    if (!tokenMatch) return null;
    num = tokenMatch[1]!;
    afterNumIndex = startIndex + num.length;
  }

  // Next non-whitespace should be '/'
  if (input[afterNumIndex] !== "/") return null;
  const slashIndex = afterNumIndex;

  // Check if this slash is part of date, URL, or word slash
  if (isDateOrUrlOrWordSlash(input, slashIndex)) {
    return null;
  }

  const denStart = slashIndex + 1;
  let den = "";
  let endIndex = denStart;

  if (input[denStart] === "(") {
    const closeParen = input.indexOf(")", denStart + 1);
    if (closeParen !== -1) {
      den = input.slice(denStart + 1, closeParen);
      endIndex = closeParen + 1;
    } else {
      return null;
    }
  } else {
    const tokenMatch = input.slice(denStart).match(/^([\p{L}\p{N}+\-*.]+)/u);
    if (!tokenMatch) return null;
    den = tokenMatch[1]!;
    endIndex = denStart + den.length;
  }

  if (!num.trim() || !den.trim()) return null;

  return { num, den, endIndex };
}

/**
 * Formats math to a readable unicode preview string for live display
 */
export function formatMathPreview(raw: string, formulasEnabled = true): string {
  if (!formulasEnabled || !raw) return raw;

  const nodes = parseMathLine(raw, true);

  const UNICODE_SUP: Record<string, string> = {
    "0": "â°",
    "1": "Â¹",
    "2": "Â²",
    "3": "Â³",
    "4": "â´",
    "5": "âµ",
    "6": "â¶",
    "7": "â·",
    "8": "â¸",
    "9": "â¹",
    "+": "âº",
    "-": "â»",
    "=": "â¼",
    "(": "â½",
    ")": "â¾",
    n: "â¿",
    i: "â±",
    x: "Ë£",
    y: "Ê¸",
  };

  const UNICODE_SUB: Record<string, string> = {
    "0": "â‚€",
    "1": "â‚",
    "2": "â‚‚",
    "3": "â‚ƒ",
    "4": "â‚„",
    "5": "â‚…",
    "6": "â‚†",
    "7": "â‚‡",
    "8": "â‚ˆ",
    "9": "â‚‰",
    "+": "â‚Š",
    "-": "â‚‹",
    "=": "â‚Œ",
    "(": "â‚",
    ")": "â‚Ž",
    a: "â‚",
    e: "â‚‘",
    o: "â‚’",
    x: "â‚“",
    i: "áµ¢",
    j: "â±¼",
    k: "â‚–",
    n: "â‚™",
    m: "â‚˜",
  };

  function stringifyNodes(list: MathNode[]): string {
    return list
      .map((node) => {
        if (node.type === "text") return node.value;
        if (node.type === "sup") {
          const inner = stringifyNodes(node.content);
          return inner
            .split("")
            .map((c) => UNICODE_SUP[c] ?? `^${c}`)
            .join("");
        }
        if (node.type === "sub") {
          const inner = stringifyNodes(node.content);
          return inner
            .split("")
            .map((c) => UNICODE_SUB[c] ?? `_${c}`)
            .join("");
        }
        if (node.type === "sqrt") {
          return `âˆš(${stringifyNodes(node.content)})`;
        }
        if (node.type === "frac") {
          return `${stringifyNodes(node.num)} / ${stringifyNodes(node.den)}`;
        }
        return "";
      })
      .join("");
  }

  return stringifyNodes(nodes);
}

/**
 * Measure the width and height of an array of MathNodes
 */
export function measureMathNodes(
  ctx: CanvasRenderingContext2D,
  nodes: MathNode[],
  fontSize: number,
): { width: number; height: number } {
  let width = 0;
  let height = fontSize;

  ctx.save();
  for (const node of nodes) {
    if (node.type === "text") {
      ctx.font = `${fontSize}px sans-serif`;
      width += ctx.measureText(node.value).width;
    } else if (node.type === "sup" || node.type === "sub") {
      const subSize = Math.max(10, Math.round(fontSize * 0.65));
      const m = measureMathNodes(ctx, node.content, subSize);
      width += m.width;
      height = Math.max(height, fontSize + subSize * 0.5);
    } else if (node.type === "frac") {
      const fracSize = Math.max(10, Math.round(fontSize * 0.72));
      const numM = measureMathNodes(ctx, node.num, fracSize);
      const denM = measureMathNodes(ctx, node.den, fracSize);
      const fracW = Math.max(numM.width, denM.width) + 8;
      width += fracW + 4;
      height = Math.max(height, fontSize * 1.3);
    } else if (node.type === "sqrt") {
      const innerM = measureMathNodes(ctx, node.content, fontSize);
      width += 14 + innerM.width + 4;
      height = Math.max(height, innerM.height + 4);
    }
  }
  ctx.restore();

  return { width, height };
}

/**
 * Render MathNodes onto canvas 2D context
 */
export function renderMathNodes(
  ctx: CanvasRenderingContext2D,
  nodes: MathNode[],
  startX: number,
  startY: number,
  fontSize: number,
  color: string,
): number {
  let currentX = startX;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.textBaseline = "top";

  for (const node of nodes) {
    if (node.type === "text") {
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillText(node.value, currentX, startY);
      currentX += ctx.measureText(node.value).width;
    } else if (node.type === "sup") {
      const subSize = Math.max(10, Math.round(fontSize * 0.65));
      const supY = startY - Math.round(fontSize * 0.3);
      currentX = renderMathNodes(ctx, node.content, currentX, supY, subSize, color);
    } else if (node.type === "sub") {
      const subSize = Math.max(10, Math.round(fontSize * 0.65));
      const subY = startY + Math.round(fontSize * 0.35);
      currentX = renderMathNodes(ctx, node.content, currentX, subY, subSize, color);
    } else if (node.type === "frac") {
      const fracSize = Math.max(10, Math.round(fontSize * 0.72));
      const numM = measureMathNodes(ctx, node.num, fracSize);
      const denM = measureMathNodes(ctx, node.den, fracSize);
      const fracW = Math.max(numM.width, denM.width) + 8;
      const barY = startY + Math.round(fontSize * 0.55);

      // Draw horizontal bar
      ctx.beginPath();
      ctx.lineWidth = Math.max(1.5, Math.round(fontSize * 0.07));
      ctx.moveTo(currentX + 2, barY);
      ctx.lineTo(currentX + fracW + 2, barY);
      ctx.stroke();

      // Render numerator centered above bar
      const numX = currentX + 2 + (fracW - numM.width) / 2;
      const numY = barY - numM.height - 2;
      renderMathNodes(ctx, node.num, numX, numY, fracSize, color);

      // Render denominator centered below bar
      const denX = currentX + 2 + (fracW - denM.width) / 2;
      const denY = barY + 3;
      renderMathNodes(ctx, node.den, denX, denY, fracSize, color);

      currentX += fracW + 6;
    } else if (node.type === "sqrt") {
      const innerM = measureMathNodes(ctx, node.content, fontSize);
      const rootW = 12;
      const topY = startY - 2;
      const bottomY = startY + innerM.height + 2;

      // Draw radical symbol
      ctx.beginPath();
      ctx.lineWidth = Math.max(1.5, Math.round(fontSize * 0.07));
      ctx.moveTo(currentX + 2, startY + fontSize * 0.5);
      ctx.lineTo(currentX + 5, bottomY - 3);
      ctx.lineTo(currentX + rootW, topY);
      ctx.lineTo(currentX + rootW + innerM.width + 4, topY);
      ctx.stroke();

      // Render inner nodes
      renderMathNodes(ctx, node.content, currentX + rootW + 2, startY, fontSize, color);

      currentX += rootW + innerM.width + 6;
    }
  }

  ctx.restore();
  return currentX;
}

/**
 * Calculates bounding box of a mark
 */
export function getMarkBounds(
  mark: Mark,
  ctx?: CanvasRenderingContext2D,
): { x: number; y: number; width: number; height: number } {
  if (mark.tool === "image") {
    return { x: mark.x, y: mark.y, width: mark.width, height: mark.height };
  }

  const p0 = mark.points[0] ?? { x: 0, y: 0 };

  if (mark.tool === "text") {
    let width = 60;
    let height = mark.size * 1.3;

    if (ctx) {
      const nodes = parseMathLine(mark.text, mark.formatted ?? true);
      const measured = measureMathNodes(ctx, nodes, mark.size);
      width = Math.max(width, measured.width);
      height = Math.max(height, measured.height);
    } else {
      // Approximate fallback
      width = Math.max(width, mark.text.length * mark.size * 0.6);
    }

    return {
      x: p0.x - 4,
      y: p0.y - 4,
      width: width + 8,
      height: height + 8,
    };
  }

  // DrawMark pen/shapes
  const xs = mark.points.map((p) => p.x);
  const ys = mark.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: Math.max(10, maxX - minX),
    height: Math.max(10, maxY - minY),
  };
}

/**
 * Check if a point hits a text mark
 */
export function isPointInTextMark(
  point: Point,
  mark: DrawMark,
  ctx?: CanvasRenderingContext2D,
): boolean {
  if (mark.tool !== "text") return false;
  const bounds = getMarkBounds(mark, ctx);
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/**
 * Check if an eraser point touches a mark
 */
export function doesEraserTouchMark(
  point: Point,
  mark: Mark,
  radius = 16,
  ctx?: CanvasRenderingContext2D,
): boolean {
  if (mark.tool === "image") return false;

  if (mark.tool === "text") {
    const b = getMarkBounds(mark, ctx);
    return (
      point.x >= b.x - radius &&
      point.x <= b.x + b.width + radius &&
      point.y >= b.y - radius &&
      point.y <= b.y + b.height + radius
    );
  }

  // Check distance to any point of the stroke
  return mark.points.some((p) => Math.hypot(p.x - point.x, p.y - point.y) <= radius);
}

/**
 * Draw a mark onto canvas context
 */
export function drawMark(g: CanvasRenderingContext2D, mark: Mark, background: string) {
  if (mark.tool === "image") {
    g.drawImage(mark.source, mark.x, mark.y, mark.width, mark.height);
    return;
  }
  const a = mark.points[0],
    b = mark.points.at(-1);
  if (!a || !b) return;

  g.strokeStyle = mark.tool === "eraser" ? background : mark.color;
  g.fillStyle = g.strokeStyle;
  g.lineWidth = mark.tool === "eraser" ? 26 : (mark.strokeWidth ?? 4);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();

  if (mark.tool === "text") {
    const formatted = mark.formatted ?? true;
    if (formatted) {
      const nodes = parseMathLine(mark.text, true);
      renderMathNodes(g, nodes, a.x, a.y, mark.size, mark.color);
    } else {
      g.font = `${mark.size}px sans-serif`;
      g.textBaseline = "top";
      mark.text.split("\n").forEach((line, index) => {
        g.fillText(line, a.x, a.y + index * mark.size * 1.25);
      });
    }
    return;
  }

  if (mark.tool === "rectangle") {
    g.rect(a.x, a.y, b.x - a.x, b.y - a.y);
  } else if (mark.tool === "ellipse") {
    g.ellipse(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      Math.abs(b.x - a.x) / 2,
      Math.abs(b.y - a.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
  } else if (mark.tool === "triangle") {
    if (mark.points.length >= 3) {
      g.moveTo(mark.points[0]!.x, mark.points[0]!.y);
      g.lineTo(mark.points[1]!.x, mark.points[1]!.y);
      g.lineTo(mark.points[2]!.x, mark.points[2]!.y);
      g.closePath();
    } else {
      g.moveTo((a.x + b.x) / 2, a.y);
      g.lineTo(b.x, b.y);
      g.lineTo(a.x, b.y);
      g.closePath();
    }
  } else if (mark.tool === "line" || mark.tool === "arrow") {
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    if (mark.tool === "arrow") {
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      for (const offset of [-Math.PI / 6, Math.PI / 6]) {
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - 18 * Math.cos(angle + offset), b.y - 18 * Math.sin(angle + offset));
      }
    }
  } else {
    g.moveTo(a.x, a.y);
    mark.points.slice(1).forEach((p) => g.lineTo(p.x, p.y));
    if (mark.points.length === 1) {
      g.arc(a.x, a.y, g.lineWidth / 2, 0, Math.PI * 2);
      g.fill();
      return;
    }
  }
  g.stroke();
}

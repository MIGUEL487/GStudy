export type AiEvent<T = unknown> =
  | { type: "text"; delta: string }
  | { type: "done"; value: T }
  | { type: "error"; message: string }
  | { type: "item"; index: number; value: unknown };

/** NDJSON keeps metadata separate from text and survives arbitrary network boundaries. */
export async function* readAiText<T = unknown>(
  response: Response,
  onDone?: (value: T) => void,
  onItem?: (value: unknown, index: number) => void,
): AsyncGenerator<string> {
  if (!response.ok || !response.body)
    throw new Error("Não foi possível iniciar a resposta. Tente novamente.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    completed = false;
  const parse = (line: string) => {
    const event = JSON.parse(line) as AiEvent<T>;
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "done") {
      completed = true;
      onDone?.(event.value);
    }
    if (event.type === "item") onItem?.(event.value, event.index);
    return event;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) {
          const event = parse(line);
          if (event.type === "text") yield event.delta;
        }
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const event = parse(buffer);
      if (event.type === "text") yield event.delta;
    }
    if (!completed) throw new Error("A conexão foi interrompida. O texto recebido foi preservado.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Only closed objects within a top-level array are eligible for validation. */
export function completedJsonItems(json: string, field: string): unknown[] {
  const match = new RegExp(`"${field}"\\s*:\\s*\\[`).exec(json);
  if (!match) return [];
  const items: unknown[] = [];
  let depth = 0,
    quoted = false,
    escaped = false,
    start = -1;
  for (let i = match.index + match[0].length; i < json.length; i++) {
    const char = json[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === "{" || char === "[") {
      if (depth === 0) start = i;
      depth++;
    }
    if (char === "}" || char === "]") {
      if (depth === 0) break;
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          items.push(JSON.parse(json.slice(start, i + 1)));
        } catch {
          break;
        }
      }
    }
  }
  return items;
}

/** Decode only complete characters from an unfinished JSON string field. */
export function partialJsonString(json: string, field: string): string {
  const match = new RegExp(`(?:^|[,{])\\s*"${field}"\\s*:\\s*"`).exec(json);
  if (!match) return "";
  let value = "";
  for (let i = match.index + match[0].length; i < json.length; i++) {
    const char = json[i]!;
    if (char === '"') break;
    if (char !== "\\") {
      value += char;
      continue;
    }
    const escaped = json[++i];
    if (!escaped) break;
    if (escaped === "u") {
      const hex = json.slice(i + 1, i + 5);
      if (!/^[0-9a-f]{4}$/i.test(hex)) break;
      value += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else
      value +=
        (
          { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" } as Record<
            string,
            string
          >
        )[escaped] ?? "";
  }
  return value;
}

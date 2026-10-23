import { describe, expect, it } from "vitest";
import { completedJsonItems, partialJsonString, readAiText } from "@/lib/ai-event-stream";
import { aiEventResponse } from "@/lib/ai-event-stream.server";
describe("Transporte incremental da IA", () => {
  it("publica só objetos fechados e ignora colchetes e escapes no texto", () => {
    const raw =
      '{"questions":[{"question":"Uma [palavra] e \\"aspas\\"?","options":["a","b"],"answer":0,"why":"Porque"},{"question":"Ainda incompleta';
    expect(completedJsonItems(raw, "questions")).toEqual([
      { question: 'Uma [palavra] e "aspas"?', options: ["a", "b"], answer: 0, why: "Porque" },
    ]);
  });
  it("preserva acentos e metadados com bytes partidos em qualquer posição", async () => {
    const bytes = new TextEncoder().encode(
      '{"type":"text","delta":"Explicação 🧠"}\n{"type":"done","value":{"quota":12}}\n',
    );
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
          controller.close();
        },
      }),
    );
    let result = "",
      metadata: unknown;
    for await (const text of readAiText(response, (value) => {
      metadata = value;
    }))
      result += text;
    expect(result).toBe("Explicação 🧠");
    expect(metadata).toEqual({ quota: 12 });
  });
  it("entrega o texto parcial antes de reportar erro e não trata EOF como sucesso", async () => {
    const partial: string[] = [];
    try {
      for await (const text of readAiText(
        new Response('{"type":"text","delta":"Parte recebida"}\n'),
      ))
        partial.push(text);
    } catch (error) {
      expect((error as Error).message).toContain("preservado");
    }
    expect(partial).toEqual(["Parte recebida"]);
  });
  it("cancela o trabalho do servidor ao fechar o leitor", async () => {
    let wasAborted = false;
    const response = aiEventResponse(async (emit, signal) => {
      emit({ type: "text", delta: "Primeiro trecho" });
      await new Promise<void>((resolve) =>
        signal.addEventListener(
          "abort",
          () => {
            wasAborted = true;
            resolve();
          },
          { once: true },
        ),
      );
    });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(wasAborted).toBe(true);
  });
  it("decodifica strings JSON incompletas sem expor escapes ou chaves", () => {
    const raw = '{"explanation":"Por qu\\u00ea?\\nUse \\"exemplos\\"';
    expect(partialJsonString(raw, "explanation")).toBe('Por quê?\nUse "exemplos"');
    expect(partialJsonString('{"explanation":"Por qu\\u00', "explanation")).toBe("Por qu");
    expect(partialJsonString(raw, "question")).toBe("");
  });
});

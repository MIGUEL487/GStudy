import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiStreamText } from "@/lib/ai.server";
const fetchMock = vi.fn();
const messages = [
  { role: "user" as const, content: "Pergunta privada que não pode aparecer nos logs" },
];
const sse = (events: unknown[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
const gemini = (text: string) =>
  sse([
    { candidates: [{ index: 0, content: { role: "model", parts: [{ text }] } }] },
    {
      candidates: [{ index: 0, content: { role: "model", parts: [] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
    },
  ]);
const groq = () =>
  sse([
    {
      id: "test",
      object: "chat.completion.chunk",
      created: 1,
      model: "llama-3.3-70b-versatile",
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "Resposta alternativa" },
          finish_reason: null,
        },
      ],
    },
    {
      id: "test",
      object: "chat.completion.chunk",
      created: 1,
      model: "llama-3.3-70b-versatile",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    },
  ]);
async function collect(source: AsyncIterable<string>) {
  let text = "";
  for await (const delta of source) text += delta;
  return text;
}
beforeEach(() => {
  vi.stubEnv("SOCRATES_AI_API_KEY", "");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("BOARD_AI_API_KEY", "gemini-private-key");
  vi.stubEnv("BOARD_AI_MODEL", "gemini-test");
  vi.stubEnv("BOARD_AI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta");
  vi.stubEnv("GROQ_API_KEY", "groq-private-key");
  vi.stubEnv("GROQ_MODEL", "llama-3.3-70b-versatile");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("Streaming com SDKs reais e transporte HTTP simulado", () => {
  it("mantém a ordem Sócrates Gemini → Gemini → Groq → OpenRouter gratuito", async () => {
    vi.stubEnv("SOCRATES_AI_API_KEY", "dedicated-private-key");
    vi.stubEnv("SOCRATES_AI_PROVIDER", "gemini");
    vi.stubEnv("SOCRATES_AI_MODEL", "gemini-dedicated");
    vi.stubEnv("SOCRATES_AI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta");
    vi.stubEnv("OPENROUTER_API_KEY", "router-private-key");
    vi.stubEnv("OPENROUTER_MODEL", "nvidia/nemotron-3.5-super-vl:free");
    for (let i = 0; i < 3; i++)
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "unavailable" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      );
    fetchMock.mockResolvedValueOnce(groq());
    await expect(collect(aiStreamText("Ensine", messages, false, true))).resolves.toBe(
      "Resposta alternativa",
    );
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toContain("gemini-dedicated:streamGenerateContent");
    expect(urls[1]).toContain("gemini-test:streamGenerateContent");
    expect(urls[2]).toContain("api.groq.com");
    expect(urls[3]).toContain("openrouter.ai");
    const body = JSON.parse(fetchMock.mock.calls[3]![1].body as string);
    expect(body.provider.max_price).toEqual({ prompt: 0, completion: 0 });
  });

  it("faz fallback quando o transporte falha com timeout antes do primeiro token", async () => {
    fetchMock
      .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
      .mockResolvedValueOnce(groq());
    await expect(collect(aiStreamText("Ensine", messages))).resolves.toBe("Resposta alternativa");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([400, 422, 429, 500, 503])(
    "faz fallback em HTTP %i antes do primeiro token",
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { message: "private-key" } }), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(groq());
      await expect(collect(aiStreamText("Ensine", messages))).resolves.toBe("Resposta alternativa");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-key");
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        messages[0]!.content,
      );
    },
  );
  it("troca de provedor se a resposta vier vazia", async () => {
    fetchMock.mockResolvedValueOnce(gemini("")).mockResolvedValueOnce(groq());
    await expect(collect(aiStreamText("Ensine", messages))).resolves.toBe("Resposta alternativa");
  });
  it("entrega o primeiro trecho antes de terminar e não reinicia em outro provedor após a falha", async () => {
    const encoder = new TextEncoder();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            stream = controller;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ candidates: [{ index: 0, content: { role: "model", parts: [{ text: "Explicação parcial" }] } }] })}\n\n`,
              ),
            );
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    const iterator = aiStreamText("Ensine", messages);
    expect((await iterator.next()).value).toBe("Explicação parcial");
    stream.error(new Error("socket closed private-key"));
    await expect(iterator.next()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("registra o uso informado pelo provedor", async () => {
    fetchMock.mockResolvedValue(gemini("Explicação completa"));
    const onUsage = vi.fn();
    await collect(aiStreamText("Ensine", messages, false, false, { onUsage }));
    expect(onUsage).toHaveBeenCalledWith(14);
  });
  it("não troca de provedor quando a pessoa cancela", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      collect(aiStreamText("Ensine", messages, false, false, { signal: controller.signal })),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiText, aiObject, aiResearch } from "@/lib/ai.server";
import { canFallback, providerFailure } from "@/lib/ai-errors";
import { AiSetupError, groqConfig } from "@/lib/ai-config";
const fetchMock = vi.fn();
const prompt = "Anotação privada do estudante que não deve aparecer nos logs.";
const messages = [{ role: "user" as const, content: prompt }];
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
const vision = [
  {
    role: "user" as const,
    content: [
      { type: "text" as const, text: "Leia esta foto." },
      { type: "file" as const, data: image, mediaType: "image/png" },
    ],
  },
];
const failed = (
  status: number,
  message = "private-diagnostic gemini-private-key groq-private-key",
) =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const google = (text = "Resposta Gemini") =>
  new Response(
    JSON.stringify({
      candidates: [
        { index: 0, content: { role: "model", parts: [{ text }] }, finishReason: "STOP" },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
const groq = (content = "Resposta Groq", finish_reason = "stop") =>
  new Response(
    JSON.stringify({
      id: "test",
      object: "chat.completion",
      created: 1,
      model: "llama-3.3-70b-versatile",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
beforeEach(() => {
  vi.stubEnv("GROK_API_KEY", "");
  vi.stubEnv("XAI_API_KEY", "");
  vi.stubEnv("BOARD_AI_API_KEY", "gemini-private-key");
  vi.stubEnv("BOARD_AI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta");
  vi.stubEnv("BOARD_AI_MODEL", "gemini-test");
  vi.stubEnv("GROQ_API_KEY", "groq-private-key");
  vi.stubEnv("GROQ_MODEL", "llama-3.3-70b-versatile");
  vi.stubEnv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});
describe("Troca automática Gemini → Groq com SDKs e HTTP simulado", () => {
  it("mantém o Gemini como primeira opção e não chama o Groq quando funciona", async () => {
    fetchMock.mockResolvedValueOnce(google());
    await expect(aiText("Explique.", messages)).resolves.toBe("Resposta Gemini");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("generativelanguage.googleapis.com");
  });
  it("pesquisa com a ferramenta Google e devolve apenas fontes do grounding", async () => {
    const response = await google("Programa de geometria da OBMEP").json();
    response.candidates[0].groundingMetadata = {
      groundingChunks: [{ web: { uri: "https://www.obmep.org.br/", title: "OBMEP" } }],
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json" } }),
    );
    const result = await aiResearch("Consulte o organizador.", messages);
    expect(result.text).toBe("Programa de geometria da OBMEP");
    expect(result.sources).toEqual([{ title: "OBMEP", url: "https://www.obmep.org.br/" }]);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).tools).toEqual([{ googleSearch: {} }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("mantém Gemini sem pesquisa quando o modelo não oferece grounding", async () => {
    fetchMock
      .mockResolvedValueOnce(failed(400, "Google Search grounding is not supported for this model"))
      .mockResolvedValueOnce(google("Orientação geral, sem edital confirmado."));
    await expect(aiResearch("Consulte.", messages)).resolves.toEqual({
      text: "Orientação geral, sem edital confirmado.",
      sources: [],
    });
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).tools).toBeUndefined();
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).includes("generativelanguage.googleapis.com"),
      ),
    ).toBe(true);
  });
  it("não atribui pesquisa web ao Groq quando Gemini falha por cota", async () => {
    fetchMock
      .mockResolvedValueOnce(failed(429))
      .mockResolvedValueOnce(groq("Orientação geral, confirme o edital."));
    await expect(aiResearch("Consulte.", messages)).resolves.toEqual({
      text: "Orientação geral, confirme o edital.",
      sources: [],
    });
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(body.tools).toBeUndefined();
    expect(body.messages[0].content).toContain("não tem busca web");
  });
  it("mantém uma geração saudável do Gemini além de 25 segundos sem interromper nem chamar Groq", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(google("Gemini terminou a geração longa")), 30000);
          init.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(init.signal.reason);
            },
            { once: true },
          );
        }),
    );
    const response = aiText("Explique.", messages);
    await vi.advanceTimersByTimeAsync(26000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(response).resolves.toBe("Gemini terminou a geração longa");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("volta a tentar Gemini na próxima solicitação após usar Groq por cota", async () => {
    fetchMock
      .mockResolvedValueOnce(failed(429))
      .mockResolvedValueOnce(groq())
      .mockResolvedValueOnce(google());
    await expect(aiText("Primeira pergunta.", messages)).resolves.toBe("Resposta Groq");
    await expect(aiText("Próxima pergunta.", messages)).resolves.toBe("Resposta Gemini");
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).hostname)).toEqual([
      "generativelanguage.googleapis.com",
      "api.groq.com",
      "generativelanguage.googleapis.com",
    ]);
  });
  it.each([401, 402, 403, 404, 408, 429, 500, 503])(
    "usa Groq uma única vez após HTTP %i, com a chave e modelo corretos",
    async (status) => {
      fetchMock.mockResolvedValueOnce(failed(status)).mockResolvedValueOnce(groq());
      await expect(aiText("Explique.", messages)).resolves.toBe("Resposta Groq");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [url, init] = fetchMock.mock.calls[1]!;
      expect(String(url)).toBe("https://api.groq.com/openai/v1/chat/completions");
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer groq-private-key");
      expect(new Headers(init.headers).has("x-goog-api-key")).toBe(false);
      const body = JSON.parse(init.body);
      expect(body.model).toBe("llama-3.3-70b-versatile");
      expect(body.messages).toContainEqual({ role: "user", content: prompt });
      const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
      for (const secret of [prompt, "private-diagnostic", "gemini-private-key", "groq-private-key"])
        expect(logs).not.toContain(secret);
    },
  );
  it("também troca em falha de rede e resposta vazia", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(groq());
    await expect(aiText("Explique.", messages)).resolves.toBe("Resposta Groq");
    fetchMock.mockResolvedValueOnce(google("")).mockResolvedValueOnce(groq());
    await expect(aiText("Explique.", messages)).resolves.toBe("Resposta Groq");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it("manda imagens para o modelo de visão, inclusive fotos que não vêm da lousa", async () => {
    fetchMock.mockResolvedValueOnce(failed(429)).mockResolvedValueOnce(groq("A nota é 8,5."));
    await expect(aiText("Leia a foto.", vision)).resolves.toBe("A nota é 8,5.");
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(body.model).toBe("meta-llama/llama-4-scout-17b-16e-instruct");
    expect(body.messages.at(-1).content).toContainEqual({
      type: "image_url",
      image_url: { url: image },
    });
  });
  it("preserva JSON nas atividades e na leitura do boletim sem exigir JSON Schema estrito do modelo de visão", async () => {
    const output = { score: 8.5, period: 1 };
    fetchMock
      .mockResolvedValueOnce(failed(503))
      .mockResolvedValueOnce(groq(JSON.stringify(output)));
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["score", "period"],
      properties: { score: { type: "number" }, period: { type: "integer" } },
    };
    await expect(aiObject("Leia o boletim.", vision, schema)).resolves.toEqual(output);
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content).toContain(JSON.stringify(schema));
  });
  it("recupera JSON inválido do Gemini e não entrega JSON inválido do Groq", async () => {
    const schema = {
      type: "object",
      required: ["answer"],
      properties: { answer: { type: "string" } },
    };
    fetchMock
      .mockResolvedValueOnce(google("não é JSON"))
      .mockResolvedValueOnce(groq('{"answer":"Certo"}'));
    await expect(aiObject("Responda.", messages, schema)).resolves.toEqual({ answer: "Certo" });
    fetchMock.mockResolvedValueOnce(failed(429)).mockResolvedValueOnce(groq("não é JSON"));
    await expect(aiObject("Responda.", messages, schema)).rejects.toThrow("formato inesperado");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it("não envia ao outro provedor quando o erro é do conteúdo ou houve filtro", async () => {
    fetchMock.mockResolvedValueOnce(failed(400));
    await expect(aiText("Explique.", messages)).rejects.toThrow("HTTP 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(canFallback({ name: "AI_NoObjectGeneratedError", finishReason: "content-filter" })).toBe(
      false,
    );
    expect(canFallback(new Error("private data"))).toBe(false);
  });
  it("não interfere no Gemini sem chave Groq e não expõe diagnóstico bruto quando os dois falham", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    fetchMock.mockResolvedValueOnce(failed(429));
    await expect(aiText("Explique.", messages)).rejects.toThrow("HTTP 429");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.stubEnv("GROQ_API_KEY", "groq-private-key");
    fetchMock.mockResolvedValueOnce(failed(503)).mockResolvedValueOnce(failed(401));
    await expect(aiText("Explique.", messages)).rejects.toThrow("GROQ_API_KEY");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private");
  });
  it("permite usar Groq se a configuração Gemini estiver ausente", async () => {
    vi.stubEnv("BOARD_AI_API_KEY", "");
    fetchMock.mockResolvedValueOnce(groq());
    await expect(aiText("Explique.", messages)).resolves.toBe("Resposta Groq");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("api.groq.com");
  });
});
describe("Configuração e classificação seguras", () => {
  it("identifica uma chave de outro serviço sem removê-la nem interferir no Gemini saudável", async () => {
    expect(() => groqConfig({ GROQ_API_KEY: "codex_private" })).toThrow("Grok e Groq");
    expect(() => groqConfig({ GROQ_API_KEY: "xai-private" })).toThrow("console.groq.com/keys");
    vi.stubEnv("GROQ_API_KEY", "codex_private");
    fetchMock.mockResolvedValueOnce(google());
    await expect(aiText("Explique.", messages)).resolves.toBe("Resposta Gemini");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("precisa apenas da chave Groq e mantém modelos de texto e visão separados", () => {
    expect(groqConfig({})).toBeNull();
    expect(groqConfig({ GROQ_API_KEY: "key" })).toMatchObject({
      baseURL: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
      visionModel: "meta-llama/llama-4-scout-17b-16e-instruct",
    });
    expect(() => groqConfig({ GROQ_API_KEY: "key", GROQ_MODEL: "https://example.com" })).toThrow(
      "GROQ_MODEL",
    );
  });
  it("preserva a causa de cota ou timeout e diferencia chave Google inválida de conteúdo recusado", () => {
    expect(canFallback(new Error("wrapper", { cause: { statusCode: 429 } }))).toBe(true);
    expect(canFallback({ name: "TimeoutError" })).toBe(true);
    expect(
      canFallback(
        providerFailure(
          400,
          { error: { details: [{ reason: "API_KEY_INVALID" }] } },
          { whiteboard: false, google: true },
        ),
      ),
    ).toBe(true);
    expect(canFallback(providerFailure(400, null, { whiteboard: false, google: true }))).toBe(
      false,
    );
    expect(canFallback(new AiSetupError("Configuração ausente."))).toBe(true);
  });
});

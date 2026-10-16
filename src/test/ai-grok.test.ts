import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiObject, aiResearch, aiText } from "@/lib/ai.server";
import { fallbackProvider, grokConfig } from "@/lib/ai-config";

const fetchMock = vi.fn();
const privateText = "Anotação privada que nunca deve aparecer nos logs.";
const messages = [{ role: "user" as const, content: privateText }];
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const failed = (status: number) =>
  json(
    { error: { message: "private diagnostic grok_private gemini_private " + privateText } },
    status,
  );
const google = (text = "Resposta Gemini") =>
  json({
    candidates: [{ index: 0, content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 },
  });
const grok = (text = "Resposta Grok") =>
  json({
    id: "resp-1",
    object: "response",
    created_at: 1,
    model: "grok-4.20-non-reasoning",
    status: "completed",
    output: [
      {
        id: "msg-1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 },
  });
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubEnv("BOARD_AI_API_KEY", "gemini_private");
  vi.stubEnv("BOARD_AI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta");
  vi.stubEnv("BOARD_AI_MODEL", "gemini-test");
  vi.stubEnv("GROK_API_KEY", "grok_private");
  vi.stubEnv("XAI_API_KEY", "");
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("GROK_MODEL", "grok-4.20-non-reasoning");
  vi.stubEnv("GROK_VISION_MODEL", "");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Gemini principal e Grok/xAI como alternativa", () => {
  it("mantém o Gemini saudável e só usa Grok após uma falha técnica", async () => {
    fetchMock
      .mockResolvedValueOnce(google())
      .mockResolvedValueOnce(failed(429))
      .mockResolvedValueOnce(grok())
      .mockResolvedValueOnce(google());
    expect(await aiText("Explique.", messages)).toBe("Resposta Gemini");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await aiText("Explique.", messages)).toBe("Resposta Grok");
    expect(await aiText("Outra explicação.", messages)).toBe("Resposta Gemini");
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).hostname)).toEqual([
      "generativelanguage.googleapis.com",
      "generativelanguage.googleapis.com",
      "api.x.ai",
      "generativelanguage.googleapis.com",
    ]);
  });
  it("usa Responses nativo, chave completa e store false, sem credenciais do Gemini", async () => {
    fetchMock.mockResolvedValueOnce(failed(503)).mockResolvedValueOnce(grok());
    expect(await aiText("Explique.", messages)).toBe("Resposta Grok");
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe("https://api.x.ai/v1/responses");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer grok_private");
    expect(headers.has("x-goog-api-key")).toBe(false);
    const body = JSON.parse(init.body);
    expect(body.model).toBe("grok-4.20-non-reasoning");
    expect(body.store).toBe(false);
    expect(JSON.stringify(body.input)).toContain(privateText);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private");
  });
  it.each(["grok_legacy_full_key", "xai-legacy-full-key"])(
    "reconhece a chave %s no campo antigo e nunca a envia para a Groq",
    async (key) => {
      vi.stubEnv("GROK_API_KEY", "");
      vi.stubEnv("GROQ_API_KEY", key);
      fetchMock.mockResolvedValueOnce(failed(429)).mockResolvedValueOnce(grok());
      await aiText("Explique.", messages);
      const [url, init] = fetchMock.mock.calls[1]!;
      expect(String(url)).toContain("api.x.ai");
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer " + key);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
  it("preserva a imagem da lousa e usa o modelo de visão configurado", async () => {
    vi.stubEnv("GROK_VISION_MODEL", "grok-vision-custom");
    fetchMock
      .mockResolvedValueOnce(failed(429))
      .mockResolvedValueOnce(grok("A imagem é vermelha."));
    const result = await aiText("Observe.", [
      {
        role: "user",
        content: [
          { type: "text", text: "Explique as cores." },
          { type: "file", data: image, mediaType: "image/png" },
        ],
      },
    ]);
    expect(result).toBe("A imagem é vermelha.");
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(body.model).toBe("grok-vision-custom");
    expect(JSON.stringify(body.input)).toContain(image);
    expect(JSON.stringify(body.input)).toContain("input_image");
  });
  it("mantém JSON Schema nas atividades e rejeita respostas inválidas sem tentar um terceiro provedor", async () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["answer"],
      properties: { answer: { type: "string" } },
    };
    fetchMock.mockResolvedValueOnce(failed(429)).mockResolvedValueOnce(grok('{"answer":"Água"}'));
    expect(await aiObject("Responda.", messages, schema)).toEqual({ answer: "Água" });
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).text.format).toMatchObject({
      type: "json_schema",
      strict: true,
      schema,
    });
    vi.stubEnv("GROQ_API_KEY", "gsk_unused");
    fetchMock.mockResolvedValueOnce(failed(429)).mockResolvedValueOnce(grok("não é JSON"));
    await expect(aiObject("Responda.", messages, schema)).rejects.toThrow(
      "Grok retornou um formato inesperado",
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it.each([400, 422])("não troca de provedor em erro de conteúdo HTTP %i", async (status) => {
    fetchMock.mockResolvedValueOnce(failed(status));
    await expect(aiText("Explique.", messages)).rejects.toThrow("HTTP " + status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("informa modelo e chave do Grok sem expor o diagnóstico privado", async () => {
    fetchMock.mockResolvedValueOnce(failed(503)).mockResolvedValueOnce(failed(404));
    await expect(aiText("Explique.", messages)).rejects.toThrow("GROK_MODEL");
    fetchMock.mockResolvedValueOnce(failed(429)).mockResolvedValueOnce(failed(401));
    await expect(aiText("Explique.", messages)).rejects.toThrow("GROK_API_KEY");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private");
  });
  it("não inventa busca web no Grok quando a pesquisa Gemini falha", async () => {
    fetchMock
      .mockResolvedValueOnce(failed(429))
      .mockResolvedValueOnce(grok("Orientação geral. Confirme o edital atual."));
    expect(await aiResearch("Pesquise.", messages)).toEqual({
      text: "Orientação geral. Confirme o edital atual.",
      sources: [],
    });
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(body.tools).toBeUndefined();
    expect(JSON.stringify(body.input)).toContain("não tem busca web");
  });
});
describe("Configuração e compatibilidade do Grok", () => {
  it("prioriza GROK_API_KEY, aceita XAI_API_KEY e preserva todas as chaves completas", () => {
    expect(grokConfig({ GROK_API_KEY: " grok_full ", XAI_API_KEY: "xai-unused" })).toMatchObject({
      key: "grok_full",
      baseURL: "https://api.x.ai/v1",
      source: "GROK_API_KEY",
    });
    expect(grokConfig({ XAI_API_KEY: "xai-full" })).toMatchObject({
      key: "xai-full",
      source: "XAI_API_KEY",
    });
    expect(grokConfig({ GROQ_API_KEY: "grok_full" })).toMatchObject({
      key: "grok_full",
      source: "GROQ_API_KEY",
    });
    expect(grokConfig({ GROQ_API_KEY: "gsk_full" })).toBeNull();
    expect(fallbackProvider({ GROK_API_KEY: "grok_full", GROQ_API_KEY: "gsk_full" })).toBe("grok");
    expect(fallbackProvider({ GROQ_API_KEY: "gsk_full" })).toBe("groq");
  });
  it("valida identificadores sem forçar remoção do prefixo nem aceitar URLs de modelo", () => {
    expect(() =>
      grokConfig({ GROK_API_KEY: "grok_full", GROK_MODEL: "https://example.com/model" }),
    ).toThrow("GROK_MODEL");
    expect(() => grokConfig({ GROK_API_KEY: "gsk_wrong_service" })).toThrow("chave da Groq");
  });
});

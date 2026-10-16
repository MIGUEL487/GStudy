import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiText, aiObject, aiResearch } from "@/lib/ai.server";
import { openRouterConfig } from "@/lib/ai-config";
import { makePdf } from "./helpers/pdf-fixture";

const fetchMock = vi.fn();
const privateText = "anotações privadas integrais do estudante";
const messages = [{ role: "user" as const, content: privateText }];
const model = "nvidia/nemotron-3.5-super-vl:free";
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
const fail = (status = 429, message = "private-provider-diagnostic") =>
  new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const chat = (text = "Resposta alternativa", finish_reason = "stop") =>
  new Response(
    JSON.stringify({
      id: "test",
      object: "chat.completion",
      created: 1,
      model,
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
const google = () =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          index: 0,
          content: { role: "model", parts: [{ text: "Resposta principal" }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
const schema = { type: "object", required: ["answer"], properties: { answer: { type: "string" } } };
const bodyAt = (index: number) => JSON.parse(fetchMock.mock.calls[index]![1].body);

beforeEach(() => {
  for (const [key, value] of Object.entries({
    BOARD_AI_API_KEY: "gemini-private-key",
    BOARD_AI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
    BOARD_AI_MODEL: "gemini-test",
    GROQ_API_KEY: "groq-private-key",
    GROQ_MODEL: "llama-3.3-70b-versatile",
    GROQ_VISION_MODEL: "meta-llama/llama-4-scout-17b-16e-instruct",
    OPENROUTER_API_KEY: "openrouter-private-key",
    OPENROUTER_MODEL: model,
    OPENROUTER_VISION_MODEL: model,
    GROK_API_KEY: "grok_ignored",
    XAI_API_KEY: "xai-ignored",
    MISTRAL_API_KEY: "mistral-ignored",
  }))
    vi.stubEnv(key, value);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("Gemini → Groq → OpenRouter gratuito, com SDK e HTTP simulado", () => {
  it("mantém Gemini como primeira opção e ignora configurações alternativas inválidas enquanto funciona", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "modelo/pago");
    fetchMock.mockResolvedValueOnce(google());
    await expect(aiText("Explique.", messages)).resolves.toBe("Resposta principal");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("não chama a terceira IA quando Groq resolve a falha do Gemini", async () => {
    fetchMock.mockResolvedValueOnce(fail()).mockResolvedValueOnce(chat("Groq resolveu"));
    await expect(aiText("Explique.", messages)).resolves.toBe("Groq resolveu");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("api.groq.com");
  });
  it("usa as três APIs em ordem e preserva o conteúdo completo com credenciais separadas e preço zero", async () => {
    const text = privateText.repeat(4000) + "-FIM";
    fetchMock
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(chat());
    await expect(aiText("Explique.", [{ role: "user", content: text }])).resolves.toBe(
      "Resposta alternativa",
    );
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).hostname)).toEqual([
      "generativelanguage.googleapis.com",
      "api.groq.com",
      "openrouter.ai",
    ]);
    const [url, init] = fetchMock.mock.calls[2]!;
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer openrouter-private-key");
    expect(new Headers(init.headers).has("x-goog-api-key")).toBe(false);
    expect(bodyAt(2)).toMatchObject({
      model,
      provider: { max_price: { prompt: 0, completion: 0 } },
    });
    expect(bodyAt(2).messages.at(-1).content).toBe(text);
    expect(bodyAt(2).plugins).toBeUndefined();
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    for (const secret of [
      privateText,
      "private-provider-diagnostic",
      "gemini-private-key",
      "groq-private-key",
      "openrouter-private-key",
    ])
      expect(logs).not.toContain(secret);
  });
  it.each(["", "grok_wrong_key"])(
    "pula Groq ausente ou com chave de outro serviço (%s), sem enviá-la ao OpenRouter",
    async (key) => {
      vi.stubEnv("GROQ_API_KEY", key);
      fetchMock.mockResolvedValueOnce(fail()).mockResolvedValueOnce(chat());
      await expect(aiText("Explique.", messages)).resolves.toBe("Resposta alternativa");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1]![0])).toContain("openrouter.ai");
      expect(new Headers(fetchMock.mock.calls[1]![1].headers).get("authorization")).toBe(
        "Bearer openrouter-private-key",
      );
    },
  );
  it("usa o modelo de visão e preserva a imagem original da lousa ou do caderno", async () => {
    vi.stubEnv("OPENROUTER_VISION_MODEL", "google/gemma-4-26b-a4b-it:free");
    fetchMock
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(chat("Reconheci a imagem"));
    await expect(
      aiText("Leia a foto.", [
        { role: "user", content: [{ type: "file", mediaType: "image/png", data: image }] },
      ]),
    ).resolves.toBe("Reconheci a imagem");
    expect(bodyAt(2).model).toBe("google/gemma-4-26b-a4b-it:free");
    expect(bodyAt(2).messages.at(-1).content).toContainEqual({
      type: "image_url",
      image_url: { url: image },
    });
  });
  it("valida JSON das atividades e fotos sem exigir JSON Schema estrito", async () => {
    fetchMock
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(chat('{"answer":"Ortografia e acentuação íntegras"}'));
    await expect(aiObject("Responda.", messages, schema)).resolves.toEqual({
      answer: "Ortografia e acentuação íntegras",
    });
    expect(bodyAt(2).response_format).toEqual({ type: "json_object" });
    expect(bodyAt(2).messages[0].content).toContain(JSON.stringify(schema));
  });
  it("recupera uma incompatibilidade técnica HTTP 400 da Groq sem reduzir o conteúdo", async () => {
    fetchMock
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail(400, "Unsupported response_format"))
      .mockResolvedValueOnce(chat());
    await expect(aiText("Explique.", messages)).resolves.toBe("Resposta alternativa");
    expect(bodyAt(2).messages.at(-1).content).toBe(privateText);
  });
  it.each(["texto pesquisável completo", ""])(
    "envia o PDF original ao leitor gratuito mesmo sem texto extraível (%s)",
    async (text) => {
      const pdf = makePdf(text);
      fetchMock.mockImplementation((url) =>
        Promise.resolve(
          String(url).includes("openrouter.ai") ? chat("Conteúdo do documento") : fail(),
        ),
      );
      const result = await aiText("Leia o documento.", [
        { role: "user", content: [{ type: "file", mediaType: "application/pdf", data: pdf }] },
      ]);
      const index = fetchMock.mock.calls.findIndex(([url]) =>
        String(url).includes("openrouter.ai"),
      );
      expect(bodyAt(index).plugins).toEqual([
        { id: "file-parser", pdf: { engine: "cloudflare-ai" } },
      ]);
      expect(bodyAt(index).messages.at(-1).content).toContainEqual({
        type: "file",
        file: { filename: "document.pdf", file_data: pdf },
      });
      expect(result).toContain("apenas o texto foi analisado");
      expect(bodyAt(index).messages[0].content).toContain("não interprete nem invente ilustrações");
      expect(JSON.stringify(bodyAt(index))).not.toContain("mistral-ocr");
    },
  );
  it("rejeita PDF inválido ou remoto sem envio parcial ou serviço de OCR pago", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    fetchMock.mockResolvedValueOnce(fail());
    await expect(
      aiText("Leia.", [
        {
          role: "user",
          content: [
            {
              type: "file",
              mediaType: "application/pdf",
              data: "data:application/pdf;base64,YQ==",
            },
          ],
        },
      ]),
    ).rejects.toThrow("PDF original");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("recusa PDFs acima de 40 páginas sem cortar ou enviar apenas uma parte", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    fetchMock.mockResolvedValueOnce(fail());
    await expect(
      aiText("Leia.", [
        {
          role: "user",
          content: [
            {
              type: "file",
              mediaType: "application/pdf",
              data: makePdf("Texto de todas as páginas", 41),
            },
          ],
        },
      ]),
    ).rejects.toThrow("Nenhuma página foi cortada");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("não atribui pesquisa web ao terceiro provedor", async () => {
    fetchMock
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(chat("Confira o edital oficial."));
    await expect(aiResearch("Pesquise.", messages)).resolves.toEqual({
      text: "Confira o edital oficial.",
      sources: [],
    });
    expect(bodyAt(2).tools).toBeUndefined();
    expect(bodyAt(2).messages[0].content).toContain("não tem busca web");
  });
  it("para em recusa de conteúdo e HTTP 400 desconhecido sem chamar outra IA", async () => {
    fetchMock.mockResolvedValueOnce(fail()).mockResolvedValueOnce(chat("", "content_filter"));
    await expect(aiText("Explique.", messages)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail(400, "Unknown input rejection"));
    await expect(aiText("Explique.", messages)).rejects.toThrow("HTTP 400");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("mostra a variável certa quando a última chave falha e não retorna JSON inválido", async () => {
    fetchMock
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail(401));
    await expect(aiText("Explique.", messages)).rejects.toThrow("OPENROUTER_API_KEY");
    fetchMock
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(chat("não é JSON"));
    await expect(aiObject("Responda.", messages, schema)).rejects.toThrow(
      "OpenRouter retornou um formato inesperado",
    );
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
  it("recusa modelos pagos antes de enviar qualquer solicitação ao OpenRouter", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "provider/modelo-pago");
    fetchMock.mockResolvedValueOnce(fail()).mockResolvedValueOnce(fail());
    await expect(aiText("Explique.", messages)).rejects.toThrow(":free");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
describe("Configuração gratuita do OpenRouter", () => {
  it("é opcional e precisa apenas da chave para usar um modelo gratuito de visão", () => {
    expect(openRouterConfig({})).toBeNull();
    expect(openRouterConfig({ OPENROUTER_API_KEY: "test" })).toMatchObject({
      model,
      visionModel: model,
      baseURL: "https://openrouter.ai/api/v1",
    });
  });
  it.each([
    "openrouter/auto",
    "provider/paid",
    "https://example.com/free",
    "provider/model:free\n/inject",
  ])("não aceita identificador fora da variante gratuita: %s", (value) => {
    expect(() => openRouterConfig({ OPENROUTER_API_KEY: "test", OPENROUTER_MODEL: value })).toThrow(
      "OPENROUTER_MODEL",
    );
  });
});

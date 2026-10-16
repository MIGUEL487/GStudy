import { describe, expect, it } from "vitest";
import { canFallback, providerFailure, safeAiFailure } from "@/lib/ai-errors";

const context = { whiteboard: false, google: false, grok: true, keyVariable: "GROQ_API_KEY" };
const privateText = "grok_SECRET_NOT_FOR_LOGS anotações privadas do estudante";
describe("Diagnóstico do HTTP 400 Grok sem reduzir o conteúdo", () => {
  it.each([
    ["key", { error: { message: "Invalid API key " + privateText } }, "GROQ_API_KEY"],
    [
      "plan",
      { error: "This API key is restricted to coding models. " + privateText },
      "restrito a programação",
    ],
    ["model", { code: "model_not_found", error: privateText }, "GROK_MODEL"],
    [
      "vision",
      { error: { message: "This model does not support images. " + privateText } },
      "GROK_VISION_MODEL",
    ],
    [
      "context",
      { error: { code: "context_length_exceeded", message: privateText } },
      "conteúdo foi preservado",
    ],
    [
      "schema",
      { error: { message: "Unsupported field in json_schema " + privateText } },
      "resposta estruturada",
    ],
    [
      "schema",
      { error: { message: privateText, param: "text.format" } },
      "incompatibilidade de formato",
    ],
    [
      "parameter",
      { error: { message: "include reasoning.encrypted_content is not supported " + privateText } },
      "parâmetro da integração",
    ],
    [
      "image-input",
      { error: { message: "Invalid image_url format " + privateText } },
      "imagem foi preservada",
    ],
    ["credits", { error: "Insufficient credits. " + privateText }, "créditos"],
    ["request", { error: { message: privateText } }, "não demonstra"],
  ])("identifica %s e não devolve o texto privado do provedor", (category, payload, expected) => {
    const error = providerFailure(400, payload, context);
    const result = safeAiFailure(
      new Error("SDK wrapper " + privateText, { cause: error }),
      context,
    );
    expect(result).toMatchObject({ status: 400, category });
    expect(result.message).toContain(expected);
    expect(result.message).not.toContain(privateText);
    expect(result.message).not.toContain("tente um conteúdo menor");
    expect(canFallback(error)).toBe(category === "key");
  });
  it("aceita o formato de erro com message no topo sem confundir JSON com falta de visão", () => {
    const error = providerFailure(
      422,
      { message: "Model does not support structured outputs. " + privateText },
      { ...context, whiteboard: true },
    );
    expect(safeAiFailure(error, context).category).toBe("schema");
    expect(error.message).not.toContain("não aceita imagens");
  });
  it("não copia categorias arbitrárias para os logs seguros", () => {
    const error = Object.assign(providerFailure(400, null, context), { category: privateText });
    expect(safeAiFailure(error, context)).not.toHaveProperty("category");
  });
});

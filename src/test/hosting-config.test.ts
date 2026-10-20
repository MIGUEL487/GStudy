import { describe, expect, it } from "vitest";
import { supabaseConfig } from "@/integrations/supabase/config";
import { aiConfig } from "@/lib/ai-config";
const publicEnv = {
  VITE_SUPABASE_URL: "https://project.supabase.co/",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
};
describe("Configuração na hospedagem", () => {
  it("usa as variáveis públicas como fallback no servidor", () => {
    expect(supabaseConfig(publicEnv, {}, true)).toEqual({
      url: "https://project.supabase.co",
      key: "sb_publishable_example",
    });
  });
  it("identifica chaves de projetos diferentes antes de validar o token", () => {
    expect(() =>
      supabaseConfig(publicEnv, { SUPABASE_PUBLISHABLE_KEY: "other-project-key" }, true),
    ).toThrow("não correspondem");
  });
  it("permite a URL interna do Lovable quando a chave é a mesma", () => {
    expect(
      supabaseConfig(
        publicEnv,
        {
          SUPABASE_URL: "https://internal.example.com",
          SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
        },
        true,
      ).url,
    ).toBe("https://internal.example.com");
  });
  it("não aceita um ID como URL nem uma chave secreta no cliente", () => {
    expect(() => supabaseConfig({ ...publicEnv, VITE_SUPABASE_URL: "project-id" })).toThrow("URL");
    expect(() =>
      supabaseConfig({ ...publicEnv, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private" }),
    ).toThrow("chave pública");
  });
  it("explica qual chave Gemini falta na hospedagem", () => {
    expect(() => aiConfig({})).toThrow("BOARD_AI_API_KEY");
  });
  it("usa os mesmos dados Gemini para todas as funções de IA", () => {
    expect(aiConfig({ BOARD_AI_API_KEY: "google-private-test-key" })).toEqual({
      key: "google-private-test-key",
      model: "gemini-3.5-flash-lite",
      baseURL: "https://generativelanguage.googleapis.com/v1beta",
    });
  });
  it("ignora credenciais antigas e preserva o modelo Gemini escolhido", () => {
    const config = aiConfig({
      BOARD_AI_API_KEY: "gemini-key",
      BOARD_AI_MODEL: "gemini-model",
      AI_API_KEY: "legacy-key",
      AI_BASE_URL: "https://legacy.example/v1",
    });
    expect(config.key).toBe("gemini-key");
    expect(config.model).toBe("gemini-model");
    expect(() => aiConfig({ AI_API_KEY: "legacy-key" })).toThrow("BOARD_AI_API_KEY");
  });
  it("recusa bases de outros provedores, credenciais na URL e o endpoint completo", () => {
    expect(() =>
      aiConfig({ BOARD_AI_API_KEY: "key", BOARD_AI_BASE_URL: "https://provider.example/v1" }),
    ).toThrow("API Gemini");
    expect(() =>
      aiConfig({
        BOARD_AI_API_KEY: "key",
        BOARD_AI_BASE_URL: "https://key@generativelanguage.googleapis.com/v1beta/openai",
      }),
    ).toThrow("API Gemini");
    expect(() =>
      aiConfig({
        BOARD_AI_API_KEY: "key",
        BOARD_AI_BASE_URL:
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      }),
    ).toThrow("base da API");
  });
  it("reaproveita a base antiga da lousa com /openai, normalizando para a API nativa", () => {
    expect(
      aiConfig({
        BOARD_AI_API_KEY: "key",
        BOARD_AI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      }).baseURL,
    ).toBe("https://generativelanguage.googleapis.com/v1beta");
  });
  it("identifica um endereço colado no campo de modelo", () => {
    expect(() =>
      aiConfig({
        BOARD_AI_API_KEY: "key",
        BOARD_AI_MODEL: "https://generativelanguage.googleapis.com",
      }),
    ).toThrow("não uma URL");
  });
});

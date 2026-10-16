import { describe, expect, it } from "vitest";
import { groqMessages, hasImages } from "@/lib/ai-fallback-media.server";
import { makePdf } from "./helpers/pdf-fixture";

describe("PDFs na alternativa Groq", () => {
  it("extrai texto de um PDF real no servidor, mantendo a origem e sem simular leitura das figuras", async () => {
    const result = await groqMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "Leia o material." },
          { type: "file", mediaType: "application/pdf", data: makePdf("Area = lado x lado.") },
        ],
      },
    ]);
    expect(result.convertedPdf).toBe(true);
    expect(JSON.stringify(result.messages)).toContain("Area = lado x lado.");
    expect(JSON.stringify(result.messages)).toContain("imagens não foram analisadas");
    expect(JSON.stringify(result.messages)).not.toContain("application/pdf");
  });
  it("recusa PDF sem texto extraível e URLs de arquivo em vez de mandar dados incompletos ao Groq", async () => {
    await expect(
      groqMessages([
        {
          role: "user",
          content: [{ type: "file", mediaType: "application/pdf", data: makePdf("") }],
        },
      ]),
    ).rejects.toThrow("páginas sem texto extraível");
    await expect(
      groqMessages([
        {
          role: "user",
          content: [
            {
              type: "file",
              mediaType: "application/pdf",
              data: new URL("https://private.example/file.pdf"),
            },
          ],
        },
      ]),
    ).rejects.toThrow("PDF enviado como arquivo");
  });
  it("detecta imagens enviadas por file e pelo formato antigo de imagem, mas não confunde PDF com visão", () => {
    expect(
      hasImages([
        {
          role: "user",
          content: [{ type: "file", data: "data:image/jpeg;base64,YQ==", mediaType: "image/jpeg" }],
        },
      ]),
    ).toBe(true);
    expect(
      hasImages([
        { role: "user", content: [{ type: "image", image: "data:image/jpeg;base64,YQ==" }] },
      ]),
    ).toBe(true);
    expect(
      hasImages([
        {
          role: "user",
          content: [{ type: "file", data: makePdf("Area."), mediaType: "application/pdf" }],
        },
      ]),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { groqMessages, hasImages } from "@/lib/ai-fallback-media.server";
const makePdf = (text: string) => {
  const stream = text ? `BT /F1 14 Tf 50 700 Td (${text}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return "data:application/pdf;base64," + Buffer.from(pdf).toString("base64");
};
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

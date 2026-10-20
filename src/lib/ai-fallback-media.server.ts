import type { ModelMessage } from "ai";
import { AiSetupError } from "./ai-config";

export function hasImages(messages: ModelMessage[]) {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some(
        (part) =>
          part.type === "image" || (part.type === "file" && part.mediaType.startsWith("image/")),
      ),
  );
}
async function pdfText(data: unknown) {
  if (
    typeof data !== "string" ||
    !/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/.test(data) ||
    data.length > 4_500_000
  )
    throw new AiSetupError(
      "A alternativa de IA precisa de um PDF enviado como arquivo de até 3 MB. Envie o conteúdo como texto ou fotos das páginas.",
    );
  const { extractText, getDocumentProxy } = await import("unpdf");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    const bytes = new Uint8Array(Buffer.from(data.slice(data.indexOf(",") + 1), "base64"));
    pdf = await getDocumentProxy(bytes, {
      disableFontFace: true,
      useSystemFonts: false,
      maxImageSize: 0,
      verbosity: 0,
    });
    if (pdf.numPages > 40)
      throw new AiSetupError(
        "Para usar a alternativa de IA, divida o PDF em arquivos de até 40 páginas ou envie um resumo.",
      );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const extracted = await Promise.race([
      extractText(pdf, { mergePages: false }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new AiSetupError(
                "O PDF demorou demais para abrir na alternativa de IA. Envie um arquivo menor ou fotos das páginas.",
              ),
            ),
          8000,
        );
      }),
    ]).finally(() => clearTimeout(timeout));
    const { text } = extracted;
    if (!text.length || text.some((page) => !page.trim()))
      throw new AiSetupError(
        "O Gemini não respondeu e este PDF tem páginas sem texto extraível. Envie fotos das páginas ou cole o texto para usar a alternativa de IA.",
      );
    const content = text.map((page, index) => `Página ${index + 1}:\n${page}`).join("\n\n");
    if (content.length > 90000)
      throw new AiSetupError(
        "O texto do PDF é extenso para a alternativa de IA. Divida o arquivo ou envie um resumo menor.",
      );
    return content;
  } catch (error) {
    if (error instanceof AiSetupError) throw error;
    throw new AiSetupError(
      "O Gemini não respondeu e não foi possível extrair o texto deste PDF. Se ele tiver senha ou for uma digitalização, envie fotos das páginas ou cole o texto.",
    );
  } finally {
    await pdf?.loadingTask.destroy().catch(() => {});
  }
}
export async function fallbackMessages(messages: ModelMessage[]) {
  let convertedPdf = false;
  const converted = await Promise.all(
    messages.map(async (message) => {
      if (!Array.isArray(message.content)) return message;
      const content = await Promise.all(
        message.content.map(async (part) => {
          if (part.type !== "file") return part;
          if (part.mediaType.startsWith("image/")) return part;
          if (part.mediaType !== "application/pdf")
            throw new AiSetupError(
              "A alternativa de IA aceita texto e imagens. Envie este arquivo como texto ou foto.",
            );
          convertedPdf = true;
          return {
            type: "text" as const,
            text: `Texto extraído do PDF (ilustrações e imagens não foram analisadas):\n${await pdfText(part.data)}`,
          };
        }),
      );
      return { ...message, content } as ModelMessage;
    }),
  );
  return { messages: converted, convertedPdf };
}

// Backward-compatible name for existing callers.
export const groqMessages = fallbackMessages;

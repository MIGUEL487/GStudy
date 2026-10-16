import type { ModelMessage } from "ai";
import { AiSetupError } from "./ai-config";

export const hasPdf = (messages: ModelMessage[]) =>
  messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === "file" && part.mediaType === "application/pdf"),
  );

/** Validate the complete original PDF before sending it to the free document parser. */
export async function validateOpenRouterFiles(messages: ModelMessage[]) {
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type !== "file") continue;
      if (part.mediaType.startsWith("image/")) continue;
      if (part.mediaType !== "application/pdf")
        throw new AiSetupError("O OpenRouter aceita imagens e PDFs neste fluxo.");
      if (
        typeof part.data !== "string" ||
        !/^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/.test(part.data) ||
        part.data.length > 6_000_000
      )
        throw new AiSetupError(
          "O OpenRouter precisa do PDF original enviado como arquivo de até 4 MB.",
        );
      const { getDocumentProxy } = await import("unpdf");
      let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
      try {
        const bytes = new Uint8Array(
          Buffer.from(part.data.slice(part.data.indexOf(",") + 1), "base64"),
        );
        if (bytes.byteLength > 4 * 1024 * 1024)
          throw new AiSetupError(
            "O OpenRouter aceita PDFs de até 4 MB neste fluxo. O arquivo não foi reduzido.",
          );
        pdf = await getDocumentProxy(bytes, {
          disableFontFace: true,
          useSystemFonts: false,
          maxImageSize: 0,
          verbosity: 0,
        });
        if (pdf.numPages < 1 || pdf.numPages > 40)
          throw new AiSetupError(
            "Este fluxo aceita PDFs de até 40 páginas. Nenhuma página foi cortada ou enviada parcialmente.",
          );
      } catch (error) {
        if (error instanceof AiSetupError) throw error;
        throw new AiSetupError(
          "Não foi possível abrir o PDF original para o OpenRouter. Confira se o arquivo é válido e não tem senha.",
        );
      } finally {
        await pdf?.loadingTask.destroy().catch(() => {});
      }
    }
  }
}

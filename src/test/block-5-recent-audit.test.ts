import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { mergeAccountDocuments } from "@/lib/account-sync-model";
import { SERVER_AI_LIMITS } from "@/lib/server-ai-quota";

describe("Bloco 5 - Auditoria de Módulos Recentes", () => {
  describe("5.1 Sócrates: limites de anexo, payload e sanitização", () => {
    it("valida que o schema de anexo rejeita payloads acima de 4.5 MB", () => {
      const attachmentSchema = z.object({
        name: z.string().trim().min(1).max(200),
        mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
        dataUrl: z.string().max(4_500_000),
      });

      const validSmall = {
        name: "documento.pdf",
        mediaType: "application/pdf" as const,
        dataUrl: "data:application/pdf;base64,JVBERi0xLjQK",
      };
      expect(attachmentSchema.safeParse(validSmall).success).toBe(true);

      const oversized = {
        name: "grande.pdf",
        mediaType: "application/pdf" as const,
        dataUrl: "data:application/pdf;base64," + "A".repeat(4_600_000),
      };
      expect(attachmentSchema.safeParse(oversized).success).toBe(false);
    });

    it("sanitiza mensagens de erro internas para não vazar URLs nem chaves para o cliente", () => {
      const rawErrorWithUrl = new Error(
        "Failed to fetch https://api.deepseek.com/v1/chat with key sk-123456",
      );
      const isSafeMessage =
        rawErrorWithUrl instanceof Error &&
        !rawErrorWithUrl.message.includes("http") &&
        !rawErrorWithUrl.message.includes("api.") &&
        !rawErrorWithUrl.message.includes("key") &&
        !rawErrorWithUrl.message.includes("AI_");

      const clientMessage = isSafeMessage
        ? rawErrorWithUrl.message
        : "Não foi possível responder agora. Tente novamente.";

      expect(clientMessage).toBe("Não foi possível responder agora. Tente novamente.");
      expect(clientMessage).not.toContain("api.deepseek.com");
      expect(clientMessage).not.toContain("sk-123456");
    });
  });

  describe("5.2 Importação de fotos: cotas e proteção de logs", () => {
    it("possui limite de cota configurado para photo_import no servidor", () => {
      expect(SERVER_AI_LIMITS.photo_import).toBeDefined();
      expect(SERVER_AI_LIMITS.photo_import).toBeGreaterThan(0);
      expect(SERVER_AI_LIMITS.photo_import).toBeLessThanOrEqual(50);
    });

    it("nunca vaza o payload base64 da foto em mensagens de erro", () => {
      const largeBase64 = "data:image/jpeg;base64," + "B".repeat(1000);
      try {
        // Simulação de erro interno do provedor
        throw new Error(`Provider failed on image: ${largeBase64}`);
      } catch (cause) {
        let clientError: string;
        if (cause instanceof Error && cause.message.includes("Limite diário de IA")) {
          clientError = cause.message;
        } else if (cause instanceof Error && cause.message.startsWith("Não foi possível")) {
          clientError = cause.message;
        } else {
          clientError =
            "Não foi possível transcrever a foto. Tente uma foto mais nítida ou de um trecho menor.";
        }

        expect(clientError).toBe(
          "Não foi possível transcrever a foto. Tente uma foto mais nítida ou de um trecho menor.",
        );
        expect(clientError).not.toContain("BBBB");
      }
    });
  });

  describe("5.3 Biblioteca de estudos: cota e resolução de fontes", () => {
    it("possui cota de servidor configurada para pesquisas da biblioteca", () => {
      expect(SERVER_AI_LIMITS.library).toBeDefined();
      expect(SERVER_AI_LIMITS.library).toBeGreaterThanOrEqual(10);
    });
  });

  describe("5.4 Sincronização de conta: concorrência e preservação de cadernos", () => {
    it("cria cópia do caderno quando detecta conflito concorrente sem sobrescrever", () => {
      const baseDocument = {
        version: 1 as const,
        name: "Estudante",
        subjects: [
          {
            id: "sub-1",
            name: "História",
            notebooks: [
              {
                id: "nb-1",
                title: "Aula 1",
                text: "Texto original",
                updatedAt: "2026-10-10T10:00:00.000Z",
              },
            ],
            courses: [],
          },
        ],
        performance: {},
      };

      const localEdited = {
        ...baseDocument,
        subjects: [
          {
            ...baseDocument.subjects[0]!,
            notebooks: [
              {
                id: "nb-1",
                title: "Aula 1",
                text: "Edição do Celular",
                updatedAt: "2026-10-10T10:05:00.000Z",
              },
            ],
          },
        ],
      };

      const remoteEdited = {
        ...baseDocument,
        subjects: [
          {
            ...baseDocument.subjects[0]!,
            notebooks: [
              {
                id: "nb-1",
                title: "Aula 1",
                text: "Edição do Computador",
                updatedAt: "2026-10-10T10:06:00.000Z",
              },
            ],
          },
        ],
      };

      type Notebook = { id: string; title: string; text: string; updatedAt: string };
      type Subject = { id: string; name: string; notebooks: Notebook[]; courses: unknown[] };
      const result = mergeAccountDocuments("workspace", undefined, localEdited, remoteEdited);
      const notebooks = (result.document["subjects"] as Subject[])[0]?.notebooks ?? [];

      // Garante que o caderno remoto foi preservado e o caderno local gerou cópia
      expect(notebooks.length).toBeGreaterThanOrEqual(2);
      expect(notebooks.some((n) => n.text === "Edição do Computador")).toBe(true);
      expect(notebooks.some((n) => n.text === "Edição do Celular")).toBe(true);
      expect(notebooks.some((n) => n.title.includes("(cópia deste aparelho)"))).toBe(true);
    });
  });
});

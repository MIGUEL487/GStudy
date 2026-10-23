import { describe, expect, it, vi } from "vitest";
import {
  autoScrollPreservingUser,
  isScrolledNearBottom,
  STREAMING_THROTTLE_MS,
} from "@/lib/streaming-ai";
import { canFallback, safeAiFailure } from "@/lib/ai-errors";

describe("Bloco 6: IA com Streaming e Fallback", () => {
  describe("6.1 Streaming Progressivo e Auto-scroll Respeitoso", () => {
    it("STREAMING_THROTTLE_MS está configurado para ~50ms", () => {
      expect(STREAMING_THROTTLE_MS).toBe(50);
    });

    it("isScrolledNearBottom detecta se o usuário está perto do final", () => {
      const mockElement = {
        scrollHeight: 1000,
        scrollTop: 720,
        clientHeight: 250, // 1000 - 720 - 250 = 30px distance <= 80px threshold
      } as HTMLElement;

      expect(isScrolledNearBottom(mockElement, 80)).toBe(true);
    });

    it("isScrolledNearBottom detecta quando o usuário rolou para cima", () => {
      const mockElement = {
        scrollHeight: 1000,
        scrollTop: 200, // 1000 - 200 - 250 = 550px distance > 80px threshold
        clientHeight: 250,
      } as HTMLElement;

      expect(isScrolledNearBottom(mockElement, 80)).toBe(false);
    });

    it("autoScrollPreservingUser não força rolagem se o usuário rolou para cima", () => {
      const scrollToMock = vi.fn();
      const mockElement = {
        scrollHeight: 1000,
        scrollTop: 200,
        clientHeight: 250,
        scrollTo: scrollToMock,
      } as unknown as HTMLElement;

      // forceBottom = false
      autoScrollPreservingUser(mockElement, false);
      expect(scrollToMock).not.toHaveBeenCalled();

      // forceBottom = true (ex: usuário enviou nova pergunta)
      autoScrollPreservingUser(mockElement, true);
      expect(scrollToMock).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    });

    it("autoScrollPreservingUser rola suavemente se já estiver no final", () => {
      const scrollToMock = vi.fn();
      const mockElement = {
        scrollHeight: 1000,
        scrollTop: 730,
        clientHeight: 250,
        scrollTo: scrollToMock,
      } as unknown as HTMLElement;

      autoScrollPreservingUser(mockElement, false);
      expect(scrollToMock).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    });
  });

  describe("6.2 Auditoria da Cadeia de Fallback da IA", () => {
    it("permite fallback em erros de autenticação, cota, 429, 5xx e timeout", () => {
      // 401 / 403 / 404 Auth / Not found
      expect(canFallback({ statusCode: 401 })).toBe(true);
      expect(canFallback({ statusCode: 403 })).toBe(true);
      expect(canFallback({ statusCode: 404 })).toBe(true);

      // 429 Rate Limit
      expect(canFallback({ statusCode: 429 })).toBe(true);

      // 500, 502, 503 Server Errors
      expect(canFallback({ statusCode: 500 })).toBe(true);
      expect(canFallback({ statusCode: 502 })).toBe(true);
      expect(canFallback({ statusCode: 503 })).toBe(true);

      // Timeout / Abort
      expect(canFallback({ name: "TimeoutError" })).toBe(true);
      expect(canFallback({ name: "AbortError" })).toBe(true);
      expect(canFallback({ code: "ETIMEDOUT" })).toBe(true);
      expect(canFallback({ code: "ECONNRESET" })).toBe(true);
    });

    it("sanitiza logs sem vazar chaves de API, tokens nem dados sensíveis", () => {
      const sensitiveError = new Error(
        "Request failed to https://api.groq.com/openai/v1/chat/completions with key gsk_abc12345secret and prompt: Aluno secreto",
      );

      const safe = safeAiFailure(sensitiveError, { groq: true });
      expect(safe.message).not.toContain("gsk_abc12345secret");
      expect(safe.message).not.toContain("https://api.groq.com");
      expect(safe.message).not.toContain("Aluno secreto");
    });
  });
});

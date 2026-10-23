import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStreamingText } from "@/lib/streaming-ai";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("Estado incremental da mensagem atual", () => {
  it("preserva texto parcial e cancela mesmo durante uma espera por rede", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const source = async function* () {
      yield "Primeiro trecho";
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      yield " não deve aparecer";
    };
    const { result } = renderHook(() => useStreamingText());
    let work!: ReturnType<typeof result.current.start>;
    act(() => {
      work = result.current.start(source());
    });
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(result.current.text).toBe("Primeiro trecho");
    await act(async () => {
      result.current.stop();
      await work;
    });
    expect(result.current.isStopped).toBe(true);
    expect(result.current.text).toBe("Primeiro trecho");
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(result.current.text).toBe("Primeiro trecho");
  });
  it("uma resposta antiga não altera a nova e strings completas não simulam digitação", async () => {
    let resolve!: (text: string) => void;
    const { result } = renderHook(() => useStreamingText());
    let old!: ReturnType<typeof result.current.start>;
    act(() => {
      old = result.current.start(
        () =>
          new Promise<string>((done) => {
            resolve = done;
          }),
      );
    });
    await act(async () => {
      await result.current.start("Resposta nova");
      await old;
    });
    expect(result.current.text).toBe("Resposta nova");
    expect(result.current.isStreaming).toBe(false);
    await act(async () => {
      resolve("Resposta antiga");
    });
    expect(result.current.text).toBe("Resposta nova");
  });
  it("mantém o texto recebido quando o transporte falha", async () => {
    const source = async function* () {
      yield "Parte já recebida";
      throw new Error("Rede interrompida");
    };
    const { result } = renderHook(() => useStreamingText());
    await act(async () => {
      await result.current.start(source());
    });
    expect(result.current.text).toBe("Parte já recebida");
    expect(result.current.error).toBe("Rede interrompida");
    expect(result.current.isStopped).toBe(false);
  });
});

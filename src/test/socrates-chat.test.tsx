import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reply: vi.fn(), quota: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/socrates.functions", () => ({
  socratesReply: mocks.reply,
  getSocratesQuota: mocks.quota,
}));
vi.mock("@/components/study-provider", () => ({
  useStudy: () => ({ data: { subjects: [{ id: "math", name: "Matemática" }] } }),
}));
import { SocratesChat } from "@/components/socrates-chat";
import { socratesStorageKey, readSocratesDocument } from "@/lib/socrates-model";
const user = "11111111-1111-4111-8111-111111111111";
const quota = {
  limit: 50000,
  used: 300,
  remaining: 49700,
  day: "2026-10-17",
  resetsAt: "2026-10-18T03:00:00Z",
};
const response = {
  ok: true,
  explanation:
    "Uma metade é uma das duas partes iguais de uma unidade. Por isso duas metades completam a unidade e dividir 1 por ½ resulta em 2.",
  question: "Por que duas metades formam uma unidade?",
  quota,
};
const send = async () => {
  fireEvent.change(screen.getByLabelText("Sua pergunta ou explicação"), {
    target: { value: "Por que dividir por metade dá o dobro?" },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Enviar para Sócrates" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Enviar para Sócrates" }));
};
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.quota.mockResolvedValue({ ok: true, quota });
  mocks.reply.mockResolvedValue(response);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Aba Sócrates", () => {
  it("mostra a explicação e termina com a pergunta; reabre a conversa salva sem nova geração", async () => {
    const view = render(<SocratesChat userId={user} />);
    await send();
    expect(await screen.findByText(response.question)).toBeInTheDocument();
    const log = screen.getByRole("log", { name: "Conversa com Sócrates" });
    expect(within(log).getByText(response.explanation)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        readSocratesDocument(localStorage.getItem(socratesStorageKey(user))).conversations[0]!
          .messages,
      ).toHaveLength(2),
    );
    expect(screen.getByText("49.700 tokens disponíveis")).toBeInTheDocument();
    const saved = readSocratesDocument(localStorage.getItem(socratesStorageKey(user)));
    view.unmount();
    render(<SocratesChat userId={user} />);
    fireEvent.change(screen.getByLabelText("Suas conversas"), {
      target: { value: saved.conversations[0]!.id },
    });
    expect(screen.getByText(response.question)).toBeInTheDocument();
    expect(mocks.reply).toHaveBeenCalledTimes(1);
  });
  it("mantém a pergunta editável quando a IA falha", async () => {
    mocks.reply.mockResolvedValue({
      ok: false,
      error: "Tente novamente. Nenhum token foi descontado.",
      quota,
    });
    render(<SocratesChat userId={user} />);
    await send();
    expect(await screen.findByRole("alert")).toHaveTextContent("Nenhum token");
    expect(screen.getByLabelText("Sua pergunta ou explicação")).toHaveValue(
      "Por que dividir por metade dá o dobro?",
    );
    expect(
      readSocratesDocument(localStorage.getItem(socratesStorageKey(user))).conversations[0]!
        .messages,
    ).toHaveLength(0);
  });
  it("bloqueia novos gastos sem cota e explica a renovação", async () => {
    mocks.quota.mockResolvedValue({ ok: true, quota: { ...quota, used: 50000, remaining: 0 } });
    render(<SocratesChat userId={user} />);
    expect(await screen.findByText(/novos tokens chegam/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Sua pergunta ou explicação"), {
      target: { value: "Uma dúvida." },
    });
    expect(screen.getByRole("button", { name: "Enviar para Sócrates" })).toBeDisabled();
    expect(mocks.reply).not.toHaveBeenCalled();
  });
  it("não cobra outra geração para tentar salvar uma resposta pronta", async () => {
    let storage: ReturnType<typeof vi.spyOn>;
    mocks.reply.mockImplementation(async () => {
      storage = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
        throw new Error("full");
      });
      return response;
    });
    render(<SocratesChat userId={user} />);
    await send();
    const retry = await screen.findByRole("button", { name: "Salvar resposta novamente" });
    expect(screen.getByText(response.question)).toBeInTheDocument();
    storage!.mockRestore();
    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Salvar resposta novamente" }),
      ).not.toBeInTheDocument(),
    );
    expect(mocks.reply).toHaveBeenCalledTimes(1);
    expect(
      readSocratesDocument(localStorage.getItem(socratesStorageKey(user))).conversations[0]!
        .messages,
    ).toHaveLength(2);
  });
  it("pede a migração antes de enviar quando o limite por conta ainda não está ativo", async () => {
    mocks.quota.mockResolvedValue({ ok: false, error: "Execute 0003_socrates.sql no Supabase." });
    render(<SocratesChat userId={user} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("0003_socrates.sql");
    expect(screen.getByRole("button", { name: "Enviar para Sócrates" })).toBeDisabled();
  });
});

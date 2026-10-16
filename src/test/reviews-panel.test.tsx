import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  vote: vi.fn(),
  reply: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/reviews-client", () => ({ reviewsApi: api }));
import { ReviewsPanel } from "@/components/reviews-panel";
const review = {
  id: "11111111-1111-4111-8111-111111111111",
  category: "review",
  rating: 5,
  body: "Gostei de estudar com a lousa.",
  anonymous: true,
  author: "Anônimo",
  isMine: false,
  createdAt: "2026-10-16T10:00:00Z",
  reply: null,
  repliedAt: null,
  up: 4,
  down: 0,
  myVote: 0,
};
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.list.mockResolvedValue({ isAdmin: false, items: [review], hasMore: false });
  api.create.mockResolvedValue("new-review");
  api.vote.mockResolvedValue(undefined);
  api.reply.mockResolvedValue(undefined);
});
afterEach(cleanup);
const open = async () => {
  render(<ReviewsPanel userId="ana" />);
  await screen.findByText(review.body);
};
describe("Avaliações e privacidade", () => {
  it("começa anônimo e envia a escolha de identificação explicitamente", async () => {
    await open();
    expect(screen.getByRole("radio", { name: /Anônimo/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Mostrar meu nome/ }));
    fireEvent.change(screen.getByLabelText("Conte um pouco mais"), {
      target: { value: "A lousa ajuda a visualizar as ideias." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar avaliação" }));
    });
    expect(api.create).toHaveBeenCalledWith({
      category: "review",
      rating: 4,
      message: "A lousa ajuda a visualizar as ideias.",
      anonymous: false,
    });
    expect(screen.getByLabelText("Conte um pouco mais")).toHaveValue("");
  });
  it("mantém o texto após falha e não publica feedbacks locais antigos automaticamente", async () => {
    localStorage.setItem(
      "gstudy.feedback.v1:ana",
      JSON.stringify({
        version: 1,
        entries: [
          {
            id: "old",
            category: "suggestion",
            rating: 4,
            message: "Um feedback antigo.",
            createdAt: "2026-10-15T10:00:00Z",
          },
        ],
      }),
    );
    api.create.mockRejectedValue(new Error("Sem conexão. Seu texto foi preservado."));
    await open();
    expect(api.create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Conte um pouco mais"), {
      target: { value: "Ainda preciso enviar esta avaliação." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar avaliação" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão");
    expect(screen.getByLabelText("Conte um pouco mais")).toHaveValue(
      "Ainda preciso enviar esta avaliação.",
    );
  });
  it("envia sugestões como privadas e não oferece a caixa administrativa para outra conta", async () => {
    await open();
    expect(screen.queryByRole("button", { name: "Sugestões recebidas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Responder" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("O que você quer enviar?"), {
      target: { value: "suggestion" },
    });
    expect(
      screen.getByText(
        "A sugestão ficará disponível apenas para você e o responsável pelo GStudy.",
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Conte um pouco mais"), {
      target: { value: "Sugestão particular sobre os cadernos." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar sugestão" }));
    });
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ category: "suggestion", anonymous: true }),
    );
    await waitFor(() => expect(api.list).toHaveBeenCalledWith("mine", "recent", 0));
  });
  it("ordena por utilidade e alterna o voto sem permitir voto no próprio envio", async () => {
    api.list.mockResolvedValue({
      isAdmin: false,
      items: [{ ...review, myVote: 1 }],
      hasMore: false,
    });
    await open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Avaliação útil" }));
    });
    expect(api.vote).toHaveBeenCalledWith(review.id, 0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mais úteis" }));
    });
    expect(api.list).toHaveBeenLastCalledWith("reviews", "helpful", 0);
    api.list.mockResolvedValue({
      isAdmin: false,
      items: [{ ...review, isMine: true }],
      hasMore: false,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Meus envios" }));
    });
    expect(screen.getByRole("button", { name: "Avaliação útil" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Avaliação não útil" })).toBeDisabled();
  });
  it("mostra a caixa de sugestões e publica a resposta somente com permissão do servidor", async () => {
    api.list.mockResolvedValue({ isAdmin: true, items: [review], hasMore: false });
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Sugestões recebidas" }));
    await waitFor(() => expect(api.list).toHaveBeenCalledWith("suggestions", "recent", 0));
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    fireEvent.change(screen.getByLabelText("Resposta do responsável"), {
      target: { value: "Obrigado! A melhoria está disponível." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publicar resposta" }));
    });
    expect(api.reply).toHaveBeenCalledWith(review.id, "Obrigado! A melhoria está disponível.");
  });
});

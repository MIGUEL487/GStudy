import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HeartsProvider } from "@/components/hearts-provider";
import {
  useLessonHearts,
  LessonHeartsIndicator,
  BreathPauseScreen,
  Finish,
} from "@/components/lesson";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
const eventId = "11111111-1111-4111-8111-111111111111";
const state = (hearts: number) => ({
  hearts,
  max: 3,
  regen_minutes: 120,
  server_now: new Date().toISOString(),
  next_at: hearts === 3 ? null : new Date(Date.now() + 7200000).toISOString(),
});
function Harness() {
  const h = useLessonHearts();
  return (
    <>
      <LessonHeartsIndicator hearts={h.hearts} />
      <span>{h.error}</span>
      <button onClick={() => void h.deductHeart(eventId)}>Errar</button>
      <button onClick={h.rechargeHearts}>Atualizar</button>
    </>
  );
}
const open = () =>
  render(
    <HeartsProvider userId="student">
      <Harness />
    </HeartsProvider>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: state(3), error: null });
});
describe("Corações confirmados pelo servidor", () => {
  it("consulta 3 corações, envia um ID de resposta e não inventa recarga", async () => {
    open();
    await screen.findByLabelText("3 vidas restantes");
    mocks.rpc.mockResolvedValueOnce({ data: state(2), error: null });
    fireEvent.click(screen.getByText("Errar"));
    await screen.findByLabelText("2 vidas restantes");
    expect(mocks.rpc).toHaveBeenLastCalledWith("lose_learning_heart", { p_event_id: eventId });
    mocks.rpc.mockResolvedValueOnce({ data: state(2), error: null });
    fireEvent.click(screen.getByText("Atualizar"));
    await waitFor(() => expect(mocks.rpc).toHaveBeenLastCalledWith("get_learning_hearts", {}));
    expect(screen.getByLabelText("2 vidas restantes")).toBeInTheDocument();
  });
  it("não desconta localmente quando o servidor falha", async () => {
    open();
    await screen.findByLabelText("3 vidas restantes");
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202", message: "function missing" },
    });
    fireEvent.click(screen.getByText("Errar"));
    await screen.findByText(/aguardando uma atualização/);
    expect(screen.getByLabelText("3 vidas restantes")).toBeInTheDocument();
  });
  it("oferece revisão gratuita e consulta, sem botão de recarga instantânea", () => {
    const review = vi.fn(),
      refresh = vi.fn();
    render(
      <BreathPauseScreen
        onReview={review}
        onRecharge={refresh}
        countdown="Próximo coração em 1 h 24 min"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Revisar erros sem custo" }));
    expect(review).toHaveBeenCalledOnce();
    expect(screen.getByText("Próximo coração em 1 h 24 min")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Recarregar/ })).not.toBeInTheDocument();
  });
  it("mostra pontuação da prática sem alegar XP ainda não confirmado", () => {
    render(
      <Finish xp={50} title="Prática concluída" line="Seu progresso foi salvo." again={vi.fn()} />,
    );
    expect(screen.getByLabelText("Pontuação desta prática: 50")).toBeInTheDocument();
    expect(screen.getByText(/XP e ofensiva são registrados pelo servidor/)).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  useLessonHearts,
  LessonHeartsIndicator,
  BreathPauseScreen,
  Finish,
} from "@/components/lesson";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    [key: string]: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/aprender" }),
}));

function HeartsTestHarness() {
  const { hearts, shaking, isExhausted, deductHeart, rechargeHearts } = useLessonHearts(5);

  return (
    <div>
      <LessonHeartsIndicator hearts={hearts} shaking={shaking} />
      <button onClick={deductHeart}>Errar</button>
      <button onClick={rechargeHearts}>Recarregar</button>
      {isExhausted && <div data-testid="exhausted">Sem vidas</div>}
    </div>
  );
}

describe("Bloco 4: Sistema de Vidas (Corações) e Troféu de XP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Sistema de Vidas (Corações)", () => {
    it("inicia com 5 corações e desconta 1 vida a cada erro", () => {
      render(<HeartsTestHarness />);

      expect(screen.getByLabelText("5 vidas restantes")).toBeInTheDocument();

      // 1º erro
      fireEvent.click(screen.getByText("Errar"));
      expect(screen.getByLabelText("4 vidas restantes")).toBeInTheDocument();

      // 2º erro
      fireEvent.click(screen.getByText("Errar"));
      expect(screen.getByLabelText("3 vidas restantes")).toBeInTheDocument();
    });

    it("ativa tela de pausa ao zerar vidas e permite recarregar", () => {
      render(<HeartsTestHarness />);

      // Erra 5 vezes
      for (let i = 0; i < 5; i++) {
        fireEvent.click(screen.getByText("Errar"));
      }

      expect(screen.getByLabelText("0 vidas restantes")).toBeInTheDocument();
      expect(screen.getByTestId("exhausted")).toBeInTheDocument();

      // Recarrega
      fireEvent.click(screen.getByText("Recarregar"));
      expect(screen.getByLabelText("5 vidas restantes")).toBeInTheDocument();
      expect(screen.queryByTestId("exhausted")).not.toBeInTheDocument();
    });
  });

  describe("Tela Pausa para Respirar (BreathPauseScreen)", () => {
    it("exibe mensagem encorajadora e botão para recarregar revisando o caderno", () => {
      const onRecharge = vi.fn();

      render(<BreathPauseScreen onRecharge={onRecharge} backTo="/aprender" />);

      expect(screen.getByText("Pausa para respirar")).toBeInTheDocument();
      expect(
        screen.getByText(/Errar é a forma como o cérebro mapeia onde precisa de mais atenção/i),
      ).toBeInTheDocument();

      const rechargeBtn = screen.getByRole("button", {
        name: /Recarregar revisando o caderno/i,
      });
      fireEvent.click(rechargeBtn);
      expect(onRecharge).toHaveBeenCalledTimes(1);

      expect(screen.getByText("Voltar à trilha")).toBeInTheDocument();
    });
  });

  describe("Troféu de XP Comemorativo (Finish)", () => {
    it("renderiza o troféu, contagem de XP e foca no botão Continuar jornada", () => {
      const again = vi.fn();

      render(
        <Finish
          xp={50}
          title="Excelente trabalho!"
          line="Você concluiu todas as questões com foco e calma."
          again={again}
          summary="Fixação do conceito de Termodinâmica concluída."
        />,
      );

      expect(screen.getByText("Excelente trabalho!")).toBeInTheDocument();
      expect(
        screen.getByText("Fixação do conceito de Termodinâmica concluída."),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Ganhos: 50 pontos de experiência")).toBeInTheDocument();

      const continueBtn = screen.getByRole("link", { name: /Continuar jornada/i });
      expect(continueBtn).toBeInTheDocument();
    });
  });
});

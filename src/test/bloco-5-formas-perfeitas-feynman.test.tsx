import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Whiteboard } from "@/components/whiteboard";
import { FeynmanLesson } from "@/routes/aprender.feynman";
import { students, studentOf } from "@/lib/students";
import { studentPersonas } from "@/lib/learning-ai";
import { detectPerfectShape } from "@/lib/shape-detector";

const mocks = vi.hoisted(() => ({
  reply: vi.fn(),
  isLoading: vi.fn(),
  snapshot: vi.fn(),
  clear: vi.fn(),
  award: vi.fn(),
  begin: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children, to, ...props }: { children: ReactNode; to: string; search?: unknown }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/learn.functions", () => ({ feynmanReply: mocks.reply }));
vi.mock("@/lib/learn-client", () => ({
  idsFrom: (value?: string) => (value ? value.split(",") : []),
  awardXp: mocks.award,
}));
vi.mock("@/components/learning-provider", () => ({
  useLessonContext: () => ({
    ready: true,
    allowed: true,
    complete: mocks.complete,
    backSearch: {},
    context: undefined,
  }),
}));
vi.mock("@/hooks/use-daily-attempt", () => ({
  useDailyAttempt: () => ({
    remaining: 2,
    begin: mocks.begin,
    succeed: mocks.succeed,
    fail: mocks.fail,
  }),
}));

beforeEach(() => {
  vi.useRealTimers();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => ({
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      ellipse: vi.fn(),
      closePath: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      measureText: vi.fn(() => ({ width: 40 })),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      setLineDash: vi.fn(),
    })),
  });
  vi.clearAllMocks();
  mocks.isLoading.mockReturnValue(false);
  mocks.reply.mockReset();
  mocks.begin.mockReset().mockReturnValue("session-token");
  mocks.snapshot.mockReturnValue(undefined);
  mocks.award.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("Bloco 5: Formas Perfeitas, Espessura na Lousa e Personas do Feynman", () => {
  describe("5.1 Lousa - Seletor de Espessura e Formas Perfeitas", () => {
    it("exibe seletor de espessura com 3 níveis (Fino 2px, Médio 4px, Grosso 8px) nas ferramentas de desenho", () => {
      render(<Whiteboard variant="paper" />);

      const brushGroup = screen.getByRole("group", { name: "Espessura do traço" });
      expect(brushGroup).toBeInTheDocument();

      const finoBtn = within(brushGroup).getByRole("button", { name: "Espessura Fino" });
      const medioBtn = within(brushGroup).getByRole("button", { name: "Espessura Médio" });
      const grossoBtn = within(brushGroup).getByRole("button", { name: "Espessura Grosso" });

      expect(finoBtn).toBeInTheDocument();
      expect(medioBtn).toBeInTheDocument();
      expect(grossoBtn).toBeInTheDocument();

      // Padrão é Médio (4px)
      expect(medioBtn).toHaveAttribute("aria-pressed", "true");
      expect(finoBtn).toHaveAttribute("aria-pressed", "false");

      // Clica em Fino
      fireEvent.click(finoBtn);
      expect(finoBtn).toHaveAttribute("aria-pressed", "true");
      expect(medioBtn).toHaveAttribute("aria-pressed", "false");

      // Clica em Grosso
      fireEvent.click(grossoBtn);
      expect(grossoBtn).toHaveAttribute("aria-pressed", "true");
    });

    it("alterna para seletor de tamanho de texto ao selecionar ferramenta Texto", () => {
      render(<Whiteboard variant="paper" />);

      // Inicialmente em Pen -> espessura do traço
      expect(screen.getByRole("group", { name: "Espessura do traço" })).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Tamanho do texto" })).not.toBeInTheDocument();

      // Ativa ferramenta Texto
      fireEvent.click(screen.getByRole("button", { name: "Texto" }));

      // Agora exibe tamanho do texto (P, M, G)
      expect(screen.getByRole("group", { name: "Tamanho do texto" })).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Espessura do traço" })).not.toBeInTheDocument();
    });

    it("detecta retângulo quando traço é desenhado com paradas e fechado", () => {
      // Simula traço retangular fechado
      const rectPoints = [
        { x: 50, y: 50 },
        { x: 150, y: 50 },
        { x: 250, y: 50 },
        { x: 250, y: 100 },
        { x: 250, y: 150 },
        { x: 150, y: 150 },
        { x: 50, y: 150 },
        { x: 50, y: 100 },
        { x: 50, y: 50 },
      ];

      const detected = detectPerfectShape(rectPoints);
      expect(detected).not.toBeNull();
      expect(detected?.tool).toBe("rectangle");
    });

    it("detecta triângulo quando polígono simplificado possui 3 vértices", () => {
      const triPoints = [
        { x: 100, y: 50 },
        { x: 150, y: 150 },
        { x: 200, y: 250 },
        { x: 100, y: 250 },
        { x: 0, y: 250 },
        { x: 50, y: 150 },
        { x: 100, y: 50 },
      ];

      const detected = detectPerfectShape(triPoints);
      expect(detected).not.toBeNull();
      expect(detected?.tool).toBe("triangle");
    });

    it("detecta círculo quando pontos fechados são uniformemente equidistantes", () => {
      const circlePoints = [];
      for (let angle = 0; angle <= Math.PI * 2; angle += 0.25) {
        circlePoints.push({
          x: 100 + 40 * Math.cos(angle),
          y: 100 + 40 * Math.sin(angle),
        });
      }

      const detected = detectPerfectShape(circlePoints);
      expect(detected).not.toBeNull();
      expect(detected?.tool).toBe("ellipse");
      expect(detected?.shapeName).toBe("circle");
    });
  });

  describe("5.2 Feynman - Proporção 2:1 e Abas Mobile", () => {
    const startFeynman = () => {
      render(<FeynmanLesson materialSearch="mat-1" />);
      fireEvent.change(screen.getByPlaceholderText("Qual é o tema da aula? Ex.: Fotossíntese"), {
        target: { value: "Fotossíntese" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Começar a aula" }));
    };

    it("renderiza layout 2:1 com abas mobile e áreas de lousa e explicação", () => {
      startFeynman();

      // Abas mobile
      const mobileTabs = screen.getByRole("tablist", { name: "Visualização da aula" });
      expect(mobileTabs).toBeInTheDocument();

      const lousaTab = within(mobileTabs).getByRole("tab", { name: "Lousa" });
      const explicacaoTab = within(mobileTabs).getByRole("tab", { name: "Explicação" });

      expect(lousaTab).toHaveAttribute("aria-selected", "true");
      expect(explicacaoTab).toHaveAttribute("aria-selected", "false");

      // Clica na aba Explicação
      fireEvent.click(explicacaoTab);
      expect(explicacaoTab).toHaveAttribute("aria-selected", "true");
      expect(lousaTab).toHaveAttribute("aria-selected", "false");
    });
  });

  describe("5.3 Feynman - 3 Personas de Estudantes", () => {
    it("define as 3 personas principais (Criança de 8 anos curiosa, Colega de classe, Professora sênior)", () => {
      expect(studentPersonas.gui.archetype).toContain("criança de 8 anos");
      expect(studentPersonas.gui.style).toContain("simples e inocente");

      expect(studentPersonas.lia.archetype).toContain("colega de classe");
      expect(studentPersonas.lia.style).toContain("vestibular e exercícios");

      expect(studentPersonas.maya.archetype).toContain("professora sênior exigente");
      expect(studentPersonas.maya.style).toContain("rigor conceitual");
    });

    it("apresenta saudações personalizadas para cada persona", () => {
      const guiGreeting = studentOf("gui").greeting("Gravidade");
      expect(guiGreeting).toContain("8 anos");
      expect(guiGreeting).toContain("curioso");

      const liaGreeting = studentOf("lia").greeting("Gravidade");
      expect(liaGreeting).toContain("Lia");
      expect(liaGreeting).toContain("prova");

      const mayaGreeting = studentOf("maya").greeting("Gravidade");
      expect(mayaGreeting).toContain("Maya");
      expect(mayaGreeting).toContain("rigor conceitual");
    });
  });
});

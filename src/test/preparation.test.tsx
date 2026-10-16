import { useState, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  research: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  navigate: vi.fn(),
  update: vi.fn(),
  data: {
    schoolYear: "fundamental-8",
    subjects: [
      {
        id: "math",
        name: "Matemática",
        notebooks: [
          {
            id: "note",
            title: "Geometria",
            text: "Áreas de figuras planas.",
            updatedAt: "2026-10-16",
          },
        ],
        courses: [],
      },
    ],
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  useNavigate: () => mocks.navigate,
  Link: ({
    to,
    search: _search,
    children,
    ...props
  }: {
    to: string;
    search?: unknown;
    children: ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/preparation-library.functions", () => ({
  getPreparationYouTubeStatus: async () => ({ youtubeConfigured: true }),
  curatePreparationLibrary: async () => ({
    version: 1,
    checkedAt: "2026-10-16T12:00:00.000Z",
    mode: "unavailable",
    videos: [],
    books: [
      {
        title: "O Homem que Calculava",
        author: "Malba Tahan",
        topicIndex: 2,
        reason: "Pratique o raciocínio com desafios.",
        access: "paid",
      },
    ],
  }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/components/study-provider", () => ({
  useStudy: () => ({ data: mocks.data, ready: true, update: mocks.update }),
}));
vi.mock("@/components/learning-provider", () => ({
  useLearning: () => ({ plans: [], ready: true, savePlan: mocks.save }),
}));
vi.mock("@/lib/preparation.functions", () => ({
  researchPreparation: mocks.research,
  createPreparationPath: mocks.create,
}));
vi.mock("@/lib/learn-client", () => ({ useMaterials: () => ({ items: [], reload: vi.fn() }) }));
vi.mock("@/components/learning-materials", () => ({
  AddMaterial: () => <div>Adicionar material</div>,
}));
import { PreparationPage } from "@/routes/preparar";
import { GoalDial } from "@/components/goal-dial";
import { dragGoal, goalAngle } from "@/lib/preparation-model";

import { preparationGuide } from "./helpers/preparation-fixture";

const research = {
  report:
    "### Antes de montar sua trilha\nQuais conceitos de geometria você conhece? Qual é sua dificuldade? Que nível fará?",
  sources: [{ title: "OBMEP", url: "https://www.obmep.org.br/" }],
  mode: "web",
  researchedAt: "2026-10-16T12:00:00.000Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.research.mockResolvedValue(research);
  mocks.save.mockReturnValue(true);
  mocks.update.mockReturnValue(true);
  mocks.create.mockResolvedValue({
    guide: preparationGuide,
    overview: "Uma preparação focada em geometria.",
    brief: "Pratique geometria no nível 2, relacionando áreas e lados.",
    topics: ["Áreas", "Ângulos", "Problemas"].map((title) => ({
      title,
      goal: "Compreender " + title,
      challenge: "Explique por que isso funciona.",
    })),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const openQuestions = async () => {
  render(<PreparationPage />);
  fireEvent.click(screen.getByRole("radio", { name: /Olimpíada/ }));
  fireEvent.change(screen.getByLabelText("Qual é a olimpíada?"), { target: { value: "OBMEP" } });
  fireEvent.change(screen.getByLabelText(/Edição, nível/), { target: { value: "Nível 2, 2027" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Matemática" }));
  fireEvent.change(screen.getByLabelText(/Algum assunto/), { target: { value: "Geometria" } });
  fireEvent.click(screen.getByRole("button", { name: "Conversar com a IA" }));
  await screen.findByText("Fontes consultadas");
};
describe("Preparação personalizada", () => {
  it("cria um plano próprio com roteiro, recursos e tempo diário na área Rumo à prova", async () => {
    await openQuestions();
    expect(mocks.research).toHaveBeenCalledWith({
      data: {
        kind: "olimpiada",
        exam: "OBMEP",
        edition: "Nível 2, 2027",
        schoolYear: "fundamental-8",
        subject: "Matemática",
        focus: "Geometria",
      },
    });
    fireEvent.change(screen.getByLabelText("Suas respostas para a IA"), {
      target: { value: "Preciso entender áreas e já conheço ângulos." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Escolher minha meta" }));
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    fireEvent.click(screen.getByText("Personalizar com meu conteúdo"));
    fireEvent.click(screen.getByLabelText(/Geometria.*Seu caderno/));
    fireEvent.click(screen.getByRole("button", { name: "Montar meu plano" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    const plan = mocks.save.mock.calls[0]![0];
    expect(plan.preparation).toMatchObject({
      target: 81,
      schoolYear: "fundamental-8",
      kind: "olimpiada",
      answers: "Preciso entender áreas e já conheço ângulos.",
    });
    expect(plan.notes).toContain("Áreas de figuras planas.");
    expect(plan.notes).toContain("81% de acertos");
    expect(plan.preparation.guide).toEqual(preparationGuide);
    expect(plan.preparation.dailyMinutes).toBe(30);
    expect(plan.completed).toEqual({});
    expect(plan.topics).toHaveLength(3);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/preparar", search: { p: plan.id } });
  });
  it("reaproveita a geração se o armazenamento falhar, sem gastar outra chamada de IA", async () => {
    await openQuestions();
    fireEvent.click(screen.getByRole("button", { name: "Escolher minha meta" }));
    mocks.save.mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Montar meu plano" }));
    await screen.findByRole("alert");
    expect(mocks.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar salvar plano" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.save.mock.calls[0]![0].id).toBe(mocks.save.mock.calls[1]![0].id);
  });
  it("preserva a matéria e o foco quando a pesquisa falha e permite tentar novamente", async () => {
    mocks.research.mockRejectedValueOnce(new Error("Pesquisa indisponível."));
    render(<PreparationPage />);
    fireEvent.change(screen.getByLabelText("Qual é a prova?"), { target: { value: "Bimestral" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Matemática" }));
    fireEvent.change(screen.getByLabelText(/Algum assunto/), { target: { value: "Áreas" } });
    fireEvent.click(screen.getByRole("button", { name: "Conversar com a IA" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pesquisa indisponível.");
    expect(screen.getByLabelText(/Algum assunto/)).toHaveValue("Áreas");
    expect(screen.getByRole("button", { name: "Matemática" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Conversar com a IA" }));
    await screen.findByText("Fontes consultadas");
    expect(mocks.research).toHaveBeenCalledTimes(2);
  });
});
describe("Meta circular acessível", () => {
  it("mapeia toda a volta e prende nos extremos sem saltar de 100% para 0%", () => {
    expect(goalAngle(0, -100)).toBeCloseTo(0);
    expect(goalAngle(100, 0)).toBeCloseTo(25);
    expect(goalAngle(0, 100)).toBeCloseTo(50);
    expect(goalAngle(-100, 0)).toBeCloseTo(75);
    expect(dragGoal(99, 99, 1)).toBe(100);
    expect(dragGoal(1, 1, 99)).toBe(0);
    expect(dragGoal(100, 1, 0)).toBe(99);
  });
  it("oferece teclado e botões sem perder os limites", () => {
    function Dial() {
      const [value, setValue] = useState(80);
      return <GoalDial value={value} onChange={setValue} />;
    }
    render(<Dial />);
    const slider = screen.getByRole("slider", { name: "Meta de aproveitamento" });
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("button", { name: "Aumentar meta" })).toBeDisabled();
    fireEvent.keyDown(slider, { key: "Home" });
    expect(slider).toHaveAttribute("aria-valuenow", "0");
    fireEvent.click(screen.getByRole("button", { name: "Aumentar meta" }));
    expect(slider).toHaveAttribute("aria-valuenow", "5");
    fireEvent.keyDown(slider, { key: "PageUp" });
    expect(slider).toHaveAttribute("aria-valuenow", "15");
  });
});

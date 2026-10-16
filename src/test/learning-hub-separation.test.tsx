import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ plans: [] as unknown[], search: {} as { p?: string } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ useSearch: () => mocks.search }),
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string;
    search?: { p?: string };
    children: ReactNode;
  }) => (
    <a href={to + (search?.p ? "?p=" + search.p : "")} {...props}>
      {children}
    </a>
  ),
  Navigate: ({ to, search }: { to: string; search: { p?: string } }) => (
    <div data-testid="redirect">
      {to}?p={search.p}
    </div>
  ),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/components/study-provider", () => ({
  useStudy: () => ({
    ready: true,
    data: { subjects: [{ id: "math", name: "Matemática", notebooks: [], courses: [] }] },
  }),
}));
vi.mock("@/components/learning-provider", () => ({
  useLearning: () => ({ ready: true, plans: mocks.plans, savePlan: vi.fn(), removePlan: vi.fn() }),
}));
vi.mock("@/lib/learn-client", () => ({
  useMaterials: () => ({ items: [], reload: vi.fn(), remove: vi.fn() }),
  useStats: () => ({ xp: 0, streak: 0 }),
  levelOf: () => ({ level: 1, into: 0 }),
}));
vi.mock("@/hooks/use-daily-attempt", () => ({ useDailyAttempt: () => ({ remaining: 2 }) }));
vi.mock("@/lib/learning.functions", () => ({ createLearningPath: vi.fn() }));
vi.mock("@/components/learning-materials", () => ({
  AddMaterial: () => null,
  MaterialCard: () => null,
}));
import { LearnHub } from "@/routes/aprender.index";
import { preparationGuide } from "./helpers/preparation-fixture";

beforeEach(() => {
  mocks.search = {};
  const base = {
    subjectId: "math",
    subject: "Matemática",
    overview: "Fundamentos",
    materialIds: [],
    notes: "",
    topics: [{ id: "topic", title: "Áreas", goal: "Entender", challenge: "Explique" }],
    completed: {},
    createdAt: "2026-10-16T12:00:00.000Z",
  };
  mocks.plans = [
    { ...base, id: "learning", topic: "Matemática básica" },
    { ...base, id: "exam", topic: "OBMEP exclusiva", preparation: { guide: preparationGuide } },
  ];
});
afterEach(() => cleanup());
describe("Aprender separado de Rumo à prova", () => {
  it("lista e conta apenas trilhas de aprendizagem", () => {
    render(<LearnHub />);
    expect(screen.getByRole("link", { name: /Matemática básica/ })).toHaveAttribute(
      "href",
      "/aprender?p=learning",
    );
    expect(screen.queryByText("OBMEP exclusiva")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Matemática.*1 trilha/ })).toBeInTheDocument();
    expect(screen.getByText("1 trilha(s)")).toBeInTheDocument();
  });
  it("encaminha links antigos de preparação para o painel correto", () => {
    mocks.search = { p: "exam" };
    render(<LearnHub />);
    expect(screen.getByTestId("redirect")).toHaveTextContent("/preparar?p=exam");
    expect(screen.queryByText("Um conceito de cada vez.")).not.toBeInTheDocument();
  });
});

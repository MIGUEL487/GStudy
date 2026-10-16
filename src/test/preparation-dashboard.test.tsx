import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { libraryFixture } from "./helpers/library-fixture";
import { preparationGuide } from "./helpers/preparation-fixture";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), navigate: vi.fn(), library: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => "/preparar",
  Link: ({
    to,
    search,
    params,
    children,
    ...props
  }: {
    to: string;
    search?: { p?: string };
    params?: { subjectId?: string };
    children: ReactNode;
  }) => (
    <a
      href={to.replace("$subjectId", params?.subjectId ?? "") + (search?.p ? "?p=" + search.p : "")}
      {...props}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/lib/preparation-library.functions", () => ({ curatePreparationLibrary: mocks.library }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/components/auth-gate", () => ({ useAuth: () => ({ user: { id: "prep-student" } }) }));
vi.mock("@/lib/preparation.functions", () => ({ createPreparationPath: mocks.generate }));
import { PreparationDashboard } from "@/components/preparation-dashboard";
import { LearningProvider, useLearning } from "@/components/learning-provider";
import { learningKey, readLearning, type LearningPlan } from "@/lib/learning-model";
import {
  preparationMissionKey,
  preparationProgress,
  preparationResourceLink,
} from "@/lib/preparation-model";
import { fingerprint, mergeAccountDocuments } from "@/lib/account-sync-model";

const key = `${learningKey}:prep-student`;
const plan = (legacy = false): LearningPlan => ({
  id: "preparation-plan",
  subjectId: "math",
  subject: "Matemática",
  topic: "OBMEP · Geometria",
  overview: "Geometria com foco no raciocínio.",
  materialIds: [],
  notes: "Anotações pessoais preservadas.",
  topics: ["Áreas", "Ângulos", "Problemas"].map((title, index) => ({
    id: "topic-" + index,
    title,
    goal: "Compreender " + title,
    challenge: "Explique o raciocínio.",
  })),
  completed: { "topic-0:explain": "2026-10-16T12:00:00.000Z" },
  createdAt: "2026-10-16T12:00:00.000Z",
  preparation: {
    kind: "olimpiada",
    exam: "OBMEP",
    edition: "2027, nível 2",
    focus: "Geometria",
    schoolYear: "fundamental-8",
    target: 85,
    answers: "Tenho dificuldade com áreas.",
    dailyMinutes: 30,
    research: {
      report: "O regulamento deve ser confirmado na edição escolhida.",
      sources: [],
      mode: "knowledge",
      researchedAt: "2026-10-16T12:00:00.000Z",
    },
    ...(!legacy ? { guide: preparationGuide } : {}),
  },
});
function Workspace() {
  const { plans, ready } = useLearning();
  return ready && plans[0] ? <PreparationDashboard plan={plans[0]} /> : null;
}
const open = (legacy = false) => {
  localStorage.setItem(key, JSON.stringify({ version: 1, plans: [plan(legacy)] }));
  return render(
    <LearningProvider>
      <Workspace />
    </LearningProvider>,
  );
};
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.library.mockResolvedValue({
    version: 1,
    checkedAt: "2026-10-16T12:00:00.000Z",
    mode: "unavailable",
    videos: [],
    books: [],
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Rumo à prova com progresso próprio", () => {
  it("mostra roteiro, biblioteca e programa sem repetir as seis atividades", async () => {
    open();
    await screen.findByRole("heading", { name: "Uma sessão de cada vez." });
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.queryByText("Flashcards")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Vídeos & livros" }));
    expect(screen.getByRole("heading", { name: "Sua sala de estudos." })).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Buscar Áreas de figuras planas no YouTube/ }),
    ).toHaveAttribute("href", expect.stringContaining("youtube.com/results?search_query="));
    expect(screen.getByRole("heading", { name: "Livros na Amazon." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Mapa da prova" }));
    expect(screen.getByRole("heading", { name: "Áreas" })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "prep-tab-map");
  });
  it("pesquisa a biblioteca só quando ela é aberta e reutiliza o resultado salvo", async () => {
    mocks.library.mockResolvedValue(libraryFixture);
    const view = open();
    await screen.findByRole("heading", { name: "Uma sessão de cada vez." });
    expect(mocks.library).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Vídeos & livros" }));
    await screen.findByTitle(libraryFixture.videos[0]!.title);
    expect(mocks.library).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("tab", { name: "Meu roteiro" }));
    fireEvent.click(screen.getByRole("tab", { name: "Vídeos & livros" }));
    expect(mocks.library).toHaveBeenCalledTimes(1);
    view.unmount();
    render(
      <LearningProvider>
        <Workspace />
      </LearningProvider>,
    );
    await screen.findByRole("heading", { name: "Uma sessão de cada vez." });
    fireEvent.click(screen.getByRole("tab", { name: "Vídeos & livros" }));
    await screen.findByTitle(libraryFixture.videos[0]!.title);
    expect(mocks.library).toHaveBeenCalledTimes(1);
  });
  it("reaproveita a curadoria pronta quando o armazenamento falha", async () => {
    mocks.library.mockResolvedValue(libraryFixture);
    open();
    await screen.findByRole("heading", { name: "Uma sessão de cada vez." });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("Storage full");
    });
    fireEvent.click(screen.getByRole("tab", { name: "Vídeos & livros" }));
    const retry = await screen.findByRole("button", { name: "Tentar salvar indicações" });
    write.mockRestore();
    fireEvent.click(retry);
    await waitFor(() =>
      expect(readLearning(localStorage.getItem(key)).plans[0]!.preparation?.guide?.library).toEqual(
        libraryFixture,
      ),
    );
    expect(mocks.library).toHaveBeenCalledTimes(1);
    expect(
      readLearning(localStorage.getItem(key)).plans[0]!.completed["topic-0:explain"],
    ).toBeDefined();
  });
  it("salva e restaura sessões sem contar como testes ou perder progresso antigo", async () => {
    const view = open();
    await screen.findByRole("heading", { name: "Uma sessão de cada vez." });
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    const saved = readLearning(localStorage.getItem(key)).plans[0]!;
    expect(preparationProgress(saved)).toEqual({ done: 1, total: 4 });
    expect(saved.completed["topic-0:explain"]).toBe("2026-10-16T12:00:00.000Z");
    view.unmount();
    render(
      <LearningProvider>
        <Workspace />
      </LearningProvider>,
    );
    await screen.findByRole("heading", { name: "Uma sessão de cada vez." });
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(preparationProgress(readLearning(localStorage.getItem(key)).plans[0]!)).toEqual({
      done: 0,
      total: 4,
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("atualiza um plano antigo sem apagar tópicos, materiais ou progresso e sem redirecionar a Aprender", async () => {
    const old = plan(true);
    mocks.generate.mockResolvedValue({
      overview: "Atualizada",
      brief: "Contexto",
      topics: old.topics,
      guide: preparationGuide,
    });
    open(true);
    fireEvent.click(await screen.findByRole("button", { name: "Descobrir meu novo roteiro" }));
    await screen.findByRole("heading", { name: "Uma sessão de cada vez." });
    const saved = readLearning(localStorage.getItem(key)).plans[0]!;
    expect(saved.topics).toEqual(old.topics);
    expect(saved.notes).toBe(old.notes);
    expect(saved.completed).toEqual(old.completed);
    expect(saved.preparation?.guide).toEqual(preparationGuide);
    expect(mocks.generate.mock.calls[0]![0].data.existingTopics).toHaveLength(3);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it("preserva mudanças salvas enquanto a IA atualiza um roteiro antigo", async () => {
    let finish!: (value: unknown) => void;
    mocks.generate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    open(true);
    fireEvent.click(await screen.findByRole("button", { name: "Descobrir meu novo roteiro" }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalled());
    const changed = plan(true);
    changed.notes = "Anotação acrescentada enquanto a IA gerava.";
    changed.completed["topic-1:explain"] = "2026-10-16T14:00:00.000Z";
    localStorage.setItem(key, JSON.stringify({ version: 1, plans: [changed] }));
    finish({ guide: preparationGuide });
    await screen.findByRole("heading", { name: "Uma sessão de cada vez." });
    const saved = readLearning(localStorage.getItem(key)).plans[0]!;
    expect(saved.notes).toBe(changed.notes);
    expect(saved.completed["topic-1:explain"]).toBe(changed.completed["topic-1:explain"]);
  });
  it("permite tentar novamente se a atualização falhar, mantendo o plano antigo", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("Cota indisponível."));
    open(true);
    fireEvent.click(await screen.findByRole("button", { name: "Descobrir meu novo roteiro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cota indisponível.");
    expect(readLearning(localStorage.getItem(key)).plans[0]!.preparation?.guide).toBeUndefined();
    expect(screen.getByRole("button", { name: "Descobrir meu novo roteiro" })).toBeEnabled();
  });
  it("mescla sessões concluídas no celular e no PC sem misturá-las com as atividades", () => {
    const original = plan(),
      base = { version: 1, plans: [original] };
    const local = {
      version: 1,
      plans: [
        {
          ...original,
          completed: {
            ...original.completed,
            [preparationMissionKey(0)]: "2026-10-16T13:00:00.000Z",
          },
        },
      ],
    };
    const remote = {
      version: 1,
      plans: [
        {
          ...original,
          completed: {
            ...original.completed,
            [preparationMissionKey(1)]: "2026-10-16T14:00:00.000Z",
          },
        },
      ],
    };
    const merged = mergeAccountDocuments("learning", fingerprint(base), local, remote).document;
    const restored = readLearning(JSON.stringify(merged)).plans[0]!;
    expect(preparationProgress(restored)).toEqual({ done: 2, total: 4 });
    expect(restored.completed["topic-0:explain"]).toBeDefined();
  });
});
describe("Referências sem links inventados", () => {
  it("só abre diretamente vídeos do YouTube encontrados nas fontes", () => {
    const video = { ...preparationGuide.resources[0]!, sourceIndex: 0 };
    expect(
      preparationResourceLink(video, [
        { title: "Aula", url: "https://www.youtube.com/watch?v=abcdefghijk" },
      ]),
    ).toEqual({ url: "https://www.youtube.com/watch?v=abcdefghijk", direct: true });
    for (const url of [
      "javascript:alert(1)",
      "https://youtube.com.evil.example/watch?v=abcdefghijk",
      "https://www.youtube.com/watch?v=inventado",
      "https://www.youtube.com/results?search_query=teste",
    ])
      expect(preparationResourceLink(video, [{ title: "Fonte", url }]).direct).toBe(false);
  });
  it("trata uma referência sem fonte como busca, preservando acentos e escapando o título", () => {
    const resource = {
      ...preparationGuide.resources[0]!,
      title: "Equações & áreas? #1",
      creator: "Professor José",
    };
    const link = preparationResourceLink(resource, []);
    expect(link.direct).toBe(false);
    expect(new URL(link.url).searchParams.get("search_query")).toBe(
      "Equações & áreas? #1 Professor José",
    );
    expect(new URL(link.url).hash).toBe("");
  });
});

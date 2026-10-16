import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  research: vi.fn(),
  text: vi.fn(),
  object: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/ai.server", () => ({
  aiResearch: mocks.research,
  aiText: mocks.text,
  aiObject: mocks.object,
}));
vi.mock("@/lib/study-auth-middleware", () => ({ requireStudyAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (input: unknown): unknown => input;
    const builder = {
      middleware: () => builder,
      inputValidator: (validator: typeof parse) => {
        parse = validator;
        return builder;
      },
      handler:
        (fn: (input: unknown) => Promise<unknown>) =>
        async ({ data }: { data: unknown }) =>
          fn({ data: parse(data), context: { supabase: { from: mocks.from }, userId: "student" } }),
    };
    return builder;
  },
}));
import { researchPreparation, createPreparationPath } from "@/lib/preparation.functions";
import { parseAccountDocument, fingerprint, mergeAccountDocuments } from "@/lib/account-sync-model";
import { initialData } from "@/lib/study-model";
import { readLearning, type LearningPlan } from "@/lib/learning-model";

import { preparationGuide } from "./helpers/preparation-fixture";

const details = {
  kind: "olimpiada",
  exam: "OBMEP",
  edition: "2027, nível 2",
  subject: "Matemática",
  schoolYear: "fundamental-8",
  focus: "Geometria",
};
const research = {
  report: "O programa atual deve ser confirmado no regulamento da edição.",
  sources: [],
  mode: "knowledge",
  researchedAt: "2026-10-16T12:00:00.000Z",
};
const metadata = {
  ...details,
  target: 85,
  answers: "Conheço ângulos, preciso compreender áreas.",
  research,
};
const path = {
  guide: preparationGuide,
  overview: "Uma preparação focada no seu objetivo.",
  brief: "Geometria para o nível 2, com o regulamento ainda a confirmar.",
  topics: ["Áreas", "Ângulos", "Problemas"].map((title) => ({
    title,
    goal: "Compreender " + title,
    challenge: "Explique o raciocínio de " + title,
  })),
};
const call = (fn: unknown, data: unknown) =>
  (fn as (input: { data: unknown }) => Promise<unknown>)({ data });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.text.mockResolvedValue(research.report);
  mocks.research.mockResolvedValue({ text: research.report, sources: [] });
  mocks.object.mockResolvedValue(path);
});
describe("Pesquisa e geração de preparação", () => {
  it("pesquisa desafios públicos e só aceita URLs HTTPS realmente devolvidas pelo provedor", async () => {
    mocks.research.mockResolvedValue({
      text: research.report,
      sources: [
        { title: "OBMEP", url: "https://www.obmep.org.br/" },
        { title: "Duplicada", url: "https://www.obmep.org.br/" },
        { title: "Script", url: "javascript:alert(1)" },
        { title: "Credencial", url: "https://user:pass@example.com/" },
      ],
    });
    const result = await call(researchPreparation, details);
    expect(result).toMatchObject({
      mode: "web",
      sources: [{ title: "OBMEP", url: "https://www.obmep.org.br/" }],
    });
    expect(mocks.research).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.research.mock.calls[0]![0]).toContain("não escolha silenciosamente");
  });
  it("não pesquisa na web a prova privada do professor nem chama de confirmada uma resposta sem fontes", async () => {
    expect(await call(researchPreparation, { ...details, kind: "prova" })).toMatchObject({
      mode: "school",
      sources: [],
    });
    expect(mocks.research).not.toHaveBeenCalled();
    expect(mocks.text).toHaveBeenCalledTimes(1);
    expect(await call(researchPreparation, details)).toMatchObject({
      mode: "knowledge",
      sources: [],
    });
  });
  it("inclui meta, ano, respostas e programa na geração sem pesquisar os cadernos", async () => {
    expect(
      await call(createPreparationPath, {
        ...details,
        preparation: metadata,
        ids: [],
        notes: "Roteiro do professor: áreas e perímetros.",
      }),
    ).toEqual(path);
    const [instructions, messages] = mocks.object.mock.calls[0]!;
    expect(instructions).toContain("não uma nota obtida");
    const data = JSON.parse(messages[0].content);
    expect(data.preparation.target).toBe(85);
    expect(data.etapa).toContain("8º ano");
    expect(data.notes).toContain("Roteiro do professor");
    expect(mocks.research).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejeita ano inexistente, alvo fora dos limites e contexto alterado antes de chamar a IA", async () => {
    await expect(call(researchPreparation, { ...details, schoolYear: "999" })).rejects.toThrow();
    for (const target of [0, 101, 80.5])
      await expect(
        call(createPreparationPath, { ...details, preparation: { ...metadata, target }, ids: [] }),
      ).rejects.toThrow();
    await expect(
      call(createPreparationPath, {
        ...details,
        exam: "Outra prova",
        preparation: metadata,
        ids: [],
      }),
    ).rejects.toThrow("mudaram");
    expect(mocks.object).not.toHaveBeenCalled();
  });
  it("não salva tópicos repetidos ou uma síntese incompleta como trilha válida", async () => {
    mocks.object.mockResolvedValue({
      ...path,
      topics: [path.topics[0], path.topics[0], path.topics[2]],
    });
    await expect(
      call(createPreparationPath, { ...details, preparation: metadata, ids: [] }),
    ).rejects.toThrow("inconsistente");
    mocks.object.mockResolvedValue({ ...path, brief: "" });
    await expect(
      call(createPreparationPath, { ...details, preparation: metadata, ids: [] }),
    ).rejects.toThrow("incompleta");
  });
  it("rejeita sessões fora do programa ou que excedem o tempo disponível", async () => {
    for (const guide of [
      {
        ...preparationGuide,
        missions: preparationGuide.missions.map((m, index) =>
          index ? m : { ...m, topicIndex: 7 },
        ),
      },
      {
        ...preparationGuide,
        missions: preparationGuide.missions.map((m) => ({ ...m, minutes: 60 })),
      },
      {
        ...preparationGuide,
        resources: preparationGuide.resources.filter((r) => r.kind === "video"),
      },
    ]) {
      mocks.object.mockResolvedValue({ ...path, guide });
      await expect(
        call(createPreparationPath, {
          ...details,
          preparation: { ...metadata, dailyMinutes: 30 },
          ids: [],
        }),
      ).rejects.toThrow();
    }
  });
  it("recusa uma atualização que troca os tópicos antigos", async () => {
    await expect(
      call(createPreparationPath, {
        ...details,
        preparation: metadata,
        ids: [],
        existingTopics: path.topics.map((topic, index) =>
          index ? topic : { ...topic, title: "Outro assunto" },
        ),
      }),
    ).rejects.toThrow("preservado");
  });
});
describe("Ano e preparação entre aparelhos", () => {
  it("mescla alteração do ano com cadernos e mantém compatibilidade com contas antigas", () => {
    const original = parseAccountDocument("workspace", initialData());
    const local = { ...original, schoolYear: "medio-2" },
      remote = { ...original, name: "Nome do celular" };
    expect(
      mergeAccountDocuments("workspace", fingerprint(original), local, remote).document,
    ).toMatchObject({ schoolYear: "medio-2", name: "Nome do celular" });
    expect(() =>
      parseAccountDocument("workspace", { ...original, schoolYear: "inválido" }),
    ).toThrow();
  });
  it("restaura meta e pesquisa e mantém preparações de dois aparelhos sem misturar progresso", () => {
    const plan = (id: string): LearningPlan => ({
      id,
      subjectId: "math",
      subject: "Matemática",
      topic: "OBMEP",
      overview: path.overview,
      notes: path.brief,
      materialIds: [],
      topics: path.topics.map((topic, i) => ({ ...topic, id: "topic-" + i })),
      completed: {},
      createdAt: "2026-10-16T12:00:00.000Z",
      preparation: metadata as LearningPlan["preparation"],
    });
    const empty = { version: 1, plans: [] },
      a = { version: 1, plans: [plan("a")] },
      b = { version: 1, plans: [plan("b")] };
    const merged = mergeAccountDocuments("learning", fingerprint(empty), a, b).document;
    const restored = readLearning(JSON.stringify(merged));
    expect(restored.plans).toHaveLength(2);
    expect(
      restored.plans.every(
        (plan) => plan.preparation?.target === 85 && !Object.keys(plan.completed).length,
      ),
    ).toBe(true);
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialData, type StudyData } from "@/lib/study-model";
const mocks = vi.hoisted(() => ({
  notebook: vi.fn(),
  report: vi.fn(),
  prepare: vi.fn(),
  update: vi.fn(),
  data: null as unknown as StudyData,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/photo-import.functions", () => ({
  transcribeNotebookPhoto: mocks.notebook,
  readReportPhoto: mocks.report,
}));
vi.mock("@/lib/study-photo", () => ({ prepareStudyPhoto: mocks.prepare }));
vi.mock("@/components/study-provider", () => ({
  useStudy: () => ({ data: mocks.data, update: mocks.update }),
}));
import { NotebookPhotoImport, ReportPhotoImport } from "@/components/photo-imports";
const image = {
  dataUrl: "data:image/jpeg;base64,YWJj",
  name: "foto.jpg",
  width: 900,
  height: 1200,
};
const report = {
  rows: [
    { subject: "Matemática", period: 1, periodLabel: "1º bim.", score: 8.5, absences: 3 },
    { subject: "Física", period: null, periodLabel: "Semestre", score: 90, absences: null },
  ],
  warnings: ["Confira o período do semestre."],
};
const upload = async () => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Escolher foto do documento"), {
      target: { files: [new File(["photo"], "foto.jpg", { type: "image/jpeg" })] },
    });
  });
};
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.data = initialData();
  mocks.prepare.mockResolvedValue(image);
  mocks.notebook.mockResolvedValue({
    text: "Área = lado²\nUm trecho [ilegível].",
    warnings: ["O canto da página está cortado."],
  });
  mocks.report.mockResolvedValue(report);
  mocks.update.mockImplementation((fn: (data: StudyData) => StudyData) => {
    mocks.data = fn(mocks.data);
    return true;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("Revisão antes de salvar uma foto", () => {
  it("não envia a foto ao escolher e não insere a transcrição antes de confirmar a revisão", async () => {
    const insert = vi.fn().mockReturnValue(true);
    render(<NotebookPhotoImport onInsert={insert} />);
    await click("Transcrever foto do caderno");
    await upload();
    expect(mocks.notebook).not.toHaveBeenCalled();
    await click("Transcrever foto");
    expect(mocks.notebook).toHaveBeenCalledWith({ data: { image: image.dataUrl } });
    expect(insert).not.toHaveBeenCalled();
    expect(screen.getByText("O canto da página está cortado.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Revise o texto transcrito"), {
      target: { value: "Área = lado²\nTrecho corrigido." },
    });
    await click("Adicionar ao caderno");
    expect(insert).toHaveBeenCalledWith("Área = lado²\nTrecho corrigido.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("preserva a revisão quando salvar falha e permite tentar novamente", async () => {
    const insert = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    render(<NotebookPhotoImport onInsert={insert} />);
    await click("Transcrever foto do caderno");
    await upload();
    await click("Transcrever foto");
    await click("Adicionar ao caderno");
    expect(screen.getByRole("alert")).toHaveTextContent("continua aqui");
    expect(screen.getByLabelText("Revise o texto transcrito")).toHaveValue(
      "Área = lado²\nUm trecho [ilegível].",
    );
    await click("Adicionar ao caderno");
    expect(mocks.notebook).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(2);
  });
  it("não reaproveita uma resposta que chegou depois de fechar o diálogo", async () => {
    let resolve!: (value: unknown) => void;
    mocks.notebook.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const insert = vi.fn();
    render(<NotebookPhotoImport onInsert={insert} />);
    await click("Transcrever foto do caderno");
    await upload();
    await click("Transcrever foto");
    await click("Close");
    await act(async () => {
      resolve({ text: "Resposta atrasada", warnings: [] });
    });
    await click("Transcrever foto do caderno");
    expect(screen.queryByLabelText("Revise o texto transcrito")).not.toBeInTheDocument();
    expect(insert).not.toHaveBeenCalled();
  });
  it("mostra erro de leitura sem apagar uma revisão já editada", async () => {
    render(<NotebookPhotoImport onInsert={() => true} />);
    await click("Transcrever foto do caderno");
    await upload();
    await click("Transcrever foto");
    fireEvent.change(screen.getByLabelText("Revise o texto transcrito"), {
      target: { value: "Meu texto corrigido." },
    });
    mocks.notebook.mockRejectedValue(new Error("O Gemini está ocupado."));
    await click("Ler novamente");
    expect(screen.getByRole("alert")).toHaveTextContent("ocupado");
    expect(screen.getByLabelText("Revise o texto transcrito")).toHaveValue("Meu texto corrigido.");
  });
  it("só salva o boletim depois da confirmação e deixa um semestre sem associação automática", async () => {
    render(<ReportPhotoImport subjectId="subject-0" />);
    await click("Importar foto do boletim");
    await upload();
    await click("Ler boletim");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Bimestre do registro 2")).toHaveValue("");
    expect(screen.getByLabelText("Importar registro 2")).not.toBeChecked();
    expect(screen.getByLabelText("Importar também as faltas")).toBeChecked();
    fireEvent.change(screen.getByLabelText("Nota do registro 1"), { target: { value: "9" } });
    await click("Salvar notas selecionadas");
    expect(mocks.data.performance["subject-0"]!.grades[0]).toMatchObject({
      score: "9",
      absences: "3",
    });
    expect(mocks.data.performance["subject-2"]).toBeUndefined();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("exige escolher o período antes de salvar uma linha incerta e mantém a revisão após falha de armazenamento", async () => {
    render(<ReportPhotoImport subjectId="subject-0" />);
    await click("Importar foto do boletim");
    await upload();
    await click("Ler boletim");
    fireEvent.click(screen.getByLabelText("Importar registro 2"));
    await click("Salvar notas selecionadas");
    expect(screen.getByRole("alert")).toHaveTextContent("Escolha o bimestre");
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Bimestre do registro 2"), { target: { value: "2" } });
    mocks.update.mockReturnValue(false);
    await click("Salvar notas selecionadas");
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível salvar");
    expect(screen.getByLabelText("Nota do registro 1")).toHaveValue(8.5);
    expect(screen.getByLabelText("Nota do registro 2")).toHaveValue(90);
  });
});

describe("Cruzamento do boletim com o horário", () => {
  it.each([false, true])(
    "só marca dias ambíguos após confirmação explícita (%s)",
    async (confirm) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 9, 21, 12));
      mocks.data.attendanceYear = 2026;
      mocks.data.attendancePeriods = [
        { start: "2026-10-12", end: "2026-10-20" },
        { start: "2026-11-01", end: "2026-11-15" },
        { start: "2026-11-16", end: "2026-11-30" },
        { start: "2026-12-01", end: "2026-12-31" },
      ];
      mocks.data.schedule = { rows: 2, cells: { "1": ["subject-0", "subject-2"] } };
      mocks.report.mockResolvedValue({
        warnings: [],
        rows: [
          { subject: "Matemática", period: 1, periodLabel: "1º", score: 8, absences: 1 },
          { subject: "Física", period: 1, periodLabel: "1º", score: null, absences: 1 },
        ],
      });
      render(<ReportPhotoImport subjectId="subject-0" />);
      await click("Importar foto do boletim");
      await upload();
      await click("Ler boletim");
      expect(screen.getByText(/Mais de uma combinação/)).toBeInTheDocument();
      expect(screen.getByLabelText("Importar registro 2")).toBeChecked();
      expect(mocks.update).not.toHaveBeenCalled();
      if (confirm) fireEvent.click(screen.getByLabelText("Confirmo que faltei nos dias sugeridos"));
      await click("Salvar notas selecionadas");
      expect(mocks.data.performance["subject-0"]!.grades[0]!.absences).toBe("1");
      expect(mocks.data.performance["subject-2"]!.grades[0]!.absences).toBe("1");
      expect(Object.values(mocks.data.attendance ?? {})).toEqual(confirm ? ["absent"] : []);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );
});

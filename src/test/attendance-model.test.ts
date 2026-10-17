import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initialData,
  emptyPerformance,
  loadData,
  storageKey,
  type StudyData,
} from "@/lib/study-model";
import { applyReportDrafts, reportDrafts, type ReportDraft } from "@/lib/photo-import-model";
import {
  absenceTotal,
  pendingAbsenceSuggestions,
  inferAbsenceDates,
  normalizeAbsenceTotals,
  totalSubjectAbsences,
  validateAttendancePeriods,
} from "@/lib/attendance-model";
import { parseAccountDocument } from "@/lib/account-sync-model";
const options = { includeAbsences: true, overwrite: false };
const row = (subjectId: string, absences: string): ReportDraft => ({
  subjectId,
  period: "1",
  absences,
  score: "",
  selected: true,
  source: subjectId,
  periodLabel: "1º bimestre",
});
const workspace = (): StudyData => ({
  ...initialData(),
  attendanceYear: 2026,
  attendancePeriods: [
    { start: "2026-10-12", end: "2026-10-13" },
    { start: "2026-11-01", end: "2026-11-15" },
    { start: "2026-11-16", end: "2026-11-30" },
    { start: "2026-12-01", end: "2026-12-31" },
  ],
  schedule: {
    rows: 3,
    cells: { "1": ["subject-0", "subject-2", "subject-1"], "2": ["subject-0", "subject-0", ""] },
  },
});
const day = (data: StudyData, date: string, status: "absent" | "present") => {
  const current = normalizeAbsenceTotals(data);
  return normalizeAbsenceTotals({
    ...current,
    attendance: { ...current.attendance, [date]: status },
  });
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 17, 12));
});
afterEach(() => vi.useRealTimers());
describe("Um total de faltas para calendário, tabela e boletim", () => {
  it("projeta os totais da tabela desde janeiro em dias crescentes sem inventar ausências", () => {
    const data = workspace();
    data.attendancePeriods![0] = { start: "2026-01-01", end: "2026-02-28" };
    data.schedule = { rows: 1, cells: { "1": ["subject-0"] } };
    data.performance["subject-0"] = emptyPerformance();
    data.performance["subject-0"]!.grades[0]!.absences = "2";
    data.attendance = { "2026-01-05": "present" };
    const suggestions = pendingAbsenceSuggestions(data, "2026-02-28");
    expect(Object.keys(suggestions)).toEqual(["2026-01-12", "2026-01-19"]);
    expect(suggestions["2026-01-12"]).toEqual([{ subjectId: "subject-0", count: 1 }]);
    expect(data.attendance).toEqual({ "2026-01-05": "present" });
    expect(absenceTotal(data, "subject-0", 0)).toBe(2);
  });
  it("deduz uma combinação única por todas as matérias e não duplica ao importar novamente", () => {
    const data = workspace();
    const rows = [row("subject-0", "3"), row("subject-2", "1")];
    const result = applyReportDrafts(data, rows, options);
    expect(result.inference).toMatchObject({
      status: "unique",
      dates: ["2026-10-12", "2026-10-13"],
    });
    expect(result.data.attendance).toEqual({ "2026-10-12": "absent", "2026-10-13": "absent" });
    expect(absenceTotal(result.data, "subject-0", 0)).toBe(3);
    expect(absenceTotal(result.data, "subject-2", 0)).toBe(1);
    expect(totalSubjectAbsences(result.data, "subject-1")).toBe(1); // Other classes on the same whole day.
    const repeated = applyReportDrafts(normalizeAbsenceTotals(result.data), rows, options);
    expect(repeated.inference?.status).toBe("complete");
    expect(repeated.changed).toBe(0);
    expect(absenceTotal(repeated.data, "subject-0", 0)).toBe(3);
    expect(data.attendance).toBeUndefined();
  });
  it("mantém datas ambíguas sem marcação e só aplica a possibilidade confirmada", () => {
    const data = workspace();
    data.attendancePeriods![0]!.end = "2026-10-20";
    data.schedule = { rows: 1, cells: { "1": ["subject-0"] } };
    vi.setSystemTime(new Date(2026, 9, 21));
    const rows = [row("subject-0", "1")];
    const result = applyReportDrafts(data, rows, options);
    expect(result.inference?.status).toBe("ambiguous");
    expect(result.data.attendance).toBeUndefined();
    expect(absenceTotal(result.data, "subject-0", 0)).toBe(1);
    const confirmed = applyReportDrafts(data, rows, {
      ...options,
      confirmedDates: result.inference!.dates,
    });
    expect(Object.values(confirmed.data.attendance!)).toEqual(["absent"]);
    expect(absenceTotal(confirmed.data, "subject-0", 0)).toBe(1);
    // Re-evaluate against the current account; never overwrite a new presence.
    expect(() =>
      applyReportDrafts(
        { ...data, attendance: { [result.inference!.dates[0]!]: "present" } },
        rows,
        { ...options, confirmedDates: result.inference!.dates },
      ),
    ).toThrow("seleção de dias mudou");
  });
  it("respeita presenças e não inventa um dia inteiro para uma falta parcial", () => {
    const data = workspace();
    data.attendance = { "2026-10-12": "present" };
    const result = applyReportDrafts(data, [row("subject-0", "1")], options);
    expect(result.inference?.status).toBe("incompatible"); // Tuesday has two maths lessons.
    expect(result.data.attendance).toEqual(data.attendance);
    expect(totalSubjectAbsences(result.data, "subject-0")).toBe(1);
  });
  it("calendário preexistente já está incluído no total do boletim", () => {
    const data = workspace();
    data.attendance = { "2026-10-12": "absent" };
    const result = applyReportDrafts(data, [row("subject-0", "1"), row("subject-2", "1")], options);
    expect(result.inference?.status).toBe("complete");
    expect(totalSubjectAbsences(result.data, "subject-0")).toBe(1);
    expect(() => applyReportDrafts(data, [row("subject-0", "0")], options)).toThrow(
      "Já há 1 faltas",
    );
  });
  it("localizar datas históricas preenche faltas já reportadas; faltas posteriores são novas", () => {
    const data = workspace();
    data.attendancePeriods![0]!.end = "2026-10-31";
    data.schedule = { rows: 1, cells: { "1": ["subject-0"] } };
    const imported = applyReportDrafts(data, [row("subject-0", "3")], options).data;
    const located = day(imported, "2026-10-12", "absent");
    expect(absenceTotal(located, "subject-0", 0)).toBe(3);
    const newAbsence = day(located, "2026-10-19", "absent");
    expect(absenceTotal(newAbsence, "subject-0", 0)).toBe(4);
    const corrected = day(newAbsence, "2026-10-12", "present");
    expect(absenceTotal(corrected, "subject-0", 0)).toBe(3);
  });
  it("um boletim novo atualiza a cobertura mesmo se o total já for igual ao da tabela", () => {
    const data = workspace();
    data.attendancePeriods![0]!.end = "2026-10-31";
    data.schedule = { rows: 1, cells: { "1": ["subject-0"] } };
    const first = applyReportDrafts(data, [row("subject-0", "2")], options).data;
    const later = day(first, "2026-10-19", "absent");
    expect(totalSubjectAbsences(later, "subject-0")).toBe(3);
    vi.setSystemTime(new Date(2026, 9, 21, 12));
    const refreshed = applyReportDrafts(later, [row("subject-0", "3")], options).data;
    expect(refreshed.performance["subject-0"]!.grades[0]!.absenceThrough).toBe("2026-10-21");
    expect(totalSubjectAbsences(day(refreshed, "2026-10-12", "absent"), "subject-0")).toBe(3);
  });
  it("migra totais antigos sem duplicar e conserva os vínculos na sincronização", () => {
    const data = workspace();
    data.attendance = { "2026-10-12": "absent" };
    data.performance["subject-0"] = emptyPerformance();
    data.performance["subject-0"]!.grades[0]!.absences = "3";
    const loaded = loadData({
      getItem: (key) => (key === storageKey ? JSON.stringify(data) : null),
    });
    expect(totalSubjectAbsences(loaded, "subject-0")).toBe(3);
    const synced = parseAccountDocument(
      "workspace",
      JSON.parse(JSON.stringify(loaded)),
    ) as unknown as StudyData;
    expect(synced.attendancePeriods).toEqual(data.attendancePeriods);
    expect(synced.performance["subject-0"]!.grades[0]).toMatchObject({
      absences: "3",
      absenceCalendarCount: 1,
      absencePastCount: 1,
      absenceThrough: "2026-10-13",
    });
  });
  it("usa todas as linhas associadas inclusive registros só com faltas", () => {
    const drafts = reportDrafts(
      {
        warnings: [],
        rows: [
          { subject: "Matemática", period: 1, periodLabel: "1º", score: null, absences: 2 },
          { subject: "Física", period: 1, periodLabel: "1º", score: null, absences: 1 },
        ],
      },
      initialData().subjects,
    );
    expect(drafts.every((item) => item.selected)).toBe(true);
  });
  it("importa faltas das matérias novas e reutiliza a mesma matéria na próxima foto", () => {
    const data = workspace();
    const parsed = {
      warnings: [],
      rows: [{ subject: "Biologia", period: 1, periodLabel: "1º", score: null, absences: 2 }],
    };
    const drafts = reportDrafts(parsed, data.subjects);
    const first = applyReportDrafts(data, drafts, options);
    const biology = first.data.subjects.find((subject) => subject.name === "Biologia")!;
    expect(totalSubjectAbsences(first.data, biology.id)).toBe(2);
    const next = applyReportDrafts(first.data, reportDrafts(parsed, first.data.subjects), options);
    expect(next.data.subjects.filter((subject) => subject.name === "Biologia")).toHaveLength(1);
    expect(totalSubjectAbsences(next.data, biology.id)).toBe(2);
  });
  it("não usa datas fora do período/ano nem períodos sobrepostos", () => {
    const data = workspace();
    data.attendance = { "2025-10-12": "absent" };
    expect(totalSubjectAbsences(data, "subject-0")).toBe(0);
    expect(
      inferAbsenceDates(data, [{ subjectId: "subject-0", period: 0, total: 3 }]).dates.every(
        (date) => date.startsWith("2026-"),
      ),
    ).toBe(true);
    const invalid = [...data.attendancePeriods!];
    invalid[1] = { ...invalid[0]! };
    expect(() => validateAttendancePeriods(2026, invalid)).toThrow("sobreposição");
  });
});

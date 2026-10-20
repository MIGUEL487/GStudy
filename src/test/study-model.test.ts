import { describe, it, expect } from "vitest";
import {
  initialData,
  addNotebook,
  addCourse,
  courseUrl,
  loadData,
  absenceBudget,
  dayBudget,
  calendarAbsences,
  classesOn,
  removeSubject,
  addSubject,
} from "@/lib/study-model";

describe("Notebook creation", () => {
  it("creates a notebook in the selected subject without mutating other subjects", () => {
    const data = initialData();
    const next = addNotebook(data, "subject-2", "  Física moderna  ");
    expect(next.subjects[2]?.notebooks[0]).toMatchObject({ title: "Física moderna", text: "" });
    expect(next.subjects[0]?.notebooks).toHaveLength(0);
    expect(data.subjects[2]?.notebooks).toHaveLength(0);
  });
  it("rejects a blank title", () =>
    expect(() => addNotebook(initialData(), "subject-0", "  ")).toThrow());
  it("rejects a missing subject rather than writing to an undefined selection", () =>
    expect(() => addNotebook(initialData(), "missing", "Aula")).toThrow());
});

describe("Course creation", () => {
  it("creates a course and normalizes a link without a protocol", () => {
    const next = addCourse(initialData(), "subject-1", "Meu curso", "example.com/aula");
    expect(next.subjects[1]?.courses[0]).toMatchObject({
      title: "Meu curso",
      url: "https://example.com/aula",
    });
  });
  it("rejects unsafe and invalid links", () => {
    expect(() => courseUrl("javascript:alert(1)")).toThrow();
    expect(() => courseUrl("não é um link")).toThrow();
  });
  it("migrates legacy notebooks and courses together", () => {
    const records: Record<string, string> = {
      materias: '["Física"]',
      cadernos: '{"Física":[{"titulo":"Aula 1","texto":"Anotações"}]}',
      cursos: '{"Física":[{"nome":"Curso 1","link":"https://example.com"}]}',
    };
    const loaded = loadData({ getItem: (key) => records[key] || null });
    expect(loaded.subjects[0]?.notebooks[0]?.text).toBe("Anotações");
    expect(loaded.subjects[0]?.courses[0]?.title).toBe("Curso 1");
  });
  it("does not swallow corrupt saved data", () =>
    expect(() => loadData({ getItem: () => "{bad" })).toThrow());
});

describe("limite de faltas", () => {
  it("3 aulas por semana = 120 aulas no ano (40 semanas letivas) e limite de 30 faltas (25%)", () => {
    const b = absenceBudget(3, 10);
    expect(b.total).toBe(120);
    expect(b.limit).toBe(30);
    expect(b.remaining).toBe(20);
    expect(b.over).toBe(false);
  });
  it("reprova ao ultrapassar 25%", () => {
    expect(absenceBudget(3, 31).over).toBe(true);
    expect(absenceBudget(3, 30).over).toBe(false);
  });
  it("200 dias letivos permitem 50 faltas", () => {
    expect(dayBudget(0).limit).toBe(50);
    expect(dayBudget(51).over).toBe(true);
    expect(dayBudget(20).remaining).toBe(30);
  });
});

describe("faltas pelo horário", () => {
  const schedule = { rows: 3, cells: { "1": ["mat", "mat", "fis"], "2": ["fis", "", ""] } };
  it("conta aulas da matéria no dia da semana", () => {
    expect(classesOn(schedule, 1, "mat")).toBe(2);
    expect(classesOn(schedule, 2, "mat")).toBe(0);
  });
  it("falta numa segunda soma 2 aulas de matemática e 1 de física", () => {
    const data = {
      schedule,
      attendance: { "2026-10-12": "absent" as const, "2026-10-13": "present" as const },
    };
    expect(calendarAbsences(data, "mat")).toBe(2);
    expect(calendarAbsences(data, "fis")).toBe(1);
  });
  it("preserva snapshot do número de aulas registrado no momento da falta", () => {
    const data = {
      schedule,
      attendance: { "2026-10-12": "absent" as const },
      attendanceSnapshots: {
        "2026-10-12": { mat: 3, fis: 0 },
      },
    };
    expect(calendarAbsences(data, "mat")).toBe(3);
    expect(calendarAbsences(data, "fis")).toBe(0);
  });
});

describe("removeSubject e limpeza de dados órfãos", () => {
  it("limpa matérias, desempenho associado e células do horário", () => {
    const initial = initialData();
    const withSubject = addSubject(initial, "Química");
    const chemId = withSubject.id;

    // Adiciona desempenho e horário referenciando chemId
    withSubject.data.performance[chemId] = {
      max: "10",
      min: "6",
      limit: "20",
      goal: "10",
      grades: [],
      sessions: [],
    };
    withSubject.data.schedule = {
      rows: 2,
      cells: {
        "1": [chemId, "subject-0"],
      },
    };
    withSubject.data.attendanceSnapshots = {
      "2026-10-15": { [chemId]: 2, "subject-0": 1 },
    };

    const cleaned = removeSubject(withSubject.data, chemId);

    expect(cleaned.subjects.some((s) => s.id === chemId)).toBe(false);
    expect(chemId in cleaned.performance).toBe(false);
    expect(cleaned.schedule?.cells["1"]?.[0]).toBe("");
    expect(cleaned.schedule?.cells["1"]?.[1]).toBe("subject-0");
    expect(cleaned.attendanceSnapshots?.["2026-10-15"]?.[chemId]).toBeUndefined();
    expect(cleaned.attendanceSnapshots?.["2026-10-15"]?.["subject-0"]).toBe(1);
  });
});

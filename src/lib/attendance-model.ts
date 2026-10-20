import type { Grade, Performance, StudyData } from "./study-model";

export type AttendancePeriod = { start: string; end: string };
export const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function parseAttendanceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!, 12);
  return dateKey(date) === value ? date : null;
}
export function attendancePeriods(
  data: Pick<StudyData, "attendancePeriods" | "attendanceYear">,
): AttendancePeriod[] {
  const year = data.attendanceYear ?? new Date().getFullYear();
  return (
    data.attendancePeriods ??
    Array.from({ length: 4 }, (_, index) => ({
      start: dateKey(new Date(year, index * 3, 1)),
      end: dateKey(new Date(year, index * 3 + 3, 0)),
    }))
  );
}
export function validateAttendancePeriods(year: number, periods: AttendancePeriod[]) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || periods.length !== 4)
    throw new Error("Informe um ano entre 2000 e 2100 e os quatro períodos letivos.");
  periods.forEach((period, index) => {
    if (
      !parseAttendanceDate(period.start) ||
      !parseAttendanceDate(period.end) ||
      period.start > period.end ||
      !period.start.startsWith(`${year}-`) ||
      !period.end.startsWith(`${year}-`) ||
      (index > 0 && periods[index - 1]!.end >= period.start)
    )
      throw new Error(
        "Confira as datas dos bimestres: use períodos do mesmo ano, em ordem e sem sobreposição.",
      );
  });
  return periods;
}
export function periodForDate(data: StudyData, date: string) {
  if (!parseAttendanceDate(date)) return -1;
  return attendancePeriods(data).findIndex((period) => date >= period.start && date <= period.end);
}
export function lessonsOnDate(data: StudyData, date: string, subjectId: string) {
  const parsed = parseAttendanceDate(date);
  if (!parsed || !(data.schoolDays ?? [1, 2, 3, 4, 5]).includes(parsed.getDay())) return 0;
  return (data.schedule?.cells[String(parsed.getDay())] ?? [])
    .slice(0, data.schedule?.rows ?? 0)
    .filter((id) => id === subjectId).length;
}
export function datedAbsences(data: StudyData, subjectId: string, period: number) {
  return Object.entries(data.attendance ?? {}).reduce(
    (total, [date, status]) =>
      status === "absent" && periodForDate(data, date) === period
        ? total + lessonsOnDate(data, date, subjectId)
        : total,
    0,
  );
}
export function datedAbsencesThrough(
  data: StudyData,
  subjectId: string,
  period: number,
  through: string,
) {
  return Object.entries(data.attendance ?? {}).reduce(
    (total, [date, status]) =>
      status === "absent" && date <= through && periodForDate(data, date) === period
        ? total + lessonsOnDate(data, date, subjectId)
        : total,
    0,
  );
}
export function absenceTotal(data: StudyData, subjectId: string, period: number) {
  const grade = data.performance[subjectId]?.grades[period];
  const dated = datedAbsences(data, subjectId, period);
  const reported = Number(grade?.absences || 0);
  if (grade?.absenceCalendarCount === undefined) return Math.max(reported, dated);
  if (!grade.absenceThrough || grade.absencePastCount === undefined)
    return Math.max(dated, reported + dated - grade.absenceCalendarCount);
  const past = datedAbsencesThrough(data, subjectId, period, grade.absenceThrough);
  const future = dated - past;
  const previousFuture = grade.absenceCalendarCount - grade.absencePastCount;
  // Locating an already reported historical absence consumes its undated total.
  return Math.max(
    dated,
    reported + Math.min(0, past - grade.absencePastCount) + future - previousFuture,
  );
}
export function totalSubjectAbsences(data: StudyData, subjectId: string) {
  return [0, 1, 2, 3].reduce((total, period) => total + absenceTotal(data, subjectId, period), 0);
}
export function undatedSubjectAbsences(data: StudyData, subjectId: string) {
  return [0, 1, 2, 3].reduce(
    (total, period) =>
      total + absenceTotal(data, subjectId, period) - datedAbsences(data, subjectId, period),
    0,
  );
}
export type PendingAbsence = { subjectId: string; count: number };
/** Display undated table totals in ascending calendar order, without claiming those dates occurred. */
export function pendingAbsenceSuggestions(data: StudyData, today = dateKey(new Date())) {
  const suggestions: Record<string, PendingAbsence[]> = {};
  const periods = attendancePeriods(data);
  const schoolDays = data.schoolDays ?? [1, 2, 3, 4, 5];
  for (const subject of data.subjects) {
    const hasScheduledLessons = schoolDays.some((weekday) =>
      (data.schedule?.cells[String(weekday)] ?? [])
        .slice(0, data.schedule?.rows ?? 0)
        .includes(subject.id),
    );
    for (let period = 0; period < periods.length; period++) {
      let remaining =
        absenceTotal(data, subject.id, period) - datedAbsences(data, subject.id, period);
      if (remaining <= 0) continue;
      const range = periods[period]!;
      const start = parseAttendanceDate(range.start);
      if (!start) continue;
      for (
        const day = new Date(start);
        dateKey(day) <= range.end && dateKey(day) <= today && remaining > 0;
        day.setDate(day.getDate() + 1)
      ) {
        const date = dateKey(day);
        if (!schoolDays.includes(day.getDay()) || data.attendance?.[date]) continue;
        // A blank timetable can still display a provisional chronology, one lesson at a time.
        const scheduled = lessonsOnDate(data, date, subject.id);
        if (hasScheduledLessons && !scheduled) continue;
        const lessons = scheduled || 1;
        const count = Math.min(remaining, lessons);
        (suggestions[date] ??= []).push({ subjectId: subject.id, count });
        remaining -= count;
      }
    }
  }
  return suggestions;
}
export function anchorAbsenceTotal(
  data: StudyData,
  subjectId: string,
  period: number,
  grade: Grade,
  value: string,
): Grade {
  const dated = datedAbsences(data, subjectId, period);
  if (value !== "" && Number(value) < dated)
    throw new Error(
      `Já há ${dated} faltas nesse bimestre no calendário. Corrija os dias marcados antes de reduzir esse total.`,
    );
  if (value === "" && dated)
    throw new Error("Desmarque as faltas no calendário antes de limpar o total.");
  const through = [dateKey(new Date()), attendancePeriods(data)[period]!.end].sort()[0]!;
  return {
    ...grade,
    absences: value,
    absenceCalendarCount: dated,
    absenceThrough: through,
    absencePastCount: datedAbsencesThrough(data, subjectId, period, through),
  };
}
/** Materialize the current view before any mutation; existing totals include dated absences. */
export function normalizeAbsenceTotals(data: StudyData): StudyData {
  const performance = { ...data.performance };
  for (const subject of data.subjects) {
    const existing = performance[subject.id];
    const hasDates = [0, 1, 2, 3].some((period) => datedAbsences(data, subject.id, period));
    if (!existing && !hasDates) continue;
    const current: Performance = existing ?? {
      max: "",
      min: "",
      goal: "",
      limit: "",
      sessions: [],
      grades: [],
    };
    performance[subject.id] = {
      ...current,
      grades: Array.from({ length: Math.max(4, current.grades.length) }, (_, period) => {
        const grade = current.grades[period] ?? {
          score: "",
          absences: "",
          behavior: "",
          warnings: "",
        };
        if (period > 3) return grade;
        const total = absenceTotal(data, subject.id, period);
        return {
          ...grade,
          absences: total || grade.absences !== "" ? String(total) : "",
          absenceCalendarCount: datedAbsences(data, subject.id, period),
          absenceThrough:
            grade.absenceThrough ??
            [dateKey(new Date()), attendancePeriods(data)[period]!.end].sort()[0]!,
          absencePastCount: datedAbsencesThrough(
            data,
            subject.id,
            period,
            grade.absenceThrough ??
              [dateKey(new Date()), attendancePeriods(data)[period]!.end].sort()[0]!,
          ),
        };
      }),
    };
  }
  return { ...data, performance };
}
export type AbsenceTarget = { subjectId: string; period: number; total: number };
export type AttendanceInference = {
  status: "complete" | "unique" | "ambiguous" | "incompatible" | "limited";
  dates: string[];
  message: string;
};
/** Solve counts, never ask a language model to invent dates. Equal weekdays remain ambiguous. */
export function inferAbsenceDates(
  data: StudyData,
  targets: AbsenceTarget[],
  today = dateKey(new Date()),
): AttendanceInference {
  const deficits = targets.map(
    (target) => target.total - datedAbsences(data, target.subjectId, target.period),
  );
  if (deficits.some((value) => value < 0))
    return {
      status: "incompatible",
      dates: [],
      message: "O calendário tem mais faltas que o boletim. Revise os valores ou os dias marcados.",
    };
  if (!deficits.some(Boolean))
    return {
      status: "complete",
      dates: [],
      message: "As faltas do boletim já estão representadas no calendário.",
    };
  const groups = new Map<string, { dates: string[]; vector: number[] }>();
  const periods = attendancePeriods(data);
  for (const period of new Set(targets.map((target) => target.period))) {
    const range = periods[period]!;
    const start = parseAttendanceDate(range.start),
      end = parseAttendanceDate(range.end);
    if (!start || !end)
      return {
        status: "incompatible",
        dates: [],
        message: "Configure as datas dos bimestres antes de cruzar o boletim com o horário.",
      };
    for (
      let date = new Date(start);
      date <= end && dateKey(date) <= today;
      date.setDate(date.getDate() + 1)
    ) {
      const key = dateKey(date);
      if (data.attendance?.[key]) continue; // Preserve both confirmed presence and absence.
      const vector = targets.map((target) =>
        target.period === period ? lessonsOnDate(data, key, target.subjectId) : 0,
      );
      if (!vector.some(Boolean) || vector.some((value, i) => value > deficits[i]!)) continue;
      const id = vector.join(",");
      const group = groups.get(id) ?? { dates: [], vector };
      group.dates.push(key);
      groups.set(id, group);
    }
  }
  const candidates = [...groups.values()];
  const capacity = candidates.map((_, index) =>
    targets.map((_, col) =>
      candidates
        .slice(index)
        .reduce((sum, group) => sum + group.vector[col]! * group.dates.length, 0),
    ),
  );
  let steps = 0,
    limited = false;
  const solutions: string[][] = [];
  const visit = (index: number, remaining: number[], dates: string[], ambiguous: boolean) => {
    if (++steps > 20_000) {
      limited = true;
      return;
    }
    if (solutions.length > 1) return;
    if (!remaining.some(Boolean)) {
      solutions.push(dates);
      if (ambiguous) solutions.push(dates);
      return;
    }
    if (
      index >= candidates.length ||
      remaining.some((value, col) => value > capacity[index]![col]!)
    )
      return;
    const group = candidates[index]!;
    const max = Math.min(
      group.dates.length,
      ...group.vector.flatMap((value, col) => (value ? [Math.floor(remaining[col]! / value)] : [])),
    );
    for (let count = 0; count <= max && solutions.length < 2 && !limited; count++)
      visit(
        index + 1,
        remaining.map((value, col) => value - count * group.vector[col]!),
        [...dates, ...group.dates.slice(0, count)],
        ambiguous || (count > 0 && count < group.dates.length),
      );
  };
  visit(0, deficits, [], false);
  if (limited)
    return {
      status: "limited",
      dates: [],
      message: "Há muitas combinações. Os totais serão salvos; confirme os dias pelo calendário.",
    };
  if (!solutions.length)
    return {
      status: "incompatible",
      dates: [],
      message:
        "Os totais não correspondem a dias inteiros no horário atual. Podem existir faltas parciais, feriados ou mudanças de horário. Os totais serão salvos sem inventar datas.",
    };
  return solutions.length > 1
    ? {
        status: "ambiguous",
        dates: solutions[0]!.sort(),
        message:
          "Mais de uma combinação de datas explica o boletim. Abaixo está uma possibilidade, não uma certeza. Confirme somente se você realmente faltou nesses dias; os totais podem ser salvos sem datas.",
      }
    : {
        status: "unique",
        dates: solutions[0]!.sort(),
        message:
          "Existe uma única combinação de dias inteiros compatível com os períodos, o horário atual e as presenças registradas. Confira as datas sugeridas.",
      };
}
export function applyAbsenceDates(
  data: StudyData,
  targets: AbsenceTarget[],
  dates: string[],
  today = dateKey(new Date()),
) {
  const attendance = { ...data.attendance };
  if (new Set(dates).size !== dates.length) throw new Error("Há datas repetidas na seleção.");
  for (const date of dates) {
    if (
      !parseAttendanceDate(date) ||
      date > today ||
      attendance[date] ||
      !targets.some(
        (target) =>
          periodForDate(data, date) === target.period &&
          lessonsOnDate(data, date, target.subjectId),
      )
    )
      throw new Error("A seleção de dias mudou ou contém uma data inválida. Confira novamente.");
    attendance[date] = "absent";
  }
  const next = { ...data, attendance };
  if (
    targets.some((target) => datedAbsences(next, target.subjectId, target.period) !== target.total)
  )
    throw new Error(
      "Essas datas não correspondem às faltas de todas as matérias do boletim. Revise os dias ou salve somente os totais.",
    );
  const performance = { ...data.performance };
  for (const target of targets) {
    const current = performance[target.subjectId]!;
    performance[target.subjectId] = {
      ...current,
      grades: current.grades.map((grade, index) =>
        index === target.period
          ? {
              ...grade,
              absences: String(target.total),
              absenceCalendarCount: datedAbsences(next, target.subjectId, index),
              absencePastCount: datedAbsencesThrough(
                next,
                target.subjectId,
                index,
                grade.absenceThrough ?? today,
              ),
            }
          : grade,
      ),
    };
  }
  return { ...next, performance };
}

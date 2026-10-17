import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useStudy } from "@/components/study-provider";
import {
  emptyPerformance,
  absenceBudget,
  calendarAbsences,
  maxWeeklyClasses,
  maxPeriodAbsences,
  performanceWeeklyClasses,
  validatePerformanceCounts,
  type Performance,
} from "@/lib/study-model";
import { Button } from "@/components/ui/button";
import { ReportPhotoImport } from "@/components/photo-imports";
export const Route = createFileRoute("/desempenho/$subjectId")({
  head: () => ({
    meta: [
      { title: "GStudy · Notas e desempenho" },
      { name: "description", content: "Acompanhe notas, faltas e tempo de estudo por matéria." },
      { property: "og:title", content: "GStudy · Notas e desempenho" },
      { property: "og:description", content: "Cada pequena evolução merece ser vista." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PerformancePage,
});
function PerformancePage() {
  const { subjectId } = Route.useParams();
  const { data, update, ready } = useStudy();
  const subject = data.subjects.find((s) => s.id === subjectId);
  const perf = data.performance[subjectId] || emptyPerformance();
  const [date, setDate] = useState("");
  const [minutes, setMinutes] = useState("");
  const change = (fn: (p: Performance) => Performance) =>
    update((d) => ({
      ...d,
      performance: {
        ...d.performance,
        [subjectId]: validatePerformanceCounts(
          d,
          subjectId,
          fn(d.performance[subjectId] || emptyPerformance()),
        ),
      },
    }));
  if (!subject) return <h1>{ready ? "Matéria não encontrada" : "Carregando…"}</h1>;
  const calendarTotal = calendarAbsences(data, subjectId);
  const manualTotal = perf.grades.reduce((sum, grade) => sum + Number(grade.absences || 0), 0);
  const weekly = performanceWeeklyClasses(data, subjectId);
  const scored = perf.grades.filter((g) => g.score !== "");
  const sum = scored.reduce((n, g) => n + Number(g.score), 0);
  const percent =
    Number(perf.max) && scored.length
      ? Math.round((sum / (Number(perf.max) * scored.length)) * 100)
      : null;
  return (
    <>
      <Link to="/materias/$subjectId" params={{ subjectId }} className="back-link">
        <ArrowLeft size={14} />
        {subject.name}
      </Link>
      <h1>Notas e desempenho</h1>
      <p className="page-subtitle">{subject.name} · Cada passo conta.</p>
      <ReportPhotoImport key={subjectId} subjectId={subjectId} />
      <div className="notes-grid">
        {(
          [
            { key: "max", label: "Nota bimestral" },
            { key: "min", label: "Nota mínima" },
            { key: "perWeek", label: "Aulas dessa matéria por semana" },
          ] as const
        ).map((f) => (
          <label className="form-label" key={f.key}>
            {f.label}
            <input
              type="number"
              min="0"
              max={f.key === "perWeek" ? maxWeeklyClasses(data) : undefined}
              step={f.key === "perWeek" ? "1" : "0.1"}
              placeholder={f.key === "perWeek" && weekly ? String(weekly) : undefined}
              className="form-input"
              value={perf[f.key] ?? ""}
              onChange={(e) => change((p) => ({ ...p, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {(() => {
        const abs = manualTotal + calendarTotal;
        const b = absenceBudget(weekly, abs);
        return (
          <div className={`absence-box ${b.over ? "danger" : ""}`}>
            <div>
              <small>Aulas no ano</small>
              <strong>{b.total || "—"}</strong>
            </div>
            <div>
              <small>Suas faltas</small>
              <strong>{abs}</strong>
            </div>
            <div>
              <small>Limite (25%)</small>
              <strong>{b.total ? b.limit : "—"}</strong>
            </div>
            <div>
              <small>Ainda pode faltar</small>
              <strong>{b.total ? b.remaining : "—"}</strong>
            </div>
            <p>
              {!b.total
                ? "Informe quantas aulas dessa matéria você tem por semana para calcular (×4 semanas ×12 meses)."
                : b.over
                  ? "Atenção: você passou do limite de 25% de faltas e corre risco de reprovação."
                  : `Frequência atual: ${b.frequency?.toLocaleString("pt-BR")}% · mínimo de 75%.`}
            </p>
          </div>
        );
      })()}
      <h2>Bimestres</h2>
      <p className="page-subtitle">
        Nas faltas de cada bimestre, informe apenas as faltas adicionais que ainda não marcou no
        calendário. As do calendário aparecem na linha própria e entram no total automaticamente,
        conforme o Horário das aulas.
      </p>
      <p className="page-subtitle">
        Até {maxWeeklyClasses(data)} aulas por semana (12 por dia letivo) e até{" "}
        {maxPeriodAbsences(data, subjectId)} faltas por bimestre, com base em 12 semanas. Aulas já
        cadastradas no Horário são usadas quando o campo semanal está vazio.
      </p>
      <div className="grade-scroll">
        <table className="grade-table">
          <thead>
            <tr>
              <th>Bimestre</th>
              <th>Nota</th>
              <th>Comportamento</th>
              <th>Advertências</th>
              <th>Faltas</th>
            </tr>
          </thead>
          <tbody>
            {perf.grades.map((g, i) => (
              <tr key={i}>
                <td>{i + 1}º</td>
                {(["score", "behavior", "warnings", "absences"] as const).map((key) => (
                  <td key={key}>
                    {key === "behavior" ? (
                      <select
                        className="form-input"
                        value={g.behavior}
                        onChange={(e) =>
                          change((p) => ({
                            ...p,
                            grades: p.grades.map((x, j) =>
                              j === i ? { ...x, behavior: e.target.value } : x,
                            ),
                          }))
                        }
                      >
                        {["", "Ótimo", "Bom", "Regular", "Ruim"].map((v) => (
                          <option key={v} value={v}>
                            {v || "—"}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label={`${key === "score" ? "Nota" : key === "absences" ? "Faltas" : "Advertências"} ${i + 1}º bimestre`}
                        type="number"
                        min="0"
                        max={key === "absences" ? maxPeriodAbsences(data, subjectId) : undefined}
                        step={key === "score" ? "0.1" : "1"}
                        className="form-input"
                        value={g[key]}
                        onChange={(e) =>
                          change((p) => ({
                            ...p,
                            grades: p.grades.map((x, j) =>
                              j === i ? { ...x, [key]: e.target.value } : x,
                            ),
                          }))
                        }
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={4}>
                Calendário (conforme horário)
              </th>
              <td aria-label="Faltas pelo calendário">{calendarTotal}</td>
            </tr>
            <tr>
              <th scope="row" colSpan={4}>
                Total de faltas
              </th>
              <td aria-label="Total de faltas">{manualTotal + calendarTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <section className="settings-section">
        <h2>Aproveitamento</h2>
        <p>{percent === null ? "—" : `${percent}% de aproveitamento`}</p>
        {Number(perf.min) > 0 && (
          <p>
            {sum >= Number(perf.min) * 4
              ? "Você já alcançou os pontos para passar."
              : `Faltam ${Math.max(0, Number(perf.min) * 4 - sum).toLocaleString("pt-BR")} pontos para atingir a nota mínima anual.`}
          </p>
        )}
        <p>
          {manualTotal + calendarTotal} faltas registradas ({calendarAbsences(data, subjectId)} pelo
          calendário)
        </p>
      </section>
      <section className="settings-section">
        <h2>Tempo de estudo</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              date &&
              Number(minutes) > 0 &&
              change((p) => ({
                ...p,
                sessions: [...p.sessions, { date, minutes: Number(minutes) }],
              }))
            )
              setMinutes("");
          }}
        >
          <label className="form-label">
            Dia
            <input
              className="form-input"
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="form-label">
            Minutos
            <input
              className="form-input"
              required
              type="number"
              min="1"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
          <Button className="mb-[10px]" type="submit">
            <Plus />
            Registrar
          </Button>
        </form>
        {perf.sessions.map((s, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-border py-2 text-xs"
          >
            <span>
              {s.date.split("-").reverse().join("/")} · {s.minutes} minutos
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Excluir registro"
              onClick={() =>
                change((p) => ({ ...p, sessions: p.sessions.filter((_, j) => j !== i) }))
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <p className="mt-4">Total: {perf.sessions.reduce((n, s) => n + s.minutes, 0)} minutos</p>
      </section>
    </>
  );
}

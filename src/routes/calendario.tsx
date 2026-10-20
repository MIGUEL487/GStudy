import {
  undatedSubjectAbsences,
  periodForDate,
  pendingAbsenceSuggestions,
} from "@/lib/attendance-model";
import { NotionCalendar } from "@/components/notion-calendar";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarCheck, Table2 } from "lucide-react";
import { ScheduleTable } from "@/components/schedule-table";
import { AnimatedNumber } from "@/components/animated-number";
import { useStudy } from "@/components/study-provider";
import { Button } from "@/components/ui/button";
import { dayBudget, defaultSchoolDays, scheduledWeeklyClasses } from "@/lib/study-model";

export const Route = createFileRoute("/calendario")({
  head: () => ({
    meta: [
      { title: "GStudy · Calendário de presença" },
      {
        name: "description",
        content: "Marque os dias em que foi ou faltou à aula e acompanhe sua frequência.",
      },
      { property: "og:title", content: "GStudy · Calendário de presença" },
      { property: "og:description", content: "Sua frequência, dia após dia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function CalendarPage() {
  const { data, update } = useStudy();
  const [tab, setTab] = useState<"presenca" | "horario">("presenca");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const days = data.schoolDays ?? defaultSchoolDays;
  const att = data.attendance ?? {};
  const cells: (Date | null)[] = Array(month.getDay()).fill(null);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let i = 1; i <= count; i++) cells.push(new Date(month.getFullYear(), month.getMonth(), i));
  const absent = Object.entries(att).filter(
    ([date, v]) => v === "absent" && periodForDate(data, date) >= 0,
  ).length;
  const present = Object.entries(att).filter(
    ([date, v]) => v === "present" && periodForDate(data, date) >= 0,
  ).length;
  const b = dayBudget(absent);
  const today = iso(new Date());
  const pending = pendingAbsenceSuggestions(data, today);
  const firstPending = Object.keys(pending).sort()[0];
  const undated = data.subjects.reduce(
    (sum, subject) => sum + undatedSubjectAbsences(data, subject.id),
    0,
  );
  const toggle = (key: string) =>
    update((d) => {
      const a = { ...(d.attendance ?? {}) };
      const cur = a[key];
      if (!cur) a[key] = "present";
      else if (cur === "present") a[key] = "absent";
      else delete a[key];
      return { ...d, attendance: a };
    });
  return (
    <>
      <div className="eyebrow">UM DIA DE CADA VEZ</div>
      <div className="welcome-row">
        <div>
          <h1>Calendário de presença</h1>
          <p>Toque no dia: uma vez para “fui”, duas para “faltei”, três para limpar.</p>
        </div>
      </div>
      <div className="tabs">
        <Button
          variant="ghost"
          className={tab === "presenca" ? "selected" : ""}
          onClick={() => setTab("presenca")}
        >
          <CalendarCheck />
          Presença
        </Button>
        <Button
          variant="ghost"
          className={tab === "horario" ? "selected" : ""}
          onClick={() => setTab("horario")}
        >
          <Table2 />
          Horário das aulas
        </Button>
      </div>
      {tab === "horario" ? (
        <ScheduleTable />
      ) : (
        <div className="page-enter">
          <div className={`absence-box ${b.over ? "danger" : ""}`}>
            <div>
              <small>Dias presentes</small>
              <strong>
                <AnimatedNumber value={present} />
              </strong>
            </div>
            <div>
              <small>Faltas</small>
              <strong>
                <AnimatedNumber value={absent} />
              </strong>
            </div>
            <div>
              <small>Limite no ano</small>
              <strong>{b.limit}</strong>
            </div>
            <div>
              <small>Ainda pode faltar</small>
              <strong>{b.remaining}</strong>
            </div>
            <p>
              {b.over
                ? "Atenção: você passou de 25% de faltas nos 200 dias letivos."
                : "Base: 200 dias letivos, frequência mínima de 75%."}
            </p>
          </div>
          <p className="page-subtitle">
            As {undated} falta(s) de aula lançadas na tabela aparecem como sugestões em ordem
            crescente, desde o início do bimestre. Elas já estão no total e aguardam a data real;
            não são dias confirmados.
          </p>
          {firstPending && (
            <Button
              variant="outline"
              className="mb-4"
              onClick={() => {
                const [year, monthNumber] = firstPending.split("-").map(Number);
                setMonth(new Date(year!, monthNumber! - 1, 1));
              }}
            >
              Ver primeiras faltas a localizar
            </Button>
          )}
          <div className="calendar">
            <div className="calendar-head">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Mês anterior"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                <ChevronLeft />
              </Button>
              <h2>{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Próximo mês"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
            <div className="calendar-grid" key={iso(month)}>
              {weekdays.map((w) => (
                <div className="calendar-weekday" key={w}>
                  {w}
                </div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} />;
                const key = iso(d);
                const school = days.includes(d.getDay()) && periodForDate(data, key) >= 0;
                const st = att[key];
                const suggestions = pending[key] ?? [];
                const pendingCount = suggestions.reduce((sum, item) => sum + item.count, 0);
                const details = suggestions
                  .map(
                    (item) =>
                      `${data.subjects.find((subject) => subject.id === item.subjectId)?.name ?? "Matéria"}: ${item.count}`,
                  )
                  .join(", ");
                return (
                  <button
                    key={key}
                    disabled={!school && !st}
                    onClick={() => toggle(key)}
                    title={pendingCount ? `Sugestão, data não confirmada: ${details}` : undefined}
                    aria-label={`${d.toLocaleDateString("pt-BR")}: ${st === "present" ? "presente" : st === "absent" ? "falta" : "sem registro"}${pendingCount ? `; ${pendingCount} falta(s) de aula a localizar: ${details}` : ""}`}
                    className={`calendar-day ${st ?? ""} ${pendingCount ? "pending" : ""} ${key === today ? "today" : ""} ${school ? "" : "off"}`}
                  >
                    <span>{d.getDate()}</span>
                    <small>
                      {st === "present"
                        ? "Fui"
                        : st === "absent"
                          ? "Faltei"
                          : pendingCount
                            ? `${pendingCount} a localizar`
                            : ""}
                    </small>
                    {pendingCount > 0 && (
                      <span className="calendar-pending-count" aria-hidden="true">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {!data.subjects.some((subject) => scheduledWeeklyClasses(data, subject.id) > 0) && (
            <p role="status" className="page-subtitle mt-4">
              Sem horário preenchido, cada marcação clara sugere uma aula por dia. Preencha seu
              horário para ajustar os dias de cada matéria.{" "}
              <Button variant="link" onClick={() => setTab("horario")}>
                Configurar horário das aulas
              </Button>
            </p>
          )}
          <p className="page-subtitle mt-4">
            Quando você marca “Faltei”, as aulas daquele dia (do seu Horário) entram nas faltas de
            cada matéria. Os dias de aula podem ser ajustados em Configurações.
          </p>
        </div>
      )}
      <NotionCalendar month={month} />
    </>
  );
}

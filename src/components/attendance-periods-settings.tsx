import { useState } from "react";
import { useStudy } from "./study-provider";
import { Button } from "./ui/button";
import { attendancePeriods, validateAttendancePeriods } from "@/lib/attendance-model";
export function AttendancePeriodsSettings() {
  const { data, update } = useStudy();
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const [year, setYear] = useState(data.attendanceYear ?? new Date().getFullYear());
  const [periods, setPeriods] = useState(() => attendancePeriods(data));
  return (
    <div className="mb-4">
      <Button
        variant="outline"
        onClick={() => {
          setPeriods(attendancePeriods(data));
          setYear(data.attendanceYear ?? new Date().getFullYear());
          setError("");
          setOpen(!open);
        }}
      >
        Ajustar períodos letivos
      </Button>
      {open && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              validateAttendancePeriods(year, periods);
              if (
                update((current) => ({
                  ...current,
                  attendanceYear: year,
                  attendancePeriods: periods,
                }))
              )
                setOpen(false);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Confira os períodos.");
            }
          }}
        >
          <p className="page-subtitle">
            Informe as datas reais da escola, incluindo as férias fora dos períodos quando possível.
            A divisão inicial usa quatro faixas de três meses; ajuste-as aos seus bimestres. O ano
            se refere à tabela atual, sem criar outro histórico de notas.
          </p>
          <label className="form-label">
            Ano do boletim
            <input
              type="number"
              min="2000"
              max="2100"
              step="1"
              required
              className="form-input"
              value={year}
              onChange={(event) => {
                const value = Number(event.target.value);
                setYear(value);
                if (Number.isInteger(value) && value >= 2000 && value <= 2100)
                  setPeriods(attendancePeriods({ attendanceYear: value }));
              }}
            />
          </label>
          {periods.map((period, index) => (
            <div key={index} className="flex flex-wrap gap-3">
              {(["start", "end"] as const).map((key) => (
                <label className="form-label" key={key}>
                  {key === "start" ? "Início" : "Fim"} do {index + 1}º bimestre
                  <input
                    required
                    type="date"
                    className="form-input"
                    value={period[key]}
                    onChange={(event) =>
                      setPeriods((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, [key]: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </div>
          ))}
          {error && <p role="alert">{error}</p>}
          <Button type="submit">Salvar períodos</Button>
        </form>
      )}
    </div>
  );
}

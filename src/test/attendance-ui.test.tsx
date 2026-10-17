import type { ReactNode, ComponentType } from "react";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
    useParams: () => ({ subjectId: "subject-0" }),
  }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/photo-imports", () => ({ ReportPhotoImport: () => null }));
vi.mock("@/components/notion-calendar", () => ({ NotionCalendar: () => null }));
import { StudyProvider } from "@/components/study-provider";
import { Route as calendarRoute } from "@/routes/calendario";
import { Route as performanceRoute } from "@/routes/desempenho.$subjectId";
import { ScheduleTable } from "@/components/schedule-table";
import { initialData, storageKey, emptyPerformance } from "@/lib/study-model";
const Calendar = (calendarRoute as unknown as { options: { component: ComponentType } }).options
  .component;
const Performance = (performanceRoute as unknown as { options: { component: ComponentType } })
  .options.component;
function Workspace() {
  const [tab, setTab] = useState("calendar");
  return (
    <StudyProvider>
      <button onClick={() => setTab("calendar")}>Ver calendário</button>
      <button onClick={() => setTab("performance")}>Ver tabela</button>
      {tab === "calendar" ? <Calendar /> : <Performance />}
    </StudyProvider>
  );
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 17, 12));
  mocks.error.mockClear();
  localStorage.clear();
  const data = initialData();
  data.schedule = { rows: 2, cells: { "1": ["subject-0", "subject-0"] } };
  data.performance["subject-0"] = emptyPerformance();
  localStorage.setItem(storageKey, JSON.stringify(data));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("Faltas do calendário e tabela", () => {
  it("mostra as aulas perdidas na tabela, persiste e remove sem duplicar faltas manuais", () => {
    const view = render(<Workspace />);
    fireEvent.click(screen.getByRole("button", { name: "12/10/2026: sem registro" }));
    fireEvent.click(screen.getByRole("button", { name: "12/10/2026: presente" }));
    fireEvent.click(screen.getByText("Ver tabela"));
    expect(screen.getByLabelText("Faltas pelo calendário")).toHaveTextContent("2");
    expect(screen.getByLabelText("Faltas 1º bimestre")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("Faltas 1º bimestre"), { target: { value: "3" } });
    expect(screen.getByLabelText("Total de faltas")).toHaveTextContent("5");
    view.unmount();
    render(<Workspace />);
    fireEvent.click(screen.getByText("Ver tabela"));
    expect(screen.getByLabelText("Total de faltas")).toHaveTextContent("5");
    fireEvent.click(screen.getByText("Ver calendário"));
    fireEvent.click(screen.getByRole("button", { name: "12/10/2026: falta" }));
    fireEvent.click(screen.getByText("Ver tabela"));
    expect(screen.getByLabelText("Faltas pelo calendário")).toHaveTextContent("0");
    expect(screen.getByLabelText("Total de faltas")).toHaveTextContent("3");
  });
  it("rejeita frações e 200 aulas semanais, mas permite registrar faltas acima de 25%", () => {
    render(<Workspace />);
    fireEvent.click(screen.getByText("Ver tabela"));
    const weekly = screen.getByLabelText("Aulas dessa matéria por semana");
    fireEvent.change(weekly, { target: { value: "200" } });
    expect(weekly).toHaveValue(null);
    expect(mocks.error).toHaveBeenLastCalledWith(expect.stringContaining("entre 0 e 60"));
    fireEvent.change(weekly, { target: { value: "3.56" } });
    expect(weekly).toHaveValue(null);
    fireEvent.change(weekly, { target: { value: "3" } });
    const absences = screen.getByLabelText("Faltas 1º bimestre");
    fireEvent.change(absences, { target: { value: "3.56" } });
    expect(absences).toHaveValue(null);
    fireEvent.change(absences, { target: { value: "37" } });
    expect(absences).toHaveValue(null);
    fireEvent.change(absences, { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Faltas 2º bimestre"), { target: { value: "10" } });
    expect(screen.getByLabelText("Total de faltas")).toHaveTextContent("40");
    expect(screen.getByText(/você passou do limite de 25%/)).toBeInTheDocument();
  });
  it("limita o horário a 12 aulas por dia", () => {
    const data = initialData();
    data.schedule = { rows: 12, cells: {} };
    localStorage.setItem(storageKey, JSON.stringify(data));
    render(
      <StudyProvider>
        <ScheduleTable />
      </StudyProvider>,
    );
    expect(screen.getByRole("button", { name: "Adicionar aula" })).toBeDisabled();
  });
});

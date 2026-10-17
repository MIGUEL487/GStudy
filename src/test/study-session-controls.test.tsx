import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({
  path: "/aprender/recall",
  search: { p: "plan", t: "topic" },
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (l: { pathname: string }) => unknown }) =>
    select({ pathname: router.path }),
  useSearch: () => router.search,
  useNavigate: () => router.navigate,
  Link: ({
    children,
    to,
    search: _search,
    ...props
  }: {
    children: ReactNode;
    to: string;
    search?: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
import { RecallSessionProvider } from "@/components/recall-session-provider";
import {
  FocusSessionHeader,
  RecallTimerPopup,
  useTestFocus,
} from "@/components/study-session-controls";
import { emptyRecallSession, recallSessionId, recallStorageKey } from "@/lib/recall-session";
const now = new Date("2026-10-16T12:00:00Z").getTime();
function Screen() {
  const focused = useTestFocus();
  return (
    <>
      <output aria-label="Foco">{String(focused)}</output>
      {focused && <FocusSessionHeader />}
      <RecallTimerPopup />
    </>
  );
}
function mount() {
  return render(
    <RecallSessionProvider userId="ana">
      <Screen />
    </RecallSessionProvider>,
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  localStorage.clear();
  router.path = "/aprender/recall";
  router.navigate.mockClear();
  localStorage.setItem(
    recallStorageKey("ana"),
    JSON.stringify({
      version: 1,
      sessions: {
        [recallSessionId(router.search)]: {
          ...emptyRecallSession,
          search: router.search,
          topic: "Áreas",
          phase: "study",
          deadline: now + 300000,
          updatedAt: now,
          material: { title: "Áreas", content: "Conteúdo", keyPoints: [] },
        },
      },
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("Foco e cronômetro persistente", () => {
  it.each(["/preparar/questoes", "/preparar/flashcards"])(
    "recolhe a navegação em %s e volta ao plano correto",
    (path) => {
      router.path = path;
      mount();
      expect(screen.getByLabelText("Foco")).toHaveTextContent("true");
      expect(screen.getByRole("link", { name: /Sair do teste/ })).toHaveAttribute(
        "href",
        "/preparar",
      );
    },
  );
  it("permite navegar durante a leitura e recolhe o menu ao terminar o prazo", () => {
    mount();
    expect(screen.getByLabelText("Foco")).toHaveTextContent("false");
    expect(screen.getByRole("timer")).toHaveTextContent("5:00");
    act(() => {
      vi.advanceTimersByTime(300000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("0:00");
    expect(screen.getByLabelText("Foco")).toHaveTextContent("true");
    expect(screen.getByRole("link", { name: /Sair do teste/ })).toHaveAttribute(
      "href",
      "/aprender",
    );
  });
  it("mostra a contagem nos cadernos e volta à escrita ao terminar", () => {
    router.path = "/materias/math";
    mount();
    expect(screen.getByRole("link", { name: /Continuar sessão/ })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("4:00");
    fireEvent.click(screen.getByRole("button", { name: "Recolher cronômetro" }));
    expect(screen.queryByText("Áreas")).not.toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("4:00");
    act(() => {
      vi.advanceTimersByTime(240000);
    });
    expect(router.navigate).toHaveBeenCalledWith({
      to: "/aprender/recall",
      search: router.search,
      replace: true,
    });
  });
  it("foca os demais testes mesmo com uma leitura de recall em andamento", () => {
    router.path = "/aprender/quiz";
    mount();
    expect(screen.getByLabelText("Foco")).toHaveTextContent("true");
    expect(screen.queryByRole("link", { name: /Continuar sessão/ })).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(300000);
    });
    expect(router.navigate).not.toHaveBeenCalled();
  });
  it("não reinicia o prazo após recarregar", () => {
    const view = mount();
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    view.unmount();
    mount();
    expect(screen.getByRole("timer")).toHaveTextContent("4:00");
  });
});

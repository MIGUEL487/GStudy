import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  validateUsernameFormat,
  checkSchoolYearRollover,
  POPULAR_SUBJECTS,
  POPULAR_EXAMS,
  WEEK_DAYS,
} from "@/lib/student-profile";
import { getNextSchoolYear, onboardingSchoolYears, schoolYearLabel } from "@/lib/school-year";
import { StudentOnboardingModal } from "@/components/student-onboarding-modal";
import { SchoolYearRolloverModal } from "@/components/school-year-rollover-modal";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    [key: string]: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/" }),
}));

// Mock Supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockImplementation((fn: string) => {
      if (fn === "check_username_available") return Promise.resolve({ data: true, error: null });
      if (fn === "save_student_onboarding")
        return Promise.resolve({ data: { id: "u1" }, error: null });
      if (fn === "advance_school_year") return Promise.resolve({ data: { id: "u1" }, error: null });
      return Promise.resolve({ data: null, error: null });
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-123", email: "aluno@escola.com" } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

// Mock useStudy
const mockUpdateStudy = vi.fn().mockReturnValue(true);
vi.mock("@/components/study-provider", () => ({
  useStudy: () => ({
    data: {
      name: "Estudante Teste",
      schoolYear: "medio-2",
      schoolDays: [1, 2, 3, 4, 5],
      subjects: [],
    },
    update: mockUpdateStudy,
  }),
}));

describe("Bloco 2: Onboarding e Perfil do Estudante", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Validação de Username", () => {
    it("aceita usernames válidos (minúsculas, números e sublinhados entre 3 e 20 chars)", () => {
      expect(validateUsernameFormat("aluno_10").valid).toBe(true);
      expect(validateUsernameFormat("miguel").valid).toBe(true);
      expect(validateUsernameFormat("ana_clara_2026").valid).toBe(true);
    });

    it("rejeita usernames curtos, longos ou com caracteres proibidos", () => {
      expect(validateUsernameFormat("ab").valid).toBe(false);
      expect(validateUsernameFormat("a".repeat(21)).valid).toBe(false);
      expect(validateUsernameFormat("aluno@escola.com").valid).toBe(false);
      expect(validateUsernameFormat("AlunoMaiusculo").valid).toBe(false);
      expect(validateUsernameFormat("aluno-com-traco").valid).toBe(false);
      expect(validateUsernameFormat("aluno espaco").valid).toBe(false);
    });
  });

  describe("Progressão e Virada de Ano Escolar", () => {
    it("calcula corretamente a progressão do ano escolar", () => {
      expect(getNextSchoolYear("fundamental-6")).toBe("fundamental-7");
      expect(getNextSchoolYear("fundamental-9")).toBe("medio-1");
      expect(getNextSchoolYear("medio-1")).toBe("medio-2");
      expect(getNextSchoolYear("medio-3")).toBe("cursinho");
      expect(getNextSchoolYear("cursinho")).toBe("superior");
      expect(getNextSchoolYear("superior")).toBeNull();
    });

    it("detecta virada de ano após 1º de janeiro quando o ano selecionado for anterior", () => {
      const currentYear = new Date().getFullYear();
      const pastDate = new Date(currentYear - 1, 5, 15).toISOString();

      const rollover = checkSchoolYearRollover({
        schoolYear: "medio-1",
        yearSelectedAt: pastDate,
      });

      expect(rollover.needsPrompt).toBe(true);
      expect(rollover.currentSchoolYear).toBe("medio-1");
      expect(rollover.suggestedNextYear).toBe("medio-2");
    });

    it("não solicita virada de ano se o ano já foi selecionado no ano corrente", () => {
      const currentDate = new Date().toISOString();

      const rollover = checkSchoolYearRollover({
        schoolYear: "medio-2",
        yearSelectedAt: currentDate,
      });

      expect(rollover.needsPrompt).toBe(false);
    });
  });

  describe("Componente StudentOnboardingModal", () => {
    it("permite preencher o fluxo de onboarding e concluir com sucesso", async () => {
      const onCompleted = vi.fn();

      render(
        <StudentOnboardingModal
          initialUsername="estudante_teste"
          initialDisplayName="Estudante Teste"
          onCompleted={onCompleted}
        />,
      );

      // Etapa 0: Identidade
      expect(screen.getByText("Como devemos te chamar?")).toBeInTheDocument();
      expect(screen.getByDisplayValue("estudante_teste")).toBeInTheDocument();

      // Aguarda validação de username
      await waitFor(() => {
        expect(screen.getByText(/está disponível/i)).toBeInTheDocument();
      });

      // Avança para a Etapa 1: Ano Escolar
      const nextBtn = screen.getByRole("button", { name: /Avançar/i });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText("Qual é o seu momento de estudo?")).toBeInTheDocument();
      });

      // Seleciona 3º ano EM
      const optionMedio3 = screen.getByRole("radio", { name: /3º ano · Ensino Médio/i });
      fireEvent.click(optionMedio3);

      // Avança para Etapa 2: Matéria Favorita
      fireEvent.click(screen.getByRole("button", { name: /Avançar/i }));

      await waitFor(() => {
        expect(screen.getByText("Qual matéria você mais gosta?")).toBeInTheDocument();
      });

      // Seleciona Física
      const optionFisica = screen.getByRole("radio", { name: "Física" });
      fireEvent.click(optionFisica);

      // Avança para Etapa 3: Dias de aula
      fireEvent.click(screen.getByRole("button", { name: /Avançar/i }));

      await waitFor(() => {
        expect(screen.getByText("Em quais dias você costuma ter aula?")).toBeInTheDocument();
      });

      // Avança para Etapa 4: Vestibulares (já que selecionou medio-3)
      fireEvent.click(screen.getByRole("button", { name: /Avançar/i }));

      await waitFor(() => {
        expect(screen.getByText("Quais provas você pretende prestar?")).toBeInTheDocument();
      });

      // Conclui onboarding
      const finishBtn = screen.getByRole("button", { name: /Avançar/i });
      fireEvent.click(finishBtn);

      await waitFor(() => {
        expect(screen.getByText(/Tudo pronto/i)).toBeInTheDocument();
      });

      const enterBtn = screen.getByRole("button", { name: /Entrar no GStudy/i });
      fireEvent.click(enterBtn);

      await waitFor(() => {
        expect(onCompleted).toHaveBeenCalledWith(
          expect.objectContaining({
            username: "estudante_teste",
            displayName: "Estudante Teste",
            schoolYear: "medio-3",
            favoriteSubject: "Física",
            onboardingCompleted: true,
          }),
        );
      });
    });
  });

  describe("Componente SchoolYearRolloverModal", () => {
    it("exibe o modal com sugestão de avanço e botão de manter", () => {
      const onDismiss = vi.fn();

      render(
        <SchoolYearRolloverModal
          currentSchoolYear="fundamental-9"
          suggestedNextYear="medio-1"
          currentCalendarYear={2026}
          onDismiss={onDismiss}
        />,
      );

      expect(screen.getByText("Novo ciclo de estudos começou!")).toBeInTheDocument();
      expect(screen.getByText(/Sim, avançar para 1º ano · Ensino médio/i)).toBeInTheDocument();
      expect(screen.getByText(/Continuar no 9º ano · Ensino fundamental/i)).toBeInTheDocument();
    });
  });
});

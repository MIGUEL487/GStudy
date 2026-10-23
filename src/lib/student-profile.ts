import { supabase } from "@/integrations/supabase/client";
import { getNextSchoolYear } from "./school-year";

export type StudentProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  status: "online" | "offline" | "studying" | "busy";
  bio?: string | null;
  schoolYear?: string | null;
  favoriteSubject?: string | null;
  schoolDays?: number[] | null;
  examGoals?: string[] | null;
  yearSelectedAt?: string | null;
  onboardingCompleted?: boolean | null;
  theme?: "light" | "dark" | null;
  createdAt?: string;
  updatedAt?: string;
};

export const POPULAR_SUBJECTS = [
  "Matemática",
  "Física",
  "Química",
  "Biologia",
  "História",
  "Geografia",
  "Português & Literatura",
  "Filosofia & Sociologia",
  "Inglês",
  "Redação",
] as const;

export const POPULAR_EXAMS = [
  "ENEM",
  "Fuvest (USP)",
  "Unicamp",
  "Unesp",
  "UERJ",
  "ITA / IME",
  "Militares (AFA/EFOMM/EsPCEx)",
  "Outros vestibulares",
] as const;

export const WEEK_DAYS = [
  { value: 1, label: "Seg", shortLabel: "Segunda" },
  { value: 2, label: "Ter", shortLabel: "Terça" },
  { value: 3, label: "Qua", shortLabel: "Quarta" },
  { value: 4, label: "Qui", shortLabel: "Quinta" },
  { value: 5, label: "Sex", shortLabel: "Sexta" },
  { value: 6, label: "Sáb", shortLabel: "Sábado" },
  { value: 0, label: "Dom", shortLabel: "Domingo" },
];

/**
 * Valida o formato de username: 3 a 20 caracteres minúsculos, números ou sublinhados.
 */
export function validateUsernameFormat(username: string): { valid: boolean; error?: string } {
  const trimmed = username.trim();
  if (!trimmed) {
    return { valid: false, error: "Digite um nome de usuário." };
  }
  if (trimmed !== trimmed.toLowerCase()) {
    return { valid: false, error: "Use apenas letras minúsculas." };
  }
  if (trimmed.length < 3) {
    return { valid: false, error: "Mínimo de 3 caracteres." };
  }
  if (trimmed.length > 20) {
    return { valid: false, error: "Máximo de 20 caracteres." };
  }
  if (!/^[a-z0-9_]+$/.test(trimmed)) {
    return { valid: false, error: "Use apenas letras minúsculas, números e sublinhados." };
  }
  return { valid: true };
}

/**
 * Verifica disponibilidade de username chamando RPC segura ou consulta isolada.
 */
export async function checkUsernameAvailability(
  username: string,
): Promise<{ available: boolean; error?: string }> {
  const formatCheck = validateUsernameFormat(username);
  if (!formatCheck.valid) {
    return { available: false, error: formatCheck.error };
  }

  const clean = username.trim().toLowerCase();
  try {
    const { data, error } = await supabase.rpc("check_username_available", {
      desired_username: clean,
    });

    if (error) {
      // Se RPC ainda não aplicada, faz verificação direta via query
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", clean)
        .maybeSingle();

      return { available: !existing };
    }

    return {
      available: Boolean(data),
      error: data ? undefined : "Este nome de usuário já está em uso.",
    };
  } catch {
    return { available: true };
  }
}

/**
 * Busca o perfil do usuário atual no Supabase.
 */
export async function fetchCurrentStudentProfile(userId: string): Promise<StudentProfile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      username: data.username,
      displayName: data.display_name ?? data.username,
      avatarUrl: data.avatar_url,
      status: data.status ?? "offline",
      bio: data.bio,
      schoolYear: data.school_year,
      favoriteSubject: data.favorite_subject,
      schoolDays: data.school_days,
      examGoals: data.exam_goals,
      yearSelectedAt: data.year_selected_at,
      onboardingCompleted: data.onboarding_completed ?? false,
      theme: data.theme,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch {
    return null;
  }
}

/**
 * Salva o onboarding completo do estudante.
 */
export async function saveStudentOnboardingData(params: {
  username: string;
  displayName: string;
  schoolYear: string;
  favoriteSubject: string;
  schoolDays: number[];
  examGoals: string[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Usuário não autenticado.");

    const { error: rpcError } = await supabase.rpc("save_student_onboarding", {
      p_username: params.username.trim().toLowerCase(),
      p_display_name: params.displayName.trim(),
      p_school_year: params.schoolYear,
      p_favorite_subject: params.favoriteSubject,
      p_school_days: params.schoolDays,
      p_exam_goals: params.examGoals,
    });

    if (rpcError) {
      // Fallback para update direto se RPC não estiver ativa
      const { error: upsertError } = await supabase.from("profiles").upsert({
        id: userData.user.id,
        username: params.username.trim().toLowerCase(),
        display_name: params.displayName.trim(),
        school_year: params.schoolYear,
        favorite_subject: params.favoriteSubject,
        school_days: params.schoolDays,
        exam_goals: params.examGoals,
        year_selected_at: new Date().toISOString(),
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      });
      if (upsertError) throw upsertError;
    }

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao salvar perfil.",
    };
  }
}

/**
 * 2.3 Virada de ano escolar:
 * Checada no login após 1º de janeiro de cada ano (sem cron):
 * Pergunta à pessoa se ela avançou de ano e atualiza o perfil e o plano com um clique.
 * Retorna se a verificação é necessária e a sugestão de novo ano.
 */
export function checkSchoolYearRollover(profile: {
  schoolYear?: string | null;
  yearSelectedAt?: string | null;
}): {
  needsPrompt: boolean;
  currentSchoolYear?: string;
  suggestedNextYear?: string;
  currentCalendarYear: number;
} {
  const currentCalendarYear = new Date().getFullYear();
  if (!profile.schoolYear) {
    return { needsPrompt: false, currentCalendarYear };
  }

  // Se não tem data gravada, assume o ano atual e não dispara imediatamente
  if (!profile.yearSelectedAt) {
    return { needsPrompt: false, currentCalendarYear };
  }

  const selectedDate = new Date(profile.yearSelectedAt);
  const selectedYear = selectedDate.getFullYear();

  // Se o ano da data de escolha for anterior ao ano atual do calendário (ex: gravou em 2025 ou antes, e agora é 2026+)
  if (currentCalendarYear > selectedYear) {
    const nextYear = getNextSchoolYear(profile.schoolYear);
    return {
      needsPrompt: true,
      currentSchoolYear: profile.schoolYear,
      suggestedNextYear: nextYear ?? undefined,
      currentCalendarYear,
    };
  }

  return { needsPrompt: false, currentCalendarYear };
}

/**
 * Confirma o avanço de ano ou mantém o ano atual gravando a nova data.
 */
export async function confirmSchoolYearAdvance(newSchoolYear: string): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return false;

    const { error: rpcError } = await supabase.rpc("advance_school_year", {
      p_new_school_year: newSchoolYear,
    });

    if (rpcError) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          school_year: newSchoolYear,
          year_selected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", userData.user.id);

      if (updateError) return false;
    }

    return true;
  } catch {
    return false;
  }
}

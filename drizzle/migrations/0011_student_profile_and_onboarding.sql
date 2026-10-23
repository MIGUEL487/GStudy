-- Migração 0011: Perfil do Estudante, Onboarding e Virada de Ano Escolar
-- Bloco 2: Onboarding e perfil do estudante (GStudy)
-- Como aplicar: Execute via Supabase SQL Editor ou migrations CLI no projeto de desenvolvimento/teste.

-- 1. Colunas adicionais em public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_year text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS favorite_subject text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_days integer[] DEFAULT ARRAY[1, 2, 3, 4, 5];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS exam_goals text[] DEFAULT ARRAY[]::text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS year_selected_at timestamptz DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme text DEFAULT 'light';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_school_year ON public.profiles (school_year);

-- 2. RPC para verificar disponibilidade de username em tempo real sem expor dados privados
CREATE OR REPLACE FUNCTION public.check_username_available(desired_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  clean_name text;
  taken boolean;
BEGIN
  IF desired_username IS NULL THEN
    RETURN false;
  END IF;

  clean_name := lower(trim(desired_username));

  -- Validação de formato: 3 a 20 caracteres minúsculos, números ou sublinhados
  IF clean_name !~ '^[a-z0-9_]{3,20}$' THEN
    RETURN false;
  END IF;

  -- Nomes reservados do sistema
  IF clean_name IN ('admin', 'gstudy', 'suporte', 'sistema', 'root', 'moderador', 'ajuda') THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE username = clean_name
      AND (auth.uid() IS NULL OR id != auth.uid())
  ) INTO taken;

  RETURN NOT taken;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated;

-- 3. RPC para salvar onboarding completo de forma atômica
CREATE OR REPLACE FUNCTION public.save_student_onboarding(
  p_username text,
  p_display_name text,
  p_school_year text,
  p_favorite_subject text,
  p_school_days integer[],
  p_exam_goals text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  clean_username text;
  result_row jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  clean_username := lower(trim(p_username));
  IF clean_username !~ '^[a-z0-9_]{3,20}$' THEN
    RAISE EXCEPTION 'Nome de usuário inválido. Use de 3 a 20 caracteres minúsculos, números ou sublinhados.';
  END IF;

  -- Checa unicidade
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = clean_username AND id != caller_id) THEN
    RAISE EXCEPTION 'Este nome de usuário já está em uso por outro estudante.';
  END IF;

  INSERT INTO public.profiles (
    id,
    username,
    display_name,
    school_year,
    favorite_subject,
    school_days,
    exam_goals,
    year_selected_at,
    onboarding_completed,
    updated_at
  )
  VALUES (
    caller_id,
    clean_username,
    trim(p_display_name),
    p_school_year,
    p_favorite_subject,
    coalesce(p_school_days, ARRAY[1, 2, 3, 4, 5]),
    coalesce(p_exam_goals, ARRAY[]::text[]),
    now(),
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    username = clean_username,
    display_name = trim(p_display_name),
    school_year = p_school_year,
    favorite_subject = p_favorite_subject,
    school_days = coalesce(p_school_days, profiles.school_days),
    exam_goals = coalesce(p_exam_goals, profiles.exam_goals),
    year_selected_at = now(),
    onboarding_completed = true,
    updated_at = now();

  SELECT to_jsonb(p) INTO result_row FROM public.profiles p WHERE p.id = caller_id;
  RETURN result_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_student_onboarding(text, text, text, text, integer[], text[]) TO authenticated;

-- 4. RPC para virada de ano escolar com data gravada
CREATE OR REPLACE FUNCTION public.advance_school_year(p_new_school_year text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  result_row jsonb;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  UPDATE public.profiles
  SET
    school_year = p_new_school_year,
    year_selected_at = now(),
    updated_at = now()
  WHERE id = caller_id;

  SELECT to_jsonb(p) INTO result_row FROM public.profiles p WHERE p.id = caller_id;
  RETURN result_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_school_year(text) TO authenticated;

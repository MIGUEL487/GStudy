import { useState, useEffect, useId } from "react";
import { m, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  GraduationCap,
  Sparkles,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { onboardingSchoolYears, schoolYearLabel } from "@/lib/school-year";
import {
  checkUsernameAvailability,
  saveStudentOnboardingData,
  validateUsernameFormat,
  POPULAR_SUBJECTS,
  POPULAR_EXAMS,
  WEEK_DAYS,
  type StudentProfile,
} from "@/lib/student-profile";
import { useStudy } from "./study-provider";
import "@/styles/onboarding.css";

interface StudentOnboardingModalProps {
  initialUsername?: string;
  initialDisplayName?: string;
  onCompleted: (profile: Partial<StudentProfile>) => void;
}

export function StudentOnboardingModal({
  initialUsername = "",
  initialDisplayName = "",
  onCompleted,
}: StudentOnboardingModalProps) {
  const { data: studyData, update: updateStudy } = useStudy();

  const [step, setStep] = useState(0);

  // Step 1: Identidade
  const [username, setUsername] = useState(initialUsername);
  const [displayName, setDisplayName] = useState(initialDisplayName || studyData.name || "");
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "unavailable" | "invalid"
  >("idle");
  const [usernameError, setUsernameError] = useState("");

  // Step 2: Ano Escolar
  const [schoolYear, setSchoolYear] = useState(studyData.schoolYear || "");

  // Step 3: Matéria Favorita
  const [favoriteSubject, setFavoriteSubject] = useState("Matemática");

  // Step 4: Dias de Aula (Seg a Sex por padrão)
  const [schoolDays, setSchoolDays] = useState<number[]>(
    studyData.schoolDays && studyData.schoolDays.length > 0
      ? studyData.schoolDays
      : [1, 2, 3, 4, 5],
  );

  // Step 5: Objetivos de Vestibular (se EM ou Cursinho)
  const [examGoals, setExamGoals] = useState<string[]>(["ENEM"]);

  const [saving, setSaving] = useState(false);

  const usernameId = useId();
  const displayNameId = useId();

  // Verifica se a etapa de vestibulares é relevante (Ensino Médio ou Cursinho)
  const isHighSchoolOrCursinho = schoolYear.startsWith("medio-") || schoolYear === "cursinho";

  // Total de etapas efetivas
  const totalSteps = isHighSchoolOrCursinho ? 5 : 4;
  const progressRatio = (step + 1) / (totalSteps + 1);

  // Debounced username check
  useEffect(() => {
    const clean = username.trim().toLowerCase();
    if (!clean) {
      setUsernameStatus("idle");
      setUsernameError("");
      return;
    }

    const formatCheck = validateUsernameFormat(clean);
    if (!formatCheck.valid) {
      setUsernameStatus("invalid");
      setUsernameError(formatCheck.error ?? "Nome de usuário inválido.");
      return;
    }

    setUsernameStatus("checking");
    setUsernameError("");

    const timer = setTimeout(async () => {
      const result = await checkUsernameAvailability(clean);
      if (result.available) {
        setUsernameStatus("available");
        setUsernameError("");
      } else {
        setUsernameStatus("unavailable");
        setUsernameError(result.error ?? "Nome de usuário indisponível.");
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [username]);

  const toggleDay = (day: number) => {
    setSchoolDays((prev) =>
      prev.includes(day)
        ? prev.length > 1
          ? prev.filter((d) => d !== day)
          : prev
        : [...prev, day].sort((a, b) => a - b),
    );
  };

  const toggleExamGoal = (exam: string) => {
    setExamGoals((prev) =>
      prev.includes(exam) ? prev.filter((e) => e !== exam) : [...prev, exam],
    );
  };

  const canAdvance = () => {
    if (step === 0) {
      return (
        usernameStatus === "available" &&
        displayName.trim().length >= 2 &&
        displayName.trim().length <= 60
      );
    }
    if (step === 1) {
      return Boolean(schoolYear);
    }
    if (step === 2) {
      return Boolean(favoriteSubject);
    }
    if (step === 3) {
      return schoolDays.length > 0;
    }
    if (step === 4 && isHighSchoolOrCursinho) {
      return examGoals.length > 0;
    }
    return true;
  };

  const handleNext = () => {
    if (!canAdvance()) return;

    if (step === 3 && !isHighSchoolOrCursinho) {
      // Pula a etapa de vestibular e vai direto para a conclusão
      setStep(5);
      return;
    }

    if (step === 4) {
      setStep(5);
      return;
    }

    if (step === 5) {
      handleComplete();
      return;
    }

    setStep((prev) => prev + 1);
  };

  const handleBack = () => {
    if (step === 0) return;
    if (step === 5 && !isHighSchoolOrCursinho) {
      setStep(3);
      return;
    }
    setStep((prev) => prev - 1);
  };

  const handleComplete = async () => {
    if (saving) return;
    setSaving(true);

    const cleanUser = username.trim().toLowerCase();
    const cleanDisplay = displayName.trim();

    // Atualiza workspace local
    updateStudy((prev) => ({
      ...prev,
      name: cleanDisplay,
      schoolYear: schoolYear,
      schoolDays: schoolDays,
    }));

    // Salva perfil persistente no Supabase
    const result = await saveStudentOnboardingData({
      username: cleanUser,
      displayName: cleanDisplay,
      schoolYear,
      favoriteSubject,
      schoolDays,
      examGoals: isHighSchoolOrCursinho ? examGoals : [],
    });

    setSaving(false);

    if (result.success) {
      toast.success("Boas-vindas ao seu espaço de estudos!");
      onCompleted({
        username: cleanUser,
        displayName: cleanDisplay,
        schoolYear,
        favoriteSubject,
        schoolDays,
        examGoals: isHighSchoolOrCursinho ? examGoals : [],
        onboardingCompleted: true,
      });
    } else {
      toast.error(result.error ?? "Não foi possível salvar seu perfil agora.");
    }
  };

  const animationVariants = {
    initial: { opacity: 0, x: 16 },
    animate: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
    },
    exit: {
      opacity: 0,
      x: -16,
      transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <div
      className="onboarding-fullscreen"
      role="dialog"
      aria-modal="true"
      aria-label="Configuração inicial do estudante"
    >
      <div className="onboarding-container">
        {/* Header com barra de progresso e voltar */}
        <header className="onboarding-header">
          <div
            className="onboarding-progress-track"
            role="progressbar"
            aria-valuenow={Math.round(progressRatio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="onboarding-progress-fill"
              style={{ transform: `scaleX(${progressRatio})` }}
            />
          </div>

          <div className="onboarding-top-nav">
            {step > 0 && step < 5 ? (
              <button
                type="button"
                className="onboarding-back-btn"
                onClick={handleBack}
                aria-label="Voltar para a etapa anterior"
              >
                <ArrowLeft size={16} />
                <span>Voltar</span>
              </button>
            ) : (
              <div />
            )}

            <span className="onboarding-step-counter">
              {step < 5 ? `Etapa ${step + 1} de ${totalSteps}` : "Finalização"}
            </span>
          </div>
        </header>

        {/* Conteúdo Dinâmico por Etapa */}
        <div className="onboarding-content">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <m.div
                key="step-identity"
                variants={animationVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <h1 className="onboarding-title">Como devemos te chamar?</h1>
                <p className="onboarding-subtitle">
                  Escolha seu identificador exclusivo no GStudy e o nome que seus colegas verão.
                </p>

                <div className="onboarding-input-group">
                  <div className="onboarding-input-wrapper">
                    <label htmlFor={displayNameId}>Nome de exibição</label>
                    <input
                      id={displayNameId}
                      type="text"
                      className="onboarding-text-input"
                      placeholder="Ex: Clara Mendes"
                      value={displayName}
                      maxLength={60}
                      onChange={(e) => setDisplayName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="onboarding-input-wrapper">
                    <label htmlFor={usernameId}>Nome de usuário (@username)</label>
                    <input
                      id={usernameId}
                      type="text"
                      className="onboarding-text-input font-mono"
                      placeholder="Ex: clara_mendes"
                      value={username}
                      maxLength={20}
                      onChange={(e) =>
                        setUsername(e.target.value.toLowerCase().replace(/\s+/g, "_"))
                      }
                    />

                    {usernameStatus === "checking" && (
                      <span className="onboarding-input-status">
                        <Clock size={12} className="animate-spin" /> Verificando disponibilidade...
                      </span>
                    )}

                    {usernameStatus === "available" && (
                      <span className="onboarding-input-status valid">
                        <CheckCircle2 size={12} /> @{username} está disponível!
                      </span>
                    )}

                    {(usernameStatus === "unavailable" || usernameStatus === "invalid") && (
                      <span className="onboarding-input-status error">
                        <XCircle size={12} /> {usernameError}
                      </span>
                    )}
                  </div>
                </div>
              </m.div>
            )}

            {step === 1 && (
              <m.div
                key="step-school-year"
                variants={animationVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <h1 className="onboarding-title">Qual é o seu momento de estudo?</h1>
                <p className="onboarding-subtitle">
                  Isso ajusta a profundidade das explicações, questões e planos de estudo.
                </p>

                <div className="onboarding-options-grid" role="radiogroup" aria-label="Ano escolar">
                  {onboardingSchoolYears.map((item) => {
                    const isSelected = schoolYear === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`onboarding-option-card ${isSelected ? "selected" : ""}`}
                        onClick={() => setSchoolYear(item.value)}
                      >
                        <span className="option-title">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </m.div>
            )}

            {step === 2 && (
              <m.div
                key="step-favorite-subject"
                variants={animationVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <h1 className="onboarding-title">Qual matéria você mais gosta?</h1>
                <p className="onboarding-subtitle">
                  Usamos sua matéria preferida como ponto de partida amigável para suas primeiras
                  sessões.
                </p>

                <div
                  className="onboarding-options-grid"
                  role="radiogroup"
                  aria-label="Matéria favorita"
                >
                  {POPULAR_SUBJECTS.map((subj) => {
                    const isSelected = favoriteSubject === subj;
                    return (
                      <button
                        key={subj}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`onboarding-option-card ${isSelected ? "selected" : ""}`}
                        onClick={() => setFavoriteSubject(subj)}
                      >
                        <span className="option-title">{subj}</span>
                      </button>
                    );
                  })}
                </div>
              </m.div>
            )}

            {step === 3 && (
              <m.div
                key="step-school-days"
                variants={animationVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <h1 className="onboarding-title">Em quais dias você costuma ter aula?</h1>
                <p className="onboarding-subtitle">
                  Esses dias estruturam automaticamente sua grade e presença na Agenda.
                </p>

                <div
                  className="flex flex-wrap gap-2.5 pt-2"
                  role="group"
                  aria-label="Dias da semana"
                >
                  {WEEK_DAYS.map((day) => {
                    const isSelected = schoolDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        aria-pressed={isSelected}
                        className={`onboarding-option-card flex-1 min-w-[70px] text-center items-center ${
                          isSelected ? "selected" : ""
                        }`}
                        onClick={() => toggleDay(day.value)}
                      >
                        <span className="font-semibold text-sm">{day.label}</span>
                        <span className="text-[11px] opacity-70">{day.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </m.div>
            )}

            {step === 4 && isHighSchoolOrCursinho && (
              <m.div
                key="step-exam-goals"
                variants={animationVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <h1 className="onboarding-title">Quais provas você pretende prestar?</h1>
                <p className="onboarding-subtitle">
                  Selecione os vestibulares que estão no seu radar. Você pode escolher mais de um.
                </p>

                <div
                  className="onboarding-options-grid"
                  role="group"
                  aria-label="Objetivos de vestibular"
                >
                  {POPULAR_EXAMS.map((exam) => {
                    const isSelected = examGoals.includes(exam);
                    return (
                      <button
                        key={exam}
                        type="button"
                        aria-pressed={isSelected}
                        className={`onboarding-option-card ${isSelected ? "selected" : ""}`}
                        onClick={() => toggleExamGoal(exam)}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="option-title">{exam}</span>
                          {isSelected && <Check size={14} className="text-accent" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </m.div>
            )}

            {(step === 5 || (step === 4 && !isHighSchoolOrCursinho)) && (
              <m.div
                key="step-conclusion"
                variants={animationVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="text-center py-6"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/20 text-accent mb-4">
                  <Sparkles size={32} />
                </div>
                <h1 className="onboarding-title">Tudo pronto, {displayName.trim()}!</h1>
                <p className="onboarding-subtitle max-w-md mx-auto">
                  Seu santuário de estudos está preparado para o {schoolYearLabel(schoolYear)}. Bons
                  estudos!
                </p>
              </m.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer com botão avançar / concluir */}
        <footer className="onboarding-footer">
          <button
            type="button"
            className="onboarding-next-btn"
            disabled={!canAdvance() || saving}
            onClick={step < 5 ? handleNext : handleComplete}
          >
            {saving ? (
              <span>Salvando...</span>
            ) : step < 5 ? (
              <>
                <span>Avançar</span>
                <ArrowRight size={16} />
              </>
            ) : (
              <>
                <span>Entrar no GStudy</span>
                <Check size={16} />
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { GraduationCap, ArrowRight, Check, Calendar } from "lucide-react";
import { toast } from "sonner";
import { schoolYearLabel } from "@/lib/school-year";
import { confirmSchoolYearAdvance } from "@/lib/student-profile";
import { useStudy } from "./study-provider";
import "@/styles/onboarding.css";

interface SchoolYearRolloverModalProps {
  currentSchoolYear: string;
  suggestedNextYear?: string;
  currentCalendarYear: number;
  onDismiss: () => void;
}

export function SchoolYearRolloverModal({
  currentSchoolYear,
  suggestedNextYear,
  currentCalendarYear,
  onDismiss,
}: SchoolYearRolloverModalProps) {
  const { update } = useStudy();
  const [submitting, setSubmitting] = useState(false);

  const handleAdvance = async () => {
    if (!suggestedNextYear || submitting) return;
    setSubmitting(true);

    const success = await confirmSchoolYearAdvance(suggestedNextYear);
    if (success) {
      update((prev) => ({ ...prev, schoolYear: suggestedNextYear }));
      toast.success(`Ano escolar atualizado para ${schoolYearLabel(suggestedNextYear)}!`);
      onDismiss();
    } else {
      toast.error("Não foi possível atualizar o ano escolar. Tente novamente.");
    }
    setSubmitting(false);
  };

  const handleKeepCurrent = async () => {
    if (submitting) return;
    setSubmitting(true);

    const success = await confirmSchoolYearAdvance(currentSchoolYear);
    if (success) {
      toast.info(`Mantido no ${schoolYearLabel(currentSchoolYear)}.`);
      onDismiss();
    } else {
      toast.error("Não foi possível confirmar a escolha.");
    }
    setSubmitting(false);
  };

  return (
    <div
      className="rollover-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Atualização de ano letivo"
    >
      <div className="rollover-card">
        <div className="flex items-center gap-2.5 text-accent mb-2">
          <Calendar size={20} />
          <span className="text-xs uppercase tracking-wider font-semibold">
            Ano Letivo {currentCalendarYear}
          </span>
        </div>

        <h3>Novo ciclo de estudos começou!</h3>
        <p>
          Identificamos que você estava matriculado no{" "}
          <strong>{schoolYearLabel(currentSchoolYear)}</strong>. Você avançou de etapa neste ano?
        </p>

        <div className="rollover-actions">
          {suggestedNextYear && (
            <button
              type="button"
              className="onboarding-next-btn w-full justify-between"
              disabled={submitting}
              onClick={handleAdvance}
            >
              <span>Sim, avançar para {schoolYearLabel(suggestedNextYear)}</span>
              <ArrowRight size={16} />
            </button>
          )}

          <button
            type="button"
            className="onboarding-back-btn w-full justify-center border border-border"
            disabled={submitting}
            onClick={handleKeepCurrent}
          >
            <span>Continuar no {schoolYearLabel(currentSchoolYear)}</span>
          </button>

          <div className="text-center mt-2">
            <Link
              to="/configuracoes"
              search={{ tab: "profile" }}
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={onDismiss}
            >
              Escolher outro ano nas configurações
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

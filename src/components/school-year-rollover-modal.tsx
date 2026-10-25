import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { GraduationCap, ArrowRight, Check, Calendar } from "lucide-react";
import { toast } from "sonner";
import { schoolYearLabel } from "@/lib/school-year";
import { confirmSchoolYearAdvance } from "@/lib/student-profile";
import { useStudy } from "./study-provider";
import "@/styles/onboarding.css";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";

interface SchoolYearRolloverModalProps {
  currentSchoolYear: string;
  suggestedNextYear?: string | undefined;
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent className="rollover-card" aria-describedby="rollover-explanation">
        <div className="flex items-center gap-2.5 text-accent mb-2">
          <Calendar size={20} />
          <span className="text-xs uppercase tracking-wider font-semibold">
            Ano Letivo {currentCalendarYear}
          </span>
        </div>

        <DialogTitle>Novo ano letivo</DialogTitle>
        <DialogDescription id="rollover-explanation">
          Sua etapa prevista agora é{" "}
          <strong>{schoolYearLabel(suggestedNextYear ?? currentSchoolYear)}</strong>. Confirme ou
          altere nas configurações.
        </DialogDescription>

        <div className="rollover-actions">
          {suggestedNextYear && (
            <button
              type="button"
              className="onboarding-next-btn w-full justify-between"
              disabled={submitting}
              onClick={handleAdvance}
            >
              <span>Confirmar {schoolYearLabel(suggestedNextYear)}</span>
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
      </DialogContent>
    </Dialog>
  );
}

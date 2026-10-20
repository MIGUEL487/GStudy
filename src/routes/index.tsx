import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import {
  BookOpen,
  NotebookPen,
  Play,
  Plus,
  ArrowUpRight,
  Sprout,
  Clock,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStudy } from "@/components/study-provider";
import { CreateDialog } from "@/components/create-dialog";
import { addSubject, removeSubject, type Subject } from "@/lib/study-model";
import { studyImage } from "@/lib/images";
import { SubjectIcon, subjectColor } from "@/components/subject-icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GStudy · Meu espaço de estudo" },
      {
        name: "description",
        content: "Organize suas matérias, crie cadernos e reúna seus cursos no GStudy.",
      },
      { property: "og:title", content: "GStudy · Meu espaço de estudo" },
      {
        property: "og:description",
        content: "Seu ritmo. Sua jornada. Um espaço tranquilo para aprender.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { data, update, ready } = useStudy();
  const [creating, setCreating] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);

  const totalNotes = data.subjects.reduce((n, s) => n + s.notebooks.length, 0);
  const totalCourses = data.subjects.reduce((n, s) => n + s.courses.length, 0);

  const handleDeleteSubject = (subj: Subject) => {
    const backupData = data;
    const ok = update((d) => removeSubject(d, subj.id));
    if (ok) {
      toast.success(`Matéria “${subj.name}” excluída.`, {
        action: {
          label: "Desfazer",
          onClick: () => {
            update(() => backupData);
            toast.success(`Matéria “${subj.name}” restaurada.`);
          },
        },
        duration: 6000,
      });
    }
    setSubjectToDelete(null);
  };

  return (
    <>
      <div className="eyebrow">UM NOVO DIA, NOVAS POSSIBILIDADES</div>
      <div className="welcome-row">
        <div>
          <h1>{data.name ? `Olá, ${data.name.split(" ")[0]}.` : "Seu próximo capítulo."}</h1>
          <p>Que tal continuar evoluindo hoje? Um passo de cada vez.</p>
        </div>
        <span className="day-label">
          <Sprout size={14} className="inline mr-2" />
          Aprender é cultivar o futuro.
        </span>
      </div>

      <section className="study-banner">
        <img
          src={studyImage.url}
          alt="Mesa de estudos iluminada pelo sol, com livros, caderno e uma xícara"
        />
        <div className="banner-copy">
          <div className="eyebrow">SEU MOMENTO DE CONCENTRAÇÃO</div>
          <h2>
            Pequenos passos.
            <br />
            Grandes descobertas.
          </h2>
          <p>O conhecimento floresce quando você cuida dele todos os dias.</p>
          <div className="banner-bottom">
            <Clock size={13} />
            Reserve um momento para você.
          </div>
        </div>
      </section>

      <div className="overview">
        {[
          { icon: BookOpen, count: data.subjects.length, label: "Matérias para explorar" },
          { icon: NotebookPen, count: totalNotes, label: "Cadernos de ideias" },
          { icon: Play, count: totalCourses, label: "Cursos na sua jornada" },
        ].map((s) => (
          <div className="overview-item" key={s.label}>
            <div className="stat-icon">
              <s.icon size={19} />
            </div>
            <div>
              <strong>{String(s.count).padStart(2, "0")}</strong>
              <small>{s.label}</small>
            </div>
          </div>
        ))}
      </div>

      <div className="section-heading">
        <div>
          <h2>Suas matérias</h2>
          <p>Cada assunto é uma porta para algo novo.</p>
        </div>
        <Button variant="outline" size="sm" disabled={!ready} onClick={() => setCreating(true)}>
          <Plus />
          Nova matéria
        </Button>
      </div>

      <div className="subject-grid">
        {data.subjects.map((s) => {
          return (
            <article
              className="subject-card subject-card--colored"
              key={s.id}
              style={{ "--subject-color": subjectColor(s.name) } as CSSProperties}
            >
              <div className="cover-icon subject-icon-frame" title={`Matéria: ${s.name}`}>
                <SubjectIcon name={s.name} size={23} />
              </div>
              <Link to="/materias/$subjectId" params={{ subjectId: s.id }} className="card-link">
                <h3>{s.name}</h3>
                <div className="card-meta">
                  <span>
                    {s.notebooks.length} {s.notebooks.length === 1 ? "caderno" : "cadernos"}
                  </span>
                  <span>·</span>
                  <span>
                    {s.courses.length} {s.courses.length === 1 ? "curso" : "cursos"}
                  </span>
                </div>
                <div className="card-footer">
                  <span>Continuar aprendendo</span>
                  <ArrowUpRight size={15} />
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="delete-item"
                title={`Excluir ${s.name}`}
                aria-label={`Excluir ${s.name}`}
                onClick={() => setSubjectToDelete(s)}
              >
                <Trash2 size={13} />
              </Button>
            </article>
          );
        })}
        <Button
          variant="ghost"
          className="add-card"
          disabled={!ready}
          onClick={() => setCreating(true)}
        >
          <span className="add-symbol">
            <Plus size={18} />
          </span>
          Explorar uma nova matéria
        </Button>
      </div>

      <AlertDialog
        open={Boolean(subjectToDelete)}
        onOpenChange={(open) => !open && setSubjectToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir matéria?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a matéria “{subjectToDelete?.name}”? Seus cadernos,
              cursos, presenças, notas e horários relacionados serão removidos. Você terá alguns
              segundos para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (subjectToDelete) handleDeleteSubject(subjectToDelete);
              }}
            >
              Excluir matéria
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateDialog
        kind="matéria"
        open={creating}
        onOpenChange={setCreating}
        onCreate={(name) => {
          const ok = update((d) => {
            const res = addSubject(d, name);
            return res.data;
          });
          if (ok) toast.success("Matéria criada. Um novo começo!");
          return ok;
        }}
      />
    </>
  );
}

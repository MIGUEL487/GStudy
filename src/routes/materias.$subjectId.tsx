import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { NotebookPen, Play, Plus, ArrowLeft, ArrowUpRight, Trash2, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStudy } from "@/components/study-provider";
import { CreateDialog } from "@/components/create-dialog";
import { addNotebook, addCourse } from "@/lib/study-model";
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

export const Route = createFileRoute("/materias/$subjectId")({
  head: () => ({
    meta: [
      { title: "GStudy · Cadernos e cursos" },
      { name: "description", content: "Seus cadernos, cursos e desempenho reunidos por matéria." },
      { property: "og:title", content: "GStudy · Cadernos e cursos" },
      { property: "og:description", content: "Reúna ideias e continue aprendendo, no seu ritmo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SubjectPage,
});

function SubjectPage() {
  const { subjectId } = Route.useParams();
  const { data, ready, update } = useStudy();
  const subject = data.subjects.find((s) => s.id === subjectId);
  const [tab, setTab] = useState<"caderno" | "curso">("caderno");
  const [creating, setCreating] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{
    id: string;
    title: string;
    kind: "caderno" | "curso";
  } | null>(null);

  if (!subject) {
    return (
      <>
        <h1>{ready ? "Matéria não encontrada" : "Carregando…"}</h1>
        <Link to="/" className="back-link">
          Voltar ao início
        </Link>
      </>
    );
  }

  const handleConfirmDelete = () => {
    if (!itemToDelete) return;
    const { id, title, kind } = itemToDelete;
    const backupData = data;
    const ok = update((d) => ({
      ...d,
      subjects: d.subjects.map((s) =>
        s.id === subjectId
          ? {
              ...s,
              notebooks: kind === "caderno" ? s.notebooks.filter((n) => n.id !== id) : s.notebooks,
              courses: kind === "curso" ? s.courses.filter((c) => c.id !== id) : s.courses,
            }
          : s,
      ),
    }));

    if (ok) {
      toast.success(`${kind === "caderno" ? "Caderno" : "Curso"} excluído.`, {
        action: {
          label: "Desfazer",
          onClick: () => {
            update(() => backupData);
            toast.success(`Exclusão de “${title}” desfeita.`);
          },
        },
        duration: 5000,
      });
    }
    setItemToDelete(null);
  };

  return (
    <>
      <Link to="/" className="back-link">
        <ArrowLeft size={14} />
        Todas as matérias
      </Link>
      <div className="subject-header">
        <div
          className="cover-icon subject-icon-frame"
          style={{ background: subjectColor(subject.name) }}
        >
          <SubjectIcon name={subject.name} size={28} />
        </div>
        <div>
          <div className="eyebrow">MATÉRIA EM FOCO</div>
          <h1>{subject.name}</h1>
          <p>
            {subject.notebooks.length}{" "}
            {subject.notebooks.length === 1 ? "caderno de ideias" : "cadernos de ideias"} ·{" "}
            {subject.courses.length}{" "}
            {subject.courses.length === 1 ? "curso salvo" : "cursos salvos"}
          </p>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === "caderno" ? "active" : ""}`}
          onClick={() => setTab("caderno")}
        >
          <NotebookPen size={16} />
          Cadernos ({subject.notebooks.length})
        </button>
        <button
          className={`tab ${tab === "curso" ? "active" : ""}`}
          onClick={() => setTab("curso")}
        >
          <Play size={16} />
          Cursos ({subject.courses.length})
        </button>
      </div>

      <div className="tab-content">
        <div className="section-heading">
          <div>
            <h2>{tab === "caderno" ? "Seus cadernos" : "Cursos recomendados"}</h2>
            <p>
              {tab === "caderno"
                ? "Um espaço em branco para registrar pensamentos e descobertas."
                : "Aulas e materiais que enriquecem o seu aprendizado."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus />
            {tab === "caderno" ? "Novo caderno" : "Novo curso"}
          </Button>
        </div>

        <div className="subject-grid">
          {tab === "caderno"
            ? subject.notebooks.map((n) => (
                <article className="subject-card" key={n.id}>
                  <Link
                    to="/cadernos/$notebookId"
                    params={{ notebookId: n.id }}
                    className="card-link"
                  >
                    <div className="cover-icon tone-warm">
                      <NotebookPen size={22} />
                    </div>
                    <h3>{n.title}</h3>
                    <div className="card-meta">
                      {n.text.trim() ? n.text.trim().split(/\s+/).length : 0} palavras
                    </div>
                    <div className="card-footer">
                      <span>Abrir caderno</span>
                      <ArrowUpRight size={14} />
                    </div>
                  </Link>
                  <Button
                    className="delete-item"
                    variant="ghost"
                    size="icon"
                    title={`Excluir ${n.title}`}
                    aria-label={`Excluir ${n.title}`}
                    onClick={() => setItemToDelete({ id: n.id, title: n.title, kind: "caderno" })}
                  >
                    <Trash2 />
                  </Button>
                </article>
              ))
            : subject.courses.map((c) => (
                <article className="subject-card" key={c.id}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="card-link">
                    <div className="cover-icon tone-green">
                      <Play size={22} />
                    </div>
                    <h3>{c.title}</h3>
                    <div className="card-meta">{new URL(c.url).hostname}</div>
                    <div className="card-footer">
                      <span>Acessar curso</span>
                      <ArrowUpRight size={14} />
                    </div>
                  </a>
                  <Button
                    className="delete-item"
                    variant="ghost"
                    size="icon"
                    title={`Excluir ${c.title}`}
                    aria-label={`Excluir ${c.title}`}
                    onClick={() => setItemToDelete({ id: c.id, title: c.title, kind: "curso" })}
                  >
                    <Trash2 />
                  </Button>
                </article>
              ))}
          <Button variant="ghost" className="add-card" onClick={() => setCreating(true)}>
            <span className="add-symbol">
              <Plus size={18} />
            </span>
            {tab === "caderno" ? "Criar um novo caderno" : "Adicionar um novo curso"}
          </Button>
        </div>
      </div>

      <div className="performance-link">
        <div className="stat-icon">
          <BarChart3 size={20} />
        </div>
        <div>
          <h3>Notas e desempenho</h3>
          <p>Cada pequena evolução merece ser vista.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/desempenho/$subjectId" params={{ subjectId }}>
            Abrir
          </Link>
        </Button>
      </div>

      <AlertDialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => !open && setItemToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {itemToDelete?.kind === "caderno" ? "caderno" : "curso"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir “{itemToDelete?.title}”? Você terá alguns segundos para
              desfazer a ação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateDialog
        kind={tab}
        open={creating}
        onOpenChange={setCreating}
        onCreate={(title, url) => {
          const ok = update((d) =>
            tab === "caderno"
              ? addNotebook(d, subjectId, title)
              : addCourse(d, subjectId, title, url ?? ""),
          );
          if (ok)
            toast.success(
              `${tab === "caderno" ? "Caderno criado" : "Curso adicionado"}. Boas ideias te esperam!`,
            );
          return ok;
        }}
      />
    </>
  );
}

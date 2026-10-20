import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, NotebookPen, AlertCircle, RefreshCw } from "lucide-react";
import { useStudy } from "@/components/study-provider";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { NotebookPhotoImport } from "@/components/photo-imports";
import { appendTranscription } from "@/lib/photo-import-model";

export const Route = createFileRoute("/cadernos/$notebookId")({
  head: () => ({
    meta: [
      { title: "GStudy · Meu caderno" },
      {
        name: "description",
        content: "Um espaço tranquilo para escrever e organizar suas anotações.",
      },
      { property: "og:title", content: "GStudy · Meu caderno" },
      { property: "og:description", content: "Suas ideias, uma página de cada vez." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotebookPage,
});

function NotebookPage() {
  const { notebookId } = Route.useParams();
  const { data, ready, update } = useStudy();
  const subject = data.subjects.find((s) => s.notebooks.some((n) => n.id === notebookId));
  const notebook = subject?.notebooks.find((n) => n.id === notebookId);

  const [text, setText] = useState<string>(notebook?.text ?? "");
  const [saveStatus, setSaveStatus] = useState<"saved" | "pending" | "error">("saved");

  const textRef = useRef(text);
  textRef.current = text;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveErrorToastShownRef = useRef<boolean>(false);
  const subjectIdRef = useRef(subject?.id);
  subjectIdRef.current = subject?.id;

  // Sync from external / account updates if not dirty
  const prevRemoteTextRef = useRef(notebook?.text);
  useEffect(() => {
    if (notebook?.text !== undefined && notebook.text !== prevRemoteTextRef.current) {
      prevRemoteTextRef.current = notebook.text;
      if (saveStatus === "saved") {
        setText(notebook.text);
      }
    }
  }, [notebook?.text, saveStatus]);

  const flushSave = useCallback(
    (valueToSave?: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      const val = valueToSave !== undefined ? valueToSave : textRef.current;
      const sId = subjectIdRef.current;
      if (!sId) return;

      const ok = update((d) => ({
        ...d,
        subjects: d.subjects.map((s) =>
          s.id === sId
            ? {
                ...s,
                notebooks: s.notebooks.map((n) =>
                  n.id === notebookId
                    ? { ...n, text: val, updatedAt: new Date().toISOString() }
                    : n,
                ),
              }
            : s,
        ),
      }));

      if (ok) {
        setSaveStatus("saved");
        saveErrorToastShownRef.current = false;
      } else {
        setSaveStatus("error");
        if (!saveErrorToastShownRef.current) {
          saveErrorToastShownRef.current = true;
          toast.error("Não foi possível salvar o caderno no armazenamento.", {
            id: "notebook-save-error",
          });
        }
      }
    },
    [notebookId, update],
  );

  const handleChange = (newText: string) => {
    setText(newText);
    setSaveStatus("pending");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      flushSave(newText);
    }, 500);
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushSave();
      }
    };
    const handleBeforeUnload = () => {
      flushSave();
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      flushSave();
    };
  }, [flushSave]);

  if (!notebook || !subject) {
    return (
      <>
        <h1>{ready ? "Caderno não encontrado" : "Carregando…"}</h1>
        <Link to="/">Voltar ao início</Link>
      </>
    );
  }

  return (
    <>
      <Link to="/materias/$subjectId" params={{ subjectId: subject.id }} className="back-link">
        <ArrowLeft size={14} />
        {subject.name}
      </Link>
      <div className="eyebrow">SUAS IDEIAS MERECEM ESPAÇO</div>
      <div className="editor-header">
        <h1>{notebook.title}</h1>
        <span className="save-status">
          {saveStatus === "error" ? (
            <button
              type="button"
              className="text-action text-destructive flex items-center gap-1"
              onClick={() => flushSave()}
            >
              <AlertCircle size={14} />
              Erro ao salvar. Tentar novamente
            </button>
          ) : saveStatus === "pending" ? (
            <span className="text-muted-foreground flex items-center gap-1">
              <RefreshCw size={13} className="animate-spin" />
              Salvando…
            </span>
          ) : (
            <>
              <Check size={14} />
              Salvo neste aparelho
            </>
          )}
        </span>
      </div>
      <NotebookPhotoImport
        key={notebookId}
        onInsert={(transcription) => {
          const merged = appendTranscription(textRef.current, transcription);
          setText(merged);
          flushSave(merged);
        }}
      />
      <textarea
        aria-label="Anotações do caderno"
        className="notebook-editor"
        placeholder="Toda descoberta começa com uma ideia…"
        value={text}
        onChange={(event) => handleChange(event.target.value)}
      />
      <div className="editor-bottom flex items-center gap-2">
        <NotebookPen size={13} />
        {text.trim() ? text.trim().split(/\s+/).length : 0} palavras
        <span className="ml-auto">{text.length} caracteres</span>
      </div>
    </>
  );
}

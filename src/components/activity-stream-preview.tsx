import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { ActivityPreviewItem } from "@/hooks/use-generated-activity";

export function ActivityStreamPreview({
  items = [],
  loading,
  error,
  stop,
  retry,
  children,
}: {
  items?: ActivityPreviewItem[];
  loading?: boolean;
  error?: string;
  stop?: () => void;
  retry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="activity-stream-preview">
      {items.length ? (
        <section className="lesson-body" aria-label="Conteúdo recebido">
          <p role="status">
            {loading ? "O conteúdo está chegando…" : "Conteúdo recebido até a interrupção"}
          </p>
          {items.map((item, i) => (
            <article key={i} className="explain-card">
              <h2>{item.title ?? item.question ?? item.front}</h2>
              {item.explanation && <ReactMarkdown>{item.explanation}</ReactMarkdown>}
              {item.example && <p>{item.example}</p>}
            </article>
          ))}
          <p>A prática começa quando a atividade estiver completa.</p>
        </section>
      ) : (
        children
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="lesson-foot">
        {loading && stop && (
          <button className="duo-btn ghost" onClick={stop}>
            Parar geração
          </button>
        )}
        {error && retry && (
          <button className="duo-btn" onClick={() => retry()}>
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}

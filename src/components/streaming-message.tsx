import React from "react";
import ReactMarkdown from "react-markdown";
import { Square, RotateCcw, AlertCircle } from "lucide-react";
import "@/styles/streaming-message.css";

export type StreamingMessageProps = {
  text: string;
  isStreaming?: boolean;
  isStopped?: boolean;
  error?: string | null;
  onStop?: () => void;
  onRetry?: () => void;
  markdown?: boolean;
  className?: string;
};

export const StreamingMessage: React.FC<StreamingMessageProps> = ({
  text,
  isStreaming = false,
  isStopped = false,
  error = null,
  onStop,
  onRetry,
  markdown = true,
  className = "",
}) => {
  return (
    <div className={`streaming-message-container ${className}`}>
      <div className="streaming-message-body">
        {!text && isStreaming && <p role="status">Preparando resposta…</p>}
        {markdown ? <ReactMarkdown>{text || ""}</ReactMarkdown> : <p>{text || ""}</p>}
        {isStreaming && <span className="streaming-cursor" aria-label="Digitando…" />}
      </div>

      {isStreaming && onStop && (
        <div className="streaming-controls">
          <button
            type="button"
            className="streaming-stop-btn"
            onClick={onStop}
            title="Interromper geração"
            aria-label="Interromper resposta da IA"
          >
            <Square size={13} fill="currentColor" />
            <span>Parar resposta</span>
          </button>
        </div>
      )}

      {isStopped && (
        <p className="streaming-notice is-stopped" role="status">
          <small>
            Geração interrompida. O texto foi preservado e o pedido iniciado continua contabilizado.
          </small>
          {onRetry && (
            <button type="button" className="streaming-retry-btn" onClick={onRetry}>
              Continuar resposta
            </button>
          )}
        </p>
      )}

      {error && (
        <div className="streaming-error-box" role="alert">
          <div className="streaming-error-header">
            <AlertCircle size={15} />
            <span>A resposta foi interrompida antes de concluir.</span>
          </div>
          <p className="streaming-error-detail">{error}</p>
          {onRetry && (
            <button type="button" className="streaming-retry-btn" onClick={onRetry}>
              <RotateCcw size={14} />
              <span>Tentar de novo</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

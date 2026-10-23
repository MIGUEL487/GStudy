import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUp,
  BookOpen,
  FileText,
  Image,
  MessageCircleQuestion,
  Paperclip,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { useStudy } from "./study-provider";
import { Button } from "./ui/button";
import { useSocratesConversations } from "@/hooks/use-socrates-conversations";
import { getSocratesQuota, socratesReply } from "@/lib/socrates.functions";
import {
  recentSocratesHistory,
  socratesDailyTokens,
  type SocratesMessage,
  type SocratesQuota,
} from "@/lib/socrates-model";
import "@/styles/socrates.css";
import { SocratesIcon } from "./socrates-icon";
import { prepareStudyPhoto } from "@/lib/study-photo";
import { StreamingMessage } from "./streaming-message";
import { autoScrollPreservingUser, useStreamingText } from "@/lib/streaming-ai";
const number = (value: number) => value.toLocaleString("pt-BR");
type SocratesAttachment = {
  name: string;
  mediaType: "image/jpeg" | "application/pdf";
  dataUrl: string;
};
const readPdf = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler este PDF."));
    reader.readAsDataURL(file);
  });
export function SocratesChat({ userId }: { userId: string }) {
  const { data } = useStudy();
  const history = useSocratesConversations(userId);
  const reply = useServerFn(socratesReply),
    readQuota = useServerFn(getSocratesQuota);
  const [selected, setSelected] = useState(""),
    [subject, setSubject] = useState("");
  const [draft, setDraft] = useState(""),
    [error, setError] = useState(""),
    [warning, setWarning] = useState("");
  const [quota, setQuota] = useState<SocratesQuota | null>(null),
    [quotaError, setQuotaError] = useState("");
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<SocratesMessage | null>(null);
  const [attachment, setAttachment] = useState<SocratesAttachment | null>(null),
    [preparingFile, setPreparingFile] = useState(false);
  const [unsaved, setUnsaved] = useState<{
    conversationId: string;
    messages: SocratesMessage[];
  } | null>(null);
  const lock = useRef(false),
    scroll = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const conversation = history.conversations.find((item) => item.id === selected);
  const messages = [
    ...(conversation?.messages ?? []),
    ...(unsaved?.conversationId === selected
      ? unsaved.messages.filter(
          (item) => !conversation?.messages.some((saved) => saved.id === item.id),
        )
      : pending
        ? [pending]
        : []),
  ];
  const loadQuota = async () => {
    try {
      const result = await readQuota();
      if (result.ok) {
        setQuota(result.quota);
        setQuotaError("");
      } else {
        setQuota(null);
        setQuotaError(result.error);
      }
    } catch {
      setQuota(null);
      setQuotaError("Não foi possível verificar sua cota. Tente atualizar em instantes.");
    }
  };
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive && !document.hidden) void loadQuota();
    };
    refresh();
    const interval = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [userId]);
  const {
    text: streamingText,
    isStreaming,
    isStopped,
    error: streamError,
    start: startStream,
    stop: stopStream,
  } = useStreamingText({
    scrollRef: scroll,
  });

  useEffect(() => {
    autoScrollPreservingUser(scroll.current, !!pending);
  }, [messages.length, busy, selected, pending]);
  const saveAnswer = () => {
    if (!unsaved) return;
    try {
      history.append(unsaved.conversationId, unsaved.messages);
      setUnsaved(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a resposta.");
    }
  };
  const send = async () => {
    if (lock.current || unsaved || !quota || !quota.remaining || (!draft.trim() && !attachment))
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setWarning("");
    const visibleText = [
      draft.trim(),
      attachment
        ? `[${attachment.mediaType === "application/pdf" ? "PDF" : "Imagem"}: ${attachment.name}]`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    const userMessage: SocratesMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: visibleText,
      createdAt: new Date().toISOString(),
    };
    try {
      const current = conversation ?? history.create(subject);
      setSelected(current.id);
      setPending(userMessage);
      autoScrollPreservingUser(scroll.current, true);
      const result = await reply({
        data: {
          accountId: userId,
          subject: current.subject,
          message: userMessage.text,
          attachment: attachment ?? undefined,
          history: recentSocratesHistory(current.messages),
        },
      });
      if ("quota" in result && result.quota) setQuota(result.quota);
      if (!result.ok) {
        setError(result.error);
        void loadQuota();
        return;
      }
      setDraft("");
      setAttachment(null);
      if (result.warning) setWarning(result.warning);

      const fullAssistantText = result.question
        ? `${result.explanation}\n\n**Pergunta:** ${result.question}`
        : result.explanation;

      const streamResult = await startStream(fullAssistantText);
      const assistantText = streamResult.text || result.explanation;

      const assistant: SocratesMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: assistantText,
        question: streamResult.stopped ? undefined : result.question,
        createdAt: new Date().toISOString(),
      };
      const completed = { conversationId: current.id, messages: [userMessage, assistant] };
      try {
        history.append(current.id, completed.messages);
      } catch (cause) {
        setUnsaved(completed);
        setError(
          cause instanceof Error
            ? cause.message
            : "A resposta está pronta, mas não foi salva. Tente salvar novamente.",
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sócrates não conseguiu responder agora. Sua pergunta continua aqui.",
      );
    } finally {
      setPending(null);
      lock.current = false;
      setBusy(false);
    }
  };
  const full = (conversation?.messages.length ?? 0) > 198;
  return (
    <section
      className={`socrates-page ${messages.length ? "has-messages" : ""}`}
      aria-label="Sócrates, seu tutor"
    >
      <header className="socrates-hero">
        <div className="eyebrow">
          <SocratesIcon size={22} /> APRENDER A PERGUNTAR
        </div>
        <h1>Uma boa pergunta abre caminhos.</h1>
        <p>
          Converse com Sócrates: toda resposta explica o porquê e termina com uma pergunta para você
          construir o próximo passo.
        </p>
      </header>
      <div className="socrates-quota" aria-label="Sua cota diária de Sócrates">
        <Sparkles size={19} aria-hidden="true" />
        <div>
          <strong>
            {quota
              ? `${number(quota.remaining)} tokens disponíveis`
              : quotaError
                ? "Cota indisponível"
                : "Consultando sua cota…"}
          </strong>
          <small>
            {number(socratesDailyTokens)} por dia · renova à meia-noite de Brasília · compartilhado
            entre seus aparelhos
          </small>
        </div>
        <button type="button" onClick={() => void loadQuota()} aria-label="Atualizar cota">
          <RefreshCw size={16} />
        </button>
        {quota && (
          <progress aria-label="Tokens disponíveis" max={quota.limit} value={quota.remaining} />
        )}
      </div>
      {quotaError && (
        <p role="alert" className="socrates-error">
          {quotaError}
        </p>
      )}
      {history.error && (
        <p role="alert" className="socrates-error">
          {history.error}
        </p>
      )}
      <div className="socrates-toolbar">
        <label className="form-label">
          Suas conversas
          <select
            aria-label="Suas conversas"
            className="form-input"
            value={selected}
            disabled={busy || !!unsaved}
            onChange={(event) => {
              setSelected(event.target.value);
              setError("");
              setDraft("");
              setAttachment(null);
            }}
          >
            <option value="">Nova conversa</option>
            {[...history.conversations].reverse().map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          Matéria
          <select
            aria-label="Matéria"
            className="form-input"
            value={conversation?.subject ?? subject}
            disabled={!!conversation || busy || !!unsaved}
            onChange={(event) => setSubject(event.target.value)}
          >
            <option value="">Estudo livre</option>
            {conversation?.subject &&
              !data.subjects.some((item) => item.name === conversation.subject) && (
                <option value={conversation.subject}>{conversation.subject}</option>
              )}
            {data.subjects.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          aria-label="Novo assunto"
          variant="outline"
          disabled={busy || !!unsaved}
          onClick={() => {
            setSelected("");
            setDraft("");
            setAttachment(null);
            setError("");
            setWarning("");
          }}
        >
          <Plus size={16} />
          <span className="socrates-new-label">Novo assunto</span>
        </Button>
      </div>
      <div className="socrates-dialogue">
        <div className="socrates-dialogue-heading">
          <SocratesIcon size={29} />
          <span>
            Sócrates<small>Primeiro, vamos entender o porquê.</small>
          </span>
        </div>
        <div
          className="socrates-messages"
          role="log"
          aria-label="Conversa com Sócrates"
          aria-live="polite"
          ref={scroll}
        >
          {!messages.length && (
            <div className="socrates-empty">
              <BookOpen size={35} strokeWidth={1.2} />
              <h2>O que desperta sua curiosidade?</h2>
              <p>
                Traga uma dúvida, uma ideia ou algo que ainda não fez sentido. Vamos explorar um
                conceito de cada vez. Você também pode anexar uma foto ou PDF no clipe abaixo.
              </p>
              <div>
                {[
                  "Por que dividir por uma fração pode aumentar o resultado?",
                  "Como funciona a seleção natural?",
                  "Por que estudar a Revolução Francesa?",
                ].map((text) => (
                  <button key={text} disabled={busy} onClick={() => setDraft(text)}>
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <article key={message.id} className={`socrates-message is-${message.role}`}>
              <small>{message.role === "assistant" ? "Sócrates" : "Você"}</small>
              <p>{message.text}</p>
              {message.question && (
                <p className="socrates-question">
                  <MessageCircleQuestion size={16} aria-hidden="true" />
                  {message.question}
                </p>
              )}
            </article>
          ))}
          {isStreaming && (
            <article className="socrates-message is-assistant">
              <small>Sócrates</small>
              <StreamingMessage
                text={streamingText}
                isStreaming={isStreaming}
                isStopped={isStopped}
                error={streamError}
                onStop={stopStream}
              />
            </article>
          )}
          {busy && !isStreaming && (
            <div className="socrates-thinking" role="status">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Ligando as ideias para explicar o porquê…
            </div>
          )}
        </div>
        {messages.some((item) => item.role === "assistant") && !busy && !unsaved && (
          <div className="socrates-quick-replies">
            {["Ainda não entendi. Pode simplificar?", "Pode mostrar outro exemplo?"].map((text) => (
              <button key={text} onClick={() => setDraft(text)}>
                {text}
              </button>
            ))}
          </div>
        )}
        <form
          className="socrates-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          {attachment && (
            <div className="socrates-attachment" role="status">
              {attachment.mediaType === "application/pdf" ? (
                <FileText size={16} />
              ) : (
                <Image size={16} />
              )}
              <span>{attachment.name}</span>
              <button
                type="button"
                aria-label="Remover anexo"
                disabled={busy}
                onClick={() => setAttachment(null)}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            aria-label="Selecionar imagem ou PDF"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setError("");
              setPreparingFile(true);
              try {
                if (file.type === "application/pdf") {
                  if (!file.size || file.size > 3 * 1024 * 1024)
                    throw new Error("Escolha um PDF de até 3 MB e 40 páginas.");
                  setAttachment({
                    name: file.name,
                    mediaType: "application/pdf",
                    dataUrl: await readPdf(file),
                  });
                } else {
                  const photo = await prepareStudyPhoto(file);
                  setAttachment({
                    name: file.name,
                    mediaType: "image/jpeg",
                    dataUrl: photo.dataUrl,
                  });
                }
              } catch (cause) {
                setAttachment(null);
                setError(
                  cause instanceof Error ? cause.message : "Não foi possível preparar o anexo.",
                );
              } finally {
                setPreparingFile(false);
              }
            }}
          />
          <button
            type="button"
            className="socrates-attach-button"
            aria-label="Anexar imagem ou PDF"
            title="Anexar imagem ou PDF"
            disabled={busy || preparingFile || !!unsaved || full}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip size={19} />
          </button>
          <label className="sr-only" htmlFor="socrates-message">
            Sua pergunta ou explicação
          </label>
          <textarea
            id="socrates-message"
            rows={2}
            maxLength={2000}
            value={draft}
            disabled={busy || !!unsaved || full}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              preparingFile ? "Preparando anexo…" : "Pergunte, tente explicar, pense em voz alta…"
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Button
            type="submit"
            aria-label="Enviar para Sócrates"
            disabled={
              busy ||
              !!unsaved ||
              full ||
              (!draft.trim() && !attachment) ||
              !quota?.remaining ||
              !!quotaError ||
              !!history.error
            }
          >
            <ArrowUp size={19} />
          </Button>
        </form>
      </div>
      {error && (
        <p role="alert" className="socrates-error">
          {error}
        </p>
      )}
      {warning && (
        <p role="status" className="socrates-error">
          {warning}
        </p>
      )}
      {unsaved && (
        <Button variant="outline" onClick={saveAnswer}>
          Salvar resposta novamente
        </Button>
      )}
      {full && (
        <p>
          Esta conversa chegou a 200 mensagens. Escolha “Novo assunto” para continuar; o histórico
          permanece salvo.
        </p>
      )}
      {quota?.remaining === 0 && (
        <p role="status">
          Você usou a cota de hoje. Suas conversas continuam disponíveis; novos tokens chegam à
          meia-noite de Brasília.
        </p>
      )}
      <p className="socrates-footnote">
        O consumo inclui contexto recente e resposta, usando a contagem do provedor ou uma
        estimativa quando ela não estiver disponível. Em PDFs, imagens e diagramas dependem de uma
        IA com visão; provedores de texto recebem apenas o texto extraído. Sócrates pode errar:
        questione e confira o que aprender.
      </p>
    </section>
  );
}

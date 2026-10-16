import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Download,
  EyeOff,
  MessageCircle,
  MessageSquareHeart,
  RefreshCw,
  Send,
  ShieldCheck,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRound,
} from "lucide-react";
import { reviewsApi, type Review, type ReviewTab } from "@/lib/reviews-client";
import { download, readFeedback, type FeedbackEntry } from "./feedback-panel";

export function ReviewsPanel({ userId }: { userId: string }) {
  const [tab, setTab] = useState<ReviewTab>("reviews"),
    [sort, setSort] = useState<"recent" | "helpful">("recent"),
    [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Review[]>([]),
    [admin, setAdmin] = useState(false),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<"review" | "suggestion">("review"),
    [rating, setRating] = useState(4),
    [anonymous, setAnonymous] = useState(true),
    [message, setMessage] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [sending, setSending] = useState(false),
    [legacy, setLegacy] = useState<FeedbackEntry[]>([]);
  const busy = useRef(false),
    request = useRef(0);
  useEffect(() => {
    try {
      setLegacy(readFeedback(userId));
    } catch {
      /* Preserve unreadable legacy data without publishing it. */
    }
  }, [userId]);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const board = await reviewsApi.list(tab, sort, offset);
      if (id !== request.current) return;
      setItems(board.items);
      setAdmin(board.isAdmin);
      setMore(board.hasMore);
    } catch (e) {
      if (id === request.current)
        setError(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [tab, sort, offset]);
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current || message.trim().length < 10) return;
    busy.current = true;
    setSending(true);
    setError("");
    setNotice("");
    try {
      await reviewsApi.create({ category, rating, message: message.trim(), anonymous });
      setMessage("");
      setNotice(
        category === "suggestion"
          ? "Sua sugestão foi enviada em particular ao responsável."
          : "Sua avaliação foi publicada. Obrigado por compartilhar!",
      );
      setTab(category === "suggestion" ? "mine" : "reviews");
      setOffset(0);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível enviar. Seu texto foi preservado.",
      );
    } finally {
      busy.current = false;
      setSending(false);
    }
  };
  return (
    <section className="settings-section reviews-panel">
      <div className="settings-card-heading">
        <MessageSquareHeart size={26} />
        <div>
          <h2>Sua experiência importa</h2>
          <p>Avalie o GStudy, conheça outras experiências e envie sugestões em particular.</p>
        </div>
      </div>
      <details className="review-compose" open>
        <summary>
          Escrever avaliação ou sugestão <MessageCircle size={17} />
        </summary>
        <form onSubmit={(event) => void submit(event)}>
          <label className="form-label">
            O que você quer enviar?
            <select
              className="form-input"
              value={category}
              disabled={sending}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              <option value="review">Avaliação pública</option>
              <option value="suggestion">Sugestão privada para o responsável</option>
            </select>
          </label>
          <fieldset className="feedback-rating">
            <legend>Como está sua experiência?</legend>
            <div>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className={rating === n ? "selected" : ""}>
                  <input
                    type="radio"
                    name="review-rating"
                    checked={rating === n}
                    onChange={() => setRating(n)}
                    disabled={sending}
                  />
                  <Star size={18} />
                  <span>{n}</span>
                  <span className="sr-only"> de 5</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="form-label" htmlFor="review-message">
            Conte um pouco mais
            <textarea
              id="review-message"
              className="form-input"
              minLength={10}
              maxLength={3000}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
              required
              placeholder="O que ajudou você? O que pode melhorar?"
            />
          </label>
          <fieldset className="review-privacy">
            <legend>Como você quer aparecer?</legend>
            <label>
              <input
                type="radio"
                name="review-privacy"
                checked={anonymous}
                onChange={() => setAnonymous(true)}
                disabled={sending}
              />
              <EyeOff size={17} />
              <span>
                Anônimo<small>Seu nome não aparece para quem lê.</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="review-privacy"
                checked={!anonymous}
                onChange={() => setAnonymous(false)}
                disabled={sending}
              />
              <UserRound size={17} />
              <span>
                Mostrar meu nome de perfil<small>Seu e-mail não será exibido.</small>
              </span>
            </label>
          </fieldset>
          <p className="review-visibility">
            {category === "review"
              ? "Ao enviar, o texto e a nota ficarão visíveis às pessoas conectadas ao GStudy."
              : "A sugestão ficará disponível apenas para você e o responsável pelo GStudy."}
          </p>
          <div className="feedback-form-footer">
            <small>{message.length}/3000 caracteres</small>
            <button className="duo-btn" disabled={sending || message.trim().length < 10}>
              <Send size={16} />
              {sending
                ? "Enviando…"
                : category === "review"
                  ? "Enviar avaliação"
                  : "Enviar sugestão"}
            </button>
          </div>
        </form>
      </details>
      {notice && (
        <p role="status" className="feedback-success">
          <Check size={16} />
          {notice}
        </p>
      )}
      <div className="review-board-heading">
        <h3>Ver avaliações</h3>
        <button
          className={`duo-btn ghost ${sort === "helpful" ? "selected" : ""}`}
          aria-pressed={sort === "helpful"}
          onClick={() => {
            setSort((s) => (s === "helpful" ? "recent" : "helpful"));
            setOffset(0);
          }}
        >
          <ThumbsUp size={15} />
          Mais úteis
        </button>
      </div>
      <div className="review-list-tabs" role="group" aria-label="Filtrar avaliações">
        <button
          aria-pressed={tab === "reviews"}
          onClick={() => {
            setTab("reviews");
            setOffset(0);
          }}
        >
          Comunidade
        </button>
        <button
          aria-pressed={tab === "mine"}
          onClick={() => {
            setTab("mine");
            setOffset(0);
          }}
        >
          Meus envios
        </button>
        {admin && (
          <button
            aria-pressed={tab === "suggestions"}
            onClick={() => {
              setTab("suggestions");
              setOffset(0);
            }}
          >
            <ShieldCheck size={14} />
            Sugestões recebidas
          </button>
        )}
      </div>
      {error && (
        <div role="alert" className="feedback-error">
          <p>{error}</p>
          <button className="text-action" onClick={() => void load()}>
            <RefreshCw size={14} />
            Atualizar avaliações
          </button>
        </div>
      )}
      {loading ? (
        <p role="status" className="review-loading">
          Carregando avaliações…{" "}
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>
      ) : !items.length ? (
        <p className="feedback-empty">
          {tab === "suggestions"
            ? "Nenhuma sugestão recebida ainda."
            : tab === "mine"
              ? "Você ainda não enviou uma avaliação ou sugestão."
              : "Seja a primeira pessoa a compartilhar sua experiência."}
        </p>
      ) : (
        <div className="review-list">
          {items.map((item) => (
            <ReviewCard key={item.id} review={item} admin={admin} refresh={load} />
          ))}
        </div>
      )}
      {(offset > 0 || more) && (
        <div className="review-pagination">
          <button
            className="duo-btn ghost"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((n) => Math.max(0, n - 20))}
          >
            Anterior
          </button>
          <span>Página {offset / 20 + 1}</span>
          <button
            className="duo-btn ghost"
            disabled={!more || loading}
            onClick={() => setOffset((n) => n + 20)}
          >
            Próxima
          </button>
        </div>
      )}
      {!!legacy.length && (
        <details className="review-legacy">
          <summary>Feedbacks anteriores deste aparelho</summary>
          <p>
            {legacy.length} registro(s) local(is) foram preservados. Eles não foram publicados
            automaticamente.
          </p>
          <button className="duo-btn ghost" onClick={() => download(legacy)}>
            <Download size={15} />
            Baixar registros anteriores
          </button>
        </details>
      )}
    </section>
  );
}
function ReviewCard({
  review,
  admin,
  refresh,
}: {
  review: Review;
  admin: boolean;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [replying, setReplying] = useState(false),
    [reply, setReply] = useState(review.reply ?? "");
  const pending = useRef(false);
  const act = async (action: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <article className="review-card">
      <header>
        <span className="review-author-icon">
          {review.anonymous ? <EyeOff size={18} /> : <UserRound size={18} />}
        </span>
        <div>
          <b>{review.author}</b>
          <small>
            {review.isMine ? "Seu envio · " : ""}
            {review.category === "suggestion" ? "Sugestão privada · " : ""}
            {new Date(review.createdAt).toLocaleDateString("pt-BR")}
          </small>
        </div>
        <span className="review-stars" aria-label={`Nota ${review.rating} de 5`}>
          <Star size={15} />
          {review.rating}/5
        </span>
      </header>
      <p>{review.body}</p>
      {review.reply && (
        <div className="review-owner-reply">
          <b>
            <ShieldCheck size={15} />
            Resposta do GStudy
          </b>
          <p>{review.reply}</p>
        </div>
      )}
      <footer>
        {admin && (
          <button className="text-action" disabled={busy} onClick={() => setReplying((v) => !v)}>
            <MessageCircle size={15} />
            {review.reply ? "Editar resposta" : "Responder"}
          </button>
        )}
        {review.isMine && (
          <button
            className="text-action"
            disabled={busy}
            onClick={() => {
              if (confirm("Excluir este envio?")) void act(() => reviewsApi.remove(review.id));
            }}
            aria-label="Excluir meu envio"
          >
            <Trash2 size={14} />
          </button>
        )}
        {review.category === "review" && (
          <div className="review-votes" aria-label="Esta avaliação foi útil?">
            <span>Foi útil?</span>
            <button
              disabled={busy || review.isMine}
              title={review.isMine ? "Você não pode votar no próprio envio." : "Útil"}
              aria-label="Avaliação útil"
              aria-pressed={review.myVote === 1}
              onClick={() =>
                void act(() => reviewsApi.vote(review.id, review.myVote === 1 ? 0 : 1))
              }
            >
              <ThumbsUp size={16} />
              {review.up}
            </button>
            <button
              disabled={busy || review.isMine}
              title="Não foi útil"
              aria-label="Avaliação não útil"
              aria-pressed={review.myVote === -1}
              onClick={() =>
                void act(() => reviewsApi.vote(review.id, review.myVote === -1 ? 0 : -1))
              }
            >
              <ThumbsDown size={16} />
              {review.down}
            </button>
          </div>
        )}
      </footer>
      {replying && admin && (
        <form
          className="review-reply-form"
          onSubmit={(event) => {
            event.preventDefault();
            void act(() => reviewsApi.reply(review.id, reply.trim())).then((ok) => {
              if (ok) setReplying(false);
            });
          }}
        >
          <label className="form-label">
            Resposta do responsável
            <textarea
              className="form-input"
              maxLength={3000}
              minLength={1}
              required
              rows={3}
              value={reply}
              disabled={busy}
              onChange={(e) => setReply(e.target.value)}
            />
          </label>
          <button className="duo-btn" disabled={busy || !reply.trim()}>
            <Send size={15} />
            Publicar resposta
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </article>
  );
}

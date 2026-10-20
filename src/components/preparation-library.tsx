import { useState } from "react";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Globe,
  Play,
  RefreshCw,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import {
  amazonSearch,
  officialCatalogueSearches,
  videoEmbedUrl,
  videoTime,
  videoWatchUrl,
  type LibraryBook,
  type LibraryVideo,
  type PreparationLibrary,
} from "@/lib/preparation-library-model";
import { preparationResourceLink } from "@/lib/preparation-model";
import type { LearningPlan } from "@/lib/learning-model";
import "@/styles/preparation-library.css";

type Props = {
  plan: LearningPlan;
  library: PreparationLibrary | undefined;
  busy: boolean;
  error: string;
  refresh: () => Promise<void>;
  refreshBooks?: () => Promise<void>;
  unsaved: boolean;
};
export function PreparationLibraryPanel({
  plan,
  library,
  busy,
  error,
  refresh,
  refreshBooks,
  unsaved,
}: Props) {
  const resources = plan.preparation!.guide!.resources;
  const open = library?.books.filter((book) => book.access === "open") ?? [],
    official = library?.books.filter((book) => book.access === "official") ?? [];
  const paid = library
    ? library.books.filter((book) => book.access === "paid")
    : resources
        .filter((resource) => resource.kind === "book")
        .map((resource) => ({
          title: resource.title,
          author: resource.creator,
          reason: resource.reason,
          topicIndex: resource.topicIndex,
          access: "paid" as const,
        }));
  return (
    <section className="prep-library">
      <div className="prep-library-heading">
        <div className="prep-section-heading">
          <span className="prep-kicker">UMA BOA AULA MUDA O CAMINHO</span>
          <h2>Sua sala de estudos.</h2>
          <p>
            Aulas para assistir aqui, leituras abertas para explorar e livros para a sua estante.
            Cada indicação conversa com o seu objetivo.
          </p>
        </div>
        <button className="text-action" disabled={busy} onClick={() => void refresh()}>
          <RefreshCw size={15} className={busy ? "library-spin" : ""} />
          {busy
            ? "Buscando referências…"
            : unsaved
              ? "Tentar salvar indicações"
              : "Atualizar indicações"}
        </button>
      </div>
      {busy && (
        <div className="prep-library-loading" role="status">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            Selecionando aulas, conferindo capítulos e consultando as fontes dos livros…
            <small>Suas sessões e o restante do plano continuam disponíveis.</small>
          </span>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="library-section-title">
        <Play size={19} />
        <div>
          <h3>Dê o play na sua próxima descoberta.</h3>
          <p>
            Player oficial do YouTube. Nos vídeos longos, o trecho sugerido usa os capítulos
            publicados pelo canal.
          </p>
        </div>
      </div>
      {Boolean(library?.videos.length) ? (
        <div className="library-video-grid">
          {library.videos.map((video) => (
            <VideoLesson
              key={video.id + (video.clip?.start ?? "full")}
              video={video}
              topic={plan.topics[video.topicIndex]?.title ?? plan.subject}
            />
          ))}
        </div>
      ) : (
        !busy && (
          <div className="library-empty">
            <Play size={24} />
            <p>
              {library?.videoNotice ||
                "Ainda não foi possível confirmar um vídeo para incorporar. Tente atualizar as indicações."}
            </p>
            <div>
              {resources
                .filter((resource) => resource.kind === "video")
                .map((resource, index) => (
                  <a
                    key={index}
                    href={preparationResourceLink(resource, plan.preparation!.research.sources).url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Buscar {resource.title} no YouTube <ExternalLink size={12} />
                  </a>
                ))}
            </div>
          </div>
        )
      )}
      {!!library?.videos.length && library.videoNotice && (
        <p className="prep-caption">{library.videoNotice}</p>
      )}
      <section className="library-books-section">
        <div className="library-section-title">
          <Globe size={19} />
          <div>
            <span className="prep-kicker">PRIMEIRO, O CONHECIMENTO ABERTO</span>
            <h3>Biblioteca gratuita.</h3>
            <p>
              Fontes oficiais com licença do próprio material confirmada para uso comercial.
              Autoria, licença e origem acompanham cada PDF.
            </p>
          </div>
        </div>
        {refreshBooks && library && !unsaved && (
          <button
            className="text-action library-books-refresh"
            disabled={busy}
            onClick={() => void refreshBooks()}
          >
            <RefreshCw size={14} className={busy ? "library-spin" : ""} />
            Buscar livros novamente
          </button>
        )}
        {open.length ? (
          <div className="prep-resource-grid">
            {open.map((book, index) => (
              <OpenBook
                key={index}
                book={book}
                topic={plan.topics[book.topicIndex]?.title ?? plan.subject}
              />
            ))}
          </div>
        ) : (
          <div className="library-empty">
            <BookOpen size={24} />
            <p>
              {library?.bookNotice ||
                "Os materiais com licença confirmada aparecerão aqui. Estar num portal público, por si só, não autoriza disponibilizar um PDF."}
            </p>
          </div>
        )}
        {!!official.length && (
          <details className="library-official" open={!open.length}>
            <summary>
              <FileText size={16} /> Outros catálogos oficiais para consultar{" "}
              <span>{official.length}</span>
            </summary>
            <p>
              Estas páginas são referências para pesquisa. Seus PDFs não são exibidos no GStudy
              porque a autorização comercial não foi confirmada.
            </p>
            <div>
              {official.map((book, index) => (
                <article key={index}>
                  <strong>{book.title}</strong>
                  <span>{book.author}</span>
                  <p>{book.reason}</p>
                  {book.officialUrl && (
                    <a href={book.officialUrl} target="_blank" rel="noopener noreferrer">
                      Consultar catálogo oficial <ExternalLink size={12} />
                    </a>
                  )}
                </article>
              ))}
            </div>
          </details>
        )}
        {!open.length && !busy && (
          <div className="library-catalogue-searches">
            <h4>Explore os acervos públicos</h4>
            <p>
              Buscas pelo seu conteúdo, não indicações de PDFs já autorizados. A licença precisa ser
              conferida na página de cada obra.
            </p>
            <div>
              {officialCatalogueSearches(plan.topics[0]?.title || plan.subject).map((source) => (
                <a key={source.name} href={source.url} target="_blank" rel="noopener noreferrer">
                  <BookOpen size={15} />
                  Buscar em {source.name}
                  <ExternalLink size={12} />
                </a>
              ))}
            </div>
          </div>
        )}
      </section>
      <section className="library-books-section">
        <div className="library-section-title">
          <ShoppingBag size={19} />
          <div>
            <span className="prep-kicker">PARA SUA ESTANTE</span>
            <h3>Livros na Amazon.</h3>
            <p>
              Uma seleção complementar para comprar. Os links abrem a Amazon Brasil; preço, edição e
              disponibilidade são conferidos lá.
            </p>
          </div>
        </div>
        <div className="prep-resource-grid">
          {paid.map((book, index) => (
            <PaidBook
              key={index}
              book={book}
              topic={plan.topics[book.topicIndex]?.title ?? plan.subject}
            />
          ))}
        </div>
        {!paid.length && !busy && (
          <p className="prep-caption">Nenhuma indicação comercial foi incluída nesta seleção.</p>
        )}
      </section>
    </section>
  );
}
export function VideoLesson({ video, topic }: { video: LibraryVideo; topic: string }) {
  const [choice, setChoice] = useState("suggested"),
    [avatarFailed, setAvatarFailed] = useState(false);
  const { clip: _clip, ...full } = video;
  const chapter =
    choice !== "suggested" && choice !== "full" ? video.chapters[Number(choice)] : undefined;
  const shown: LibraryVideo =
    choice === "full"
      ? full
      : chapter
        ? { ...full, clip: { start: chapter.start, end: chapter.end, chapterTitle: chapter.title } }
        : video;
  const embed = videoEmbedUrl(
    shown,
    typeof window !== "undefined" ? window.location.origin : undefined,
  );
  return (
    <article className="library-video">
      <div className="library-video-player">
        {embed ? (
          <iframe
            key={embed}
            src={embed}
            title={video.title}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div className="library-video-unavailable">
            <Play size={32} />
            <p>Este vídeo não permite reprodução incorporada.</p>
            <a href={videoWatchUrl(shown)} target="_blank" rel="noopener noreferrer">
              Assistir no YouTube <ExternalLink size={13} />
            </a>
          </div>
        )}
      </div>
      <div className="library-video-content">
        <div className="library-video-meta">
          <span>{topic}</span>
          {shown.clip ? (
            <span>
              {videoTime(shown.clip.start)} – {videoTime(shown.clip.end)}
            </span>
          ) : video.duration ? (
            <span>Aula completa · {videoTime(video.duration)}</span>
          ) : (
            <span>Aula completa</span>
          )}
        </div>
        <h3>{video.title}</h3>
        <a
          href={video.channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="library-channel"
        >
          <span className="library-channel-avatar">
            {video.avatarUrl && !avatarFailed ? (
              <img
                src={video.avatarUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <Users size={18} />
            )}
          </span>
          <span>
            <small>NO CANAL</small>
            <strong>{video.channel}</strong>
          </span>
          <ExternalLink size={12} />
        </a>
        <p>{video.reason}</p>
        {shown.clip && (
          <p className="library-clip-note">
            <Play size={13} /> Trecho pelos capítulos: {shown.clip.chapterTitle}. Você pode ver a
            aula inteira.
          </p>
        )}
        {!!video.chapters.length && (
          <label className="library-chapter-picker">
            O que você quer assistir?
            <select value={choice} onChange={(event) => setChoice(event.target.value)}>
              {video.clip && <option value="suggested">Trecho sugerido para este assunto</option>}
              {!video.clip && <option value="suggested">Aula completa</option>}
              {video.clip && <option value="full">Aula completa</option>}
              {video.chapters.map((chapter, index) => (
                <option value={index} key={index}>
                  {videoTime(chapter.start)} · {chapter.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <a
          href={"https://www.youtube.com/watch?v=" + video.id}
          target="_blank"
          rel="noopener noreferrer"
          className="text-action"
        >
          Ver aula inteira no YouTube <ExternalLink size={13} />
        </a>
        <small className="library-player-help">
          Se o canal bloquear a incorporação ou o vídeo ficar indisponível, use o link para o
          YouTube.
        </small>
      </div>
    </article>
  );
}
function PaidBook({ book, topic }: { book: LibraryBook; topic: string }) {
  return (
    <article className="prep-resource is-book library-paid-book">
      <div className="prep-resource-top">
        <span className="prep-resource-symbol">
          <BookOpen size={29} strokeWidth={1.3} />
        </span>
        <span>
          PARA SUA ESTANTE
          <small>
            {book.amazonUrl ? "Produto encontrado na Amazon" : "Buscar título e autor na Amazon"}
          </small>
        </span>
      </div>
      <small className="prep-resource-topic">{topic}</small>
      <h3>{book.title}</h3>
      {book.author && <p className="prep-resource-creator">{book.author}</p>}
      {book.editionStatus === "previous" && (
        <p className="prep-caption library-edition-note">
          Edição anterior · confira dados e conteúdos atuais no programa da sua prova.
        </p>
      )}
      {book.language && (
        <small className="prep-caption">
          Idioma:{" "}
          {(
            { en: "inglês", es: "espanhol", pt: "português", "pt-BR": "português" } as Record<
              string,
              string
            >
          )[book.language] || book.language}
        </small>
      )}
      <p>{book.reason}</p>
      <a
        href={book.amazonUrl || amazonSearch(book.title, book.author)}
        target="_blank"
        rel="noopener noreferrer"
        className="duo-btn ghost"
      >
        <ShoppingBag size={15} />
        {book.amazonUrl ? "Ver livro na Amazon" : "Buscar livro na Amazon"}
        <ExternalLink size={13} />
      </a>
    </article>
  );
}
export function OpenBook({ book, topic }: { book: LibraryBook; topic: string }) {
  const [reading, setReading] = useState(false);
  return (
    <article className="prep-resource is-book library-open-book">
      <div className="prep-resource-top">
        <span className="prep-resource-symbol">
          <BookOpen size={29} strokeWidth={1.3} />
        </span>
        <span>
          LEITURA ABERTA<small>{book.pdf?.license}</small>
        </span>
      </div>
      <small className="prep-resource-topic">{topic}</small>
      <h3>{book.title}</h3>
      {book.author && <p className="prep-resource-creator">{book.author}</p>}
      {book.editionStatus === "previous" && (
        <p className="prep-caption library-edition-note">
          Edição anterior · confira dados e conteúdos atuais no programa da sua prova.
        </p>
      )}
      {book.language && (
        <small className="prep-caption">
          Idioma:{" "}
          {(
            { en: "inglês", es: "espanhol", pt: "português", "pt-BR": "português" } as Record<
              string,
              string
            >
          )[book.language] || book.language}
        </small>
      )}
      <p>{book.reason}</p>
      <div className="library-open-actions">
        {book.pdf?.embeddable && (
          <button className="duo-btn ghost" onClick={() => setReading((value) => !value)}>
            {reading ? <X size={15} /> : <BookOpen size={15} />}
            {reading ? "Fechar leitura" : "Ler no GStudy"}
          </button>
        )}
        {book.pdf && (
          <a href={book.pdf.url} target="_blank" rel="noopener noreferrer" className="text-action">
            PDF na fonte oficial <ExternalLink size={13} />
          </a>
        )}
      </div>
      {reading && book.pdf?.embeddable && (
        <iframe
          className="library-book-reader"
          title={"Leitura: " + book.title}
          src={book.pdf.url}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
      {book.pdf && (
        <div className="library-book-attribution">
          <span>
            {book.title} · {book.pdf.attribution}
          </span>
          <a href={book.pdf.licenseUrl} target="_blank" rel="noopener noreferrer">
            Licença {book.pdf.license} <ExternalLink size={11} />
          </a>
          <a href={book.pdf.evidenceUrl} target="_blank" rel="noopener noreferrer">
            Origem e direitos do material <ExternalLink size={11} />
          </a>
          <small>Documento original, sem alterações.</small>
        </div>
      )}
    </article>
  );
}

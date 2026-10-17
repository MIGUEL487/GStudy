import { useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Check, FileImage, ImagePlus, ScanLine, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { useStudy } from "./study-provider";
import { transcribeNotebookPhoto, readReportPhoto } from "@/lib/photo-import.functions";
import {
  applyReportDrafts,
  reportDrafts,
  newReportSubject,
  type ReportDraft,
} from "@/lib/photo-import-model";
import { absenceTotal } from "@/lib/attendance-model";
import { prepareStudyPhoto, type StudyPhoto } from "@/lib/study-photo";
import "@/styles/photo-imports.css";

function usePhotoReader<T>(read: (image: string) => Promise<T>) {
  const [photo, setPhoto] = useState<StudyPhoto | null>(null),
    [result, setResult] = useState<T | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState<"preparing" | "reading" | null>(null);
  const active = useRef(true),
    busy = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const choose = async (file?: File) => {
    if (!file || busy.current) return;
    busy.current = true;
    setPending("preparing");
    setError("");
    try {
      const next = await prepareStudyPhoto(file);
      if (active.current) {
        setPhoto(next);
        setResult(null);
      }
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "Não foi possível preparar a foto.");
    } finally {
      busy.current = false;
      if (active.current) setPending(null);
    }
  };
  const analyze = async () => {
    if (!photo || busy.current) return;
    busy.current = true;
    setPending("reading");
    setError("");
    try {
      const next = await read(photo.dataUrl);
      if (active.current) setResult(next);
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error ? e.message : "Não foi possível ler a foto agora. Tente novamente.",
        );
    } finally {
      busy.current = false;
      if (active.current) setPending(null);
    }
  };
  return { photo, result, error, pending, choose, analyze, setError };
}
function PhotoPicker({
  photo,
  pending,
  choose,
  compact = false,
}: {
  compact?: boolean;
  photo: StudyPhoto | null;
  pending: "preparing" | "reading" | null;
  choose: (file?: File) => Promise<void>;
}) {
  const gallery = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  return (
    <div className={`study-photo-picker ${compact ? "has-result" : ""}`}>
      <div className="study-photo-preview">
        {photo ? (
          <img src={photo.dataUrl} alt="Foto selecionada para leitura" />
        ) : (
          <>
            <FileImage size={38} strokeWidth={1.2} />
            <p>
              Uma página de cada vez,
              <br />
              com boa luz e sem cortes.
            </p>
          </>
        )}
      </div>
      <div className="study-photo-choice">
        <Button variant="outline" disabled={!!pending} onClick={() => gallery.current?.click()}>
          <ImagePlus />
          {photo ? "Trocar foto" : "Escolher foto"}
        </Button>
        <Button variant="outline" disabled={!!pending} onClick={() => camera.current?.click()}>
          <Camera />
          Usar câmera
        </Button>
      </div>
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Escolher foto do documento"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void choose(file);
        }}
      />
      <input
        ref={camera}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        aria-label="Fotografar documento"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void choose(file);
        }}
      />
      {photo && (
        <small>
          {photo.name} · {photo.width} × {photo.height}
        </small>
      )}
      {compact && photo && (
        <details className="study-photo-original">
          <summary>Ver foto para comparar</summary>
          <img src={photo.dataUrl} alt="Foto original do documento para comparar com a leitura" />
        </details>
      )}
      <p className="study-photo-privacy">
        Ao iniciar a leitura, a foto poderá ser enviada ao Gemini, à Groq ou ao OpenRouter
        configurados como alternativas. O GStudy salva somente o texto ou as notas que você
        confirmar.
      </p>
    </div>
  );
}
function PhotoWarnings({ items }: { items: string[] }) {
  return items.length ? (
    <div className="study-photo-warnings" role="note">
      <strong>Confira estes pontos</strong>
      <ul>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  ) : null;
}
function Reading({ pending }: { pending: "preparing" | "reading" | null }) {
  return pending ? (
    <p className="study-photo-reading" role="status">
      {pending === "preparing" ? "Preparando sua foto…" : "A IA está lendo a imagem…"}
      <span className="dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </p>
  ) : null;
}
function PhotoDialog({
  title,
  description,
  close,
  children,
}: {
  title: string;
  description: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="study-photo-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function NotebookPhotoImport({ onInsert }: { onInsert: (text: string) => boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="study-photo-trigger" onClick={() => setOpen(true)}>
        <ScanLine />
        Transcrever foto do caderno
      </Button>
      {open && <NotebookPhotoDialog close={() => setOpen(false)} onInsert={onInsert} />}
    </>
  );
}
function NotebookPhotoDialog({
  close,
  onInsert,
}: {
  close: () => void;
  onInsert: (text: string) => boolean;
}) {
  const read = useServerFn(transcribeNotebookPhoto),
    state = usePhotoReader((image) => read({ data: { image } }));
  const [text, setText] = useState("");
  const applied = useRef(false);
  useEffect(() => {
    if (state.result) setText(state.result.text);
  }, [state.result]);
  return (
    <PhotoDialog
      title="Do papel para o seu caderno"
      description="Fotografe suas anotações. Revise a transcrição e adicione ao final do caderno, preservando o que já escreveu."
      close={close}
    >
      <PhotoPicker
        photo={state.photo}
        pending={state.pending}
        choose={state.choose}
        compact={!!state.result}
      />
      <Reading pending={state.pending} />
      {state.error && (
        <p className="study-photo-error" role="alert">
          {state.error}
        </p>
      )}
      {!state.result ? (
        <Button disabled={!state.photo || !!state.pending} onClick={() => void state.analyze()}>
          <Sparkles />
          Transcrever foto
        </Button>
      ) : (
        <div className="study-photo-review">
          <PhotoWarnings items={state.result.warnings} />
          {!state.result.text.trim() && (
            <p className="study-photo-empty">
              Não encontramos texto legível. Tente uma foto mais próxima da página.
            </p>
          )}
          <label className="form-label">
            Revise o texto transcrito
            <textarea
              className="form-input"
              rows={9}
              disabled={!!state.pending}
              maxLength={24000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <small>{text.length}/24000 caracteres · Trechos incertos aparecem como [ilegível].</small>
          <div className="study-photo-actions">
            <Button variant="ghost" onClick={() => void state.analyze()} disabled={!!state.pending}>
              Ler novamente
            </Button>
            <Button
              disabled={!text.trim() || !!state.pending}
              onClick={() => {
                if (applied.current) return;
                if (onInsert(text)) {
                  applied.current = true;
                  toast.success("Transcrição adicionada ao caderno.");
                  close();
                } else
                  state.setError(
                    "Não foi possível salvar o caderno. A transcrição continua aqui; libere espaço e tente novamente.",
                  );
              }}
            >
              <Check />
              Adicionar ao caderno
            </Button>
          </div>
        </div>
      )}
    </PhotoDialog>
  );
}
export function ReportPhotoImport({ subjectId }: { subjectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="study-photo-trigger" onClick={() => setOpen(true)}>
        <ScanLine />
        Importar foto do boletim
      </Button>
      {open && <ReportPhotoDialog currentSubjectId={subjectId} close={() => setOpen(false)} />}
    </>
  );
}
function ReportPhotoDialog({
  currentSubjectId,
  close,
}: {
  currentSubjectId: string;
  close: () => void;
}) {
  const { data, update } = useStudy(),
    read = useServerFn(readReportPhoto),
    state = usePhotoReader((image) => read({ data: { image } }));
  const [drafts, setDrafts] = useState<ReportDraft[]>([]),
    [includeAbsences, setIncludeAbsences] = useState(true),
    [confirmDates, setConfirmDates] = useState(false),
    [overwrite, setOverwrite] = useState(false);
  const applied = useRef(false);
  useEffect(() => {
    if (state.result) setDrafts(reportDrafts(state.result, data.subjects));
  }, [state.result]);
  const preview = useMemo(() => {
    try {
      return { result: applyReportDrafts(data, drafts, { includeAbsences, overwrite }), error: "" };
    } catch (cause) {
      return {
        result: undefined,
        error: cause instanceof Error ? cause.message : "Confira os registros.",
      };
    }
  }, [data, drafts, includeAbsences, overwrite]);
  useEffect(() => {
    setConfirmDates(false);
  }, [data, drafts, includeAbsences, overwrite]);
  const edit = (index: number, patch: Partial<ReportDraft>) =>
    setDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const save = () => {
    if (applied.current) return;
    state.setError("");
    try {
      const confirmedDates =
        confirmDates && preview.result?.inference?.status === "ambiguous"
          ? preview.result.inference.dates
          : undefined;
      const options = { includeAbsences, overwrite, ...(confirmedDates ? { confirmedDates } : {}) };
      const check = applyReportDrafts(data, drafts, options);
      if (!check.changed) {
        state.setError(
          "Nenhum campo precisa ser alterado. Para trocar notas existentes, marque “Substituir notas já preenchidas”.",
        );
        return;
      }
      let changes = 0,
        kept = 0;
      const ok = update((current) => {
        const next = applyReportDrafts(current, drafts, options);
        changes = next.changed;
        kept = next.kept;
        return next.data;
      });
      if (!ok) {
        state.setError(
          "Não foi possível salvar as notas. Sua revisão continua aqui; tente novamente.",
        );
        return;
      }
      applied.current = true;
      toast.success(
        `${changes} campo(s) importado(s).${kept ? ` ${kept} valor(es) existente(s) preservado(s).` : ""}`,
      );
      close();
    } catch (e) {
      state.setError(
        e instanceof Error ? e.message : "Confira as matérias e os bimestres antes de importar.",
      );
    }
  };
  return (
    <PhotoDialog
      title="Seu boletim, sem digitar tudo"
      description="A IA lê todas as matérias do boletim. Confira os totais e o cruzamento com seu horário antes de salvar."
      close={close}
    >
      <PhotoPicker
        photo={state.photo}
        pending={state.pending}
        choose={state.choose}
        compact={!!state.result}
      />
      <Reading pending={state.pending} />
      {state.error && (
        <p className="study-photo-error" role="alert">
          {state.error}
        </p>
      )}
      {!state.result ? (
        <Button disabled={!state.photo || !!state.pending} onClick={() => void state.analyze()}>
          <Sparkles />
          Ler boletim
        </Button>
      ) : (
        <div className="study-photo-review">
          <PhotoWarnings items={state.result.warnings} />
          {!drafts.length ? (
            <p className="study-photo-empty">
              Não encontramos notas legíveis. Tente uma foto mais próxima da tabela do boletim.
            </p>
          ) : (
            <>
              <p className="study-photo-help">
                Matérias com o mesmo nome são associadas automaticamente; as novas serão criadas ao
                salvar. Confira os nomes e os períodos; nenhum valor será salvo antes da sua
                confirmação.
              </p>
              <div className="report-import-options">
                <label>
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                  />
                  Substituir notas já preenchidas
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={includeAbsences}
                    onChange={(e) => setIncludeAbsences(e.target.checked)}
                  />
                  Importar também as faltas
                </label>
                {includeAbsences && (
                  <p>
                    As faltas do boletim atualizam o mesmo total da tabela e do calendário; não são
                    somadas outra vez. Confira o bimestre e seu horário atual. Presenças já
                    registradas serão preservadas.
                  </p>
                )}
              </div>
              {includeAbsences && preview.result?.inference && (
                <div className="study-photo-help" role="status">
                  <p>{preview.result.inference.message}</p>
                  {!!preview.result.inference.dates.length && (
                    <>
                      <p>
                        Dias sugeridos:{" "}
                        {preview.result.inference.dates
                          .map((date) => date.split("-").reverse().join("/"))
                          .join(", ")}
                        . Marcar um dia inteiro afeta todas as aulas desse dia, inclusive de
                        matérias fora da foto.
                      </p>
                      {preview.result.inference.status === "ambiguous" ? (
                        <label>
                          <input
                            type="checkbox"
                            checked={confirmDates}
                            onChange={(event) => setConfirmDates(event.target.checked)}
                          />
                          Confirmo que faltei nos dias sugeridos
                        </label>
                      ) : (
                        <p>
                          Esses dias serão marcados ao salvar. Se houver feriados, faltas parciais
                          ou mudanças de horário, ajuste os dados antes de confirmar.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
              {preview.error && !state.error && drafts.some((row) => row.selected) && (
                <p role="alert" className="study-photo-error">
                  {preview.error}
                </p>
              )}
              <div className="report-import-rows">
                {drafts.map((row, index) => {
                  const previous = data.performance[row.subjectId]?.grades[Number(row.period) - 1];
                  return (
                    <article
                      key={index}
                      className={`report-import-row ${row.selected ? "is-selected" : ""} ${row.subjectId === currentSubjectId ? "is-current-subject" : ""}`}
                    >
                      <header>
                        <label>
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(e) => edit(index, { selected: e.target.checked })}
                          />
                          Importar registro {index + 1}
                        </label>
                        <small>
                          {row.source} · {row.periodLabel || "Período não identificado"}
                        </small>
                      </header>
                      <div className="report-import-fields">
                        <label className="form-label">
                          Matéria do registro {index + 1}
                          <select
                            className="form-input"
                            value={row.subjectId}
                            onChange={(e) => edit(index, { subjectId: e.target.value })}
                          >
                            <option value="">Escolha a matéria</option>
                            <option value={newReportSubject}>Criar matéria: {row.source}</option>
                            {data.subjects.map((subject) => (
                              <option key={subject.id} value={subject.id}>
                                {subject.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="form-label">
                          Bimestre do registro {index + 1}
                          <select
                            className="form-input"
                            value={row.period}
                            onChange={(e) => edit(index, { period: e.target.value })}
                          >
                            <option value="">Escolha o período</option>
                            {[1, 2, 3, 4].map((period) => (
                              <option key={period} value={period}>
                                {period}º bimestre
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="form-label">
                          Nota do registro {index + 1}
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            max="1000"
                            step="any"
                            placeholder="Não identificada"
                            value={row.score}
                            onChange={(e) => edit(index, { score: e.target.value })}
                          />
                        </label>
                        <label className="form-label">
                          Faltas do registro {index + 1}
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            max="1000"
                            step="1"
                            placeholder="Não identificadas"
                            value={row.absences}
                            disabled={!includeAbsences}
                            onChange={(e) => edit(index, { absences: e.target.value })}
                          />
                        </label>
                      </div>
                      {(previous?.score || previous?.absences) && (
                        <p className="report-existing-values">
                          Já salvo: nota {previous.score || "—"} · faltas{" "}
                          {absenceTotal(data, row.subjectId, Number(row.period) - 1)}.
                          {!overwrite ? " Notas preenchidas serão mantidas." : ""}
                        </p>
                      )}
                      {!row.subjectId && (
                        <p className="report-existing-values">
                          Essa matéria não foi associada. Escolha uma já cadastrada ou deixe o
                          registro desmarcado.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
          <div className="study-photo-actions">
            <Button variant="ghost" onClick={() => void state.analyze()} disabled={!!state.pending}>
              Ler novamente
            </Button>
            <Button
              disabled={!drafts.some((row) => row.selected) || !!state.pending}
              onClick={save}
            >
              <Check />
              Salvar notas selecionadas
            </Button>
          </div>
        </div>
      )}
    </PhotoDialog>
  );
}

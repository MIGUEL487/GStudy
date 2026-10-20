import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { FileUp, FileText, Link2, PenLine, Trash2, ChevronDown } from "lucide-react";
import { addMaterial } from "@/lib/learn.functions";

function readAs(file: File, mode: "text" | "url") {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Não deu para ler o arquivo."));
    if (mode === "text") r.readAsText(file);
    else r.readAsDataURL(file);
  });
}

export function MaterialCard({
  m,
  on,
  toggle,
  remove,
}: {
  m: { title: string; kind: string; memory: string; source: string | null };
  on: boolean;
  toggle: () => void;
  remove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`material ${on ? "on" : ""}`}>
      <div className="material-head">
        <button className="material-pick" onClick={toggle} aria-pressed={on}>
          <span>
            {m.kind === "link" ? (
              <Link2 size={18} />
            ) : m.kind === "file" ? (
              <FileText size={18} />
            ) : (
              <PenLine size={18} />
            )}
          </span>
          <b>{m.title}</b>
          {on && <em>foco</em>}
        </button>
        <button className="icon-btn" aria-label="Ver memória" onClick={() => setOpen(!open)}>
          <ChevronDown
            size={16}
            className={open ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </button>
        <button className="icon-btn" aria-label="Apagar material" onClick={remove}>
          <Trash2 size={15} />
        </button>
      </div>
      {open && (
        <div className="material-memory prose prose-sm">
          <ReactMarkdown>{m.memory}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export function AddMaterial({ onAdded }: { onAdded: () => void }) {
  const add = useServerFn(addMaterial);
  const [kind, setKind] = useState<"file" | "link" | "summary">("summary");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const t = title.trim() || file?.name.replace(/\.[^.]+$/, "") || "";
    if (!t) return setError("Dê um nome ao material.");
    try {
      setBusy(true);
      const payload: {
        title: string;
        kind: typeof kind;
        text?: string;
        url?: string;
        file?: { dataUrl: string; mediaType: string; name: string };
      } = { title: t.slice(0, 120), kind };
      if (kind === "link") {
        if (!url.trim()) throw new Error("Cole um link.");
        payload.url = url.trim();
      }
      if (kind === "summary") {
        if (text.trim().length < 20)
          throw new Error("Escreva um pouco mais (pelo menos 20 letras).");
        payload.text = text;
      }
      if (kind === "file") {
        if (!file) throw new Error("Escolha um arquivo.");
        if (file.size > 3 * 1024 * 1024) throw new Error("Arquivo grande demais (máx. 3 MB).");
        if (/^text\/|\.md$|\.txt$|\.csv$/.test(file.type || file.name))
          payload.text = (await readAs(file, "text")).slice(0, 60000);
        else
          payload.file = {
            dataUrl: await readAs(file, "url"),
            mediaType: file.type,
            name: file.name,
          };
      }
      await add({ data: payload });
      toast.success("Material guardado na sua memória de estudos!");
      setTitle("");
      setUrl("");
      setText("");
      setFile(null);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo deu errado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-material" onSubmit={submit}>
      <div className="seg">
        {(
          [
            ["file", FileUp, "Arquivo"],
            ["link", Link2, "Link"],
            ["summary", PenLine, "Resumo"],
          ] as const
        ).map(([k, Icon, l]) => (
          <button
            type="button"
            key={k}
            className={kind === k ? "on" : ""}
            onClick={() => {
              setKind(k);
              setError("");
            }}
          >
            <Icon size={15} />
            {l}
          </button>
        ))}
      </div>
      <input
        className="form-input"
        placeholder="Nome (ex.: Revolução Francesa)"
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {kind === "link" && (
        <input
          className="form-input"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      )}
      {kind === "summary" && (
        <textarea
          className="form-input min-h-28"
          placeholder="Escreva com suas palavras o que está estudando…"
          maxLength={60000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {kind === "file" && (
        <label className="file-drop">
          <input
            type="file"
            accept="application/pdf,image/*,.txt,.md,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <FileUp size={20} />
          {file ? file.name : "PDF, foto do caderno ou texto (até 3 MB)"}
        </label>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="duo-btn w-full" disabled={busy}>
        {busy ? "A IA está lendo…" : "Guardar na memória"}
      </button>
    </form>
  );
}

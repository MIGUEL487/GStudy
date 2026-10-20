import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
export function CreateDialog({
  kind,
  open,
  onOpenChange,
  onCreate,
}: {
  kind: "matéria" | "caderno" | "curso";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (name: string, url: string) => boolean;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif text-3xl">
            {kind === "matéria"
              ? "Nova matéria"
              : kind === "caderno"
                ? "Novo caderno"
                : "Adicionar curso"}
          </DialogTitle>
          <DialogDescription>
            {kind === "matéria"
              ? "Um novo assunto para explorar."
              : kind === "caderno"
                ? "Uma página em branco, muitas possibilidades."
                : "Mais conhecimento para a sua jornada."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              setError("Preencha o nome para continuar.");
              return;
            }
            if (kind === "curso" && !url.trim()) {
              setError("Preencha o link do curso.");
              return;
            }
            if (onCreate(name, url)) {
              setName("");
              setUrl("");
              setError("");
              onOpenChange(false);
            }
          }}
        >
          <label className="form-label">
            {kind === "caderno" ? "Título" : "Nome"}
            <input
              autoFocus
              className="form-input"
              maxLength={100}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder={
                kind === "matéria"
                  ? "Ex.: História"
                  : kind === "caderno"
                    ? "Ex.: Anotações de aula"
                    : "Ex.: Introdução à matemática"
              }
            />
          </label>
          {kind === "curso" && (
            <label className="form-label">
              Link do curso
              <input
                className="form-input"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError("");
                }}
                placeholder="https://site.com/curso"
              />
            </label>
          )}
          <p className="form-error" role="alert">
            {error}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              <Plus size={16} />
              Criar {kind}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { Heart, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { m } from "motion/react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { useHearts } from "./hearts-provider";
import { learningRpc } from "@/lib/learning-rpc";
import { backendErrorMessage } from "@/lib/backend-errors";

export function HeartsStatus() {
  const hearts = useHearts();
  if (!hearts) return null;
  return (
    <details className="hearts-status">
      <summary
        aria-label={
          hearts.state
            ? `${hearts.state.hearts} de ${hearts.state.max} corações`
            : "Consultar corações"
        }
      >
        <Heart size={17} aria-hidden="true" />
        <span>{hearts.state?.hearts ?? "—"}</span>
      </summary>
      <div className="hearts-status-details">
        <p>{hearts.error || (hearts.state ? hearts.countdown : "Consultando corações…")}</p>
        <p>Você recupera um coração por vez. Revisar seus erros não gasta corações.</p>
        <button type="button" className="text-action" onClick={() => void hearts.refresh()}>
          Atualizar corações
        </button>
      </div>
    </details>
  );
}

type Row = { user_id: string; display_name: string; score: number; rank_position: number };
export function LearningTrophy() {
  const account = useHearts();
  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState<"xp" | "streak">("xp");
  const [period, setPeriod] = useState<"week" | "total">("week");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    void Promise.resolve(
      learningRpc("get_learning_leaderboard", { p_metric: metric, p_period: period }),
    )
      .then(({ data, error: failure }) => {
        if (!active) return;
        if (failure) setError(backendErrorMessage(failure, "Não foi possível carregar o ranking."));
        else setRows(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar o ranking. Confira a conexão.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, metric, period]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  if (!account) return null;
  return (
    <>
      <button
        type="button"
        className="header-badge-btn"
        aria-label="Abrir ranking de XP e ofensiva"
        onClick={() => setOpen(true)}
      >
        <Trophy size={20} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="learning-ranking" aria-describedby={undefined}>
          <m.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
          >
            <header>
              <DialogTitle>Entre amigos</DialogTitle>
            </header>
            <div role="tablist" aria-label="Métrica do ranking">
              {(["xp", "streak"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={metric === key}
                  onClick={() => setMetric(key)}
                >
                  {key === "xp" ? "XP" : "Ofensiva"}
                </button>
              ))}
            </div>
            {
              <label>
                Período{" "}
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as "week" | "total")}
                >
                  <option value="week">Esta semana</option>
                  <option value="total">Total</option>
                </select>
              </label>
            }
            {metric === "streak" && (
              <p>Sequência atual de dias de estudo, limitada ao período escolhido.</p>
            )}
            {loading ? (
              <p role="status">Carregando ranking…</p>
            ) : error ? (
              <p role="alert">{error}</p>
            ) : rows.length ? (
              <ol>
                {rows.map((row) => (
                  <li
                    key={row.user_id}
                    className={row.user_id === account.userId ? "is-current" : ""}
                  >
                    <span>
                      {row.rank_position}. {row.display_name}
                      {row.user_id === account.userId ? " (você)" : ""}
                    </span>
                    <b>
                      {row.score} {metric === "xp" ? "XP" : "dias"}
                    </b>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Seus amigos que escolherem aparecer no ranking serão listados aqui.</p>
            )}
            <p>Seu perfil e apenas amigos aceitos que ativaram a participação no ranking.</p>
          </m.section>
        </DialogContent>
      </Dialog>
    </>
  );
}

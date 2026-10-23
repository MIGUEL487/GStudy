import { useEffect, useState } from "react";
import { readGameChallenge } from "@/lib/games/rpc";
export function ChallengeResults({ id, revision }: { id: string; revision: number | null }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof readGameChallenge>>["results"]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void readGameChallenge(id)
      .then((value) => {
        if (active) {
          setRows(value.results);
          setError("");
        }
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Não foi possível comparar as partidas.",
          );
      });
    return () => {
      active = false;
    };
  }, [id, revision]);
  return (
    <section aria-label="Resultado do desafio">
      <h3>O mesmo desafio</h3>
      {error && <p role="alert">{error}</p>}
      <ul>
        {rows.map((row) => (
          <li key={row.user_id}>
            {row.display_name}: {row.score} pontos
          </li>
        ))}
      </ul>
      {rows.length < 2 && (
        <p>Seu amigo pode jogar depois. O resultado dele aparece aqui quando concluir.</p>
      )}
    </section>
  );
}

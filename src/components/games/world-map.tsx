import { useState } from "react";
import countries from "@/lib/games/world-map.json";
export function WorldMap({
  disabled,
  onAnswer,
}: {
  disabled: boolean;
  onAnswer: (answer: string) => void;
}) {
  const [zoom, setZoom] = useState(1),
    [selected, setSelected] = useState("");
  return (
    <section className="game-map-container" aria-label="Mapa-múndi">
      <div className="game-map-controls">
        <button
          onClick={() => setZoom((v) => Math.max(1, v - 0.5))}
          disabled={zoom <= 1}
          aria-label="Diminuir zoom"
        >
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((v) => Math.min(4, v + 0.5))}
          disabled={zoom >= 4}
          aria-label="Aumentar zoom"
        >
          +
        </button>
      </div>
      <div className="game-map-scroll">
        <svg
          viewBox="0 0 900 390"
          style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
          role="group"
          aria-label="Países do mundo"
        >
          {countries.map((country) => (
            <path
              key={country.id}
              d={country.path}
              fillRule="evenodd"
              className="game-map-region"
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={country.name}
              aria-disabled={disabled}
              onClick={() => {
                if (!disabled) onAnswer(country.id);
              }}
              onKeyDown={(event) => {
                if (!disabled && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onAnswer(country.id);
                }
              }}
            />
          ))}
        </svg>
      </div>
      <label>
        País pelo teclado{" "}
        <select
          value={selected}
          disabled={disabled}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Escolha um país</option>
          {countries.map((country) => (
            <option key={country.id} value={country.id}>
              {country.name}
            </option>
          ))}
        </select>
      </label>
      <button disabled={disabled || !selected} onClick={() => onAnswer(selected)}>
        Marcar país
      </button>
      <small>
        Limites: Natural Earth, domínio público. Projeção equiretangular; Antártida omitida.
      </small>
    </section>
  );
}

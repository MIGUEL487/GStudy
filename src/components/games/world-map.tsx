import { useState } from "react";
import countries from "@/lib/games/world-map.json";
export function WorldMap({
  disabled,
  onAnswer,
}: {
  disabled: boolean;
  onAnswer: (answer: string) => void;
}) {
  const [selected, setSelected] = useState("");
  return (
    <section className="game-map-container" aria-label="Mapa-múndi">
      <div className="game-map-scroll">
        <svg viewBox="0 0 900 390" role="group" aria-label="Países do mundo">
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
      <small>Mapa: Natural Earth, domínio público. Arraste para explorar.</small>
    </section>
  );
}

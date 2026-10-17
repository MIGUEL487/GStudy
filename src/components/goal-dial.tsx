import { useRef, type PointerEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { dragGoal, goalAngle, snapGoal } from "@/lib/preparation-model";

export function GoalDial({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const dragging = useRef<{ id: number; angle: number; value: number } | null>(null);
  const update = (next: number) => onChange(snapGoal(next));
  const angle = (value / 100) * Math.PI * 2 - Math.PI / 2;
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * 280) / rect.width - 140,
      y: ((event.clientY - rect.top) * 280) / rect.height - 140,
    };
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const active = dragging.current;
    if (!active || active.id !== event.pointerId) return;
    const p = point(event),
      next = goalAngle(p.x, p.y);
    active.value = dragGoal(active.value, active.angle, next);
    active.angle = next;
    update(active.value);
  };
  const end = (event: PointerEvent<SVGSVGElement>) => {
    if (dragging.current?.id !== event.pointerId) return;
    move(event);
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div className="goal-dial">
      <div className="goal-dial-face">
        <svg
          viewBox="0 0 280 280"
          role="slider"
          aria-label="Meta de aproveitamento"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-valuetext={value + "% de aproveitamento"}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(event) => {
            if (disabled) return;
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 100
                  : event.key === "PageUp"
                    ? value + 10
                    : event.key === "PageDown"
                      ? value - 10
                      : ["ArrowUp", "ArrowRight"].includes(event.key)
                        ? value + 5
                        : ["ArrowDown", "ArrowLeft"].includes(event.key)
                          ? value - 5
                          : undefined;
            if (next !== undefined) {
              event.preventDefault();
              update(next);
            }
          }}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0 || dragging.current) return;
            const p = point(event),
              distance = Math.hypot(p.x, p.y);
            if (distance < 82 || distance > 135) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const raw = goalAngle(p.x, p.y),
              next = raw < 0.5 && value > 50 ? 100 : raw;
            dragging.current = { id: event.pointerId, angle: raw, value: next };
            update(next);
          }}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={() => {
            dragging.current = null;
          }}
          onLostPointerCapture={() => {
            dragging.current = null;
          }}
        >
          <circle className="goal-dial-track" cx="140" cy="140" r="108" />
          {Array.from({ length: 20 }, (_, i) => (
            <line
              key={i}
              className="goal-dial-tick"
              x1="140"
              y1="10"
              x2="140"
              y2={i % 5 ? 15 : 20}
              transform={"rotate(" + i * 18 + " 140 140)"}
            />
          ))}
          <circle
            className="goal-dial-fill"
            cx="140"
            cy="140"
            r="108"
            pathLength="100"
            strokeDasharray={value + " 100"}
            transform="rotate(-90 140 140)"
          />
          <circle
            className="goal-dial-handle"
            cx={140 + Math.cos(angle) * 108}
            cy={140 + Math.sin(angle) * 108}
            r="11"
          />
        </svg>
        <div className="goal-dial-value" aria-hidden="true">
          <small>SUA META</small>
          <strong>
            {value}
            <span>%</span>
          </strong>
          <span>de aproveitamento</span>
        </div>
      </div>
      <div className="goal-dial-buttons">
        <button
          type="button"
          aria-label="Diminuir meta"
          disabled={disabled || value <= 0}
          onClick={() => update(value - 5)}
        >
          <Minus size={18} />
        </button>
        <span>Arraste pela borda do círculo</span>
        <button
          type="button"
          aria-label="Aumentar meta"
          disabled={disabled || value >= 100}
          onClick={() => update(value + 5)}
        >
          <Plus size={18} />
        </button>
      </div>
      <small className="goal-dial-help">
        De 5% em 5%. Arraste a borda ou use as setas do teclado.
      </small>
    </div>
  );
}

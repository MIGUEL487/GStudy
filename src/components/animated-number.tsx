import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}

export function AnimatedNumber({
  value,
  duration = 600,
  format = (n) => String(Math.round(n)),
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const currentRef = useRef(value);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplayValue(value);
      currentRef.current = value;
      return;
    }

    const startValue = currentRef.current;
    const diff = value - startValue;
    if (diff === 0) return;

    const startTime = performance.now();

    let handle: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = startValue + diff * eased;
      setDisplayValue(nextVal);
      currentRef.current = nextVal;

      if (progress < 1) {
        handle = requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
        currentRef.current = value;
      }
    };

    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [value, duration]);

  return <span>{format(displayValue)}</span>;
}

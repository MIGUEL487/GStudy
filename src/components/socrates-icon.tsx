import type { SVGProps } from "react";

/** Compact line portrait based on the familiar bald, bearded Socrates silhouette. */
export function SocratesIcon({ size = 20, strokeWidth = 1.65, ...props }: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4.5 10V8a7.5 7.5 0 0 1 15 0v2c1.1.6 1.5 1.7 1.1 2.8l-.9 2.2-1.2.8c-.1 2.3-1.1 4.1-2.8 5.2L12 23l-3.7-2c-1.7-1.1-2.7-2.9-2.8-5.2l-1.2-.8-.9-2.2c-.4-1.1 0-2.2 1.1-2.8Z" />
      <path d="M6.2 7.5c1.3-3.5 3.6-4.5 5.8-4.5s4.5 1 5.8 4.5M7.2 10l2-.3m5.6 0 2 .3M8.5 12h.1m6.8 0h.1M12 13.2c-.8.8-1 1.4-.7 1.8m.7 0h1M9.4 17.4c1.6 1 3.6 1 5.2 0M7.2 15.5c.1 2.4.7 4.3 2.2 5.3m7.4-5.3c-.1 2.4-.7 4.3-2.2 5.3" />
    </svg>
  );
}

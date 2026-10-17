import type { SVGProps } from "react";

/** Transparent line portrait matching the bald head and long beard in the reference. */
export function SocratesIcon({ size = 24, strokeWidth = 90, ...props }: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="150 0 900 1200" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M222 359C198 461 198 566 226 632c-20 116-9 189 57 240 20 79 61 144 121 167 35 62 89 112 160 145l36-55 36 55c71-33 125-83 160-145 60-23 101-88 121-167 66-51 77-124 57-240 28-66 28-171 4-273-6-203-133-323-377-323S228 156 222 359Z" />
      <path d="M384 75c-28 118-79 309-79 406l33 166 111 82c6-75 59-131 151-131s145 56 151 131l111-82 33-166c0-97-51-288-79-406" />
      <path strokeWidth={strokeWidth * .72} d="M448 203c58-14 107-7 152 17 45-24 94-31 152-17M411 355c37-26 74-27 114 0m150 0c40-27 77-26 114 0" />
      <circle cx="468" cy="411" r="36" fill="currentColor" stroke="none" />
      <circle cx="732" cy="411" r="36" fill="currentColor" stroke="none" />
      <path strokeWidth={strokeWidth * .72} d="M542 542a58 58 0 0 1 116 0M545 714h110M403 807c16 70 13 150 1 232m393-232c-16 70-13 150-1 232M483 879l-7 32m7 79c7 34 24 63 45 82m189-193 7 32m-7 79c-7 34-24 63-45 82M600 1032v100" />
    </svg>
  );
}

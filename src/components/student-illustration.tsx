import { useId } from "react";
import type { StudentId } from "@/lib/students";

const palettes = {
  gui: {
    sweater: "#65796c",
    shade: "#3d5349",
    skin: "#f3cfac",
    shadow: "#e4af84",
    hair: "#403025",
    collar: "#8a9a87",
  },
  lia: {
    sweater: "#b7786e",
    shade: "#81534e",
    skin: "#c99068",
    shadow: "#af704f",
    hair: "#30271f",
    collar: "#d1a99b",
  },
  rafa: {
    sweater: "#6b8b9f",
    shade: "#405c72",
    skin: "#a77352",
    shadow: "#8b5b3f",
    hair: "#292420",
    collar: "#a0b9c5",
  },
  maya: {
    sweater: "#b09760",
    shade: "#7c673c",
    skin: "#f0c5a0",
    shadow: "#dca47e",
    hair: "#72472f",
    collar: "#d8c799",
  },
} as const;

export function StudentIllustration({
  thinking = false,
  studentId = "gui",
}: {
  thinking?: boolean;
  studentId?: StudentId;
}) {
  const id = useId().replace(/:/g, "");
  const color = palettes[studentId];
  return (
    <svg
      className={`student-illustration ${thinking ? "is-thinking" : ""}`}
      viewBox="0 0 280 200"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`${id}-sweater`}
          x1="76"
          y1="140"
          x2="208"
          y2="205"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={color.sweater} />
          <stop offset="1" stopColor={color.shade} />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop stopColor="#f7d894" stopOpacity=".7" />
          <stop offset="1" stopColor="#f7d894" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="140" cy="185" rx="107" ry="11" fill="#6c4830" fillOpacity=".09" />
      <circle cx="145" cy="92" r="87" fill="#e8d6b9" fillOpacity=".45" />
      <circle cx="220" cy="45" r="36" fill={`url(#${id}-glow)`} />
      <g
        className="student-bulb"
        stroke="#b98538"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M210 41a11 11 0 1 1 19 8c-3 3-4 5-4 8h-10c0-4-1-6-3-9a11 11 0 0 1-2-7Z"
          fill="#ffe7ad"
        />
        <path d="M216 61h8m-7 4h6m-4-10-2-13 4 4 4-4-3 13M219 23v-5m-18 13-4-3m41 3 4-3m-8 22 5 2" />
      </g>
      <path
        d="M49 102c1-17 11-31 27-36m-7-3 9 2-3 9"
        stroke="#99734d"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {(studentId === "lia" || studentId === "maya") && (
        <path
          d="M90 83c-7 15-9 36-5 62l25 4 51-4 24 3c5-24 0-53-7-67Z"
          fill={color.hair}
          stroke="#493023"
          strokeWidth="2"
        />
      )}
      <path
        d="M77 186c0-36 22-58 62-58s64 20 65 58"
        fill={`url(#${id}-sweater)`}
        stroke={color.shade}
        strokeWidth="2"
      />
      <path
        d="m119 135 20 19 20-19-5-13h-30l-5 13Z"
        fill={color.shadow}
        stroke="#805639"
        strokeWidth="2"
      />
      <path d="m116 139 23 15-15 12-15-21m54-7-24 16 15 12 17-19" fill={color.collar} />
      <ellipse cx="94" cy="90" rx="9" ry="13" fill={color.skin} stroke="#805639" strokeWidth="2" />
      <ellipse cx="180" cy="90" rx="9" ry="13" fill={color.skin} stroke="#805639" strokeWidth="2" />
      <path
        d="M96 74c0-31 80-32 81 0l-2 28c-2 22-18 36-38 36-22 0-38-16-40-37l-1-27Z"
        fill={color.skin}
        stroke="#805639"
        strokeWidth="2"
      />
      {studentId === "lia" ? (
        <path
          d="M89 91c-10-39 10-65 49-65 36 0 53 27 45 66l-12-22-9-20c-18 21-39 24-62 24l-11 17Z"
          fill={color.hair}
          stroke="#2f241c"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : studentId === "rafa" ? (
        <path
          d="m90 86-6-24 7-13 3-11 14 1 12-12 16 6 15-8 14 12 15 3 9 21-7 25-11-21-17-7-17 7-17-9-17 17-13 13Z"
          fill={color.hair}
          stroke="#2f241c"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : studentId === "maya" ? (
        <path
          d="M88 88c-4-27 4-60 48-63 34-2 55 27 47 64l-10-20c-19 2-37-5-49-18-4 17-18 25-29 27l-7 10Z"
          fill={color.hair}
          stroke="#4c3023"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="m89 87-3-20 9-12-4-11 17 1 3-17 20 9 17-14 13 15 22-1-1 17 11 12-11 28-8-19-9-7-8-14-15 18-9-10-15 15-10-9-13 28Z"
          fill={color.hair}
          stroke="#2f241c"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
      <path
        d="m106 47 14-5m28 1 9-5m16 12 6 9"
        stroke="#6a4b32"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="m109 83 10-2m30 0 11 2" stroke="#62432e" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="116" cy="95" rx="6.5" ry="9" fill="#34291f" />
      <ellipse cx="155" cy="95" rx="6.5" ry="9" fill="#34291f" />
      <circle cx="118" cy="92" r="2" fill="#fff9ed" />
      <circle cx="157" cy="92" r="2" fill="#fff9ed" />
      {studentId === "rafa" && (
        <g stroke="#38434c" strokeWidth="2">
          <rect x="104" y="85" width="25" height="22" rx="7" />
          <rect x="143" y="85" width="25" height="22" rx="7" />
          <path d="M129 93h14M96 88l8 3m64 0 9-3" />
        </g>
      )}
      {studentId === "maya" && (
        <>
          <path d="m173 53 13 0-5 11-9-4Z" fill="#c29a58" stroke="#836033" strokeWidth="1.5" />
          <path
            d="m96 127-10 10m85-9 10 10"
            stroke="#b38a43"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}
      <ellipse cx="107" cy="109" rx="9" ry="4" fill="#df987f" fillOpacity=".35" />
      <ellipse cx="164" cy="109" rx="9" ry="4" fill="#df987f" fillOpacity=".35" />
      <path
        d="m134 102-2 6 4 1m-6 10q7 5 14-1"
        stroke="#9c6749"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m181 164-16-24 5-12c0-5 7-7 10-3l10 18 6 18"
        fill={color.skin}
        stroke="#805639"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="m170 137 8 5m-7-12 9 5" stroke="#b57e58" strokeWidth="1.5" strokeLinecap="round" />
      <path d="m178 124 12-22" stroke="#6b4a2f" strokeWidth="5" strokeLinecap="round" />
      <path d="m190 102 4-7" stroke="#c79d5b" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M68 168c25-5 49-3 71 9 25-13 49-15 74-10l-4 27c-24-4-47-2-70 5-25-8-46-10-68-5l-3-26Z"
        fill="#c4a47b"
        stroke="#6f5037"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M73 163c25-4 45 0 66 11 22-12 45-16 68-12l-2 24c-24-1-45 2-66 10-22-9-42-11-64-10l-2-23Z"
        fill="#fff5df"
        stroke="#8f7150"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m139 174 0 21m-52-24 34 7m-35 0 35 7m35-7 35-8m-34 15 34-8"
        stroke="#d7c6a7"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

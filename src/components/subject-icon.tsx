import {
  Atom,
  BookOpen,
  Calculator,
  Code2,
  FlaskConical,
  Globe2,
  HeartPulse,
  Landmark,
  Languages,
  Leaf,
  Palette,
  type LucideIcon,
} from "lucide-react";

const normalize = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function subjectIdentity(name: string): { icon: LucideIcon; color: string } {
  const value = normalize(name);
  if (/matemat|algebra|geometr|calcul|estatistic/.test(value))
    return { icon: Calculator, color: "#aa4d48" };
  if (/biolog|ciencia da natureza|botanic|ecolog/.test(value))
    return { icon: Leaf, color: "#447959" };
  if (/tecnolog|program|comput|informat|software|robot/.test(value))
    return { icon: Code2, color: "#436d9d" };
  if (/fisica|astronom/.test(value)) return { icon: Atom, color: "#766194" };
  if (/quimica|ciencia/.test(value)) return { icon: FlaskConical, color: "#337e80" };
  if (/histor|filosof|sociolog/.test(value)) return { icon: Landmark, color: "#9a7544" };
  if (/geograf|geolog/.test(value)) return { icon: Globe2, color: "#577e70" };
  if (/portugues|literat|redacao|lingua|ingles|espanhol|frances/.test(value))
    return { icon: Languages, color: "#9a617a" };
  if (/arte|musica|design/.test(value)) return { icon: Palette, color: "#9a6750" };
  if (/saude|medicin|educacao fisica|anatom/.test(value))
    return { icon: HeartPulse, color: "#a05864" };
  return { icon: BookOpen, color: "#876548" };
}

export function subjectColor(name: string): string {
  return subjectIdentity(name).color;
}

/** Subject appearance comes from its name; legacy emoji values remain untouched. */
export function SubjectIcon({
  name,
  size = 22,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const { icon: Icon, color } = subjectIdentity(name);
  return (
    <Icon
      className={className}
      size={size}
      color={color}
      strokeWidth={1.65}
      fill="none"
      aria-hidden="true"
    />
  );
}

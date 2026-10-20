import { Link, useLocation } from "@tanstack/react-router";
import {
  Home,
  SlidersHorizontal,
  ChevronRight,
  Leaf,
  BookOpen,
  CalendarDays,
  LogOut,
  GraduationCap,
  Compass,
} from "lucide-react";
import { useAuth } from "./auth-gate";
import { Avatar, useDisplayName } from "./avatar";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { logo } from "@/lib/images";
import { useStudy } from "./study-provider";
import { Button } from "@/components/ui/button";
import { SubjectIcon } from "./subject-icon";
import { SocratesIcon } from "./socrates-icon";
import { RecallResume } from "./recall-resume";
import { SyncStatus } from "./account-sync-provider";
import { FocusSessionHeader, RecallTimerPopup, useTestFocus } from "./study-session-controls";

const navigation = [
  { to: "/", label: "Início", mobileLabel: "Início", icon: Home },
  { to: "/calendario", label: "Calendário", mobileLabel: "Calendário", icon: CalendarDays },
  { to: "/aprender", label: "Aprender", mobileLabel: "Aprender", icon: GraduationCap },
  { to: "/socrates", label: "Sócrates", mobileLabel: "Sócrates", icon: SocratesIcon },
  { to: "/preparar", label: "Rumo à prova", mobileLabel: "Sua prova", icon: Compass },
  { to: "/configuracoes", label: "Configurações", mobileLabel: "Ajustes", icon: SlidersHorizontal },
] as const;

export function StudyLayout({ children }: { children: ReactNode }) {
  const { data } = useStudy();
  const { signOut } = useAuth();
  const path = useLocation({ select: (l) => l.pathname });
  const name = useDisplayName();
  const focused = useTestFocus();
  const page = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!page.current?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const transition = page.current.animate(
      [
        { opacity: 0, transform: "translateY(10px)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      { duration: 250, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "both" },
    );
    return () => transition.cancel();
  }, [path]);
  const selected = (to: string) =>
    ["/aprender", "/preparar"].includes(to) ? path.startsWith(to) : path === to;
  const pageName = navigation.find((item) => selected(item.to))?.label ?? "Minhas matérias";
  return (
    <div className={`app-shell ${focused ? "is-test-focused" : ""}`}>
      <aside className="sidebar" inert={focused} aria-hidden={focused || undefined}>
        <Link to="/" className="brand">
          <img src={logo.url} alt="" />
          GStudy
        </Link>
        <div className="side-caption">SEU ESPAÇO</div>
        <nav className="side-nav" aria-label="Navegação principal">
          {navigation.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={selected(to) ? "active" : ""}
              aria-current={selected(to) ? "page" : undefined}
            >
              {to === "/socrates" ? (
                <span className="socrates-nav-icon">
                  <Icon size={15} />
                </span>
              ) : (
                <Icon size={18} />
              )}
              {label}
            </Link>
          ))}
        </nav>
        <div className="side-subjects">
          <div className="side-caption">SUAS MATÉRIAS</div>
          <nav className="side-nav" aria-label="Suas matérias">
            {data.subjects.map((s) => (
              <Link
                key={s.id}
                to="/materias/$subjectId"
                params={{ subjectId: s.id }}
                className={path.includes(s.id) ? "active" : ""}
              >
                <SubjectIcon name={s.name} size={18} />
                {s.name}
              </Link>
            ))}
          </nav>
        </div>
        <div className="side-bottom">
          <div className="side-quote">
            “Grandes jornadas começam
            <br />
            com pequenos passos.”
          </div>
          <Link to="/configuracoes" className="profile">
            <Avatar />
            <div>
              {name}
              <small>Um dia de cada vez</small>
            </div>
            <ChevronRight size={14} />
          </Link>
          <button className="side-logout" onClick={signOut}>
            <LogOut size={15} />
            Sair da conta
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar" inert={focused}>
          <div className="topbar-left">
            <Link to="/" className="brand mobile-brand">
              <img src={logo.url} alt="" />
              GStudy
            </Link>
            <BookOpen size={15} className="desktop-crumb" />
            <span>Meu espaço de estudo</span>
            <ChevronRight size={12} className="desktop-crumb" />
            <span>{pageName}</span>
          </div>
          <div className="topbar-right">
            <SyncStatus />
            <Leaf size={14} className="desktop-crumb" />
            <span>Seu ritmo. Sua jornada.</span>
            <Button variant="ghost" size="icon" asChild title="Configurações">
              <Link to="/configuracoes" aria-label="Configurações">
                <Avatar />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Sair da conta"
              aria-label="Sair da conta"
              onClick={signOut}
            >
              <LogOut />
            </Button>
          </div>
        </header>
        <main className="content">
          {focused ? <FocusSessionHeader /> : <RecallResume />}
          <div className="page-transition" ref={page}>
            {children}
          </div>
          <footer className="page-footer">
            <span className="footer-motto">
              Sapere aude. <span className="font-sans text-[10px] not-italic">Ouse saber.</span>
            </span>
            <span>Feito para o seu próximo capítulo.</span>
          </footer>
        </main>
      </div>
      <nav
        className="mobile-bottom-nav"
        aria-label="Navegação principal no celular"
        inert={focused}
        aria-hidden={focused || undefined}
      >
        {navigation.map(({ to, label, mobileLabel, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={selected(to) ? "active" : ""}
            aria-current={selected(to) ? "page" : undefined}
            aria-label={label}
          >
            {to === "/socrates" ? (
              <span className="socrates-nav-icon">
                <Icon size={18} />
              </span>
            ) : (
              <Icon size={21} strokeWidth={1.65} />
            )}
            <span>{mobileLabel}</span>
          </Link>
        ))}
      </nav>
      <RecallTimerPopup />
    </div>
  );
}

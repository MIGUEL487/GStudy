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
  Users,
  Radio,
} from "lucide-react";
import { useAuth } from "./auth-gate";
import { Avatar, useDisplayName } from "./avatar";
import { useEffect, useState, useLayoutEffect, useRef, type ReactNode } from "react";
import { m, useAnimationControls, useReducedMotion } from "motion/react";
import { motionTokens } from "@/lib/motion";
import { logo } from "@/lib/images";
import { useStudy } from "./study-provider";
import { Button } from "@/components/ui/button";
import { SubjectIcon } from "./subject-icon";
import { SocratesIcon } from "./socrates-icon";
import { RecallResume } from "./recall-resume";
import { SyncStatus } from "./account-sync-provider";
import { FocusSessionHeader, RecallTimerPopup, useTestFocus } from "./study-session-controls";
import { isSocialFeatureEnabled } from "@/lib/social-model";
import { ThemeToggle } from "./theme-toggle";
import { HeartsStatus } from "./learning-status";
import { toast } from "sonner";
import { FriendsDrawer } from "./friends-drawer";
import { NotificationsPopover } from "./notifications-popover";
import { VoiceHeader } from "./voice/voice-controls";
import { StudentOnboardingModal } from "./student-onboarding-modal";
import { SchoolYearRolloverModal } from "./school-year-rollover-modal";
import {
  fetchCurrentStudentProfile,
  checkSchoolYearRollover,
  getStudentRollover,
  profileUpdatedEvent,
  type StudentProfile,
} from "@/lib/student-profile";

const navigation = [
  { to: "/", label: "Início", mobileLabel: "Início", icon: Home },
  { to: "/calendario", label: "Calendário", mobileLabel: "Calendário", icon: CalendarDays },
  { to: "/aprender", label: "Aprender", mobileLabel: "Aprender", icon: GraduationCap },
  { to: "/socrates", label: "Sócrates", mobileLabel: "Sócrates", icon: SocratesIcon },
  { to: "/preparar", label: "Rumo à prova", mobileLabel: "Sua prova", icon: Compass },
  { to: "/configuracoes", label: "Configurações", mobileLabel: "Ajustes", icon: SlidersHorizontal },
] as const;

export function StudyLayout({ children }: { children: ReactNode }) {
  const { data, update } = useStudy();
  const { user, signOut } = useAuth();
  const path = useLocation({ select: (l) => l.pathname });
  const name = useDisplayName();
  const focused = useTestFocus();
  const previousPath = useRef(path);
  const pageAnimation = useAnimationControls();
  const reducedMotion = useReducedMotion();
  const dismissedRolloverYears = useRef(new Set<number>());

  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [rolloverPrompt, setRolloverPrompt] = useState<{
    show: boolean;
    currentSchoolYear: string;
    suggestedNextYear?: string | undefined;
    currentCalendarYear: number;
  } | null>(null);

  useEffect(() => {
    // Sessões is a primary mobile destination. Parse it while the home screen is idle so
    // the first tap does not compete with the route animation on slower phones.
    const preload = () => void import("./sessions-view");
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(preload, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(preload, 700);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    let revision = 0;
    const refresh = () => {
      const run = ++revision;
      void fetchCurrentStudentProfile(user.id)
        .then(async (p) => {
          if (cancelled) return;
          setProfile(p);

          // 2.1 Checagem de Onboarding incompleto ou primeiro acesso
          const isProfileIncomplete = !p || !p.onboardingCompleted || !p.schoolYear || !p.username;
          if (isProfileIncomplete) {
            setShowOnboarding(true);
          } else if (p) {
            // 2.3 Checagem de virada de ano após 1º de janeiro
            const local = checkSchoolYearRollover(p);
            const rollover = local.needsPrompt
              ? await getStudentRollover().catch((cause) => {
                  toast.error(
                    cause instanceof Error
                      ? cause.message
                      : "Não foi possível conferir o novo ano.",
                  );
                  return local;
                })
              : local;
            if (cancelled || run !== revision) return;
            const effectiveYear = rollover.suggestedNextYear ?? p.schoolYear;
            if (effectiveYear)
              update((value) =>
                value.schoolYear === effectiveYear
                  ? value
                  : { ...value, schoolYear: effectiveYear },
              );
            if (
              rollover.needsPrompt &&
              rollover.currentSchoolYear &&
              !dismissedRolloverYears.current.has(rollover.currentCalendarYear)
            ) {
              setRolloverPrompt({
                show: true,
                currentSchoolYear: rollover.currentSchoolYear,
                suggestedNextYear: rollover.suggestedNextYear,
                currentCalendarYear: rollover.currentCalendarYear,
              });
            } else setRolloverPrompt(null);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled)
            toast.error(
              error instanceof Error ? error.message : "Não foi possível carregar seu perfil.",
            );
        });
    };
    refresh();
    window.addEventListener(profileUpdatedEvent, refresh);
    window.addEventListener("focus", refresh);
    let calendarYear = new Intl.DateTimeFormat("en", {
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const timer = setInterval(() => {
      const year = new Intl.DateTimeFormat("en", {
        year: "numeric",
        timeZone: "America/Sao_Paulo",
      }).format(new Date());
      if (year !== calendarYear) {
        calendarYear = year;
        refresh();
      }
    }, 60000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(profileUpdatedEvent, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [user?.id]);
  useLayoutEffect(() => {
    if (reducedMotion) {
      previousPath.current = path;
      pageAnimation.set({ opacity: 1, y: 0 });
      return;
    }
    if (previousPath.current === path) return;
    previousPath.current = path;
    pageAnimation.set({ opacity: 0.85, y: 4 });
    void pageAnimation.start({
      opacity: 1,
      y: 0,
      transition: { duration: motionTokens.duration.instant, ease: motionTokens.easing.editorial },
    });
    return () => pageAnimation.stop();
  }, [path, reducedMotion, pageAnimation]);
  const selected = (to: string) =>
    ["/aprender", "/preparar", "/salas", "/sessoes", "/amigos"].includes(to)
      ? path.startsWith(to)
      : path === to;
  const socialEnabled = isSocialFeatureEnabled();
  const currentNav = socialEnabled
    ? [
        ...navigation.slice(0, 4),
        { to: "/sessoes" as const, label: "Sessões", mobileLabel: "Sessões", icon: Radio },
        ...navigation.slice(4),
      ]
    : navigation;
  const pageName = currentNav.find((item) => selected(item.to))?.label ?? "Minhas matérias";
  return (
    <div className={`app-shell ${focused ? "is-test-focused" : ""}`}>
      <aside className="sidebar" inert={focused} aria-hidden={focused || undefined}>
        <Link to="/" className="brand">
          <img src={logo.url} alt="" />
          GStudy
        </Link>
        <div className="side-caption">SEU ESPAÇO</div>
        <nav className="side-nav" aria-label="Navegação principal">
          {currentNav.map(({ to, label, icon: Icon }) => (
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
            <Link to="/" className="brand mobile-brand" aria-label="GStudy · Início">
              <img src={logo.url} alt="" />
              <span>GStudy</span>
            </Link>
            <BookOpen size={15} className="desktop-crumb" />
            <span>Meu espaço de estudo</span>
            <ChevronRight size={12} className="desktop-crumb" />
            <span>{pageName}</span>
          </div>
          <div className="topbar-right">
            <HeartsStatus />
            <SyncStatus />
            <VoiceHeader />
            <Leaf size={14} className="desktop-crumb" />
            <span>Seu ritmo. Sua jornada.</span>
            {socialEnabled && user && (
              <>
                <FriendsDrawer userId={user.id} />
                <NotificationsPopover userId={user.id} />
              </>
            )}
            <ThemeToggle />
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
          <m.div className="page-transition" animate={pageAnimation} initial={false}>
            {children}
          </m.div>
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
        {currentNav.map(({ to, label, mobileLabel, icon: Icon }) => (
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

      {showOnboarding && (
        <StudentOnboardingModal
          initialUsername={user?.email ? user.email.split("@")[0].replace(/[^a-z0-9_]/g, "_") : ""}
          initialDisplayName={data.name || user?.user_metadata?.full_name || ""}
          onCompleted={(updatedProfile) => {
            setShowOnboarding(false);
            setProfile((prev) => ({ ...(prev ?? {}), ...updatedProfile }) as StudentProfile);
          }}
        />
      )}

      {rolloverPrompt?.show && (
        <SchoolYearRolloverModal
          currentSchoolYear={rolloverPrompt.currentSchoolYear}
          suggestedNextYear={rolloverPrompt.suggestedNextYear}
          currentCalendarYear={rolloverPrompt.currentCalendarYear}
          onDismiss={() => {
            dismissedRolloverYears.current.add(rolloverPrompt.currentCalendarYear);
            setRolloverPrompt(null);
          }}
        />
      )}
    </div>
  );
}

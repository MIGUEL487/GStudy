import { NotionPanel } from "@/components/notion-panel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Save,
  Download,
  LogOut,
  Camera,
  Trash2,
  UserRound,
  CalendarDays,
  MessageSquareHeart,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import { useStudy } from "@/components/study-provider";
import { useAuth, NotionMark } from "@/components/auth-gate";
import { Avatar, useDisplayName } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { schoolYears } from "@/lib/school-year";
import { defaultSchoolDays } from "@/lib/study-model";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReviewsPanel } from "@/components/reviews-panel";
import { useAccountSync } from "@/components/account-sync-provider";
import { useLearning } from "@/components/learning-provider";

type SettingsTab = "profile" | "preferences" | "notion" | "reviews" | "data";
export const Route = createFileRoute("/configuracoes")({
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab | undefined } =>
    search["tab"] === "feedback"
      ? { tab: "reviews" }
      : ["profile", "preferences", "notion", "reviews", "data"].includes(String(search["tab"]))
        ? { tab: search["tab"] as SettingsTab }
        : {},
  head: () => ({
    meta: [
      { title: "GStudy · Configurações" },
      { name: "description", content: "Personalize seu espaço de estudo e exporte seus dados." },
      { property: "og:title", content: "GStudy · Configurações" },
      { property: "og:description", content: "Um espaço de estudo que tem a sua cara." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

const weekNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Escolha um arquivo de imagem."));
    if (file.size > 10 * 1024 * 1024) return reject(new Error("Use uma imagem de até 10 MB."));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = 192;
      const c = document.createElement("canvas");
      c.width = s;
      c.height = s;
      const ctx = c.getContext("2d")!;
      const m = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler essa imagem."));
    };
    img.src = url;
  });
}

function Settings() {
  const { data, update } = useStudy();
  const { user, signOut } = useAuth();
  const display = useDisplayName();
  const sync = useAccountSync();
  const { plans } = useLearning();
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const [name, setName] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const days = data.schoolDays ?? defaultSchoolDays;
  return (
    <>
      <div className="eyebrow">DO SEU JEITO</div>
      <div className="welcome-row">
        <div>
          <h1>Configurações</h1>
          <p>Os pequenos detalhes do seu espaço.</p>
        </div>
      </div>
      <Tabs
        value={tab ?? "profile"}
        onValueChange={(value) =>
          void navigate({
            to: "/configuracoes",
            search: { tab: value as SettingsTab },
            replace: true,
          })
        }
        className="settings-tabs"
      >
        <TabsList className="settings-tabs-list" aria-label="Seções das configurações">
          <TabsTrigger value="profile">
            <UserRound size={16} />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="preferences">
            <CalendarDays size={16} />
            Preferências
          </TabsTrigger>
          <TabsTrigger value="notion">
            <NotionMark />
            Notion
          </TabsTrigger>
          <TabsTrigger value="reviews">
            <MessageSquareHeart size={16} />
            Avaliações
          </TabsTrigger>
          <TabsTrigger value="data">
            <Database size={16} />
            Meus dados
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="settings-tab-content">
          <section className="settings-section">
            <h2>Seu perfil</h2>
            <div className="profile-photo">
              <Avatar className="avatar-lg" />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
                  <Camera />
                  Mudar foto
                </Button>
                {data.avatar && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (update((d) => ({ ...d, avatar: undefined })))
                        toast.success("Foto removida.");
                    }}
                  >
                    <Trash2 />
                    Remover
                  </Button>
                )}
                <input
                  ref={file}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    try {
                      const url = await resizeImage(f);
                      if (update((d) => ({ ...d, avatar: url })))
                        toast.success("Foto de perfil atualizada.");
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                />
              </div>
            </div>
            <label className="form-label">
              Como podemos chamar você?
              <input
                className="form-input"
                value={name ?? data.name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder={display}
              />
            </label>
            <Button
              className="mt-3"
              onClick={() => {
                if (update((d) => ({ ...d, name: (name ?? data.name).trim() })))
                  toast.success("Seu perfil foi atualizado.");
              }}
            >
              <Save />
              Salvar perfil
            </Button>
          </section>
          <section className="settings-section">
            <h2>Seu momento de estudo</h2>
            <label className="form-label">
              Ano escolar
              <select
                aria-label="Ano escolar"
                className="form-input"
                value={data.schoolYear ?? ""}
                onChange={(e) => {
                  const year = e.target.value;
                  if (update((d) => ({ ...d, schoolYear: year || undefined })))
                    toast.success("Etapa de estudo atualizada.");
                }}
              >
                <option value="">Escolha seu ano ou etapa</option>
                {schoolYears.map((year) => (
                  <option key={year.value} value={year.value}>
                    {year.label}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Você pode mudar seu ano aqui a qualquer momento. As próximas preparações usarão essa
              etapa; as trilhas já criadas serão preservadas.
            </p>
          </section>
          <section className="settings-section">
            <h2>Sincronização entre aparelhos</h2>
            <p role="status">{sync.message}</p>
            <p>
              Entre com a mesma conta no celular e no computador. Alterações são enviadas
              automaticamente e verificadas ao voltar à página.
            </p>
            <Button variant="outline" onClick={sync.retry}>
              Sincronizar agora
            </Button>
          </section>
          <section className="settings-section">
            <h2>Conta</h2>
            <p>Conectado como {user.email}</p>
            <Button variant="outline" onClick={signOut}>
              <LogOut />
              Sair da conta
            </Button>
          </section>
        </TabsContent>
        <TabsContent value="preferences" className="settings-tab-content">
          <section className="settings-section">
            <h2>Dias de aula</h2>
            <p>Esses dias aparecem liberados no calendário de presença.</p>
            <div className="day-chips">
              {weekNames.map((n, i) => (
                <button
                  key={n}
                  className={`day-chip ${days.includes(i) ? "on" : ""}`}
                  aria-pressed={days.includes(i)}
                  onClick={() =>
                    update((d) => {
                      const cur = d.schoolDays ?? defaultSchoolDays;
                      return {
                        ...d,
                        schoolDays: cur.includes(i)
                          ? cur.filter((x) => x !== i)
                          : [...cur, i].sort(),
                      };
                    })
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </section>
        </TabsContent>
        <TabsContent value="notion" className="settings-tab-content">
          <NotionPanel />
        </TabsContent>
        <TabsContent value="reviews" className="settings-tab-content">
          <ReviewsPanel key={user.id} userId={user.id} />
        </TabsContent>
        <TabsContent value="data" className="settings-tab-content">
          <section className="settings-section">
            <h2>Seus dados</h2>
            <p>
              Seus estudos são sincronizados com sua conta. Uma cópia permanece neste aparelho para
              uso offline. Exporte uma cópia adicional quando quiser.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob(
                    [
                      JSON.stringify(
                        {
                          ...data,
                          learning: { version: 1, plans },
                          exportedAt: new Date().toISOString(),
                        },
                        null,
                        2,
                      ),
                    ],
                    { type: "application/json" },
                  ),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "gstudy-meus-estudos.json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download />
              Exportar meus estudos
            </Button>
          </section>
        </TabsContent>
      </Tabs>
    </>
  );
}

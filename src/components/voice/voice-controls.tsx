import { Phone, Moon, PhoneOff } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useVoice } from "./voice-provider";
import type { DndMode } from "@/lib/voice-rpc";
import "@/styles/voice-call.css";

export function CallAvatar({ name, src }: { name: string; src?: string | null }) {
  return (
    <span className="call-avatar">
      {src ? (
        <img src={src} alt="" referrerPolicy="no-referrer" />
      ) : (
        name.trim().slice(0, 1).toLocaleUpperCase("pt-BR")
      )}
    </span>
  );
}
export function StartCallButton({ roomId, groupId }: { roomId?: string; groupId?: string }) {
  const voice = useVoice();
  if (!voice) return null;
  return (
    <div className="call-start">
      <button type="button" disabled={voice.busy} onClick={() => void voice.start(roomId, groupId)}>
        <Phone size={16} />
        {voice.callId ? "Abrir chamada" : "Ligar"}
      </button>
      {voice.error && !voice.callId && <p role="alert">{voice.error}</p>}
    </div>
  );
}
export function VoicePreferences() {
  const voice = useVoice();
  if (!voice) return null;
  const prefs = voice.inbox?.preferences;
  const enabled = Boolean(
    prefs?.dnd_manual || (prefs?.dnd_until && Date.parse(prefs.dnd_until) > voice.now),
  );
  return (
    <div className="call-dnd">
      <label>
        <Moon size={16} />
        Não perturbar
        <select
          aria-label="Duração de Não perturbar"
          disabled={voice.busy}
          value={enabled ? (prefs?.dnd_manual ? "manual" : "active") : "off"}
          onChange={(e) => void voice.dnd(e.target.value as DndMode)}
        >
          {enabled && !prefs?.dnd_manual && (
            <option value="active">
              Ativado até{" "}
              {new Date(prefs!.dnd_until!).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </option>
          )}
          <option value="off">Desativado</option>
          <option value="hour">Por uma hora</option>
          <option value="today">Até o fim de hoje</option>
          <option value="manual">Até eu desligar</option>
        </select>
      </label>
      <p>As ligações ficam silenciosas e aparecem como perdidas nas notificações.</p>
      {voice.error && !voice.callId && <p role="alert">{voice.error}</p>}
    </div>
  );
}
export function VoiceHeader() {
  const voice = useVoice();
  if (!voice) return null;
  const prefs = voice.inbox?.preferences;
  const dnd = Boolean(
    prefs?.dnd_manual || (prefs?.dnd_until && Date.parse(prefs.dnd_until) > voice.now),
  );
  return (
    <>
      {voice.callId && (
        <Link
          to="/chamada"
          className="call-header-button"
          aria-label="Abrir chamada ativa"
          ref={(node) => voice.bindLevel("*", node)}
        >
          <Phone size={18} />
          <span>Em chamada</span>
        </Link>
      )}
      {dnd && (
        <button
          className="call-dnd-header"
          onClick={() => void voice.dnd("off")}
          disabled={voice.busy}
          aria-label="Desativar Não perturbar"
        >
          <Moon size={18} />
        </button>
      )}
    </>
  );
}
export function IncomingCall() {
  const voice = useVoice();
  if (!voice) return null;
  const invite = voice.inbox?.invites.find((i) => Date.parse(i.expires_at) > voice.now);
  const seconds = invite
    ? Math.max(0, Math.ceil((Date.parse(invite.expires_at) - voice.now) / 1000))
    : 0;
  return (
    <Dialog open={Boolean(invite)}>
      <DialogContent
        className="incoming-voice-dialog"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle>Ligação de {invite?.name}</DialogTitle>
        <DialogDescription>
          {invite?.title}. Este convite termina em {seconds} segundos.
        </DialogDescription>
        {invite && (
          <>
            <CallAvatar name={invite.name} src={invite.avatar_url} />
            <p>Você entra com o microfone desligado. Chamada ao vivo, não é gravada.</p>
            <div className="call-invite-progress">
              <span style={{ transform: `scaleX(${seconds / 30})` }} />
            </div>
            <div className="call-actions">
              <button
                disabled={voice.busy || Boolean(voice.callId)}
                onClick={() => void voice.respond(invite.id, true)}
              >
                <Phone size={18} />
                Atender
              </button>
              <button disabled={voice.busy} onClick={() => void voice.respond(invite.id, false)}>
                <PhoneOff size={18} />
                Recusar
              </button>
            </div>
            {voice.callId && <p>Saia da chamada atual para atender outra.</p>}
            <VoicePreferences />
            {voice.error && <p role="alert">{voice.error}</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

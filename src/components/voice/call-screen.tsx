import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mic, MicOff, Monitor, PhoneOff, Users, Volume2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useVoice } from "./voice-provider";
import { CallAvatar } from "./voice-controls";
import type { VoiceMember } from "@/lib/voice-rpc";
import "@/styles/voice-call.css";

function ShareVideo({ stream, local }: { stream: MediaStream; local: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (video) video.srcObject = stream;
    return () => {
      if (video) video.srcObject = null;
    };
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={local}
      aria-label={local ? "Sua tela compartilhada" : "Tela compartilhada na chamada"}
    />
  );
}
function MemberTile({ member }: { member: VoiceMember }) {
  const voice = useVoice()!;
  const local = member.user_id === voice.userId;
  const muted = local ? voice.muted : member.muted || member.force_muted;
  const state = voice.connections.get(member.user_id);
  return (
    <article
      className="call-member-tile"
      ref={(node) => voice.bindLevel(member.user_id, node)}
      data-user-id={member.user_id}
    >
      <CallAvatar name={member.name} src={member.avatar_url} />
      <p>
        {member.name}
        {local ? " (você)" : ""}
      </p>
      <span className="call-member-status">
        {muted ? <MicOff size={16} /> : <Mic size={16} />}
        <span>
          {muted
            ? "Microfone desligado"
            : local || state === "connected"
              ? "Microfone ligado"
              : "Conectando áudio…"}
        </span>
      </span>
      <span className="call-speaking-bars" aria-label="Nível de áudio">
        <i />
        <i />
        <i />
      </span>
    </article>
  );
}
export default function CallScreen() {
  const voice = useVoice();
  const [peopleOpen, setPeopleOpen] = useState(false),
    [list, setList] = useState<"members" | "friends" | "group">("members"),
    [shareMenu, setShareMenu] = useState(false),
    [inviteStatus, setInviteStatus] = useState("");
  if (!voice) return <p>Chamadas não estão disponíveis neste ambiente.</p>;
  if (!voice.callId)
    return (
      <section className="call-empty">
        <h1>Sua chamada terminou</h1>
        <p>Escolha uma sala ou grupo para ligar. Ninguém entra sem atender ao convite.</p>
        {voice.error && <p role="alert">{voice.error}</p>}
        <Link to="/sessoes">Voltar para Sessões</Link>
      </section>
    );
  const { snapshot } = voice;
  const me = snapshot?.members.find((m) => m.user_id === voice.userId);
  const sharing = snapshot?.members.find((m) => m.sharing && voice.screens.has(m.user_id));
  const stream = sharing ? voice.screens.get(sharing.user_id) : null;
  const sidebar = (
    <>
      <div className="call-people-tabs" role="tablist" aria-label="Pessoas da chamada">
        {(
          [
            ["members", "Na chamada"],
            ["friends", "Amigos"],
            ["group", "Membros"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={list === key} onClick={() => setList(key)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {list === "members" ? (
          snapshot?.members.map((member) => (
            <div key={member.user_id} className="call-person">
              <CallAvatar name={member.name} src={member.avatar_url} />
              <span>{member.name}</span>
              {snapshot.can_moderate && member.user_id !== voice.userId && (
                <div>
                  <button
                    disabled={voice.busy}
                    onClick={() =>
                      void voice.moderate(member.user_id, member.force_muted ? "allow" : "mute")
                    }
                  >
                    {member.force_muted ? "Permitir falar" : "Silenciar"}
                  </button>
                  <button
                    disabled={voice.busy}
                    onClick={() => void voice.moderate(member.user_id, "remove")}
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <>
            {snapshot?.candidates
              .filter((p) => (list === "friends" ? p.friend : p.source_member))
              .map((person) => {
                const present = snapshot.members.some((m) => m.user_id === person.user_id),
                  remaining = person.next_at
                    ? Math.max(0, Math.ceil((Date.parse(person.next_at) - voice.now) / 1000))
                    : 0;
                return (
                  <div className="call-person" key={person.user_id}>
                    <CallAvatar name={person.name} src={person.avatar_url} />
                    <span>
                      {person.name}
                      <small>{person.online ? "Online" : "Offline"}</small>
                    </span>
                    <button
                      disabled={voice.busy || present || remaining > 0 || !person.online}
                      onClick={() => {
                        setInviteStatus("Enviando convite…");
                        void voice
                          .invite(person.user_id)
                          .then(() => setInviteStatus("Confira o estado do convite na lista."));
                      }}
                    >
                      {present ? "Na chamada" : remaining ? `Chamar em ${remaining}s` : "Chamar"}
                    </button>
                  </div>
                );
              })}
            <p>
              {list === "group"
                ? "Pessoas elegíveis desta sala ou grupo."
                : "Seus amigos disponíveis para conversar."}
            </p>
            {inviteStatus && <p role="status">{inviteStatus}</p>}
          </>
        )}
      </div>
    </>
  );
  return (
    <section className="call-screen">
      <header>
        <div>
          <h1>{snapshot?.title ?? "Abrindo chamada…"}</h1>
          <p>Chamada ao vivo, não é gravada · {snapshot?.members.length ?? 1}/6 pessoas</p>
        </div>
        <button className="call-people-mobile" onClick={() => setPeopleOpen(true)}>
          <Users size={18} />
          Pessoas
        </button>
      </header>
      {voice.error && (
        <p className="call-error" role="alert">
          {voice.error}
        </p>
      )}
      <div className="call-layout">
        <div className="call-stage">
          {stream && (
            <div className="call-share-stage">
              <ShareVideo stream={stream} local={sharing?.user_id === voice.userId} />
              <p>
                {sharing?.user_id === voice.userId
                  ? "Você está compartilhando"
                  : `${sharing?.name} está compartilhando`}
              </p>
            </div>
          )}
          <div className={`call-member-grid ${stream ? "has-share" : ""}`}>
            {snapshot?.members.map((member) => (
              <MemberTile key={member.user_id} member={member} />
            ))}
          </div>
          {!snapshot && <p role="status">Conectando à chamada…</p>}
        </div>
        <aside className="call-people-desktop">{sidebar}</aside>
      </div>
      <p className="call-permission-note">
        Seu microfone começa desligado. Ao ativar, o navegador pedirá permissão para transmitir sua
        voz. Nenhuma câmera é usada.
      </p>
      <div className="call-toolbar">
        <button
          onClick={() => void voice.toggleMute()}
          disabled={voice.busy || !voice.ready || Boolean(me?.force_muted)}
          aria-label={voice.muted ? "Ativar microfone" : "Desligar microfone"}
        >
          {voice.muted ? <MicOff size={20} /> : <Mic size={20} />}
          <span>{voice.muted ? "Ativar microfone" : "Desligar microfone"}</span>
        </button>
        <button onClick={voice.resumeAudio} disabled={!voice.ready}>
          <Volume2 size={20} />
          Ativar áudio
        </button>
        {typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia) && (
          <div className="call-share-control">
            {me?.sharing ? (
              <button onClick={() => void voice.stopShare()} disabled={voice.busy}>
                <Monitor size={20} />
                Parar compartilhamento
              </button>
            ) : (
              <button
                disabled={voice.busy || !voice.ready}
                aria-expanded={shareMenu}
                onClick={() => setShareMenu(!shareMenu)}
              >
                <Monitor size={20} />
                Compartilhar tela
              </button>
            )}
            {shareMenu && !me?.sharing && (
              <div className="call-share-menu">
                <button
                  onClick={() => {
                    setShareMenu(false);
                    void voice.share(true);
                  }}
                >
                  GStudy
                </button>
                <button
                  onClick={() => {
                    setShareMenu(false);
                    void voice.share(false);
                  }}
                >
                  Navegador
                </button>
              </div>
            )}
          </div>
        )}
        <button className="call-leave" disabled={voice.busy} onClick={() => void voice.leave()}>
          <PhoneOff size={20} />
          Sair da chamada
        </button>
      </div>
      <Dialog open={peopleOpen} onOpenChange={setPeopleOpen}>
        <DialogContent className="call-people-sheet">
          <DialogTitle>Pessoas</DialogTitle>
          {sidebar}
        </DialogContent>
      </Dialog>
    </section>
  );
}

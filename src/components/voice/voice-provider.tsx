import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  inboxSchema,
  snapshotSchema,
  voiceRpc,
  isVoiceFeatureEnabled,
  type VoiceInbox,
  type VoiceSnapshot,
  type DndMode,
} from "@/lib/voice-rpc";
import type { VoiceMesh } from "@/lib/voice-mesh";
import { z } from "zod";

type VoiceValue = {
  userId: string;
  callId: string | null;
  snapshot: VoiceSnapshot | null;
  inbox: VoiceInbox | null;
  now: number;
  busy: boolean;
  error: string;
  muted: boolean;
  ready: boolean;
  screens: Map<string, MediaStream>;
  connections: Map<string, RTCPeerConnectionState>;
  start: (room?: string, group?: string) => Promise<void>;
  respond: (id: string, accept: boolean) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
  share: (currentTab: boolean) => Promise<void>;
  stopShare: () => Promise<void>;
  resumeAudio: () => void;
  invite: (id: string) => Promise<void>;
  moderate: (id: string, action: "mute" | "allow" | "remove") => Promise<void>;
  dnd: (mode: DndMode) => Promise<void>;
  bindLevel: (id: string, element: HTMLElement | null) => void;
};
const VoiceContext = createContext<VoiceValue | null>(null);
export const useVoice = () => useContext(VoiceContext);
export function VoiceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const navigate = useNavigate();
  const [callId, setCallId] = useState<string | null>(null),
    [snapshot, setSnapshot] = useState<VoiceSnapshot | null>(null),
    [inbox, setInbox] = useState<VoiceInbox | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [muted, setMuted] = useState(true),
    [ready, setReady] = useState(false),
    [now, setNow] = useState(Date.now());
  const [screens, setScreens] = useState(new Map<string, MediaStream>()),
    [connections, setConnections] = useState(new Map<string, RTCPeerConnectionState>());
  const offset = useRef(0),
    mesh = useRef<VoiceMesh | null>(null),
    bound = useRef(new Map<string, Set<HTMLElement>>()),
    levels = useRef(new Map<string, number>()),
    operation = useRef(false);
  const key = `gstudy_active_call:${userId}`;
  const clock = (server: string) => {
    offset.current = Date.parse(server) - Date.now();
    setNow(Date.now() + offset.current);
  };
  const bindLevel = (id: string, element: HTMLElement | null) => {
    let elements = bound.current.get(id);
    if (!elements) {
      elements = new Set();
      bound.current.set(id, elements);
    }
    for (const node of elements) if (!node.isConnected) elements.delete(node);
    if (element) {
      elements.add(element);
      element.style.setProperty("--voice-level", String(levels.current.get(id) ?? 0));
    }
  };
  useEffect(() => {
    if (!isVoiceFeatureEnabled()) return;
    let active = true,
      loading = false;
    try {
      const saved = localStorage.getItem(key);
      if (z.string().uuid().safeParse(saved).success) setCallId(saved);
    } catch {
      /* optional cache */
    }
    const refresh = async (): Promise<void> => {
      if (loading) return;
      loading = true;
      try {
        const next = inboxSchema.parse(await voiceRpc("voice_inbox"));
        if (active) {
          setInbox(next);
          clock(next.server_now);
        }
      } catch {
        /* Missing migration must not interrupt unrelated study routes. Explicit actions show errors. */
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000),
      tick = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => {
      active = false;
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [key]);
  useEffect(() => {
    if (!callId || !isVoiceFeatureEnabled()) return;
    let active = true,
      loading = false,
      connecting = false,
      failures = 0,
      transport: { close: () => void } | undefined;
    setError("");
    setMuted(true);
    setReady(false);
    setSnapshot(null);
    setScreens(new Map());
    setConnections(new Map());
    const refresh = async (): Promise<VoiceSnapshot | undefined> => {
      if (!active || loading) return;
      loading = true;
      try {
        const next = snapshotSchema.parse(await voiceRpc("voice_snapshot", { p_call: callId }));
        if (!active) return;
        if (!next.members.some((m) => m.user_id === userId))
          throw new Error("Sua participação na chamada terminou.");
        if (failures) setError("");
        failures = 0;
        setSnapshot(next);
        clock(next.server_now);
        const local = next.members.find((m) => m.user_id === userId)!;
        if (local.force_muted) {
          mesh.current?.setMuted(true);
          setMuted(true);
        }
        mesh.current?.sync(next.members);
        return next;
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Não foi possível atualizar a chamada.",
          );
          mesh.current?.setMuted(true);
          setMuted(true);
          if (++failures >= 3) setCallId(null);
        }
      } finally {
        loading = false;
      }
      return undefined;
    };
    const connect = async () => {
      if (!active || connecting || mesh.current) return;
      connecting = true;
      try {
        const initial = await refresh();
        if (!active || !initial) return;
        await voiceRpc("update_voice_member", { p_call: callId, p_muted: true, p_sharing: false });
        const [{ VoiceMesh }, { createVoiceTransport }] = await Promise.all([
          import("@/lib/voice-mesh"),
          import("@/lib/voice-transport"),
        ]);
        if (!active) return;
        const connection = createVoiceTransport(
          callId,
          userId,
          (signal) => mesh.current?.receive(signal),
          (message) => {
            if (active) setError(message);
          },
        );
        transport = connection;
        const instance = new VoiceMesh(userId, connection.send, {
          error: (message) => {
            if (active) setError(message);
          },
          level: (id, value) => {
            levels.current.set(id, value);
            for (const node of bound.current.get(id) ?? [])
              node.style.setProperty("--voice-level", String(value));
            const aggregate = Math.max(0, ...levels.current.values());
            for (const node of bound.current.get("*") ?? [])
              node.style.setProperty("--voice-level", String(aggregate));
          },
          screen: (id, stream) => {
            if (active)
              setScreens((previous) => {
                const next = new Map(previous);
                if (stream) next.set(id, stream);
                else next.delete(id);
                return next;
              });
          },
          sharingEnded: () => {
            void voiceRpc("update_voice_member", {
              p_call: callId,
              p_muted: instance.isMuted,
              p_sharing: false,
            }).catch(() => {
              if (active)
                setError("O compartilhamento parou, mas não foi possível atualizar a chamada.");
            });
          },
          connection: (id, state) => {
            if (active) setConnections((previous) => new Map(previous).set(id, state));
          },
        });
        mesh.current = instance;
        instance.sync(initial.members);
        setReady(true);
        try {
          localStorage.setItem(key, callId);
        } catch {
          /* optional cache */
        }
      } catch (cause) {
        if (active)
          setError(cause instanceof Error ? cause.message : "Não foi possível abrir a chamada.");
      } finally {
        connecting = false;
      }
    };
    void connect();
    const timer = setInterval(() => {
      if (mesh.current) void refresh();
      else void connect();
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
      transport?.close();
      mesh.current?.close();
      mesh.current = null;
      levels.current.clear();
    };
  }, [callId, userId, key]);
  const perform = async (task: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível completar esta ação na chamada.",
      );
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  const open = async (id: string) => {
    setCallId(id);
    await navigate({ to: "/chamada" });
  };
  const dnd = (mode: DndMode) =>
    perform(async () => {
      await voiceRpc("set_call_dnd", { p_mode: mode });
      const next = inboxSchema.parse(await voiceRpc("voice_inbox"));
      setInbox(next);
      clock(next.server_now);
    });
  const value: VoiceValue = {
    userId,
    callId,
    snapshot,
    inbox,
    now,
    busy,
    error,
    muted,
    ready,
    screens,
    connections,
    bindLevel,
    dnd,
    start: (room, group) =>
      perform(async () => {
        if (callId) {
          await navigate({ to: "/chamada" });
          return;
        }
        await open(
          z
            .string()
            .uuid()
            .parse(
              await voiceRpc("start_voice_call", { p_room: room ?? null, p_group: group ?? null }),
            ),
        );
      }),
    respond: (id, accept) =>
      perform(async () => {
        const result = await voiceRpc("respond_voice_invite", { p_invite: id, p_accept: accept });
        setInbox((previous) =>
          previous ? { ...previous, invites: previous.invites.filter((i) => i.id !== id) } : null,
        );
        if (accept) await open(z.string().uuid().parse(result));
      }),
    leave: () =>
      perform(async () => {
        const id = callId;
        mesh.current?.close();
        setMuted(true);
        setReady(false);
        if (id)
          await voiceRpc("update_voice_member", {
            p_call: id,
            p_muted: true,
            p_sharing: false,
            p_leave: true,
          });
        setCallId(null);
        setSnapshot(null);
        try {
          localStorage.removeItem(key);
        } catch {
          /* optional cache */
        }
      }),
    toggleMute: () =>
      perform(async () => {
        const instance = mesh.current;
        if (!instance || !callId) return;
        const next = !instance.isMuted;
        if (next) instance.setMuted(true);
        else await instance.prepareMicrophone();
        await voiceRpc("update_voice_member", {
          p_call: callId,
          p_muted: next,
          p_sharing: instance.isSharing,
        });
        const state = snapshotSchema.parse(await voiceRpc("voice_snapshot", { p_call: callId }));
        setSnapshot(state);
        const blocked = state.members.find((m) => m.user_id === userId)?.force_muted ?? true;
        instance.setMuted(next || blocked);
        setMuted(instance.isMuted);
        if (blocked && !next)
          setError("O responsável silenciou seu microfone. Peça autorização para voltar a falar.");
      }),
    share: (current) =>
      perform(async () => {
        const instance = mesh.current;
        if (!instance || !callId) return;
        try {
          await instance.shareScreen(current);
          await voiceRpc("update_voice_member", {
            p_call: callId,
            p_muted: instance.isMuted,
            p_sharing: instance.isSharing,
          });
        } catch (cause) {
          instance.stopSharing();
          if (!(cause instanceof Error && cause.name === "NotAllowedError"))
            throw new Error(
              "Não foi possível compartilhar a tela. Confira a permissão e tente novamente.",
            );
        }
      }),
    stopShare: () =>
      perform(async () => {
        mesh.current?.stopSharing();
        if (callId)
          await voiceRpc("update_voice_member", {
            p_call: callId,
            p_muted: mesh.current?.isMuted ?? true,
            p_sharing: false,
          });
      }),
    resumeAudio: () => mesh.current?.resumeAudio(),
    invite: (id) =>
      perform(async () => {
        if (!callId) return;
        const result = (await voiceRpc("invite_voice_peer", {
          p_call: callId,
          p_recipient: id,
        })) as { status?: string };
        const next = snapshotSchema.parse(await voiceRpc("voice_snapshot", { p_call: callId }));
        setSnapshot(next);
        clock(next.server_now);
        if (result.status === "cooldown")
          setError("Aguarde a contagem antes de chamar esta pessoa novamente.");
      }),
    moderate: (id, action) =>
      perform(async () => {
        if (!callId) return;
        await voiceRpc("moderate_voice_member", { p_call: callId, p_user: id, p_action: action });
        setSnapshot(snapshotSchema.parse(await voiceRpc("voice_snapshot", { p_call: callId })));
      }),
  };
  return (
    <VoiceContext.Provider value={isVoiceFeatureEnabled() ? value : null}>
      {children}
    </VoiceContext.Provider>
  );
}

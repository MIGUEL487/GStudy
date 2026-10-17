import { useEffect, useRef, useState } from "react";
import {
  readSocratesDocument,
  socratesStorageKey,
  type SocratesConversation,
  type SocratesDocument,
  type SocratesMessage,
} from "@/lib/socrates-model";
import { signalAccountChange } from "@/lib/account-sync-model";
export function useSocratesConversations(userId: string) {
  const key = socratesStorageKey(userId);
  const [data, setData] = useState<SocratesDocument>({ version: 1, conversations: [] });
  const [error, setError] = useState("");
  const readable = useRef(false);
  useEffect(() => {
    const read = () => {
      try {
        setData(readSocratesDocument(localStorage.getItem(key)));
        readable.current = true;
        setError("");
      } catch {
        readable.current = false;
        setError("Não foi possível carregar suas conversas. Sua cópia salva foi preservada.");
      }
    };
    read();
    const sync = (event: StorageEvent) => {
      if (event.key === key) read();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  const save = (change: (current: SocratesDocument) => SocratesDocument) => {
    if (!readable.current) throw new Error("Recupere o histórico salvo antes de continuar.");
    const next = change(readSocratesDocument(localStorage.getItem(key)));
    // Validate before writing and preserve the last valid document on storage failures.
    const valid = readSocratesDocument(JSON.stringify(next));
    try {
      localStorage.setItem(key, JSON.stringify(valid));
    } catch {
      throw new Error(
        "Não foi possível salvar esta conversa. Libere espaço e tente salvar novamente.",
      );
    }
    setData(valid);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: JSON.stringify(valid) }));
    signalAccountChange();
  };
  const create = (subject: string): SocratesConversation => {
    const conversation: SocratesConversation = {
      id: crypto.randomUUID(),
      title: "Nova conversa",
      subject,
      createdAt: new Date().toISOString(),
      messages: [],
    };
    save((current) => {
      if (current.conversations.length >= 50)
        throw new Error("Você já tem 50 conversas salvas. Continue uma delas.");
      return { ...current, conversations: [...current.conversations, conversation] };
    });
    return conversation;
  };
  const append = (conversationId: string, messages: SocratesMessage[]) =>
    save((current) => {
      const conversation = current.conversations.find((item) => item.id === conversationId);
      if (!conversation)
        throw new Error("A conversa não está mais disponível. Sua resposta continua na tela.");
      const known = new Set(conversation.messages.map((message) => message.id));
      const additions = messages.filter((message) => !known.has(message.id));
      if (conversation.messages.length + additions.length > 200)
        throw new Error(
          "Esta conversa atingiu 200 mensagens. Inicie outro assunto; sua resposta continua na tela.",
        );
      return {
        ...current,
        conversations: current.conversations.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                title: item.messages.length ? item.title : messages[0]!.text.slice(0, 100),
                messages: [...item.messages, ...additions],
              }
            : item,
        ),
      };
    });
  return { ...data, error, create, append };
}

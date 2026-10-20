import { useStudy } from "./study-provider";
import { useAuth } from "./auth-gate";
export function useDisplayName() {
  const { data } = useStudy();
  const { user } = useAuth();
  const m = user.user_metadata || {};
  return data.name || m["full_name"] || m["name"] || user.email?.split("@")[0] || "Estudante";
}
export function Avatar({ className = "" }: { className?: string }) {
  const { data } = useStudy();
  const { user } = useAuth();
  const name = useDisplayName();
  const src = data.avatar || user.user_metadata?.["avatar_url"] || user.user_metadata?.["picture"];
  return (
    <div className={`avatar ${className}`}>
      {src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : String(name)[0]?.toUpperCase()}
    </div>
  );
}

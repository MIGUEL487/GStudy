import { useStudy } from "./study-provider";
import { useAuth } from "./auth-gate";
export function useDisplayName() {
  const { data } = useStudy();
  const { user } = useAuth();
  const m = user.user_metadata || {};
  return data.name || m["full_name"] || m["name"] || user.email?.split("@")[0] || "Estudante";
}
export function Avatar({
  className = "",
  url,
  name: suppliedName,
  size,
}: {
  className?: string;
  url?: string | null;
  name?: string;
  size?: number;
}) {
  const { data } = useStudy();
  const { user } = useAuth();
  const accountName = useDisplayName();
  const own = url === undefined && suppliedName === undefined;
  const name = own ? accountName : suppliedName || "Estudante";
  const src = own
    ? data.avatar || user.user_metadata?.["avatar_url"] || user.user_metadata?.["picture"]
    : url;
  return (
    <div
      className={`avatar ${className}`}
      style={size ? { width: size, height: size, aspectRatio: "1", flexShrink: 0 } : undefined}
    >
      {src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : String(name)[0]?.toUpperCase()}
    </div>
  );
}

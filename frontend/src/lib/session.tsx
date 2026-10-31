import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type Me } from "./api";

interface Session { me: Me | null; loaded: boolean; setMe: (m: Me | null) => void; signOut: () => Promise<void>; toast: (t: string, tone?: "good" | "bad") => void; toasts: { id: number; text: string; tone: "good" | "bad" }[]; }
const Ctx = createContext<Session | null>(null);
export const useSession = () => { const s = useContext(Ctx); if (!s) throw new Error("no session"); return s; };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toasts, setToasts] = useState<Session["toasts"]>([]);
  useEffect(() => { api.me().then(setMe).catch((e) => { if (!(e instanceof ApiError && e.status === 401)) console.warn(e); }).finally(() => setLoaded(true)); }, []);
  const toast = useCallback((text: string, tone: "good" | "bad" = "good") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const signOut = useCallback(async () => { await api.logout().catch(() => {}); setMe(null); location.hash = "/"; }, []);
  return <Ctx.Provider value={{ me, loaded, setMe, signOut, toast, toasts }}>{children}</Ctx.Provider>;
}

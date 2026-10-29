import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiClient } from "@/lib/api-client";
import type { Session, User } from "@/lib/api-client";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let revision = 0;

    const resolveRole = async (s: Session | null, current: number) => {
      if (!active || current !== revision) return;
      let admin = false;
      try {
        if (s?.user) {
          const { data, error } = await apiClient.from("user_roles")
            .select("role").eq("user_id", s.user.id).eq("role", "admin").maybeSingle();
          admin = !error && !!data;
        }
      } finally {
        if (active && current === revision) {
          setIsAdmin(admin);
          setLoading(false);
        }
      }
    };

    const applySession = (s: Session | null) => {
      const current = ++revision;
      setLoading(true);
      setIsAdmin(false);
      setSession(s);
      setUser(s?.user ?? null);
      // Resolve outside the auth callback; ignore replies from older sessions.
      setTimeout(() => { void resolveRole(s, current).catch(() => {}); }, 0);
    };

    const { data: sub } = apiClient.auth.onAuthStateChange((_e, s) => applySession(s));
    apiClient.auth.getSession().then(({ data: { session: s } }) => {
      if (active && revision === 0) applySession(s);
    }).catch(() => {
      if (active && revision === 0) applySession(null);
    });

    return () => { active = false; revision++; sub.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => {
    await apiClient.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user, session, isAdmin, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);

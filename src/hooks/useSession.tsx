import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  active: boolean;
}

interface SessionState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  loading: true,
  session: null,
  user: null,
  profile: null,
  isAdmin: false,
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setIsAdmin(false);
      return;
    }
    const [{ data: profileRow }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, active").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile((profileRow as Profile) ?? null);
    setIsAdmin(Boolean(roles?.some((row) => row.role === "admin")));
  };

  useEffect(() => {
    let active = true;
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      void loadProfile(nextSession?.user?.id);
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user?.id);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      isAdmin,
      refresh: async () => loadProfile(session?.user?.id),
    }),
    [loading, session, profile, isAdmin],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type OwnProfile = { display_name: string; avatar_path: string | null };
type Ctx = { session: Session | null; loading: boolean; needsProfile: boolean; refreshProfile: () => Promise<void> };

const SessionContext = createContext<Ctx>({ session: null, loading: true, needsProfile: false, refreshProfile: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  // undefined means not loaded yet, null means the profile could not be read.
  const [profile, setProfile] = useState<OwnProfile | null | undefined>(undefined);
  const uid = session?.user.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!uid) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('display_name, avatar_path').eq('id', uid).maybeSingle();
    setProfile((data as OwnProfile | null) ?? null);
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      return;
    }
    setProfile(undefined);
    refreshProfile();
  }, [uid, refreshProfile]);

  const loading = sessionLoading || (!!session && profile === undefined);
  // A profile we cannot read never locks you out.
  const needsProfile = !!session && !!profile && !profile.display_name.trim();

  return <SessionContext.Provider value={{ session, loading, needsProfile, refreshProfile }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

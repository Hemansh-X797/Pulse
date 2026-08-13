import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { getMyProfile } from '../lib/api/profile';

/**
 * Wires Supabase's auth state into the Zustand store and reports whether
 * the initial session check has finished loading. Every protected route
 * (see routes/router.tsx's `appLayoutRoute`) waits on `loading` before
 * deciding whether to redirect to /login.
 */
export function useAuthSync() {
  const [loading, setLoading] = useState(true);
  const setSession = useAppStore((s) => s.setSession);
  const setProfile = useAppStore((s) => s.setProfile);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        try {
          const profile = await getMyProfile();
          if (mounted) setProfile(profile);
        } catch {
          // profile row may not exist yet if the handle_new_user trigger
          // hasn't run — extremely rare race, next reload picks it up
        }
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        try {
          setProfile(await getMyProfile());
        } catch {
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [setSession, setProfile]);

  return { loading };
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Auth events invalidate the actor immediately, independently of query caches. */
export function useSlimCopilotUser() {
  const [actorId, setActorId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let eventVersion = 0;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      eventVersion++;
      if (live) setActorId(session?.user?.id ?? null);
    });
    const initialVersion = eventVersion;
    void supabase.auth.getSession().then(result => {
      if (live && eventVersion === initialVersion) {
        setActorId(result.error ? null : result.data.session?.user?.id ?? null);
      }
    }).catch(() => {
      if (live && eventVersion === initialVersion) setActorId(null);
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return actorId;
}

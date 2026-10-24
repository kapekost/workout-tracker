import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { api } from '../api';
import { usePlan } from '../plan';
import type { RecencyRow } from '../recovery/recovery';
import type { SessionRow } from './home';

// Home is a tab and stays mounted, so both reads are refreshed each time it gains focus: a
// finished workout must not leave "Next up" stale. `now` moves with focus and once a minute while
// focused, which is all the elapsed-time label needs.
//
// The reads fail independently, as on the web: sessions (or the plan) failing replaces the page
// with the load error, recency failing only hides the picker.
export function useHomeData() {
  const plan = usePlan();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<SessionRow[]>('/sessions') });
  const recency = useQuery({ queryKey: ['recency'], queryFn: () => api.get<RecencyRow[]>('/exercises/recency') });
  const [now, setNow] = useState(() => Date.now());
  const { refetch: refetchSessions } = sessions;
  const { refetch: refetchRecency } = recency;

  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      // Not cancelling an in-flight read: the first focus lands while the mount fetch is running.
      refetchSessions({ cancelRefetch: false });
      refetchRecency({ cancelRefetch: false });
      const timer = setInterval(() => setNow(Date.now()), 60_000);
      return () => clearInterval(timer);
    }, [refetchSessions, refetchRecency]),
  );

  return { plan, sessions, recency, now };
}

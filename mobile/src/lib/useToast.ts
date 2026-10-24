import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastState = { message: string; type: 'default' | 'error' };

const DISMISS_MS = 4000;

// A second showToast clears the pending timer, so a toast shown while an earlier one is still up
// gets its own full delay.
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastState['type'] = 'default') => {
    if (timeout.current) clearTimeout(timeout.current);
    setToast({ message, type });
    timeout.current = setTimeout(() => {
      timeout.current = null;
      setToast(null);
    }, DISMISS_MS);
  }, []);

  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );

  return { toast, showToast };
}

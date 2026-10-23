import { useEffect, useState } from 'react';

// `useEffect` is not invoked during server rendering, meaning
// we can use this to determine if we're on the server or not.
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  const [value, setValue] = useState<S | C>(server);
  useEffect(() => {
    // Deliberate: the first render must match the server HTML, so the client value is set after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(client);
  }, [client]);

  return value;
}

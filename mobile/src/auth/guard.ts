import type { AuthStatus } from './store.ts';

export type RouteGroup = 'loading' | 'auth' | 'app';

// Which route group a user may be in. While the stored session is being checked, neither.
export function routeGroup(status: AuthStatus): RouteGroup {
  if (status === 'signedIn') return 'app';
  if (status === 'signedOut') return 'auth';
  return 'loading';
}

import { Redirect } from 'expo-router';

import { useAuth } from '@/src/auth';
import { routeGroup } from '@/src/auth/guard';

// "/" is reachable by everyone. Each group's own screens sit behind Stack.Protected, so without
// this the first screen would not exist for a user who is logged out.
export default function Index() {
  const group = useAuth((s) => routeGroup(s.status));
  return <Redirect href={group === 'app' ? '/home' : '/login'} />;
}

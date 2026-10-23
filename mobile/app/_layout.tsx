import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { authStore, useAuth } from '@/src/auth';
import { routeGroup } from '@/src/auth/guard';
import { colors } from '@/src/theme/tokens';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

const queryClient = new QueryClient();

// The app is dark only. The navigation theme paints every screen and header, so its background is
// the token background.
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.card,
    border: colors.border,
    text: colors.text,
    primary: colors.accent,
  },
};

// Held until the stored session has been checked, so Login never flashes for a logged-in user.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const group = useAuth((s) => routeGroup(s.status));

  useEffect(() => {
    authStore.getState().restore();
  }, []);

  useEffect(() => {
    if (group !== 'loading') SplashScreen.hideAsync();
  }, [group]);

  if (group === 'loading') return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={navTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={group === 'app'}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={group === 'auth'}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

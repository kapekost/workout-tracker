import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { authStore, useAuth } from '@/src/auth';
import { routeGroup } from '@/src/auth/guard';
import { fontAssets } from '@/src/theme/fonts';
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

// Held until the stored session has been checked and the fonts are in, so Login never flashes for
// a logged-in user and no text renders in the system font first.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const group = useAuth((s) => routeGroup(s.status));
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  // A font that fails to load falls back to the system font rather than holding the splash forever.
  const fontsReady = fontsLoaded || fontError !== null;

  useEffect(() => {
    authStore.getState().restore();
  }, []);

  // The cache is keyed without the profile, so the next member must not see the last one's data.
  useEffect(() => {
    if (group !== 'app') queryClient.clear();
  }, [group]);

  useEffect(() => {
    if (group !== 'loading' && fontsReady) SplashScreen.hideAsync();
  }, [group, fontsReady]);

  if (group === 'loading' || !fontsReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
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

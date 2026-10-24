import { Stack } from 'expo-router';

// The tab screens carry the app chrome; exercises and the workout sit above it, chrome-free.
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

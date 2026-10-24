import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/src/components/Button';
import { ThemedText } from '@/src/components/ThemedText';
import { useAuth } from '@/src/auth';
import { space } from '@/src/theme/tokens';

export default function HomeScreen() {
  const profile = useAuth((s) => s.profile);
  const logout = useAuth((s) => s.logout);
  const router = useRouter();

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: space.xxxl, gap: space.xl }}>
      <ThemedText size="title">Gym Tracker</ThemedText>
      <ThemedText color="muted">Signed in as {profile?.username}</ThemedText>
      <Button testID="home-start-workout" label="Start workout" onPress={() => router.push('/workout')} />
      <Button testID="home-exercises" label="Exercises" onPress={() => router.push('/exercises')} />
      <Button testID="home-logout" label="Log out" onPress={logout} />
    </View>
  );
}

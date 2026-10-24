import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/src/components/Button';
import { ThemedText } from '@/src/components/ThemedText';
import { useAuth } from '@/src/auth';
import { space } from '@/src/theme/tokens';

export default function HomeScreen() {
  const profile = useAuth((s) => s.profile);
  const router = useRouter();

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: space.xxxl, gap: space.xl }}>
      <ThemedText size="title" weight="bold">
        Gym Tracker
      </ThemedText>
      <ThemedText color="muted">Signed in as {profile?.username}</ThemedText>
      <Button label="Start workout" onPress={() => router.push('/workout')} />
      <Button variant="secondary" label="Exercises" onPress={() => router.push('/exercises')} />
    </View>
  );
}

import { Link, Stack } from 'expo-router';
import { View } from 'react-native';

import { ThemedText } from '@/src/components/ThemedText';
import { space } from '@/src/theme/tokens';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.xl }}>
        <ThemedText size="strong">This screen doesn&apos;t exist.</ThemedText>
        <Link href="/">
          <ThemedText color="accent">Go to the home screen</ThemedText>
        </Link>
      </View>
    </>
  );
}
